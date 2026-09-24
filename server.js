const express = require('express');
const cors = require('cors');
const path = require('path');
const { scrapeGoogleBusiness, extractCardsFromCheerio, findChromeExecutable } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing (with 20MB limit for uploading large HTML files)
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Status / Health check
app.get('/api/status', (req, res) => {
  try {
    const chromePath = findChromeExecutable();
    res.json({
      status: 'ready',
      browser: chromePath,
      message: 'Scraper engine is ready to extract Google Business profiles.'
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});

// Main Scraping Endpoint
app.post('/api/scrape', async (req, res) => {
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
app.post('/api/download-csv', (req, res) => {
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
app.post('/api/parse-html', (req, res) => {
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
