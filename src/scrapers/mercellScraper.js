const puppeteer = require('puppeteer-core');
const fs = require('fs').promises;
const path = require('path');

// Функция для получения конфигурации браузера
async function getBrowserConfig() {
  if (process.env.NODE_ENV === 'production') {
    // На Render используем chromium
    const chromium = require('@sparticuz/chromium');
    return {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    };
  } else {
    // Локально используем установленный Chrome
    const puppeteerLocal = require('puppeteer');
    return {
      executablePath: puppeteerLocal.executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new'
    };
  }
}

class MercellScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.dataDir = path.join(__dirname, '../../data');
  }

  async init() {
    const config = await getBrowserConfig();
    this.browser = await puppeteer.launch(config);
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async getTenders() {
    try {
      console.log('[Mercell] Mercell требует подписку для доступа к тендерам');
      console.log('[Mercell] mercell.com перенаправляет на маркетинговую страницу info.mercell.com');
      console.log('[Mercell] Для доступа необходима платная подписка');

      // Mercell перенаправляет все URL на info.mercell.com (маркетинговая страница)
      // Без платной подписки доступ к тендерам невозможен
      return [];
    } catch (error) {
      console.error('[Mercell] Ошибка:', error.message);
      return [];
    }
  }

  async saveTenders(tenders) {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const existingFile = path.join(this.dataDir, 'mercell_tenders.json');
      let existingTenders = [];

      try {
        const data = await fs.readFile(existingFile, 'utf8');
        existingTenders = JSON.parse(data);
      } catch (e) {
        // файл не существует - нормально
      }

      // Не перезаписываем если нет новых данных
      if (tenders.length === 0) {
        console.log('[Mercell] Нет данных (требуется подписка)');
        return 0;
      }

      const existingTitles = new Set(existingTenders.map(t => t.title));
      const newTenders = tenders.filter(t => !existingTitles.has(t.title));

      if (newTenders.length > 0) {
        existingTenders.unshift(...newTenders);
        await fs.writeFile(existingFile, JSON.stringify(existingTenders, null, 2));
      }

      return newTenders.length;
    } catch (error) {
      console.error('[Mercell] Ошибка сохранения:', error.message);
      return 0;
    }
  }

  async scrape() {
    try {
      // Не запускаем браузер — Mercell не доступен без подписки
      const tenders = await this.getTenders();
      const newCount = await this.saveTenders(tenders);
      return { success: false, newCount: 0, total: 0, error: 'Mercell требует платную подписку' };
    } catch (error) {
      console.error('[Mercell] Критическая ошибка:', error.message);
      return { success: false, error: error.message, newCount: 0 };
    }
  }
}

module.exports = MercellScraper;
