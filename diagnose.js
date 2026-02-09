require('dotenv').config();
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // === ЧАСТЬ 1: Anbud Direkte — логин и поиск страницы тендеров ===
  console.log('=== ANBUD DIREKTE ===\n');
  console.log('Логин...');
  await page.goto('https://www.anbuddirekte.no/Members/Login.aspx', { waitUntil: 'networkidle2', timeout: 60000 });

  await page.type('#ctl00_ContentPlaceHolder1_txtEmail', process.env.ANBUD_USERNAME);
  await page.type('#ctl00_ContentPlaceHolder1_txtPassword', process.env.ANBUD_PASSWORD);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null),
    page.click('#ctl00_ContentPlaceHolder1_btnSignIn')
  ]);

  await new Promise(r => setTimeout(r, 3000));
  console.log('URL после логина:', page.url());

  // Ищем навигационные ссылки
  const navLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      text: a.textContent.trim(),
      href: a.href,
      className: a.className
    })).filter(a => a.text && a.href.includes('anbuddirekte'));
  });

  console.log('\nВсе ссылки на сайте:');
  navLinks.forEach(l => console.log(`  "${l.text}" -> ${l.href}`));

  // Переходим на страницу ANBUD
  const anbudLink = navLinks.find(l => l.text.toUpperCase().includes('ANBUD') && !l.text.includes('FAVORITT') && !l.text.includes('SØK'));
  if (anbudLink) {
    console.log(`\nПереход на: ${anbudLink.href}`);
    await page.goto(anbudLink.href, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));
    console.log('URL страницы тендеров:', page.url());

    // Анализ структуры
    const pageStructure = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const links = document.querySelectorAll('a');
      const divs = document.querySelectorAll('div');
      return {
        tables: Array.from(tables).map((t, i) => ({
          index: i,
          id: t.id,
          className: t.className,
          rows: t.querySelectorAll('tr').length,
          firstRowText: t.querySelector('tr') ? t.querySelector('tr').textContent.trim().substring(0, 200) : ''
        })),
        allLinksCount: links.length,
        bodyText: document.body.innerText.substring(0, 3000)
      };
    });

    console.log('\n=== ТАБЛИЦЫ ===');
    pageStructure.tables.forEach(t => console.log(JSON.stringify(t, null, 2)));
    console.log('\n=== ТЕКСТ СТРАНИЦЫ (3000 символов) ===');
    console.log(pageStructure.bodyText);
  }

  // === ЧАСТЬ 2: Doffin — структура результатов ===
  console.log('\n\n=== DOFFIN.NO ===\n');
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1920, height: 1080 });

  await page2.goto('https://doffin.no/Notice?query=&PageNumber=1&PageSize=25&OrderingType=0&OrderingDirection=1&IsAdvancedSearch=true&IncludeExpired=false&Cpvs=45000000', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await new Promise(r => setTimeout(r, 5000));
  console.log('URL:', page2.url());

  const doffinStructure = await page2.evaluate(() => {
    // Все элементы с данными тендеров
    const allElements = document.querySelectorAll('*');
    const interestingElements = [];

    allElements.forEach(el => {
      const text = el.textContent.trim();
      if (text.includes('barnehage') || text.includes('Forprosjekt')) {
        if (el.children.length < 5 && text.length < 500) {
          interestingElements.push({
            tag: el.tagName,
            className: el.className,
            id: el.id,
            text: text.substring(0, 100),
            parentTag: el.parentElement ? el.parentElement.tagName : '',
            parentClass: el.parentElement ? el.parentElement.className : ''
          });
        }
      }
    });

    // Ищем повторяющиеся блоки (карточки результатов)
    const possibleCards = document.querySelectorAll('article, [class*="result"], [class*="notice"], [class*="card"], [class*="item"], [class*="hit"], li > div, section > div > div');
    const cards = Array.from(possibleCards).filter(el => {
      const text = el.textContent;
      return text.length > 50 && text.length < 2000 && text.includes('NOK');
    });

    return {
      interestingElements: interestingElements.slice(0, 20),
      cardsFound: cards.length,
      cardExamples: cards.slice(0, 3).map(c => ({
        tag: c.tagName,
        className: c.className,
        id: c.id,
        textPreview: c.textContent.trim().substring(0, 300),
        childrenCount: c.children.length,
        innerHTML: c.innerHTML.substring(0, 500)
      })),
      bodyText: document.body.innerText.substring(0, 2000)
    };
  });

  console.log('\n=== ЭЛЕМЕНТЫ С ДАННЫМИ ТЕНДЕРОВ ===');
  doffinStructure.interestingElements.forEach(e => console.log(JSON.stringify(e, null, 2)));

  console.log('\n=== КАРТОЧКИ РЕЗУЛЬТАТОВ ===');
  console.log('Найдено карточек:', doffinStructure.cardsFound);
  doffinStructure.cardExamples.forEach(c => {
    console.log('\n--- Карточка ---');
    console.log(JSON.stringify({ tag: c.tag, className: c.className, id: c.id, children: c.childrenCount }, null, 2));
    console.log('Текст:', c.textPreview);
    console.log('HTML:', c.innerHTML);
  });

  await browser.close();
  console.log('\nДиагностика завершена.');
})();
