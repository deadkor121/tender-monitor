#!/usr/bin/env node

/**
 * Автоматическая настройка PostgreSQL базы данных
 * 
 * Использование:
 *   node setup-postgres.js
 */

const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('   🐘 НАСТРОЙКА POSTGRESQL');
  console.log('═══════════════════════════════════════════\n');

  console.log('Этот скрипт поможет создать и настроить базу данных.');
  console.log('Вам понадобятся учетные данные PostgreSQL.\n');

  // Запрос учетных данных
  const host = await question('PostgreSQL Host [localhost]: ') || 'localhost';
  const port = await question('PostgreSQL Port [5432]: ') || '5432';
  const adminUser = await question('PostgreSQL User [postgres]: ') || 'postgres';
  const password = await question('PostgreSQL Password: ');
  const dbName = await question('Имя новой БД [tender_monitor]: ') || 'tender_monitor';

  console.log('\n📡 Подключение к PostgreSQL...');

  // Подключение к postgres БД для создания новой БД
  const adminClient = new Client({
    host,
    port: parseInt(port),
    user: adminUser,
    password,
    database: 'postgres' // Подключаемся к дефолтной БД
  });

  try {
    await adminClient.connect();
    console.log('✅ Подключено к PostgreSQL\n');

    // Проверка, существует ли БД
    console.log(`🔍 Проверка существования БД "${dbName}"...`);
    const checkDb = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (checkDb.rows.length > 0) {
      console.log(`⚠️  База данных "${dbName}" уже существует!`);
      const overwrite = await question('Пересоздать? (yes/no) [no]: ');
      
      if (overwrite.toLowerCase() === 'yes') {
        console.log(`\n🗑️  Удаление существующей БД "${dbName}"...`);
        // Отключаем все соединения
        await adminClient.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = $1
            AND pid <> pg_backend_pid()
        `, [dbName]);
        
        await adminClient.query(`DROP DATABASE "${dbName}"`);
        console.log('✅ БД удалена');
      } else {
        console.log('\n⏭️  Пропускаем создание БД, используем существующую\n');
        await adminClient.end();
        await createTables(host, port, adminUser, password, dbName);
        await saveEnvConfig(host, port, adminUser, password, dbName);
        rl.close();
        return;
      }
    }

    // Создание новой БД
    console.log(`\n📦 Создание базы данных "${dbName}"...`);
    await adminClient.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8'`);
    console.log('✅ База данных создана\n');

    await adminClient.end();

    // Создание таблиц
    await createTables(host, port, adminUser, password, dbName);

    // Сохранение конфигурации
    await saveEnvConfig(host, port, adminUser, password, dbName);

    console.log('\n═══════════════════════════════════════════');
    console.log('   ✅ НАСТРОЙКА ЗАВЕРШЕНА!');
    console.log('═══════════════════════════════════════════\n');

    console.log('Следующие шаги:');
    console.log('  1. Мигрируйте данные: node migrate-sqlite-to-postgres.js');
    console.log('  2. Запустите сервер: npm start\n');

  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 PostgreSQL сервер не запущен или недоступен.');
      console.error('   Запустите: Start-Service postgresql-x64-17');
    } else if (error.code === '28P01') {
      console.error('\n💡 Неверный пароль. Проверьте учетные данные.');
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

async function createTables(host, port, user, password, database) {
  console.log('🏗️  Создание таблиц...\n');

  const client = new Client({ host, port: parseInt(port), user, password, database });
  
  try {
    await client.connect();

    // Читаем SQL скрипт
    const sqlPath = path.join(__dirname, 'database', 'create-database.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');

    // Выполняем SQL скрипт
    await client.query(sql);

    // Проверяем созданные таблицы
    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);

    console.log('✅ Созданные таблицы:');
    tablesResult.rows.forEach(row => {
      console.log(`   • ${row.tablename}`);
    });

    // Проверяем views
    const viewsResult = await client.query(`
      SELECT viewname FROM pg_views 
      WHERE schemaname = 'public' 
      ORDER BY viewname
    `);

    if (viewsResult.rows.length > 0) {
      console.log('\n✅ Созданные представления:');
      viewsResult.rows.forEach(row => {
        console.log(`   • ${row.viewname}`);
      });
    }

    await client.end();
  } catch (error) {
    console.error('❌ Ошибка создания таблиц:', error.message);
    throw error;
  }
}

async function saveEnvConfig(host, port, user, password, database) {
  console.log('\n💾 Сохранение конфигурации в .env...');

  const envPath = path.join(__dirname, '.env');
  let envContent = '';

  try {
    envContent = await fs.readFile(envPath, 'utf8');
  } catch (error) {
    // Файл не существует, создадим новый
  }

  // Удаляем старые postgres настройки если есть
  envContent = envContent.replace(/# PostgreSQL Database[\s\S]*?(?=\n# |$)/g, '');
  envContent = envContent.replace(/DB_TYPE=.*/g, '');
  envContent = envContent.replace(/DB_HOST=.*/g, '');
  envContent = envContent.replace(/DB_PORT=.*/g, '');
  envContent = envContent.replace(/DB_NAME=.*/g, '');
  envContent = envContent.replace(/DB_USER=.*/g, '');
  envContent = envContent.replace(/DB_PASSWORD=.*/g, '');

  // Добавляем новые настройки
  const newConfig = `\n# PostgreSQL Database
DB_TYPE=postgresql
DB_HOST=${host}
DB_PORT=${port}
DB_NAME=${database}
DB_USER=${user}
DB_PASSWORD=${password}
`;

  envContent = envContent.trim() + '\n' + newConfig;

  await fs.writeFile(envPath, envContent);
  console.log('✅ Конфигурация сохранена в .env');
}

main().catch(error => {
  console.error('\n❌ Критическая ошибка:', error);
  rl.close();
  process.exit(1);
});
