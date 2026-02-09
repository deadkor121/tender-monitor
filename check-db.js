const { Client } = require('pg');

async function checkDatabase() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: ''
  });

  try {
    await client.connect();
    
    // Проверяем все базы данных
    const result = await client.query(`
      SELECT datname, pg_size_pretty(pg_database_size(datname)) as size
      FROM pg_database 
      WHERE datname NOT LIKE 'template%'
      ORDER BY datname
    `);
    
    console.log('📊 Список всех баз данных:\n');
    result.rows.forEach(row => {
      console.log(`  ${row.datname === 'tender_monitor' ? '✅' : '  '} ${row.datname} (${row.size})`);
    });
    
    // Если tender_monitor есть, проверяем таблицы
    const tmCheck = result.rows.find(r => r.datname === 'tender_monitor');
    if (tmCheck) {
      await client.end();
      
      const tmClient = new Client({
        host: 'localhost',
        port: 5432,
        database: 'tender_monitor',
        user: 'postgres',
        password: ''
      });
      
      await tmClient.connect();
      
      const tables = await tmClient.query(`
        SELECT tablename, 
               (SELECT COUNT(*) FROM tenders) as tender_count
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      
      console.log('\n📋 Таблицы в tender_monitor:');
      tables.rows.forEach(t => {
        console.log(`  - ${t.tablename}`);
      });
      
      const count = await tmClient.query('SELECT COUNT(*) FROM tenders');
      console.log(`\n✅ В базе tender_monitor: ${count.rows[0].count} тендеров\n`);
      
      await tmClient.end();
    } else {
      console.log('\n❌ База данных tender_monitor НЕ НАЙДЕНА!\n');
      console.log('Запустите: node setup-database.js\n');
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    if (!client._ending) {
      await client.end();
    }
  }
}

checkDatabase();
