const cron = require('node-cron');
const AnbudScraper = require('./scrapers/anbudScraper');
const DoffinScraper = require('./scrapers/doffinScraper');
const TedScraper = require('./scrapers/tedScraper');
const MercellScraper = require('./scrapers/mercellScraper');
const NotificationService = require('./notificationService');
const fs = require('fs').promises;
const path = require('path');

class Scheduler {
  constructor(username, password, intervalMinutes = 30, db = null) {
    this.username = username;
    this.password = password;
    this.intervalMinutes = intervalMinutes;
    this.db = db; // Добавляем БД
    this.isRunning = false;
    this.lastRun = null;
    this.enabledSources = { anbud: true, doffin: true, ted: true, mercell: false };
    this.notificationService = new NotificationService();
    this.newTendersCache = {}; // Хранит новые тендеры для отправки уведомлений
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalNewTenders: 0,
      bySite: {
        anbud: { runs: 0, newTenders: 0, lastStatus: null },
        doffin: { runs: 0, newTenders: 0, lastStatus: null },
        ted: { runs: 0, newTenders: 0, lastStatus: null },
        mercell: { runs: 0, newTenders: 0, lastStatus: null }
      }
    };
  }

  setEnabledSources(sources) {
    this.enabledSources = { ...this.enabledSources, ...sources };
  }

  async runSingleScraper(name, scraperInstance) {
    console.log(`\n--- ${name} ---`);
    try {
      const result = await scraperInstance.scrape();
      this.stats.bySite[name].runs++;
      this.stats.bySite[name].lastStatus = result.success ? 'ok' : 'error';
      
      if (result.success && result.newCount > 0) {
        this.stats.bySite[name].newTenders += result.newCount;
        
        // Читаем новые тендеры для отправки уведомлений
        const dataFile = path.join(__dirname, '../data', this.getDataFile(name));
        try {
          const data = await fs.readFile(dataFile, 'utf8');
          const allTenders = JSON.parse(data);
          const newTenders = allTenders.slice(0, result.newCount);
          
          // Сохраняем в БД, если она подключена
          if (this.db) {
            console.log(`[${name}] Сохранение ${newTenders.length} тендеров в БД...`);
            await this.db.saveTenders(newTenders);
          }
          
          // Отправляем уведомления
          await this.notificationService.notifyNewTenders(newTenders, name);
        } catch (e) {
          console.error(`[${name}] Не удалось отправить уведомления:`, e.message);
        }
      }
      
      if (!result.success && result.error) {
        await this.notificationService.notifyError(name, result.error);
      }
      
      return result;
    } catch (error) {
      console.error(`[${name}] Ошибка:`, error.message);
      this.stats.bySite[name].lastStatus = 'error';
      await this.notificationService.notifyError(name, error.message);
      return { success: false, newCount: 0, error: error.message };
    }
  }

  getDataFile(source) {
    const files = {
      anbud: 'tenders.json',
      doffin: 'doffin_tenders.json',
      ted: 'ted_tenders.json',
      mercell: 'mercell_tenders.json'
    };
    return files[source] || 'tenders.json';
  }

  async runScraper(specificSource = null) {
    if (this.isRunning) {
      console.log('Парсинг уже выполняется, пропуск...');
      return;
    }

    this.isRunning = true;
    console.log(`\n[${new Date().toLocaleString()}] Запуск проверки тендеров...`);

    try {
      const results = [];

      if (this.shouldRun('anbud', specificSource)) {
        const scraper = new AnbudScraper(this.username, this.password);
        results.push(await this.runSingleScraper('anbud', scraper));
      }

      if (this.shouldRun('doffin', specificSource)) {
        const scraper = new DoffinScraper();
        results.push(await this.runSingleScraper('doffin', scraper));
      }

      if (this.shouldRun('ted', specificSource)) {
        const scraper = new TedScraper();
        results.push(await this.runSingleScraper('ted', scraper));
      }

      if (this.shouldRun('mercell', specificSource)) {
        const scraper = new MercellScraper();
        results.push(await this.runSingleScraper('mercell', scraper));
      }

      this.stats.totalRuns++;
      this.lastRun = new Date();

      const totalNew = results.reduce((sum, r) => sum + (r.newCount || 0), 0);
      const anySuccess = results.some(r => r.success);

      if (anySuccess) {
        this.stats.successfulRuns++;
        this.stats.totalNewTenders += totalNew;
      } else {
        this.stats.failedRuns++;
      }

      console.log(`\nИтого новых тендеров: ${totalNew}`);
    } catch (error) {
      this.stats.failedRuns++;
      console.error('Критическая ошибка:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  shouldRun(source, specificSource) {
    if (specificSource) return specificSource === source;
    return this.enabledSources[source];
  }

  start() {
    const cronExpression = `*/${this.intervalMinutes} * * * *`;
    const sources = Object.entries(this.enabledSources)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name);

    console.log(`Планировщик запущен. Проверка каждые ${this.intervalMinutes} минут`);
    console.log(`Активные сайты: ${sources.join(', ')}\n`);

    this.runScraper();

    this.task = cron.schedule(cronExpression, () => {
      this.runScraper();
    });
  }

  stop() {
    if (this.task) {
      this.task.stop();
      console.log('Планировщик остановлен');
    }
  }

  getStats() {
    return {
      ...this.stats,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes,
      enabledSources: this.enabledSources
    };
  }
}

module.exports = Scheduler;
