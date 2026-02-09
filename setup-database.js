const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  console.log('🚀 Начинаем создание базы данных PostgreSQL...\n');

  // Подключаемся к базе postgres для создания новой БД
  const adminClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: '' // пустой пароль для trust authentication
  });

  try {
    // Подключаемся
    console.log('📡 Подключаемся к PostgreSQL...');
    await adminClient.connect();
    console.log('✅ Подключение успешно\n');

    // Проверяем, существует ли база данных
    console.log('🔍 Проверяем существование базы tender_monitor...');
    const checkDb = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = 'tender_monitor'"
    );

    if (checkDb.rows.length > 0) {
      console.log('⚠️  База данных tender_monitor уже существует');
      console.log('🗑️  Удаляем старую базу данных...');
      
      // Отключаем всех пользователей
      await adminClient.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = 'tender_monitor'
        AND pid <> pg_backend_pid()
      `);
      
      // Удаляем базу
      await adminClient.query('DROP DATABASE tender_monitor');
      console.log('✅ Старая база удалена\n');
    }

    // Создаем новую базу данных
    console.log('🏗️  Создаем новую базу данных tender_monitor...');
    await adminClient.query('CREATE DATABASE tender_monitor');
    console.log('✅ База данных создана\n');

    await adminClient.end();

    // Подключаемся к новой базе данных
    console.log('📡 Подключаемся к tender_monitor...');
    const dbClient = new Client({
      host: 'localhost',
      port: 5432,
      database: 'tender_monitor',
      user: 'postgres',
      password: ''
    });

    await dbClient.connect();
    console.log('✅ Подключение успешно\n');

    // Читаем SQL скрипт
    console.log('📄 Читаем SQL скрипт...');
    const sqlPath = path.join(__dirname, 'database', 'create-database.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('✅ SQL скрипт загружен\n');

    // Выполняем SQL скрипт
    console.log('⚙️  Выполняем SQL скрипт (создание таблиц, индексов, views, функций)...');
    await dbClient.query(sql);
    console.log('✅ SQL скрипт выполнен\n');

    // Проверяем созданные объекты
    console.log('🔍 Проверяем созданные объекты...\n');

    const tables = await dbClient.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    console.log(`📊 Создано таблиц: ${tables.rows.length}`);
    tables.rows.forEach(row => console.log(`   - ${row.tablename}`));

    const views = await dbClient.query(`
      SELECT viewname FROM pg_views 
      WHERE schemaname = 'public'
      ORDER BY viewname
    `);
    console.log(`\n👁️  Создано представлений: ${views.rows.length}`);
    views.rows.forEach(row => console.log(`   - ${row.viewname}`));

    const indexes = await dbClient.query(`
      SELECT indexname FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY indexname
    `);
    console.log(`\n🔑 Создано индексов: ${indexes.rows.length}`);

    await dbClient.end();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 ГОТОВО! База данных успешно создана!');
    console.log('='.repeat(60));
    console.log('\n📋 Следующие шаги:');
    console.log('1. Откройте pgAdmin и обновите базу tender_monitor (F5)');
    console.log('2. Вы увидите все 9 таблиц и 3 представления');
    console.log('3. Запустите: node migrate-sqlite-to-postgres.js');
    console.log('   для переноса 77 тендеров из SQLite в PostgreSQL\n');

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    
    if (error.message.includes('password authentication failed')) {
      console.log('\n💡 Решение:');
      console.log('1. Замените файл pg_hba.conf на database/pg_hba_trust.conf');
      console.log('2. Перезапустите PostgreSQL от имени администратора:');
      console.log('   Restart-Service postgresql-x64-17');
    }
    
    process.exit(1);
  }
}

// Запускаем
setupDatabase();
