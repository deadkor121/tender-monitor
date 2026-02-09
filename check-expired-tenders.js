const PostgresService = require('./src/postgresService');

async function checkExpiredTenders() {
  const db = new PostgresService();
  
  try {
    console.log('📊 Проверка просроченных тендеров в БД...\n');
    
    // Запрос для проверки просроченных тендеров
    const query = `
      SELECT 
        source,
        COUNT(*) as total,
        COUNT(CASE WHEN deadline < NOW() THEN 1 END) as expired,
        COUNT(CASE WHEN deadline >= NOW() THEN 1 END) as active,
        COUNT(CASE WHEN deadline IS NULL THEN 1 END) as no_deadline
      FROM tenders
      GROUP BY source
      ORDER BY source
    `;
    
    const result = await db.pool.query(query);
    
    console.log('📈 Статистика по источникам:\n');
    
    let totalAll = 0;
    let totalExpired = 0;
    let totalActive = 0;
    let totalNoDeadline = 0;
    
    result.rows.forEach(row => {
      console.log(`${row.source.toUpperCase()}:`);
      console.log(`   Всего: ${row.total}`);
      console.log(`   ⏰ Активных (deadline не истек): ${row.active}`);
      console.log(`   ❌ Просроченных (deadline истек): ${row.expired}`);
      console.log(`   ⚠️  Без deadline: ${row.no_deadline}`);
      console.log('');
      
      totalAll += parseInt(row.total);
      totalExpired += parseInt(row.expired);
      totalActive += parseInt(row.active);
      totalNoDeadline += parseInt(row.no_deadline);
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 ИТОГО:');
    console.log(`   Всего тендеров: ${totalAll}`);
    console.log(`   ✅ Актуальных (будут показаны): ${totalActive + totalNoDeadline}`);
    console.log(`   ❌ Просроченных (скрыты): ${totalExpired}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Примеры просроченных тендеров
    if (totalExpired > 0) {
      console.log('🔍 Примеры просроченных тендеров:\n');
      
      const expiredQuery = `
        SELECT id, title, deadline, source
        FROM tenders
        WHERE deadline < NOW()
        ORDER BY deadline DESC
        LIMIT 5
      `;
      
      const expired = await db.pool.query(expiredQuery);
      
      expired.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. ${row.title.substring(0, 60)}...`);
        console.log(`   Источник: ${row.source}`);
        console.log(`   Deadline: ${new Date(row.deadline).toLocaleString('ru-RU')}`);
        console.log(`   ID: ${row.id}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await db.close();
  }
}

checkExpiredTenders();
