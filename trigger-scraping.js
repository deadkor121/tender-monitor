const fetch = require('node-fetch');

async function triggerScraping() {
  try {
    console.log('🚀 Запуск проверки тендеров через API...\n');
    
    const response = await fetch('http://localhost:3001/api/scrape', {
      method: 'POST'
    });
    
    const result = await response.json();
    
    console.log('📊 Результат:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

triggerScraping();
