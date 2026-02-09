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

class AnbudScraper {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.browser = null;
    this.page = null;
    this.dataDir = path.join(__dirname, '../../data');
    
    // Норвежские месяцы для парсинга дат
    this.norwegianMonths = {
      'januar': 0, 'februar': 1, 'mars': 2, 'april': 3,
      'mai': 4, 'juni': 5, 'juli': 6, 'august': 7,
      'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
    };
  }

  // Парсинг норвежской даты в Date объект
  parseNorwegianDate(dateStr) {
    try {
      if (!dateStr || dateStr === '') return null;
      
      // Формат: "mandag 19. januar 2026" или "19. januar 2026"
      const parts = dateStr.toLowerCase().replace(/\./g, '').split(' ');
      
      let day, month, year;
      
      // Ищем день (число)
      for (const part of parts) {
        if (/^\d+$/.test(part)) {
          day = parseInt(part);
          break;
        }
      }
      
      // Ищем месяц
      for (const part of parts) {
        if (this.norwegianMonths.hasOwnProperty(part)) {
          month = this.norwegianMonths[part];
          break;
        }
      }
      
      // Ищем год
      for (const part of parts) {
        if (/^\d{4}$/.test(part)) {
          year = parseInt(part);
          break;
        }
      }
      
      if (day && month !== undefined && year) {
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      
      return null;
    } catch (error) {
      console.error(`[Anbud] Ошибка парсинга даты "${dateStr}":`, error.message);
      return null;
    }
  }

  async init() {
    const config = await getBrowserConfig();
    this.browser = await puppeteer.launch(config);
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async login() {
    try {
      console.log('[Anbud] Авторизация...');

      await this.page.goto('https://www.anbuddirekte.no/Members/Login.aspx', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Обработка cookie banner
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const buttons = await this.page.$$('button');
        for (const button of buttons) {
          const text = await this.page.evaluate(el => el.textContent.toLowerCase(), button);
          if (text.includes('godta') || text.includes('accept') || text.includes('consent')) {
            await button.click();
            console.log('[Anbud] Cookie banner закрыт');
            await new Promise(resolve => setTimeout(resolve, 1000));
            break;
          }
        }
      } catch (e) {
        // Игнорируем если баннер не найден
      }

      await this.page.waitForSelector('#ctl00_ContentPlaceHolder1_txtEmail', { timeout: 15000 });
      await this.page.type('#ctl00_ContentPlaceHolder1_txtEmail', this.username);
      await this.page.type('#ctl00_ContentPlaceHolder1_txtPassword', this.password);

      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null),
        this.page.click('#ctl00_ContentPlaceHolder1_btnSignIn')
      ]);

      await new Promise(resolve => setTimeout(resolve, 3000));

      const pageText = await this.page.evaluate(() => document.body.innerText.substring(0, 1000));
      const isLoggedIn = pageText.includes('Logg ut') || pageText.includes('LOGG UT');

      if (!isLoggedIn) {
        console.error('[Anbud] Авторизация не удалась');
        return false;
      }

      console.log('[Anbud] Авторизация успешна!');
      return true;
    } catch (error) {
      console.error('[Anbud] Ошибка авторизации:', error.message);
      return false;
    }
  }

  async getTenders() {
    try {
      console.log('[Anbud] Загрузка списка тендеров...');

      // Правильный URL — страница "Anbud"
      await this.page.goto('https://www.anbuddirekte.no/Members/Tenders/ContractNotices.aspx', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Парсинг таблицы #ctl00_ContentPlaceHolder1_grdAlerts
      // Структура: 8 ячеек на строку данных (класс GridItem_Read)
      // cells[0-2]: пустые (чекбокс, иконки)
      // cells[3]: дата публикации
      // cells[4]: название + ссылка
      // cells[5]: заказчик
      // cells[6]: дедлайн
      // cells[7]: пустая
      const tenderLinks = await this.page.evaluate(() => {
        const items = [];
        const table = document.querySelector('#ctl00_ContentPlaceHolder1_grdAlerts');
        if (!table) return items;

        const rows = table.querySelectorAll('tr');
        rows.forEach((row, index) => {
          // Пропускаем строки без класса GridItem (заголовки, фильтры, разделители)
          const className = row.className || '';
          if (!className.includes('GridItem')) return;

          const cells = row.querySelectorAll('td');
          if (cells.length < 7) return;

          const published = cells[3] ? cells[3].textContent.trim() : '';
          const titleCell = cells[4];
          const titleLink = titleCell ? titleCell.querySelector('a') : null;
          const title = titleLink ? titleLink.textContent.trim() : (titleCell ? titleCell.textContent.trim() : '');
          const link = titleLink ? titleLink.href : '';
          const buyer = cells[5] ? cells[5].textContent.trim() : '';
          const deadlineFromList = cells[6] ? cells[6].textContent.trim() : '';

          if (!title) return;

          items.push({
            title,
            link,
            buyer,
            published,
            deadlineFromList,
            index
          });
        });

        return items;
      });

      console.log(`[Anbud] Найдено тендеров: ${tenderLinks.length}`);

      // Извлекаем детальную информацию для каждого тендера (ограничено первыми 20)
      const tenders = [];
      const limit = Math.min(tenderLinks.length, 20);
      
      for (let i = 0; i < limit; i++) {
        const tender = tenderLinks[i];
        console.log(`[Anbud] Обработка ${i + 1}/${limit}: ${tender.title.substring(0, 50)}...`);
        
        try {
          // Переход на страницу тендера
          await this.page.goto(tender.link, {
            waitUntil: 'networkidle2',
            timeout: 30000
          });

          await new Promise(resolve => setTimeout(resolve, 1500));

          // Извлечение детальной информации
          const details = await this.page.evaluate(() => {
            const info = {};
            
            // Получаем весь текст страницы для поиска
            const bodyText = document.body.innerText;
            
            // Ищем Innleveringsfrist
            const innleveringMatch = bodyText.match(/Innleveringsfrist[:\s]+([^\n]+)/i);
            if (innleveringMatch) {
              info.deadline = innleveringMatch[1].trim();
            }
            
            // Ищем Publiseringsdato
            const publisertMatch = bodyText.match(/Publiseringsdato[:\s]+([^\n]+)/i);
            if (publisertMatch) {
              info.published = publisertMatch[1].trim();
            }
            
            // Ищем ID (формат NOR2025-120903 или подобный)
            const idMatch = bodyText.match(/ID[:\s]+(NOR[0-9\-]+)/i);
            if (idMatch) {
              info.id = idMatch[1].trim();
            }
            
            // Ищем Dokumenttype
            const docTypeMatch = bodyText.match(/Dokumenttype[:\s]+([^\n]+)/i);
            if (docTypeMatch) {
              info.category = docTypeMatch[1].trim();
            }
            
            // Альтернативный метод - через таблицы
            const rows = document.querySelectorAll('tr');
            rows.forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 2) {
                const label = cells[0].textContent.trim();
                const value = cells[1].textContent.trim();
                
                if (label.includes('Innleveringsfrist') && !info.deadline) {
                  info.deadline = value;
                }
                if (label.includes('Publiseringsdato') && !info.published) {
                  info.published = value;
                }
                if (label.includes('ID:') && !info.id) {
                  info.id = value;
                }
                if (label.includes('Dokumenttype') && !info.category) {
                  info.category = value;
                }
              }
            });

            // Дополнительно ищем текст описания
            const descDiv = document.querySelector('.ShortDescription, .Description');
            if (descDiv) {
              info.description = descDiv.textContent.trim().substring(0, 500);
            }

            return info;
          });

          tenders.push({
            id: details.id || `anbud_${Date.now()}_${i}`,
            title: tender.title,
            description: details.description || `Innkjøper: ${tender.buyer}`,
            published: this.parseNorwegianDate(details.published || tender.published) || new Date().toISOString(),
            deadline: this.parseNorwegianDate(details.deadline || tender.deadlineFromList),
            link: tender.link,
            buyer: tender.buyer,
            source: 'anbud',
            category: details.category || '',
            scrapedAt: new Date().toISOString()
          });

        } catch (error) {
          console.error(`[Anbud] Ошибка обработки тендера: ${error.message}`);
          // Добавляем тендер с базовой информацией
          tenders.push({
            id: `anbud_${Date.now()}_${i}`,
            title: tender.title,
            description: `Innkjøper: ${tender.buyer}`,
            published: this.parseNorwegianDate(tender.published) || new Date().toISOString(),
            deadline: this.parseNorwegianDate(tender.deadlineFromList),
            link: tender.link,
            buyer: tender.buyer,
            source: 'anbud',
            category: '',
            scrapedAt: new Date().toISOString()
          });
        }
      }

      if (tenders.length > 0) {
        console.log(`[Anbud] Обработано тендеров: ${tenders.length}`);
        console.log(`[Anbud] Пример: "${tenders[0].title}" | Deadline: ${tenders[0].deadline || 'не указан'}`);
      }

      return tenders;
    } catch (error) {
      console.error('[Anbud] Ошибка получения тендеров:', error.message);
      return [];
    }
  }

  async saveTenders(tenders) {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });

      const existingFile = path.join(this.dataDir, 'tenders.json');
      let existingTenders = [];

      try {
        const data = await fs.readFile(existingFile, 'utf8');
        existingTenders = JSON.parse(data);
      } catch (error) {
        console.log('[Anbud] Создается новый файл');
      }

      const existingTitles = new Set(existingTenders.map(t => t.title));
      const newTenders = tenders.filter(t => !existingTitles.has(t.title));

      if (newTenders.length > 0) {
        console.log(`[Anbud] Новых тендеров: ${newTenders.length}`);
        existingTenders.unshift(...newTenders);
      } else {
        console.log('[Anbud] Новых тендеров не найдено');
      }

      await fs.writeFile(existingFile, JSON.stringify(existingTenders, null, 2));
      return newTenders.length;
    } catch (error) {
      console.error('[Anbud] Ошибка сохранения:', error.message);
      return 0;
    }
  }

  async scrape() {
    try {
      await this.init();
      const loggedIn = await this.login();

      if (!loggedIn) {
        return { success: false, newCount: 0 };
      }

      const tenders = await this.getTenders();
      const newCount = await this.saveTenders(tenders);

      return { success: true, newCount, total: tenders.length };
    } catch (error) {
      console.error('[Anbud] Критическая ошибка:', error.message);
      return { success: false, error: error.message, newCount: 0 };
    } finally {
      if (this.browser) await this.browser.close();
    }
  }
}

module.exports = AnbudScraper;
