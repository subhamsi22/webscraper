const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');

// ─────────────────────────────────────────────────────────────────────────────
// Shared: CSV Converter
// ─────────────────────────────────────────────────────────────────────────────
function convertToCSV(dataArr) {
  if (!dataArr || dataArr.length === 0) return '';
  const headers = [
    'entry_id', 'company_name', 'phone', 'rating', 'review_count',
    'category', 'location', 'status', 'closing_time', 'service_type', 'website', 'details'
  ];
  const csvRows = [headers.join(',')];
  for (const row of dataArr) {
    const values = headers.map(h => {
      const val = row[h] !== null && row[h] !== undefined ? String(row[h]) : '';
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\r\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Parse plain text card data (same regex logic as extension)
// ─────────────────────────────────────────────────────────────────────────────
function parseCardText(fullText, index) {
  const phoneRegex = /(?:\+|00|0)?(?:\d{1,4}[ -]?)?(?:\(?\d{2,5}\)?[ -]?)?\d{3,4}[ -]?\d{3,5}/g;
  const matches = fullText.match(phoneRegex) || [];
  let phoneNumber = 'N/A';
  const validPhone = matches.find(num => {
    const d = num.replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15;
  });
  if (validPhone) phoneNumber = validPhone.trim();

  let rating = null, reviewCount = null;
  const ratingMatch = fullText.match(/(\d+(?:\.\d+)?)\s*\(([\d\.,]+[KkMmBb]?)\)/);
  if (ratingMatch) { rating = parseFloat(ratingMatch[1]); reviewCount = ratingMatch[2]; }

  let category = '';
  const catMatch = fullText.match(/·\s*([^·\n\r]+)/);
  if (catMatch) category = catMatch[1].trim();

  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  let location = '';
  for (const line of lines) {
    if (phoneNumber !== 'N/A' && line.includes(phoneNumber) && line.includes('·')) {
      const parts = line.split('·');
      for (const p of parts) {
        const cleaned = p.trim();
        if (cleaned && !cleaned.includes(phoneNumber) && !/^\d+\+?\s*years/i.test(cleaned)) {
          location = cleaned; break;
        }
      }
    }
    if (location) break;
  }
  if (!location) {
    for (const line of lines) {
      if (/^(Open|Closed|Closes|Opens|In-store|Kerbside|Delivery|On-site|Pick-up|")/i.test(line)) continue;
      if (/\d\.\d\s*\(/.test(line)) continue;
      const p = line.split('·');
      const cand = p[0].trim();
      if (!/^\d+\+?\s*years/i.test(cand) && cand.length > 3) { location = cand; break; }
      else if (p[1]) { location = p[1].trim(); break; }
    }
  }

  let status = '', closingTime = '';
  const statusMatch = fullText.match(/(Open 24 hours|Open|Closed|Closes soon|Opens soon)/i);
  if (statusMatch) status = statusMatch[1].trim();
  const timeMatch = fullText.match(/(?:Closes(?: soon)?\s*(?:·\s*)?|Opens\s*)([0-9:]+\s*[apAP\s\.]+[mM]?)/u);
  if (timeMatch) closingTime = timeMatch[1].trim();

  const serviceMatches = fullText.match(/(?:In-store shopping|In-store pick-up|Kerbside pickup|Delivery|On-site services(?: not available)?)/gi);
  const serviceType = serviceMatches ? [...new Set(serviceMatches.map(s => s.trim()))].join(', ') : '';

  return { entry_id: index + 1, phone: phoneNumber, rating, review_count: reviewCount, category, location, status, closing_time: closingTime, service_type: serviceType };
}

// ─────────────────────────────────────────────────────────────────────────────
// Method 1: SerpAPI  (works on all cloud servers — bypasses IP blocking)
// Get your free key at: https://serpapi.com (100 free searches/month)
// Set env var: SERPAPI_KEY=your_key_here
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeViaSerpAPI(businessType, location) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error('SERPAPI_KEY not set');

  const query = `${businessType.trim()} in ${location.trim()}`;
  const url = `https://serpapi.com/search.json?engine=google_local&q=${encodeURIComponent(query)}&hl=en&gl=in&api_key=${apiKey}`;

  console.log(`[SerpAPI] Requesting: ${query}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`SerpAPI HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const localResults = data.local_results || [];
  console.log(`[SerpAPI] Got ${localResults.length} local results`);

  const jsonData = localResults.map((item, index) => {
    const fullText = [
      item.title,
      item.type,
      item.address,
      item.phone,
      item.hours,
      item.description
    ].filter(Boolean).join('\n');

    return {
      entry_id: index + 1,
      company_name: item.title || 'No Name',
      phone: item.phone || 'N/A',
      rating: item.rating || null,
      review_count: item.reviews ? String(item.reviews) : null,
      category: item.type || '',
      location: item.address || '',
      status: item.hours || '',
      closing_time: '',
      service_type: '',
      website: item.website || item.links?.website || '',
      details: fullText
    };
  });

  return {
    success: true,
    count: jsonData.length,
    data: jsonData,
    csv: convertToCSV(jsonData),
    txt: jsonData.map(d => `--- Entry ${d.entry_id}: ${d.company_name} ---\nPhone: ${d.phone}\nDetails:\n${d.details}\n`).join('\n---\n\n')
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Method 2: Direct Puppeteer  (works locally, may be blocked on cloud IPs)
// ─────────────────────────────────────────────────────────────────────────────
function findChromeExecutable() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWindows) {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const p of candidates) { if (p && fs.existsSync(p)) return p; }
  } else if (isMac) {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ];
    for (const p of candidates) { if (fs.existsSync(p)) return p; }
  } else {
    // Linux / Docker / Render
    const candidates = [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
    for (const p of candidates) { if (fs.existsSync(p)) return p; }

    // Search in Puppeteer cache dirs
    const cacheDirs = [
      '/opt/render/project/src/.cache/puppeteer',
      path.join(process.env.HOME || '/root', '.cache/puppeteer')
    ];
    for (const cacheDir of cacheDirs) {
      if (!fs.existsSync(cacheDir)) continue;
      const findInDir = (dir) => {
        try {
          for (const file of fs.readdirSync(dir)) {
            const full = path.join(dir, file);
            if (fs.statSync(full).isDirectory()) { const r = findInDir(full); if (r) return r; }
            else if (file === 'chrome' || file === 'chromium' || file === 'google-chrome') return full;
          }
        } catch (e) {}
        return null;
      };
      const found = findInDir(cacheDir);
      if (found) return found;
    }
  }
  throw new Error('Chrome/Edge not found. Please install Google Chrome or set PUPPETEER_EXECUTABLE_PATH.');
}

async function scrapeViaPuppeteer(businessType, location, scrollMore = false) {
  const chromePath = findChromeExecutable();
  console.log(`[Puppeteer] Using browser: ${chromePath}`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas',
      '--no-first-run', '--no-zygote', '--disable-gpu', '--lang=en-US,en',
      '--disable-infobars', '--window-size=1366,768'
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

    // Stealth
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.navigator.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    // Pre-set consent cookies
    await page.setCookie(
      { name: 'SOCS', value: 'CAESHAgBEhJnd3NfMjAyNDA5MjQtMF9SQzEaAmVuIAEaBgiA_L20Bg', domain: '.google.com', path: '/' },
      { name: 'CONSENT', value: 'PENDING+999', domain: '.google.com', path: '/' },
      { name: 'NID', value: '511=fake', domain: '.google.com', path: '/' }
    ).catch(() => {});

    const searchQuery = `${businessType.trim()} in ${location.trim()}`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&udm=local&hl=en`;
    console.log(`[Puppeteer] Navigating to: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const pageTitle = await page.title().catch(() => '');
    const pageUrl = page.url();
    console.log(`[Puppeteer] Landed: ${pageUrl} | "${pageTitle}"`);

    // Auto-accept consent if shown
    if (pageUrl.includes('consent.google') || pageTitle.includes('Before you continue')) {
      console.log('[Puppeteer] Consent wall detected. Auto-accepting...');
      const acceptBtn = await page.$('#L2AGLb, button[aria-label*="Accept"], form[action*="consent"] button').catch(() => null);
      if (acceptBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
          acceptBtn.click()
        ]);
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    const cardSelector = 'div[jscontroller][data-cid], div.VkpGBb, div.cXedhc, div[data-cid]';
    try { await page.waitForSelector(cardSelector, { timeout: 8000 }); } catch (e) {}

    const cardCount = await page.$$eval(cardSelector, els => els.length).catch(() => 0);
    console.log(`[Puppeteer] Found ${cardCount} cards with udm=local`);

    if (cardCount === 0) {
      throw new Error('Google blocked scraping from this cloud server IP. Please configure SERPAPI_KEY for cloud deployment.');
    }

    if (scrollMore) {
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000));
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000));
    } else {
      await new Promise(r => setTimeout(r, 1500));
    }

    const extractedData = await page.evaluate(() => {
      const rawCards = Array.from(document.querySelectorAll('div[jscontroller][data-cid], div.VkpGBb, div.cXedhc, div[data-cid]'));
      let cards = rawCards.filter((card, idx) => !rawCards.some((other, oIdx) => oIdx !== idx && other.contains(card)));
      if (cards.length === 0) cards = rawCards;

      let allData = [], jsonData = [];
      cards.forEach((card, index) => {
        const name = card.querySelector('[role="heading"]')?.innerText?.trim() || 'No Name';
        const fullText = card.innerText.trim();
        const website = card.querySelector('a[href^="http"]:not([href*="google.com"])')?.href || '';
        allData.push(`--- Entry ${index + 1}: ${name} ---\nDetails:\n${fullText}\n`);
        jsonData.push({ name, fullText, website, index });
      });
      return { rawItems: jsonData, txt: allData.join('\n---\n\n') };
    });

    const jsonData = extractedData.rawItems.map(item => {
      const parsed = parseCardText(item.fullText, item.index);
      return { ...parsed, company_name: item.name, website: item.website, details: item.fullText };
    });

    return {
      success: true,
      count: jsonData.length,
      data: jsonData,
      csv: convertToCSV(jsonData),
      txt: extractedData.txt
    };

  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export: scrapeGoogleBusiness
// Automatically picks the best method:
//   1. SerpAPI  → if SERPAPI_KEY env var is set (works everywhere)
//   2. Puppeteer → fallback (works locally, may fail on cloud)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeGoogleBusiness(businessType, location, options = {}) {
  if (process.env.SERPAPI_KEY) {
    console.log('[Scraper] Using SerpAPI (cloud-safe mode)');
    return scrapeViaSerpAPI(businessType, location);
  }
  console.log('[Scraper] SERPAPI_KEY not set. Using direct Puppeteer (local mode)');
  return scrapeViaPuppeteer(businessType, location, options.scrollMore || false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cheerio offline HTML extractor (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function extractCardsFromCheerio(html) {
  const $ = cheerio.load(html);
  const cardElements = $('div[jscontroller][data-cid], div.VkpGBb, div.cXedhc').toArray();
  const filtered = cardElements.filter((el, idx) => !cardElements.some((other, oIdx) => oIdx !== idx && $(other).has(el).length > 0));
  const finals = filtered.length > 0 ? filtered : cardElements;

  const jsonData = [], allTextLog = [];
  finals.forEach((el, index) => {
    const card = $(el);
    const name = card.find('[role="heading"]').first().text().trim() || card.find('div.fontHeadlineSmall').first().text().trim() || 'No Name';
    const fullText = card.text().replace(/\s+/g, ' ').trim();
    const parsed = parseCardText(fullText, index);
    const website = card.find('a[href^="http"]:not([href*="google.com"])').first().attr('href') || '';
    allTextLog.push(`--- Entry ${index + 1}: ${name} ---\nPhone: ${parsed.phone}\nDetails:\n${fullText}\n`);
    jsonData.push({ ...parsed, company_name: name, website, details: fullText });
  });

  return { data: jsonData, csv: convertToCSV(jsonData), txt: allTextLog.join('\n---\n\n') };
}

module.exports = { findChromeExecutable, convertToCSV, extractCardsFromCheerio, scrapeGoogleBusiness };
