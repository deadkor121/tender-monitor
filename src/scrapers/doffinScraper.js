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

const CONSTRUCTION_KEYWORDS = [
  'bygg', 'bygge', 'byggeri', 'bygning', 'konstruksjon',
  'anlegg', 'rehabilitering', 'renovering', 'vedlikehold',
  'maling', 'maler', 'fasade', 'tak', 'gulv', 'bad',
  'rørlegger', 'elektriker', 'vvs', 'ventilasjon',
  'betong', 'mur', 'tømrer', 'snekker', 'graving',
  'riving', 'demontering', 'montering', 'installasjon',
  'utomhus', 'uteområde', 'asfaltering', 'belegg',
  'sanitær', 'varme', 'isolasjon', 'membran',
  'stillas', 'vinduer', 'dører', 'kjøkken',
  'barnehage', 'skole', 'ombygging', 'omsorgsbolig',
  'entreprise', 'prosjekt', 'lekeplass'
];

class DoffinScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.dataDir = path.join(__dirname, '../../data');
  }

  // Парсинг норвежской даты DD.MM.YYYY в ISO формат
  parseNorwegianDate(dateStr) {
    try {
      if (!dateStr || typeof dateStr !== 'string') return null;
      
      // Формат: "DD.MM.YYYY"
      const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (!match) return null;
      
      const [, day, month, year] = match;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
      return null;
    } catch (error) {
      console.error(`[Doffin] Ошибка парсинга даты "${dateStr}":`, error.message);
      return null;
    }
  }

  async init() {
    const config = await getBrowserConfig();
    this.browser = await puppeteer.launch(config);
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async getTenders() {
    try {
      console.log('[Doffin] Загрузка тендеров...');

      // Doffin перенаправляет на /search — используем прямой URL
      await this.page.goto('https://doffin.no/search', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Ждем загрузки результатов (SPA)
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Парсинг карточек: a._card_1oojq_1
      const tenders = await this.page.evaluate(() => {
        const items = [];

        // Основные карточки тендеров
        const cards = document.querySelectorAll('a[class*="_card_"]');

        cards.forEach((card, index) => {
          const buyerEl = card.querySelector('p[class*="_buyer_"]');
          const titleEl = card.querySelector('h2[class*="_title_"]');
          const descEl = card.querySelector('p[class*="_ingress_"]');
          const link = card.href || '';

          const buyer = buyerEl ? buyerEl.textContent.trim() : '';
          const title = titleEl ? titleEl.textContent.trim() : '';
          const description = descEl ? descEl.textContent.trim() : '';

          // Извлекаем дополнительную информацию из текста карточки
          const fullText = card.textContent.trim();

          // Ищем сумму (NOK)
          const amountMatch = fullText.match(/([\d\s]+(?:\.\d+)?)\s*NOK/i);
          const amount = amountMatch ? amountMatch[1].trim() : '';

          // Ищем даты в формате DD.MM.YYYY
          const dateMatches = fullText.match(/\d{2}\.\d{2}\.\d{4}/g) || [];
          
          // Первая дата - обычно дата публикации, вторая - deadline
          const publishedDate = dateMatches[0] || null;
          const deadlineDate = dateMatches[1] || null;

          // Ищем тип (KONKURRANSE, PLANLEGGING, RESULTAT)
          let noticeType = '';
          if (fullText.includes('KONKURRANSE')) noticeType = 'Konkurranse';
          else if (fullText.includes('PLANLEGGING')) noticeType = 'Planlegging';
          else if (fullText.includes('RESULTAT')) noticeType = 'Resultat';

          // Ищем статус (AKTIV, UTGÅTT)
          let status = '';
          if (fullText.includes('AKTIV')) status = 'Aktiv';
          else if (fullText.includes('UTGÅTT')) status = 'Utgått';
          else if (fullText.includes('TILDELT')) status = 'Tildelt';

          if (!title) return;

          items.push({
            id: `doffin_${Date.now()}_${index}`,
            title,
            description,
            buyer,
            amount,
            noticeType,
            status,
            publishedRaw: publishedDate,
            deadlineRaw: deadlineDate,
            link,
            source: 'doffin',
            category: 'Bygg og anlegg',
            scrapedAt: new Date().toISOString()
          });
        });

        return items;
      });

      // Конвертируем даты в ISO формат
      const tendersWithDates = tenders.map(t => ({
        ...t,
        published: this.parseNorwegianDate(t.publishedRaw) || new Date().toISOString(),
        deadline: this.parseNorwegianDate(t.deadlineRaw)
      }));
      
      console.log(`[Doffin] Найдено тендеров: ${tendersWithDates.length}`);
      if (tendersWithDates.length > 0) {
        console.log(`[Doffin] Пример: "${tendersWithDates[0].title}" (${tendersWithDates[0].amount} NOK)`);
        if (tendersWithDates[0].deadline) {
          console.log(`[Doffin] Deadline: ${new Date(tendersWithDates[0].deadline).toLocaleDateString('ru-RU')}`);
        }
      }

      return tendersWithDates;
    } catch (error) {
      console.error('[Doffin] Ошибка:', error.message);
      return [];
    }
  }

  isConstructionRelated(tender) {
    const text = `${tender.title} ${tender.description} ${tender.category} ${tender.buyer}`.toLowerCase();
    return CONSTRUCTION_KEYWORDS.some(keyword => text.includes(keyword));
  }

  isBeginnerFriendly(tender) {
    const text = `${tender.title} ${tender.description}`.toLowerCase();
    const complexKeywords = ['rammeavtale', 'totalentreprise', 'iso 9001', 'iso 14001',
      'sentral godkjenning', 'ansvarsrett', 'prekvalifisering'];
    return !complexKeywords.some(k => text.includes(k));
  }

  isUnderBudget(tender, maxNOK = 1000000) {
    if (!tender.amount) return true; // если сумма не указана — пропускаем фильтр
    const numStr = tender.amount.replace(/\s/g, '').replace(/\./g, '');
    const num = parseInt(numStr);
    return isNaN(num) || num <= maxNOK;
  }

  async saveTenders(tenders) {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });

      const existingFile = path.join(this.dataDir, 'doffin_tenders.json');
      let existingTenders = [];

      try {
        const data = await fs.readFile(existingFile, 'utf8');
        existingTenders = JSON.parse(data);
      } catch (error) {
        console.log('[Doffin] Создается новый файл');
      }

      const existingTitles = new Set(existingTenders.map(t => t.title));
      const newTenders = tenders.filter(t => !existingTitles.has(t.title));

      if (newTenders.length > 0) {
        console.log(`[Doffin] Новых тендеров: ${newTenders.length}`);
        existingTenders.unshift(...newTenders);
      } else {
        console.log('[Doffin] Новых тендеров не найдено');
      }

      await fs.writeFile(existingFile, JSON.stringify(existingTenders, null, 2));
      return newTenders.length;
    } catch (error) {
      console.error('[Doffin] Ошибка сохранения:', error.message);
      return 0;
    }
  }

  async scrape() {
    try {
      await this.init();
      const tenders = await this.getTenders();

      // Фильтры: строительство + до 1 млн NOK + для новичков
      const construction = tenders.filter(t => this.isConstructionRelated(t));
      const underBudget = construction.filter(t => this.isUnderBudget(t));
      const beginnerFriendly = underBudget.filter(t => this.isBeginnerFriendly(t));

      console.log(`[Doffin] Фильтр: ${tenders.length} всего -> ${construction.length} строительных -> ${underBudget.length} до 1 млн -> ${beginnerFriendly.length} для новичков`);

      // Сохраняем отфильтрованные, но если пустой — сохраняем строительные
      const toSave = beginnerFriendly.length > 0 ? beginnerFriendly : (underBudget.length > 0 ? underBudget : construction);
      const newCount = await this.saveTenders(toSave);

      return { success: true, newCount, total: tenders.length, filtered: toSave.length };
    } catch (error) {
      console.error('[Doffin] Критическая ошибка:', error.message);
      return { success: false, error: error.message, newCount: 0 };
    } finally {
      if (this.browser) await this.browser.close();
    }
  }
}

module.exports = DoffinScraper;
