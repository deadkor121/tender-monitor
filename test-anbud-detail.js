const puppeteer = require('puppeteer');

async function testTenderDetail() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    // Логин
    await page.goto('https://www.anbuddirekte.no/Members/Login.aspx', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await page.type('#ctl00_ContentPlaceHolder1_txtEmail', 'denis_2002@i.ua');
    await page.type('#ctl00_ContentPlaceHolder1_txtPassword', 'C70482');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null),
      page.click('#ctl00_ContentPlaceHolder1_btnSignIn')
    ]);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('✅ Авторизован\n');
    
    // Принятие cookies если появляется баннер
    try {
      const cookieButton = await page.$('button');
      if (cookieButton) {
        const buttonText = await page.evaluate(el => el.textContent, cookieButton);
        if (buttonText.includes('Godta') || buttonText.includes('Accept')) {
          await cookieButton.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log('🍪 Cookies приняты\n');
        }
      }
    } catch (e) {
      // Игнорируем если баннер не найден
    }
    
    // Переход на конкретный тендер из скриншота пользователя
    const testUrl = 'https://www.anbuddirekte.no/Members/Tenders/TenderView.aspx?ID=NOR2025-120903';
    await page.goto(testUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('📄 Страница тендера загружена\n');
        // Сделаем скриншот для диагностики
    await page.screenshot({ path: 'tender-page-screenshot.png', fullPage: true });
    console.log('📸 Скриншот сохранен: tender-page-screenshot.png\n');
        // Извлекаем всю структуру таблицы
    const pageData = await page.evaluate(() => {
      const data = {
        allText: document.body.innerText.substring(0, 3000),
        tables: [],
        innleveringsfrist: null
      };
      
      // Ищем все таблицы
      const tables = document.querySelectorAll('table');
      tables.forEach((table, idx) => {
        const rows = table.querySelectorAll('tr');
        const tableData = [];
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th');
          if (cells.length >= 2) {
            const label = cells[0].textContent.trim();
            const value = cells[1].textContent.trim();
            tableData.push({ label, value });
            
            if (label.toLowerCase().includes('innlevering') || label.toLowerCase().includes('frist')) {
              data.innleveringsfrist = value;
            }
          }
        });
        if (tableData.length > 0) {
          data.tables.push({ index: idx, rows: tableData });
        }
      });
      
      return data;
    });
    
    console.log('📊 Найдено таблиц:', pageData.tables.length);
    console.log('\n🔍 Innleveringsfrist найден:', pageData.innleveringsfrist || 'НЕТ');
    
    // Показываем данные из всех таблиц
    pageData.tables.forEach((table, idx) => {
      console.log(`\n📋 Таблица ${idx + 1}:`);
      table.rows.forEach(row => {
        if (row.label && row.value) {
          console.log(`   ${row.label}: ${row.value}`);
        }
      });
    });
    
    console.log('\n📝 Первые 500 символов текста страницы:');
    console.log(pageData.allText.substring(0, 500));
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await browser.close();
  }
}

testTenderDetail();
