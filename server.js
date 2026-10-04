const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { scrapeGoogleBusiness, extractCardsFromCheerio, findChromeExecutable } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vdxebetyqodillkzyles.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_0SAZf3QMqeiZw4De_7Z1bg_6m3KFtAW';
const SESSION_IDLE_TTL_MS = 5 * 60 * 1000;
const sessions = new Map();

function getSessionToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)key_access_session=([^;]+)/);
  return match ? match[1] : null;
}

function requireAccess(req, res, next) {
  const token = getSessionToken(req);
  const session = token && sessions.get(token);

  if (!session || Date.now() - session.lastActivityAt >= SESSION_IDLE_TTL_MS) {
    if (token) sessions.delete(token);
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, error: 'Please enter a valid access key.' });
    }
    return res.redirect('/');
  }

  session.lastActivityAt = Date.now();
  next();
}

// Enable CORS and JSON parsing (with 20MB limit for uploading large HTML files)
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.get('/', (req, res) => {
  const token = getSessionToken(req);
  const session = token && sessions.get(token);
  if (session && Date.now() - session.lastActivityAt < SESSION_IDLE_TTL_MS) {
    session.lastActivityAt = Date.now();
    return res.redirect('/index.html');
  }
  if (token) sessions.delete(token);
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/index.html', requireAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Do not let static middleware serve index.html outside the access gate above.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Status / Health check
app.get('/api/status', (req, res) => {
  if (process.env.SERPER_API_KEY) {
    return res.json({ status: 'ready', mode: 'serper', message: 'Using Serper.dev (cloud-safe, 2500 free/month).' });
  }
  if (process.env.SERPAPI_KEY) {
    return res.json({ status: 'ready', mode: 'serpapi', message: 'Using SerpAPI (cloud-safe mode).' });
  }
  try {
    const chromePath = findChromeExecutable();
    res.json({ status: 'ready', mode: 'puppeteer', browser: chromePath, message: 'Using direct browser (local mode).' });
  } catch (err) {
    res.status(500).json({ status: 'error', mode: 'none', message: err.message });
  }
});

app.post('/api/verify-key', async (req, res) => {
  const key = typeof req.body.key === 'string' ? req.body.key.trim() : '';
  if (!key) return res.status(400).json({ success: false, error: 'Please enter your access key.' });

  const endpoint = new URL('/rest/v1/rpc/verify_payment_key', SUPABASE_URL);
  let isValid;
  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({ candidate_key: key }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const details = await response.text();
      console.error(`[Auth] Supabase returned ${response.status}: ${details}`);
      return res.status(503).json({
        success: false,
        error: 'Could not verify this key. Please try again later.'
      });
    }

    isValid = await response.json();
    if (typeof isValid !== 'boolean') {
      console.error('[Auth] Supabase returned an unexpected payment verification response.');
      return res.status(503).json({
        success: false,
        error: 'Could not verify this key. Please try again later.'
      });
    }
  } catch (err) {
    console.error('[Auth] Supabase key verification request failed:', err);
    return res.status(503).json({
      success: false,
      error: 'Could not verify this key. Please try again later.'
    });
  }

  if (!isValid) {
    return res.status(401).json({ success: false, error: 'Invalid key. Please check your key and try again.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  for (const [sessionToken, session] of sessions) {
    if (now - session.lastActivityAt >= SESSION_IDLE_TTL_MS) sessions.delete(sessionToken);
  }
  sessions.set(token, { lastActivityAt: now });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `key_access_session=${token}; HttpOnly; SameSite=Strict; Path=/${secure ? '; Secure' : ''}`
  );
  res.json({ success: true });
});

app.post('/api/session/logout', (req, res) => {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `key_access_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`
  );
  res.sendStatus(204);
});

app.post('/api/session/heartbeat', requireAccess, (req, res) => {
  res.sendStatus(204);
});

// Main Scraping Endpoint
app.post('/api/scrape', requireAccess, async (req, res) => {
  const { type, location, scrollMore } = req.body;

  if (!type || !type.trim()) {
    return res.status(400).json({ success: false, error: 'Business Type is required (e.g. Restaurants, Hardware, Dentists).' });
  }

  if (!location || !location.trim()) {
    return res.status(400).json({ success: false, error: 'Location is required (e.g. Mumbai, Delhi, New York).' });
  }

  console.log(`[API] Scrape requested: "${type.trim()}" in "${location.trim()}" (scrollMore: ${Boolean(scrollMore)})`);

  try {
    const result = await scrapeGoogleBusiness(type.trim(), location.trim(), { scrollMore: Boolean(scrollMore) });
    const sanitizedType = type.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedLoc = location.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${sanitizedType}_${sanitizedLoc}_leads.csv`;

    res.json({
      success: true,
      filename,
      query: { type: type.trim(), location: location.trim() },
      count: result.count,
      data: result.data,
      csv: result.csv,
      txt: result.txt
    });
  } catch (err) {
    console.error('[API] Scrape failed:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to scrape business profiles. Please check your internet connection or browser setup.'
    });
  }
});

// Download CSV direct file endpoint
app.post('/api/download-csv', requireAccess, (req, res) => {
  const { csv, filename } = req.body;
  if (!csv) {
    return res.status(400).send('No CSV content provided.');
  }

  const safeFilename = (filename || 'google_business_leads.csv').replace(/[^a-zA-Z0-9_.-]/g, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  // Include UTF-8 BOM so Excel opens Hindi / Unicode characters properly
  res.send('\uFEFF' + csv);
});

// Parse Offline HTML
app.post('/api/parse-html', requireAccess, (req, res) => {
  const { html, filename } = req.body;
  if (!html || !html.trim()) {
    return res.status(400).json({ success: false, error: 'HTML content is empty.' });
  }

  try {
    const result = extractCardsFromCheerio(html);
    res.json({
      success: true,
      count: result.data.length,
      data: result.data,
      csv: result.csv,
      txt: result.txt,
      filename: (filename ? filename.replace(/\.html$/i, '') : 'extracted') + '_leads.csv'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Google Business Profile Finder Web Application `);
  console.log(` Server running at: http://localhost:${PORT}`);
  console.log(`====================================================`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    const fallbackPort = PORT + 1;
    console.log(`Port ${PORT} is in use, trying port ${fallbackPort}...`);
    app.listen(fallbackPort, () => {
      console.log(`Server started on alternative port: http://localhost:${fallbackPort}`);
    });
  } else {
    console.error('Server error:', e);
  }
});
