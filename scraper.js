const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');

/**
 * Auto-detect Chrome or Edge executable on Windows, macOS, or Linux.
 */
function findChromeExecutable() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWindows) {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
      // Fallback to Microsoft Edge (Chromium based, installed on all Windows 10/11)
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft\\Edge\\Application\\msedge.exe')
    ];

    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        return p;
      }
    }
  } else if (isMac) {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } else {
    // Linux / Docker / Render
    const candidates = [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }

    // Check Render / Linux cache dirs
    const homeCache = path.join(process.env.HOME || '/root', '.cache/puppeteer');
    const renderCache = '/opt/render/project/src/.cache/puppeteer';
    const cacheDirs = [renderCache, homeCache];

    for (const cacheDir of cacheDirs) {
      if (fs.existsSync(cacheDir)) {
        try {
          const findInDir = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              const fullPath = path.join(dir, file);
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                const res = findInDir(fullPath);
                if (res) return res;
              } else if (file === 'chrome' || file === 'chromium' || file === 'google-chrome') {
                return fullPath;
              }
            }
            return null;
          };
          const found = findInDir(cacheDir);
          if (found) return found;
        } catch (e) {}
      }
    }
  }

  throw new Error('Chrome or Edge browser executable not found. Please ensure Google Chrome or Microsoft Edge is installed.');
}

/**
 * Convert array of business objects to CSV format.
 */
function convertToCSV(dataArr) {
  if (!dataArr || dataArr.length === 0) return '';
  const headers = [
    'entry_id',
    'company_name',
    'phone',
    'rating',
    'review_count',
    'category',
    'location',
    'status',
    'closing_time',
    'service_type',
    'website',
    'details'
  ];

  const csvRows = [];
  csvRows.push(headers.join(','));

  for (const row of dataArr) {
    const values = headers.map(header => {
      const val = row[header] !== null && row[header] !== undefined ? String(row[header]) : '';
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\r\n');
}

/**
 * Parse cards extracted from DOM or HTML.
 */
function extractCardsFromCheerio(html) {
  const $ = cheerio.load(html);
  const cards = [];

  // Match the selectors from extension: div[jscontroller][data-cid], div.VkpGBb, div.cXedhc
  const cardElements = $('div[jscontroller][data-cid], div.VkpGBb, div.cXedhc').toArray();

  const filteredElements = cardElements.filter((elem, idx) => {
    return !cardElements.some((other, oIdx) => oIdx !== idx && $(other).has(elem).length > 0);
  });

  const finalElements = filteredElements.length > 0 ? filteredElements : cardElements;

  const jsonData = [];
  const allTextLog = [];

  finalElements.forEach((el, index) => {
    const card = $(el);
    const headingEl = card.find('[role="heading"]').first();
    const name = headingEl.length > 0 ? headingEl.text().trim() : (card.find('div.fontHeadlineSmall').first().text().trim() || 'No Name');
    const fullText = card.text().replace(/\s+/g, ' ').trim();

    // International regex pattern from script.js
    const phoneRegex = /(?:\+|00|0)?(?:\d{1,4}[ -]?)?(?:\(?\d{2,5}\)?[ -]?)?\d{3,4}[ -]?\d{3,5}/g;
    const matches = fullText.match(phoneRegex);

    let phoneNumber = 'N/A';
    if (matches) {
      const validPhone = matches.find((num) => {
        const digitsOnly = num.replace(/\D/g, '');
        return digitsOnly.length >= 8 && digitsOnly.length <= 15;
      });
      phoneNumber = validPhone ? validPhone.trim() : 'N/A';
    }

    allTextLog.push(`--- Entry ${index + 1}: ${name} ---\nPhone: ${phoneNumber}\nDetails:\n${fullText}\n`);

    // Structured JSON Entry
    let rating = null;
    let reviewCount = null;
    const ratingMatch = fullText.match(/(\d+(?:\.\d+)?)\s*\(([\d\.,]+[KkMmBb]?)\)/);
    if (ratingMatch) {
      rating = parseFloat(ratingMatch[1]);
      reviewCount = ratingMatch[2];
    }

    let category = '';
    const catMatch = fullText.match(/·\s*([^·\n\r]+)/);
    if (catMatch) {
      category = catMatch[1].trim();
    }

    // Location extraction
    let location = '';
    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (phoneNumber !== 'N/A' && line.includes(phoneNumber) && line.includes('·')) {
        const parts = line.split('·');
        for (const p of parts) {
          const cleaned = p.trim();
          if (cleaned && !cleaned.includes(phoneNumber) && !/^\d+\+?\s*years/i.test(cleaned)) {
            location = cleaned;
            break;
          }
        }
      }
      if (location) break;
    }
    if (!location) {
      for (const line of lines) {
        if (line === name || /^(Open|Closed|Closes|Opens|In-store|Kerbside|Delivery|On-site|Pick-up|\")/i.test(line)) continue;
        if (/\d\.\d\s*\(/.test(line)) continue;
        const p = line.split('·');
        const cand = p[0].trim();
        if (!/^\d+\+?\s*years/i.test(cand) && cand.length > 0) {
          location = cand;
          break;
        } else if (p[1]) {
          location = p[1].trim();
          break;
        }
      }
    }

    // Status & Closing time
    let status = '';
    let closingTime = '';
    const statusMatch = fullText.match(/(Open 24 hours|Open|Closed|Closes soon|Opens soon)/i);
    if (statusMatch) {
      status = statusMatch[1].trim();
    }
    const timeMatch = fullText.match(/(?:Closes(?: soon)?\s*(?:·\s*)?|Opens\s*)([0-9:]+\s*[apAP\s\.]+[mM]?)/u);
    if (timeMatch) {
      closingTime = timeMatch[1].trim();
    }

    // Services
    const serviceMatches = fullText.match(/(?:In-store shopping|In-store pick-up|Kerbside pickup|Delivery|On-site services(?: not available)?)/gi);
    const serviceType = serviceMatches ? Array.from(new Set(serviceMatches.map(s => s.trim()))).join(', ') : '';

    const linkElem = card.find('a[href^="http"]:not([href*="google.com"])').first();
    const website = linkElem.length > 0 ? linkElem.attr('href') : '';

    jsonData.push({
      entry_id: index + 1,
      company_name: name,
      phone: phoneNumber,
      rating: rating,
      review_count: reviewCount,
      category: category,
      location: location,
      status: status,
      closing_time: closingTime,
      service_type: serviceType,
      website: website,
      details: fullText
    });
  });

  return {
    data: jsonData,
    csv: convertToCSV(jsonData),
    txt: allTextLog.join('\n----------------------------------------\n\n')
  };
}

/**
 * Scrape Google Business Profiles using headless browser.
 */
async function scrapeGoogleBusiness(businessType, location, options = {}) {
  const chromePath = findChromeExecutable();
  const scrollMore = options.scrollMore || false;

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--lang=en-US,en'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    });

    // Stealth: Hide webdriver from bot detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.navigator.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    // Set Google consent cookies to prevent consent wall on cloud/EU/US IPs
    try {
      await page.setCookie(
        { name: 'SOCS', value: 'CAESHAgBEhJnd3NfMjAyNDA5MjQtMF9SQzEaAmVuIAEaBgiA_L20Bg', domain: '.google.com', path: '/' },
        { name: 'CONSENT', value: 'PENDING+999', domain: '.google.com', path: '/' }
      );
    } catch (cookieErr) {
      console.log('[Scraper] Cookie set warning:', cookieErr.message);
    }

    const searchQuery = `${businessType.trim()} in ${location.trim()}`;
    let searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&udm=local&hl=en`;

    console.log(`[Scraper] Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

    // Handle Google Consent page if redirected
    const currentUrl = page.url();
    console.log(`[Scraper] Loaded page URL: ${currentUrl} | Title: ${await page.title().catch(() => '')}`);

    if (currentUrl.includes('consent.google') || (await page.$('#L2AGLb, #W0wltc, form[action*="consent"] button'))) {
      console.log('[Scraper] Google Consent detected. Auto-accepting...');
      try {
        const acceptBtn = await page.$('#L2AGLb, button[aria-label*="Accept all"], button[aria-label*="Alle akzeptieren"], form[action*="consent"] button');
        if (acceptBtn) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
            acceptBtn.click()
          ]);
          console.log('[Scraper] Consent accepted. Resumed at:', page.url());
        }
      } catch (err) {
        console.log('[Scraper] Consent click error:', err.message);
      }
    }

    // Wait for the local business cards to render
    const cardSelectorList = 'div[jscontroller][data-cid], div.VkpGBb, div.cXedhc, div[data-cid], div.uSZmif, div.rlfl__tls > div';
    try {
      await page.waitForSelector(cardSelectorList, { timeout: 8000 });
    } catch (e) {
      console.log('[Scraper] udm=local wait selector timeout. Checking if standard search has results...');
    }

    // Check if cards were found, if not, fallback to standard Google search query
    let hasCards = await page.$$eval(cardSelectorList, els => els.length > 0).catch(() => false);
    if (!hasCards) {
      console.log('[Scraper] No cards on udm=local. Falling back to standard Google search...');
      const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&hl=en`;
      await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      try {
        await page.waitForSelector(cardSelectorList, { timeout: 8000 });
      } catch (err) {}
    }

    // Additional settling time
    await new Promise(r => setTimeout(r, 2000));

    if (scrollMore) {
      console.log('[Scraper] Scrolling to load additional results...');
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000));
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000));
    }

    // Run extraction inside the live browser page with full fidelity
    const extractedData = await page.evaluate(() => {
      const rawCards = Array.from(document.querySelectorAll(
        'div[jscontroller][data-cid], div.VkpGBb, div.cXedhc, div[data-cid], div.uSZmif, div.rlfl__tls > div'
      ));

      if (rawCards.length === 0) {
        return { data: [], txt: '' };
      }

      // Filter out child cards so each card is only included once
      let cards = rawCards.filter((card, idx) => {
        return !rawCards.some((other, oIdx) => oIdx !== idx && other.contains(card));
      });
      if (cards.length === 0) {
        cards = rawCards;
      }

      let allData = [];
      let jsonData = [];

      cards.forEach((card, index) => {
        const name = card.querySelector('[role="heading"]')?.innerText?.trim() || "No Name";
        const fullText = card.innerText.trim();

        // International regex pattern
        const phoneRegex = /(?:\+|00|0)?(?:\d{1,4}[ -]?)?(?:\(?\d{2,5}\)?[ -]?)?\d{3,4}[ -]?\d{3,5}/g;
        const matches = fullText.match(phoneRegex);

        let phoneNumber = "N/A";
        if (matches) {
          const validPhone = matches.find((num) => {
            const digitsOnly = num.replace(/\D/g, "");
            return digitsOnly.length >= 8 && digitsOnly.length <= 15;
          });
          phoneNumber = validPhone ? validPhone.trim() : "N/A";
        }

        // 1. Text Entry
        allData.push(
          `--- Entry ${index + 1}: ${name} ---\nPhone: ${phoneNumber}\nDetails:\n${fullText}\n`
        );

        // 2. Structured JSON Entry
        let rating = null;
        let reviewCount = null;
        const ratingMatch = fullText.match(/(\d+(?:\.\d+)?)\s*\(([\d\.,]+[KkMmBb]?)\)/);
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1]);
          reviewCount = ratingMatch[2];
        }

        let category = "";
        const catMatch = fullText.match(/·\s*([^·\n\r]+)/);
        if (catMatch) {
          category = catMatch[1].trim();
        }

        // Location extraction
        let location = "";
        const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (phoneNumber !== "N/A" && line.includes(phoneNumber) && line.includes('·')) {
            const parts = line.split('·');
            for (const p of parts) {
              const cleaned = p.trim();
              if (cleaned && !cleaned.includes(phoneNumber) && !/^\d+\+?\s*years/i.test(cleaned)) {
                location = cleaned;
                break;
              }
            }
          }
          if (location) break;
        }
        if (!location) {
          for (const line of lines) {
            if (line === name || /^(Open|Closed|Closes|Opens|In-store|Kerbside|Delivery|On-site|Pick-up|\")/i.test(line)) continue;
            if (/\d\.\d\s*\(/.test(line)) continue;
            const p = line.split('·');
            const cand = p[0].trim();
            if (!/^\d+\+?\s*years/i.test(cand) && cand.length > 0) {
              location = cand;
              break;
            } else if (p[1]) {
              location = p[1].trim();
              break;
            }
          }
        }

        // Status & Closing time
        let status = "";
        let closingTime = "";
        const statusMatch = fullText.match(/(Open 24 hours|Open|Closed|Closes soon|Opens soon)/i);
        if (statusMatch) {
          status = statusMatch[1].trim();
        }
        const timeMatch = fullText.match(/(?:Closes(?: soon)?\s*(?:·\s*)?|Opens\s*)([0-9:]+\s*[apAP\s\.]+[mM]?)/u);
        if (timeMatch) {
          closingTime = timeMatch[1].trim();
        }

        // Services
        const serviceMatches = fullText.match(/(?:In-store shopping|In-store pick-up|Kerbside pickup|Delivery|On-site services(?: not available)?)/gi);
        const serviceType = serviceMatches ? Array.from(new Set(serviceMatches.map(s => s.trim()))).join(", ") : "";

        // Check website
        const linkElem = card.querySelector('a[href^="http"]:not([href*="google.com"])');
        const website = linkElem ? linkElem.href : "";

        jsonData.push({
          entry_id: index + 1,
          company_name: name,
          phone: phoneNumber,
          rating: rating,
          review_count: reviewCount,
          category: category,
          location: location,
          status: status,
          closing_time: closingTime,
          service_type: serviceType,
          website: website,
          details: fullText
        });
      });

      return {
        data: jsonData,
        txt: allData.join("\n----------------------------------------\n\n")
      };
    });

    const csvContent = convertToCSV(extractedData.data);

    return {
      success: true,
      count: extractedData.data.length,
      data: extractedData.data,
      csv: csvContent,
      txt: extractedData.txt
    };

  } finally {
    await browser.close();
  }
}

module.exports = {
  findChromeExecutable,
  convertToCSV,
  extractCardsFromCheerio,
  scrapeGoogleBusiness
};
