#!/usr/bin/env node

/**
 * Создание базы данных PostgreSQL без пароля (trust)
 * Работает если PostgreSQL настроен на trust для localhost
 */

const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('   🐘 СОЗДАНИЕ БД БЕЗ ПАРОЛЯ (TRUST)');
  console.log('═══════════════════════════════════════════\n');

  const dbName = 'tender_monitor';

  // Подключение без пароля (trust метод)
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    database: 'postgres'
    // password НЕ указываем - используется trust
  });

  try {
    console.log('📡 Подключение к PostgreSQL (без пароля)...');
    await client.connect();
    console.log('✅ Подключено!\n');

    // Проверка существования БД
    console.log(`🔍 Проверка БД "${dbName}"...`);
    const checkDb = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (checkDb.rows.length > 0) {
      console.log(`✅ БД "${dbName}" уже существует\n`);
    } else {
      console.log(`📦 Создание БД "${dbName}"...`);
      await client.query(`CREATE DATABASE ${dbName} ENCODING 'UTF8'`);
      console.log('✅ БД создана!\n');
    }

    await client.end();

    // Подключение к новой БД для создания таблиц
    const dbClient = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      database: dbName
    });

    console.log('🏗️  Создание таблиц...');
    await dbClient.connect();

    // Читаем SQL скрипт
    const sqlPath = path.join(__dirname, 'database', 'create-database.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');

    // Выполняем
    await dbClient.query(sql);

    // Проверяем таблицы
    const tables = await dbClient.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);

    console.log('\n✅ Созданные таблицы:');
    tables.rows.forEach(row => {
      console.log(`   • ${row.tablename}`);
    });

    await dbClient.end();

    // Сохраняем конфигурацию в .env
    console.log('\n💾 Сохранение конфигурации...');
    const envPath = path.join(__dirname, '.env');
    let envContent = '';

    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (e) {
      // Файл не существует
    }

    // Удаляем старые настройки
    envContent = envContent.replace(/# PostgreSQL Database[\s\S]*?(?=\n# |$)/g, '');
    envContent = envContent.replace(/DB_TYPE=.*/g, '');
    envContent = envContent.replace(/DB_HOST=.*/g, '');
    envContent = envContent.replace(/DB_PORT=.*/g, '');
    envContent = envContent.replace(/DB_NAME=.*/g, '');
    envContent = envContent.replace(/DB_USER=.*/g, '');

    // Добавляем новые
    const newConfig = `\n# PostgreSQL Database
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${dbName}
DB_USER=postgres
`;

    envContent = envContent.trim() + '\n' + newConfig;
    await fs.writeFile(envPath, envContent);
    console.log('✅ Конфигурация сохранена\n');

    console.log('═══════════════════════════════════════════');
    console.log('   ✅ ГОТОВО!');
    console.log('═══════════════════════════════════════════\n');

    console.log('Следующие шаги:');
    console.log('  1. Мигрируйте данные: node migrate-sqlite-to-postgres.js');
    console.log('  2. Запустите: npm start\n');

  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    
    if (error.message.includes('password authentication failed')) {
      console.error('\n💡 PostgreSQL требует пароль.');
      console.error('   Решения:');
      console.error('   1. Используйте setup-postgres.js и введите пароль');
      console.error('   2. Настройте trust-аутентификацию в pg_hba.conf\n');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 PostgreSQL не запущен.');
      console.error('   Start-Service postgresql-x64-17\n');
    }
    
    process.exit(1);
  }
}

main();
