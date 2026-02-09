const AnbudScraper = require('./src/scrapers/anbudScraper');
require('dotenv').config();

async function testAnbudScraper() {
  console.log('🧪 Тестируем обновленный Anbud скрапер...\n');
  
  const username = process.env.ANBUD_USERNAME || 'denis_2002@i.ua';
  const password = process.env.ANBUD_PASSWORD || 'C70482';
  
  const scraper = new AnbudScraper(username, password);
  
  try {
    await scraper.init();
    console.log('✅ Браузер инициализирован');
    
    const loggedIn = await scraper.login();
    if (!loggedIn) {
      console.error('❌ Не удалось авторизоваться');
      return;
    }
    console.log('✅ Авторизация успешна\n');
    
    const tenders = await scraper.getTenders();
    console.log(`\n📊 Всего извлечено тендеров: ${tenders.length}\n`);
    
    // Показываем первые 5 тендеров с детальной информацией
    const limit = Math.min(5, tenders.length);
    for (let i = 0; i < limit; i++) {
      const t = tenders[i];
      console.log(`\n${i + 1}. 📋 ${t.title}`);
      console.log(`   ID: ${t.id}`);
      console.log(`   🏢 Заказчик: ${t.buyer}`);
      console.log(`   📅 Опубликовано: ${t.published}`);
      console.log(`   ⏰ Deadline: ${t.deadline || 'НЕ УКАЗАН'}`);
      console.log(`   🔗 ${t.link}`);
      
      // Проверяем, успешно ли распарсился deadline
      if (t.deadline) {
        const deadlineDate = new Date(t.deadline);
        if (!isNaN(deadlineDate.getTime())) {
          const now = new Date();
          const daysLeft = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
          console.log(`   ✅ Deadline распознан: ${deadlineDate.toLocaleDateString('ru-RU')} (через ${daysLeft} дн.)`);
        } else {
          console.log(`   ⚠️  Deadline не распознан как дата`);
        }
      }
    }
    
    // Статистика по deadline
    const withDeadline = tenders.filter(t => t.deadline).length;
    console.log(`\n📈 Статистика:`);
    console.log(`   Тендеров с deadline: ${withDeadline}/${tenders.length}`);
    console.log(`   Тендеров без deadline: ${tenders.length - withDeadline}/${tenders.length}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    if (scraper.browser) {
      await scraper.browser.close();
      console.log('\n✅ Браузер закрыт');
    }
  }
}

testAnbudScraper();
