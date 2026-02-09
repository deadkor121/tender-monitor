const PostgresService = require('./src/postgresService');

async function cleanDoffinTed() {
  const db = new PostgresService();
  
  try {
    console.log('🗑️  Удаление старых тендеров Doffin и TED...\n');
    
    const result = await db.pool.query(
      'DELETE FROM tenders WHERE source IN ($1, $2)',
      ['doffin', 'ted']
    );
    
    console.log(`✅ Удалено тендеров: ${result.rowCount}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await db.close();
  }
}

cleanDoffinTed();
