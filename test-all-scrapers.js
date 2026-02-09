const DoffinScraper = require('./src/scrapers/doffinScraper');
const TedScraper = require('./src/scrapers/tedScraper');
const PostgresService = require('./src/postgresService');

async function testAllScrapers() {
  console.log('🧪 Тестирование всех скраперов с улучшенным парсингом дат\n');
  
  const db = new PostgresService();
  
  try {
    // Тест Doffin
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Тестирование Doffin Scraper');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const doffinScraper = new DoffinScraper();
    await doffinScraper.init();
    const doffinTenders = await doffinScraper.getTenders();
    await doffinScraper.browser.close();
    
    console.log(`\n📊 Doffin: Найдено ${doffinTenders.length} тендеров\n`);
    
    if (doffinTenders.length > 0) {
      console.log('Примеры с датами:');
      for (let i = 0; i < Math.min(3, doffinTenders.length); i++) {
        const t = doffinTenders[i];
        console.log(`\n${i + 1}. ${t.title.substring(0, 60)}...`);
        console.log(`   Published: ${t.published || 'NULL'}`);
        console.log(`   Deadline: ${t.deadline || 'NULL'}`);
        if (t.deadline) {
          try {
            const deadlineDate = new Date(t.deadline);
            const now = new Date();
            const daysLeft = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
            console.log(`   ✅ Deadline распознан: ${deadlineDate.toLocaleDateString('ru-RU')} (через ${daysLeft} дн.)`);
          } catch (e) {
            console.log(`   ⚠️  Deadline не распознан как дата`);
          }
        }
      }
      
      // Статистика по deadline для Doffin
      const withDeadline = doffinTenders.filter(t => t.deadline).length;
      console.log(`\n📈 Doffin статистика:`);
      console.log(`   С deadline: ${withDeadline}/${doffinTenders.length}`);
      console.log(`   Без deadline: ${doffinTenders.length - withDeadline}/${doffinTenders.length}`);
    }
    
    // Тест TED
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Тестирование TED Scraper');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const tedScraper = new TedScraper();
    const tedTenders = await tedScraper.getTenders();
    
    console.log(`\n📊 TED: Найдено ${tedTenders.length} тендеров\n`);
    
    if (tedTenders.length > 0) {
      console.log('Примеры с датами:');
      for (let i = 0; i < Math.min(3, tedTenders.length); i++) {
        const t = tedTenders[i];
        console.log(`\n${i + 1}. ${t.title.substring(0, 60)}...`);
        console.log(`   ID: ${t.id}`);
        console.log(`   Buyer: ${t.buyer.substring(0, 40)}`);
        console.log(`   Published: ${t.published || 'NULL'}`);
        console.log(`   Deadline: ${t.deadline || 'NULL'}`);
        if (t.deadline) {
          try {
            const deadlineDate = new Date(t.deadline);
            const now = new Date();
            const daysLeft = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
            console.log(`   ✅ Deadline распознан: ${deadlineDate.toLocaleDateString('ru-RU')} (через ${daysLeft} дн.)`);
          } catch (e) {
            console.log(`   ⚠️  Deadline не распознан как дата`);
          }
        }
      }
      
      // Статистика по deadline для TED
      const withDeadline = tedTenders.filter(t => t.deadline).length;
      console.log(`\n📈 TED статистика:`);
      console.log(`   С deadline: ${withDeadline}/${tedTenders.length}`);
      console.log(`   Без deadline: ${tedTenders.length - withDeadline}/${tedTenders.length}`);
    }
    
    // Сохранение в PostgreSQL
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💾 Сохранение в PostgreSQL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const allTenders = [...doffinTenders, ...tedTenders];
    console.log(`Всего тендеров для сохранения: ${allTenders.length}`);
    
    if (allTenders.length > 0) {
      await db.saveTenders(allTenders);
      console.log('✅ Тендеры сохранены в PostgreSQL');
      
      // Проверка статистики в БД
      const stats = await db.pool.query(`
        SELECT source, 
               COUNT(*) as total,
               COUNT(deadline) as with_deadline
        FROM tenders
        WHERE source IN ('doffin', 'ted')
        GROUP BY source
      `);
      
      console.log('\n📊 Статистика в базе данных:');
      stats.rows.forEach(row => {
        console.log(`\n   ${row.source.toUpperCase()}:`);
        console.log(`   - Всего: ${row.total}`);
        console.log(`   - С deadline: ${row.with_deadline}`);
        console.log(`   - Без deadline: ${row.total - row.with_deadline}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await db.close();
  }
}

testAllScrapers();
