require('dotenv').config();
const puppeteer = require('puppeteer');

async function diagnoseAnbud(browser) {
  console.log('\n========== ANBUD DIAGNOSE ==========');
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Login
    await page.goto('https://www.anbuddirekte.no/Members/Login.aspx', { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtEmail', { timeout: 15000 });
    await page.type('#ctl00_ContentPlaceHolder1_txtEmail', process.env.ANBUD_USERNAME);
    await page.type('#ctl00_ContentPlaceHolder1_txtPassword', process.env.ANBUD_PASSWORD);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null),
      page.click('#ctl00_ContentPlaceHolder1_btnSignIn')
    ]);
    await new Promise(r => setTimeout(r, 3000));

    const loggedIn = await page.evaluate(() => document.body.innerText.includes('Logg ut') || document.body.innerText.includes('LOGG UT'));
    console.log('[Anbud] Logged in:', loggedIn);

    if (!loggedIn) { await page.close(); return; }

    // Go to tenders page
    await page.goto('https://www.anbuddirekte.no/Members/Tenders/ContractNotices.aspx', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    console.log('[Anbud] Page URL:', page.url());

    // Check table existence and structure
    const tableInfo = await page.evaluate(() => {
      const result = {};

      // Try main table
      const table = document.querySelector('#ctl00_ContentPlaceHolder1_grdAlerts');
      result.tableFound = !!table;

      if (!table) {
        // Try any table
        const tables = document.querySelectorAll('table');
        result.tablesCount = tables.length;
        result.tableIds = Array.from(tables).map(t => t.id || '(no id)').slice(0, 10);

        // Check for gridview
        const gridviews = document.querySelectorAll('[id*="grd"], [id*="Grid"], [id*="grid"]');
        result.gridviews = Array.from(gridviews).map(g => ({ tag: g.tagName, id: g.id, classes: g.className }));

        return result;
      }

      const rows = table.querySelectorAll('tr');
      result.totalRows = rows.length;

      // Analyze first 5 rows
      result.rows = [];
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const row = rows[i];
        const ths = row.querySelectorAll('th');
        const tds = row.querySelectorAll('td');

        const rowInfo = {
          index: i,
          thCount: ths.length,
          tdCount: tds.length,
          className: row.className,
          thTexts: Array.from(ths).map(th => th.textContent.trim().substring(0, 50)),
          tdTexts: Array.from(tds).map(td => td.textContent.trim().substring(0, 80)),
          hasLinks: Array.from(tds).map(td => {
            const a = td.querySelector('a');
            return a ? { text: a.textContent.trim().substring(0, 60), href: a.href } : null;
          }).filter(Boolean)
        };
        result.rows.push(rowInfo);
      }

      // Also check direct children vs nested
      const directTrs = table.querySelectorAll(':scope > tbody > tr, :scope > tr');
      result.directTrs = directTrs.length;

      return result;
    });

    console.log('[Anbud] Table info:', JSON.stringify(tableInfo, null, 2));

  } catch (error) {
    console.error('[Anbud] Error:', error.message);
  } finally {
    await page.close();
  }
}

async function diagnoseTed(browser) {
  console.log('\n========== TED DIAGNOSE ==========');
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Try TED search API endpoint
    console.log('[TED] Trying search page...');

    const searchUrl = 'https://ted.europa.eu/en/search/result?query=CPV%3D45*&sortField=PD&reverseOrder=true&scope=2&lang=en&place=NO';
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    const tedUrl = page.url();
    console.log('[TED] Final URL:', tedUrl);

    // Handle cookie consent
    const hasCookieBanner = await page.evaluate(() => {
      const banner = document.querySelector('[class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"], .cck-container');
      return !!banner;
    });

    console.log('[TED] Has cookie banner:', hasCookieBanner);

    if (hasCookieBanner) {
      // Try to accept cookies
      const accepted = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a');
        for (const btn of buttons) {
          const text = btn.textContent.trim().toLowerCase();
          if (text.includes('accept') || text.includes('agree') || text.includes('ok') || text.includes('refuse') || text.includes('reject')) {
            btn.click();
            return text;
          }
        }
        return false;
      });
      console.log('[TED] Cookie button clicked:', accepted);
      await new Promise(r => setTimeout(r, 3000));
    }

    // Analyze page structure
    const tedInfo = await page.evaluate(() => {
      const result = {};
      result.title = document.title;
      result.bodyTextPreview = document.body.innerText.substring(0, 1000);

      // Look for result cards/items
      const selectors = [
        '.notice-search-result', '[class*="search-result"]', '[class*="notice"]',
        '[class*="result-item"]', '[class*="ResultItem"]', '.result',
        'table tbody tr', 'article', '.card', '[class*="card"]',
        'mat-card', 'app-notice-search-result', '[class*="Notice"]'
      ];

      result.selectorResults = {};
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          result.selectorResults[sel] = {
            count: els.length,
            firstText: els[0].textContent.trim().substring(0, 200),
            firstTag: els[0].tagName,
            firstClass: els[0].className.substring(0, 100)
          };
        }
      }

      // Check all links with 'notice' in href
      const noticeLinks = document.querySelectorAll('a[href*="notice"], a[href*="Notice"]');
      result.noticeLinks = Array.from(noticeLinks).slice(0, 10).map(a => ({
        text: a.textContent.trim().substring(0, 80),
        href: a.href
      }));

      // Check for Angular/React app
      const appRoot = document.querySelector('app-root, #root, #app, [ng-version]');
      result.hasSpaRoot = !!appRoot;
      result.spaTag = appRoot ? `${appRoot.tagName} class="${appRoot.className}"` : null;

      return result;
    });

    console.log('[TED] Page info:', JSON.stringify(tedInfo, null, 2));

    // Try TED API directly
    console.log('\n[TED] Trying API endpoint...');
    const apiPage = await browser.newPage();
    try {
      const apiUrl = 'https://ted.europa.eu/api/v3.0/notices/search?pageSize=10&pageNum=1&q=TD%3D3%20AND%20CPV%3D45*%20AND%20CY%3DNOR&fields=title-official-language,publication-date,deadline-receipt-tenders,notice-type,buyer-name,estimated-total-value&sortField=publication-date&reverseOrder=true';
      const response = await apiPage.goto(apiUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      const responseText = await apiPage.evaluate(() => document.body.innerText.substring(0, 3000));
      console.log('[TED API] Status:', response.status());
      console.log('[TED API] Response:', responseText.substring(0, 2000));
    } catch (e) {
      console.log('[TED API] Error:', e.message);
    } finally {
      await apiPage.close();
    }

  } catch (error) {
    console.error('[TED] Error:', error.message);
  } finally {
    await page.close();
  }
}

async function diagnoseMercell(browser) {
  console.log('\n========== MERCELL DIAGNOSE ==========');
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Track redirects
    const redirects = [];
    page.on('response', response => {
      if ([301, 302, 303, 307, 308].includes(response.status())) {
        redirects.push({ from: response.url(), to: response.headers()['location'], status: response.status() });
      }
    });

    console.log('[Mercell] Trying main search URL...');
    const searchUrl = 'https://www.mercell.com/en/search/tenders?query=bygg&country=NO&category=construction';
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    const mercellUrl = page.url();
    console.log('[Mercell] Final URL:', mercellUrl);
    console.log('[Mercell] Redirects:', JSON.stringify(redirects, null, 2));

    const mercellInfo = await page.evaluate(() => {
      const result = {};
      result.title = document.title;
      result.bodyTextPreview = document.body.innerText.substring(0, 1500);

      // Look for tender cards
      const selectors = [
        '[class*="tender"]', '[class*="notice"]', '[class*="result"]',
        '[class*="card"]', 'article', 'table tbody tr',
        '.search-result', '.list-item', '.procurement',
        'a[href*="tender"]', 'a[href*="notice"]', 'a[href*="procurement"]'
      ];

      result.selectorResults = {};
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          result.selectorResults[sel] = {
            count: els.length,
            firstText: els[0].textContent.trim().substring(0, 200),
            firstTag: els[0].tagName,
            firstClass: els[0].className.substring(0, 200)
          };
        }
      }

      return result;
    });

    console.log('[Mercell] Page info:', JSON.stringify(mercellInfo, null, 2));

    // Try alternative URLs
    const altUrls = [
      'https://www.mercell.com/en-gb/tenders/search/',
      'https://www.mercell.com/nb-no/tenders/',
      'https://www.mercell.com/en/tenderoverview.aspx'
    ];

    for (const url of altUrls) {
      console.log(`\n[Mercell] Trying: ${url}`);
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));
        const finalUrl = page.url();
        const title = await page.title();
        const preview = await page.evaluate(() => document.body.innerText.substring(0, 500));
        console.log(`[Mercell] -> ${finalUrl}`);
        console.log(`[Mercell] Title: ${title}`);
        console.log(`[Mercell] Text: ${preview.substring(0, 300)}`);
      } catch (e) {
        console.log(`[Mercell] Error: ${e.message}`);
      }
    }

  } catch (error) {
    console.error('[Mercell] Error:', error.message);
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    await diagnoseAnbud(browser);
    await diagnoseTed(browser);
    await diagnoseMercell(browser);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
