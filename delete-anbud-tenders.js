const PostgresService = require('./src/postgresService');

async function deleteAnbudTenders() {
  const db = new PostgresService();
  
  try {
    console.log('🗑️  Удаление тендеров из источника "anbud"...\n');
    
    const result = await db.pool.query('DELETE FROM tenders WHERE source = $1', ['anbud']);
    
    console.log(`✅ Удалено тендеров: ${result.rowCount}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await db.close();
  }
}

deleteAnbudTenders();
