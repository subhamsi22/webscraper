# Google Business Profile Finder (Web Edition)

A web application that brings the exact business profile scraping and CSV lead extraction logic from the Chrome Extension to a standalone website.

## Features

- **Exact Extraction Logic**: Uses the regex patterns and card selectors from the extension (`div[jscontroller][data-cid], div.VkpGBb, div.cXedhc`).
- **Data Extracted**:
  - `entry_id` (Entry number)
  - `company_name` (Business name)
  - `phone` (Verified phone numbers using international regex pattern)
  - `rating` (Review score e.g. 4.8)
  - `review_count` (Review count e.g. 1.2K)
  - `category` (Industry/Category)
  - `location` (Full address/locality)
  - `status` (Open / Closed / Closes soon)
  - `closing_time` (e.g. Closes 9:30 pm)
  - `service_type` (In-store shopping, Delivery, etc.)
  - `website` (Official website link if present)
  - `details` (Full text snippet)
- **Automatic CSV Download**: Once you search, the `.csv` file is automatically downloaded to your downloads folder.
- **Multiple Export Formats**:
  - 📥 **Download CSV** (Excel-friendly with UTF-8 BOM)
  - 📋 **Download JSON**
  - 📄 **Download TXT Log**
  - 📋 **Copy to Clipboard**
- **Live Preview & Filter**: Search and filter through the extracted business listings in real-time.
- **Offline HTML Extractor**: Upload or paste saved Google search HTML pages to extract CSV leads offline.
- **Auto Browser Detection**: Works with Google Chrome or Microsoft Edge installed on your Windows machine.

---

## Quick Start

### 1. Launch with Batch Script (Easiest)
Simply double-click `start-website.bat` in the root folder, or `web\start.bat`.
It will start the server and open your browser to `http://localhost:3000`.

### 2. Launch via Terminal
```bash
cd web
node server.js
```
Then open `http://localhost:3000` in any web browser.

---

## API Endpoints

- `POST /api/scrape`: `{ "type": "Restaurants", "location": "Mumbai", "scrollMore": false }`
- `POST /api/download-csv`: Directly stream CSV file download.
- `POST /api/parse-html`: Parse raw Google HTML without browser.
- `GET /api/status`: Health check for browser and server.
