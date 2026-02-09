require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');
const socketIo = require('socket.io');
const Scheduler = require('./scheduler');
const PostgresService = require('./postgresService');
const UserDataService = require('./userDataService');
const ExportService = require('./exportService');
const NotificationService = require('./notificationService');
const ReminderService = require('./reminderService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const username = process.env.ANBUD_USERNAME;
const password = process.env.ANBUD_PASSWORD;
const checkInterval = parseInt(process.env.CHECK_INTERVAL_MINUTES) || 30;

if (!username || !password) {
  console.error('ОШИБКА: Установите ANBUD_USERNAME и ANBUD_PASSWORD в файле .env');
  process.exit(1);
}

// Объявление переменных
let db, scheduler, userDataService, exportService, notificationService, reminderService;

// Асинхронный запуск приложения
(async () => {
  try {
    // Инициализация базы данных PostgreSQL
    db = new PostgresService();
    await db.initDatabase(); // Явная инициализация схемы БД
    
    scheduler = new Scheduler(username, password, checkInterval, db); // Передаем БД в scheduler
    userDataService = new UserDataService(db);
    exportService = new ExportService();
    notificationService = new NotificationService();
    reminderService = new ReminderService(notificationService);

// Маппинг источников к файлам
const SOURCE_FILES = {
  anbud: 'tenders.json',
  doffin: 'doffin_tenders.json',
  ted: 'ted_tenders.json',
  mercell: 'mercell_tenders.json'
};

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/api/tenders', async (req, res) => {
  const source = req.query.source || 'all';
  try {
    // Сначала пытаемся загрузить из БД
    let tenders = await db.getTenders({ source: source === 'all' ? null : source });
    
    // Если в БД нет тендеров, загружаем из JSON файлов (для обратной совместимости)
    if (tenders.length === 0) {
      const dataDir = path.join(__dirname, '../data');
      const sources = source === 'all' ? Object.keys(SOURCE_FILES) : [source];

      for (const src of sources) {
        const file = SOURCE_FILES[src];
        if (!file) continue;
        try {
          const data = await fs.readFile(path.join(dataDir, file), 'utf8');
          const jsonTenders = JSON.parse(data).map(t => ({ ...t, source: t.source || src }));
          tenders.push(...jsonTenders);
        } catch (e) { /* файл не существует */ }
      }
      
      // Сохраняем загруженные тендеры в БД
      if (tenders.length > 0) {
        console.log(`[Database] Импортировано ${tenders.length} тендеров из JSON в БД`);
        await db.saveTenders(tenders);
      }
    }

    tenders.sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt));
    res.json({ success: true, tenders, count: tenders.length, source });
  } catch (error) {
    console.error('Ошибка загрузки тендеров:', error);
    res.json({ success: true, tenders: [], count: 0 });
  }
});

app.get('/api/stats', (req, res) => {
  res.json({ success: true, stats: scheduler.getStats() });
});

app.post('/api/scrape-now', async (req, res) => {
  const source = req.body.source || null;
  res.json({ success: true, message: `Парсинг запущен: ${source || 'все сайты'}` });
  scheduler.runScraper(source);
});

app.post('/api/sources', (req, res) => {
  scheduler.setEnabledSources(req.body);
  res.json({ success: true, enabledSources: scheduler.enabledSources });
});

app.get('/api/sources', (req, res) => {
  res.json({
    success: true,
    sources: [
      { id: 'anbud', name: 'Anbud Direkte', url: 'anbuddirekte.no', enabled: scheduler.enabledSources.anbud, requiresLogin: true, description: 'Коммерческий сервис тендеров Норвегии' },
      { id: 'doffin', name: 'Doffin.no', url: 'doffin.no', enabled: scheduler.enabledSources.doffin, requiresLogin: false, description: 'Официальная база гос. закупок Норвегии' },
      { id: 'ted', name: 'TED Europa', url: 'ted.europa.eu', enabled: scheduler.enabledSources.ted, requiresLogin: false, description: 'Европейские тендеры (ЕС/ЕЭЗ)' },
      { id: 'mercell', name: 'Mercell', url: 'mercell.com', enabled: scheduler.enabledSources.mercell, requiresLogin: true, description: 'Платная подписка. mercell.com — закрытая платформа' }
    ]
  });
});

// === Новые API endpoints ===

// WebSocket connection
io.on('connection', (socket) => {
  console.log('[WebSocket] Клиент подключен');
  socket.on('disconnect', () => {
    console.log('[WebSocket] Клиент отключен');
  });
});

// Уведомление клиентов о новых тендерах через WebSocket
scheduler.on = (event, data) => {
  if (event === 'newTenders') {
    io.emit('newTenders', data);
  }
};

// Избранное
app.get('/api/favorites', async (req, res) => {
  try {
    const favorites = await userDataService.getFavorites();
    res.json({ success: true, favorites });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/favorites/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { tender } = req.body;
    await userDataService.addFavorite(tenderId, tender);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.delete('/api/favorites/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    await userDataService.removeFavorite(tenderId);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Заметки
app.post('/api/notes/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { note } = req.body;
    await userDataService.addNote(tenderId, note);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Статус тендера
app.post('/api/status/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { status } = req.body;
    await userDataService.setStatus(tenderId, status);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Отметить как просмотренный
app.post('/api/viewed/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    await userDataService.markAsViewed(tenderId);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Получить данные о тендере
app.get('/api/tender-data/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const data = await userDataService.getTenderData(tenderId);
    res.json({ success: true, data });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Экспорт данных
app.get('/api/export/:format', async (req, res) => {
  try {
    const { format } = req.params;
    const source = req.query.source || 'all';
    
    // Получаем тендеры из БД
    let allTenders = db.getTenders({ source: source === 'all' ? null : source });

    allTenders.sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt));

    if (format === 'excel') {
      const buffer = await exportService.exportToExcel(allTenders);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=tenders.xlsx');
      res.send(buffer);
    } else if (format === 'csv') {
      const csv = exportService.exportToCSV(allTenders);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=tenders.csv');
      res.send('\uFEFF' + csv); // BOM для правильной кодировки в Excel
    } else if (format === 'json') {
      const json = exportService.exportToJSON(allTenders);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=tenders.json');
      res.send(json);
    } else {
      res.status(400).json({ success: false, error: 'Неизвестный формат' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Аналитика
app.get('/api/analytics', async (req, res) => {
  try {
    // Получаем статистику из БД
    const stats = await db.getStatistics();
    
    // Получаем все тендеры для детальной аналитики по датам и категориям
    const allTenders = await db.getTenders();

    // Аналитика по дням
    const byDate = {};
    allTenders.forEach(t => {
      const date = new Date(t.scrapedAt).toISOString().split('T')[0];
      byDate[date] = (byDate[date] || 0) + 1;
    });

    // Аналитика по категориям
    const categoryCount = {};
    allTenders.forEach(t => {
      const category = t.category || 'Без категории';
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });
    
    // Преобразуем объект bySource в массив и сортируем
    const bySourceArray = Object.entries(stats.bySource).map(([source, count]) => ({
      source: source,
      count: count
    })).sort((a, b) => b.count - a.count);
    
    // Топ 10 категорий
    const byCategoryArray = Object.entries(categoryCount)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      success: true,
      analytics: {
        total: stats.total,
        byDate: Object.entries(byDate).map(([date, count]) => ({ date, count })).slice(-30),
        byCategory: byCategoryArray,
        bySource: bySourceArray
      }
    });
  } catch (error) {
    console.error('Ошибка аналитики:', error);
    res.json({ success: false, error: error.message });
  }
});

// === Теги ===
app.get('/api/tags/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const tags = await userDataService.getTags(tenderId);
    res.json({ success: true, tags });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/tags/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { tags } = req.body;
    await userDataService.setTags(tenderId, tags);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/tags', async (req, res) => {
  try {
    const allTags = await userDataService.getAllTags();
    res.json({ success: true, tags: allTags });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// === Приоритеты ===
app.post('/api/priority/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { priority } = req.body; // 'high', 'medium', 'low'
    await userDataService.setPriority(tenderId, priority);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/priority/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const priority = await userDataService.getPriority(tenderId);
    res.json({ success: true, priority });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// === Напоминания ===
app.post('/api/reminders/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { daysBeforeList } = req.body; // [1, 3, 7]
    await reminderService.setReminder(tenderId, daysBeforeList);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.delete('/api/reminders/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    await reminderService.removeReminder(tenderId);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/reminders/:tenderId', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const reminders = await reminderService.getReminders();
    res.json({ success: true, reminder: reminders[tenderId] || null });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/reminders', async (req, res) => {
  try {
    const reminders = await reminderService.getReminders();
    res.json({ success: true, reminders });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// === Пресеты фильтров ===
app.get('/api/filter-presets', async (req, res) => {
  try {
    const presets = await userDataService.getFilterPresets();
    res.json({ success: true, presets });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/filter-presets', async (req, res) => {
  try {
    const { name, filters } = req.body;
    await userDataService.saveFilterPreset(name, filters);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.delete('/api/filter-presets/:name', async (req, res) => {
  try {
    const { name } = req.params;
    await userDataService.deleteFilterPreset(name);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Срочность тендера на основе дедлайна
app.get('/api/urgency/:deadline', (req, res) => {
  try {
    const { deadline } = req.params;
    const urgency = reminderService.getUrgencyLevel(deadline);
    res.json({ success: true, urgency });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

  scheduler.start();

  server.listen(PORT, () => {
    console.log(`\n=================================`);
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    console.log(`=================================\n`);
  });

  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
})();

process.on('SIGINT', () => {
  console.log('\nОстановка сервера...');
  process.exit(0);
});
