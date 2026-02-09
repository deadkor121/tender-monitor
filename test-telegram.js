require('dotenv').config();
const NotificationService = require('./src/notificationService');

const notificationService = new NotificationService();

// Тестовые тендеры
const testTenders = [
  {
    id: 'test_1',
    title: 'Тестовый тендер - Строительство дома',
    category: 'Construction',
    description: 'Это тестовое уведомление для проверки Telegram бота',
    amount: '500 000 NOK',
    deadline: '15.03.2026',
    link: 'http://localhost:3001',
    source: 'doffin',
    scrapedAt: new Date().toISOString()
  },
  {
    id: 'test_2',
    title: 'Тестовый тендер - Ремонт школы',
    category: 'Construction',
    description: 'Второй тестовый тендер',
    amount: '750 000 NOK',
    deadline: '20.03.2026',
    link: 'http://localhost:3001',
    source: 'doffin',
    scrapedAt: new Date().toISOString()
  }
];

console.log('🧪 Тестирование Telegram уведомлений...\n');
console.log('Настройки:');
console.log('TELEGRAM_ENABLED:', process.env.TELEGRAM_ENABLED);
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? '✅ Установлен' : '❌ Не установлен');
console.log('TELEGRAM_CHAT_ID:', process.env.TELEGRAM_CHAT_ID || '❌ Не установлен');
console.log('\nОтправка тестового уведомления...\n');

notificationService.notifyNewTenders(testTenders, 'doffin')
  .then(() => {
    console.log('\n✅ Тест завершен! Проверьте Telegram.');
    console.log('Если сообщение не пришло:');
    console.log('1. Убедитесь что TELEGRAM_ENABLED=true в .env');
    console.log('2. Проверьте правильность токена и Chat ID');
    console.log('3. Отправьте боту /start если еще не делали');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Ошибка:', error.message);
    process.exit(1);
  });
