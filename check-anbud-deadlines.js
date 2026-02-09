const PostgresService = require('./src/postgresService');

async function checkAnbudDeadlines() {
  const db = new PostgresService();
  
  try {
    console.log('📊 Проверка deadline у тендеров Anbud в БД...\n');
    
    const query = `
      SELECT id, title, 
             deadline,
             scraped_at
      FROM tenders 
      WHERE source = 'anbud'
      ORDER BY scraped_at DESC
      LIMIT 10
    `;
    
    const result = await db.pool.query(query);
    
    console.log(`Найдено тендеров Anbud: ${result.rows.length}\n`);
    
    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.title.substring(0, 60)}...`);
      console.log(`   ID: ${row.id}`);
      console.log(`   Deadline: ${row.deadline ? new Date(row.deadline).toLocaleDateString('ru-RU') : 'NULL'}`);
      console.log(`   Scraped: ${new Date(row.scraped_at).toLocaleString('ru-RU')}`);
      console.log('');
    });
    
    // Статистика
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(deadline) as with_deadline
      FROM tenders 
      WHERE source = 'anbud'
    `;
    
    const stats = await db.pool.query(statsQuery);
    console.log(`\n📈 Статистика:`);
    console.log(`   Всего тендеров Anbud: ${stats.rows[0].total}`);
    console.log(`   С deadline: ${stats.rows[0].with_deadline}`);
    console.log(`   Без deadline: ${stats.rows[0].total - stats.rows[0].with_deadline}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await db.close();
  }
}

checkAnbudDeadlines();
