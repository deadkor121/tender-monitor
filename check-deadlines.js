const { Client } = require('pg');

async function checkTenders() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'tender_monitor',
    user: 'postgres',
    password: ''
  });

  try {
    await client.connect();
    console.log('✅ Подключено к PostgreSQL\n');

    // Проверяем тендеры с deadline
    const withDeadline = await client.query(`
      SELECT id, title, deadline, scraped_at, source 
      FROM tenders 
      WHERE deadline IS NOT NULL 
      LIMIT 5
    `);

    console.log('📊 Тендеры с deadline:');
    withDeadline.rows.forEach(t => {
      console.log(`  - ${t.title.substring(0, 50)}...`);
      console.log(`    Deadline: ${t.deadline}`);
      console.log(`    Добавлен: ${t.scraped_at}\n`);
    });

    // Проверяем тендеры без deadline
    const withoutDeadline = await client.query(`
      SELECT COUNT(*) as count 
      FROM tenders 
      WHERE deadline IS NULL
    `);

    console.log(`\n⚠️  Тендеров без deadline: ${withoutDeadline.rows[0].count}`);

    // Показываем примеры без deadline
    const examples = await client.query(`
      SELECT id, title, source, scraped_at
      FROM tenders 
      WHERE deadline IS NULL 
      LIMIT 3
    `);

    console.log('\nПримеры тендеров без deadline:');
    examples.rows.forEach(t => {
      console.log(`  - [${t.source}] ${t.title.substring(0, 60)}...`);
    });

    await client.end();
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

checkTenders();
