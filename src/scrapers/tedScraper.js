const https = require('https');
const fs = require('fs').promises;
const path = require('path');

const CONSTRUCTION_KEYWORDS_EN = [
  'construction', 'building', 'renovation', 'repair', 'maintenance',
  'painting', 'facade', 'roof', 'floor', 'plumbing', 'electrical',
  'hvac', 'ventilation', 'concrete', 'masonry', 'carpentry',
  'demolition', 'installation', 'asphalt', 'insulation',
  'windows', 'doors', 'kitchen', 'school', 'kindergarten',
  'pipeline', 'bridge', 'road', 'tunnel', 'housing'
];

const CONSTRUCTION_KEYWORDS_NO = [
  'bygg', 'bygge', 'byggeri', 'bygning', 'konstruksjon',
  'anlegg', 'rehabilitering', 'renovering', 'vedlikehold',
  'maling', 'maler', 'fasade', 'tak', 'gulv', 'bad',
  'rørlegger', 'elektriker', 'vvs', 'ventilasjon',
  'betong', 'mur', 'tømrer', 'snekker', 'graving',
  'riving', 'montering', 'installasjon', 'asfaltering',
  'sanitær', 'varme', 'isolasjon', 'vinduer', 'dører',
  'entreprise', 'prosjekt', 'ombygging'
];

class TedScraper {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.apiUrl = 'tedweb.api.ted.europa.eu';
    this.apiPath = '/private-search/api/v1/notices/search';
  }

  // HTTP POST запрос к TED API
  apiRequest(body) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const options = {
        hostname: this.apiUrl,
        path: this.apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`JSON parse error: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(postData);
      req.end();
    });
  }

  // Извлекает текст из I18N поля TED API
  // Формат: { eng: "text" } или { eng: ["text1", "text2"] } или "string" или ["arr"]
  extractI18N(raw) {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
      const first = raw[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object') return this.extractI18N(first);
      return '';
    }
    // Объект с языковыми ключами: { eng: "...", hun: "...", ... }
    // Приоритет: eng > dan > swe > первый доступный
    for (const lang of ['eng', 'dan', 'swe', 'nld', 'deu', 'fra']) {
      if (raw[lang]) {
        const val = raw[lang];
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return val[0] || '';
      }
    }
    // Первое доступное значение
    const first = Object.values(raw)[0];
    if (typeof first === 'string') return first;
    if (Array.isArray(first)) return first[0] || '';
    return '';
  }

  // Извлекает реальный заголовок из TED формата
  // "Norway – Category description – Actual tender title" → "Actual tender title"
  extractTitle(fullTitle) {
    if (!fullTitle) return '';
    const parts = fullTitle.split(' – ');
    if (parts.length >= 3) {
      // Берем все после второго " – " (реальное название)
      return parts.slice(2).join(' – ').trim();
    }
    if (parts.length === 2) {
      return parts[1].trim();
    }
    return fullTitle.trim();
  }

  async getTenders() {
    try {
      console.log('[TED] Загрузка норвежских тендеров через API...');

      // Запрашиваем норвежские тендеры через API
      // publication-date>=20250101 — только свежие тендеры
      const response = await this.apiRequest({
        page: 1,
        limit: 50,
        scope: 'ACTIVE',
        query: 'organisation-country-buyer=NOR AND publication-date>=20250101',
        fields: [
          'publication-number',
          'notice-title',
          'buyer-name',
          'organisation-country-buyer',
          'notice-type',
          'deadline-receipt-tender-date-lot',
          'publication-date',
          'description-lot',
          'place-of-performance'
        ]
      });

      if (response.status !== 200) {
        console.error('[TED] API ошибка:', response.status, JSON.stringify(response.data).substring(0, 300));
        return [];
      }

      const total = response.data.totalNoticeCount || 0;
      const notices = response.data.notices || [];

      console.log(`[TED] API: ${notices.length} тендеров из ${total} норвежских (с 2025)`);

      // Преобразуем в наш формат
      const tenders = notices.map((notice) => {
        const pubNumber = notice['publication-number'] || '';

        // Заголовок: I18N объект { eng: "Norway – Category – Title", hun: "..." }
        const fullTitle = this.extractI18N(notice['notice-title']);
        const title = this.extractTitle(fullTitle) || pubNumber;

        // Заказчик: { eng: ["Buyer Name"] }
        const buyer = this.extractI18N(notice['buyer-name']);

        // Описание: { eng: ["Description text..."] }
        const description = this.extractI18N(notice['description-lot']);

        // Дедлайн: ["2026-03-10+01:00"] - сохраняем в ISO формате для PostgreSQL
        let deadline = null;
        const rawDeadline = notice['deadline-receipt-tender-date-lot'];
        if (rawDeadline) {
          const dl = Array.isArray(rawDeadline) ? rawDeadline[0] : rawDeadline;
          if (dl) {
            const d = new Date(dl);
            if (!isNaN(d.getTime())) {
              deadline = d.toISOString();
            }
          }
        }

        // Дата публикации: "2026-02-07Z" - сохраняем в ISO формате для PostgreSQL
        let published = null;
        const rawPubDate = notice['publication-date'];
        if (rawPubDate) {
          const pd = Array.isArray(rawPubDate) ? rawPubDate[0] : rawPubDate;
          if (pd) {
            const d = new Date(pd);
            if (!isNaN(d.getTime())) {
              published = d.toISOString();
            }
          }
        }

        // Тип уведомления
        const rawType = notice['notice-type'];
        const noticeType = rawType ? (rawType.label || rawType.value || '') : '';

        // Место выполнения
        let location = '';
        const rawPlace = notice['place-of-performance'];
        if (rawPlace && Array.isArray(rawPlace)) {
          const labels = rawPlace.map(p => p.label || p).filter(v => v && v !== '00');
          location = labels.join(', ');
        }

        const link = `https://ted.europa.eu/en/notice/-/detail/${pubNumber}`;

        return {
          id: `ted_${pubNumber}`,
          title: String(title).substring(0, 300),
          description: description ? String(description).substring(0, 500) : (buyer ? `Innkjøper: ${buyer}` : ''),
          buyer: String(buyer),
          amount: '',
          noticeType,
          published,
          deadline,
          location,
          link,
          source: 'ted',
          category: 'Tenders Norway (EU/TED)',
          scrapedAt: new Date().toISOString()
        };
      }).filter(t => t.title && t.title.length > 0);

      console.log(`[TED] Обработано: ${tenders.length} тендеров`);
      if (tenders.length > 0) {
        console.log(`[TED] Пример: "${tenders[0].title}" | Заказчик: ${tenders[0].buyer} | Дедлайн: ${tenders[0].deadline}`);
      }

      return tenders;
    } catch (error) {
      console.error('[TED] Ошибка:', error.message);
      return [];
    }
  }

  isConstructionRelated(tender) {
    const text = `${tender.title} ${tender.description} ${tender.buyer} ${tender.location || ''}`.toLowerCase();
    return CONSTRUCTION_KEYWORDS_EN.some(k => text.includes(k)) ||
           CONSTRUCTION_KEYWORDS_NO.some(k => text.includes(k));
  }

  async saveTenders(tenders) {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const existingFile = path.join(this.dataDir, 'ted_tenders.json');
      let existingTenders = [];

      try {
        const data = await fs.readFile(existingFile, 'utf8');
        existingTenders = JSON.parse(data);
      } catch (e) {
        console.log('[TED] Создается новый файл');
      }

      // Дедупликация по ID (номеру публикации)
      const existingIds = new Set(existingTenders.map(t => t.id));
      const newTenders = tenders.filter(t => !existingIds.has(t.id));

      if (newTenders.length > 0) {
        console.log(`[TED] Новых тендеров: ${newTenders.length}`);
        existingTenders.unshift(...newTenders);
      } else {
        console.log('[TED] Новых тендеров не найдено');
      }

      await fs.writeFile(existingFile, JSON.stringify(existingTenders, null, 2));
      return newTenders.length;
    } catch (error) {
      console.error('[TED] Ошибка сохранения:', error.message);
      return 0;
    }
  }

  async scrape() {
    try {
      const tenders = await this.getTenders();

      // Фильтруем строительные тендеры (опционально)
      const construction = tenders.filter(t => this.isConstructionRelated(t));
      console.log(`[TED] Фильтр: ${tenders.length} всего -> ${construction.length} строительных`);

      // Сохраняем все если строительных мало, иначе строительные
      const toSave = construction.length > 0 ? construction : tenders;
      const newCount = await this.saveTenders(toSave);

      return { success: true, newCount, total: tenders.length, filtered: toSave.length };
    } catch (error) {
      console.error('[TED] Критическая ошибка:', error.message);
      return { success: false, error: error.message, newCount: 0 };
    }
  }
}

module.exports = TedScraper;
