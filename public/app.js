// State management
let currentResults = [];
let currentCsv = '';
let currentTxt = '';
let currentFilename = 'google_business_leads.csv';

// DOM Elements
const finderForm = document.getElementById('finderForm');
const businessTypeInput = document.getElementById('businessType');
const locationInput = document.getElementById('location');
const searchBtn = document.getElementById('searchBtn');
const autoDownloadCheck = document.getElementById('autoDownloadCheck');
const scrollMoreCheck = document.getElementById('scrollMoreCheck');

const loadingBanner = document.getElementById('loadingBanner');
const loadingTitle = document.getElementById('loadingTitle');
const loadingMsg = document.getElementById('loadingMsg');
const errorAlert = document.getElementById('errorAlert');
const errorMessage = document.getElementById('errorMessage');

const resultsSection = document.getElementById('resultsSection');
const statTotal = document.getElementById('statTotal');
const statPhones = document.getElementById('statPhones');
const statRating = document.getElementById('statRating');
const statCategory = document.getElementById('statCategory');

const resultsTableBody = document.getElementById('resultsTableBody');
const tableFilter = document.getElementById('tableFilter');
const tableEmptyMessage = document.getElementById('tableEmptyMessage');

const downloadCsvBtn = document.getElementById('downloadCsvBtn');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');
const downloadTxtBtn = document.getElementById('downloadTxtBtn');
const copyCsvBtn = document.getElementById('copyCsvBtn');

const serverStatusBadge = document.getElementById('serverStatusBadge');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  checkServerStatus();
  initPresetTags();
  initOfflineParser();
});

// Check Server Status
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (res.ok && data.status === 'ready') {
      serverStatusBadge.innerHTML = `
        <span class="status-dot online"></span>
        <span class="status-text text-white small">Engine Ready</span>
      `;
    } else {
      serverStatusBadge.innerHTML = `
        <span class="status-dot offline"></span>
        <span class="status-text text-danger small">Browser not found</span>
      `;
    }
  } catch (err) {
    serverStatusBadge.innerHTML = `
      <span class="status-dot offline"></span>
      <span class="status-text text-danger small">Server Offline</span>
    `;
  }
}

// Quick Preset Click Handlers
function initPresetTags() {
  document.querySelectorAll('.preset-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const type = tag.getAttribute('data-type');
      const loc = tag.getAttribute('data-loc');
      businessTypeInput.value = type;
      locationInput.value = loc;
      finderForm.dispatchEvent(new Event('submit'));
    });
  });
}

// Handle Form Submission (Search)
finderForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const businessType = businessTypeInput.value.trim();
  const location = locationInput.value.trim();
  const scrollMore = scrollMoreCheck.checked;
  const autoDownload = autoDownloadCheck.checked;

  if (!businessType || !location) {
    showError('Please enter both business type and location.');
    return;
  }

  hideError();
  showLoading(true, `Searching Google for "${businessType}" in "${location}"...`);

  // Simulated progressive feedback
  const progressTimer1 = setTimeout(() => {
    if (!loadingBanner.classList.contains('d-none')) {
      loadingMsg.textContent = 'Navigating to Google Local search results & parsing profiles...';
    }
  }, 3500);

  const progressTimer2 = setTimeout(() => {
    if (!loadingBanner.classList.contains('d-none')) {
      loadingMsg.textContent = 'Extracting names, phone numbers, ratings, and location details...';
    }
  }, 7000);

  try {
    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: businessType, location, scrollMore })
    });

    clearTimeout(progressTimer1);
    clearTimeout(progressTimer2);

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to extract data.');
    }

    if (!result.data || result.data.length === 0) {
      showError(`No business profiles found for "${businessType} in ${location}". Try adjusting your keywords.`);
      showLoading(false);
      return;
    }

    // Store state
    currentResults = result.data;
    currentCsv = result.csv;
    currentTxt = result.txt;
    currentFilename = result.filename || `${businessType}_${location}_leads.csv`;

    // Render metrics and table
    renderMetrics(currentResults);
    renderTable(currentResults);
    resultsSection.classList.remove('d-none');
    showLoading(false);

    // Auto download CSV if enabled
    if (autoDownload) {
      downloadFile(currentCsv, currentFilename, 'text/csv;charset=utf-8');
      showToast(`Extracted ${result.count} businesses! CSV downloaded automatically.`);
    } else {
      showToast(`Extracted ${result.count} businesses successfully!`);
    }

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    clearTimeout(progressTimer1);
    clearTimeout(progressTimer2);
    showLoading(false);
    showError(err.message);
  }
});

// Render Metric Cards
function renderMetrics(data) {
  statTotal.textContent = data.length;

  const withPhone = data.filter(d => d.phone && d.phone !== 'N/A').length;
  statPhones.textContent = withPhone;

  const ratedItems = data.filter(d => d.rating !== null && !isNaN(d.rating));
  if (ratedItems.length > 0) {
    const avg = ratedItems.reduce((acc, curr) => acc + Number(curr.rating), 0) / ratedItems.length;
    statRating.textContent = avg.toFixed(1);
  } else {
    statRating.textContent = 'N/A';
  }

  // Find most frequent category
  const catCounts = {};
  data.forEach(d => {
    if (d.category) {
      catCounts[d.category] = (catCounts[d.category] || 0) + 1;
    }
  });
  const topCat = Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a])[0];
  statCategory.textContent = topCat || 'Local Business';
}

// Render Results Table
function renderTable(data) {
  resultsTableBody.innerHTML = '';
  tableFilter.value = '';
  tableEmptyMessage.classList.add('d-none');

  data.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.dataset.index = index;

    // Phone HTML
    const phoneHtml = (item.phone && item.phone !== 'N/A')
      ? `<a href="tel:${item.phone.replace(/\s+/g, '')}" class="phone-badge text-truncate">
           <i class="bi bi-telephone-fill"></i> ${escapeHtml(item.phone)}
         </a>`
      : `<span class="text-secondary small">N/A</span>`;

    // Rating HTML
    let ratingHtml = `<span class="text-secondary small">No reviews</span>`;
    if (item.rating) {
      ratingHtml = `
        <div class="d-flex align-items-center gap-1">
          <span class="text-warning fw-bold">${item.rating}</span>
          <i class="bi bi-star-fill text-warning small"></i>
          <span class="text-secondary small">(${item.review_count || '0'})</span>
        </div>
      `;
    }

    // Category HTML
    const categoryHtml = item.category
      ? `<span class="category-pill">${escapeHtml(item.category)}</span>`
      : `<span class="text-secondary small">-</span>`;

    // Status HTML
    let statusClass = 'status-open';
    if (/closed/i.test(item.status)) statusClass = 'status-closed';
    const statusHtml = item.status
      ? `<div>
           <span class="status-badge ${statusClass}">${escapeHtml(item.status)}</span>
           ${item.closing_time ? `<div class="text-secondary small mt-1">${escapeHtml(item.closing_time)}</div>` : ''}
         </div>`
      : `<span class="text-secondary small">-</span>`;

    tr.innerHTML = `
      <td class="text-secondary fw-semibold">${item.entry_id || index + 1}</td>
      <td>
        <div class="fw-bold text-white">${escapeHtml(item.company_name)}</div>
        ${item.website ? `<a href="${item.website}" target="_blank" class="small text-primary text-decoration-none"><i class="bi bi-link-45deg"></i> Website</a>` : ''}
      </td>
      <td>${phoneHtml}</td>
      <td>${ratingHtml}</td>
      <td>${categoryHtml}</td>
      <td><div class="text-truncate" style="max-width: 220px;" title="${escapeHtml(item.location || '')}">${escapeHtml(item.location || 'N/A')}</div></td>
      <td>${statusHtml}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary view-details-btn" data-index="${index}">
          <i class="bi bi-eye"></i> Details
        </button>
      </td>
    `;

    resultsTableBody.appendChild(tr);
  });

  // Attach Details Modal Buttons
  document.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = e.currentTarget.getAttribute('data-index');
      showDetailsModal(currentResults[idx]);
    });
  });
}

// Table Filter
tableFilter.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  const rows = resultsTableBody.querySelectorAll('tr');
  let visibleCount = 0;

  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    if (text.includes(query)) {
      row.style.display = '';
      visibleCount++;
    } else {
      row.style.display = 'none';
    }
  });

  if (visibleCount === 0) {
    tableEmptyMessage.classList.remove('d-none');
  } else {
    tableEmptyMessage.classList.add('d-none');
  }
});

// View Details Modal
function showDetailsModal(item) {
  if (!item) return;

  document.getElementById('modalCompanyName').textContent = item.company_name || 'N/A';
  
  const phoneEl = document.getElementById('modalPhone');
  if (item.phone && item.phone !== 'N/A') {
    phoneEl.innerHTML = `<a href="tel:${item.phone.replace(/\s+/g, '')}" class="text-success text-decoration-none"><i class="bi bi-telephone me-1"></i>${item.phone}</a>`;
  } else {
    phoneEl.textContent = 'N/A';
  }

  document.getElementById('modalRating').textContent = item.rating ? `★ ${item.rating} (${item.review_count || 0} reviews)` : 'N/A';
  document.getElementById('modalCategory').textContent = item.category || 'N/A';
  document.getElementById('modalLocation').textContent = item.location || 'N/A';
  document.getElementById('modalStatus').textContent = `${item.status || 'N/A'} ${item.closing_time ? '· ' + item.closing_time : ''}`;
  document.getElementById('modalServices').textContent = item.service_type || 'N/A';
  document.getElementById('modalFullText').textContent = item.details || 'No snippet';

  const modal = new bootstrap.Modal(document.getElementById('detailsModal'));
  modal.show();
}

// Download Handlers
downloadCsvBtn.addEventListener('click', () => {
  if (!currentCsv) return;
  downloadFile(currentCsv, currentFilename, 'text/csv;charset=utf-8');
  showToast('CSV downloaded!');
});

downloadJsonBtn.addEventListener('click', () => {
  if (!currentResults || currentResults.length === 0) return;
  const jsonStr = JSON.stringify(currentResults, null, 2);
  const jsonFilename = currentFilename.replace(/\.csv$/i, '.json');
  downloadFile(jsonStr, jsonFilename, 'application/json;charset=utf-8');
  showToast('JSON downloaded!');
});

downloadTxtBtn.addEventListener('click', () => {
  if (!currentTxt) return;
  const txtFilename = currentFilename.replace(/\.csv$/i, '_log.txt');
  downloadFile(currentTxt, txtFilename, 'text/plain;charset=utf-8');
  showToast('TXT log downloaded!');
});

copyCsvBtn.addEventListener('click', async () => {
  if (!currentCsv) return;
  try {
    await navigator.clipboard.writeText(currentCsv);
    showToast('CSV copied to clipboard!');
  } catch (err) {
    showToast('Failed to copy to clipboard.');
  }
});

// Helper: Download File via Blob
function downloadFile(content, fileName, mimeType = 'text/plain') {
  // Add UTF-8 BOM for CSV to guarantee correct rendering in Excel
  const bom = mimeType.includes('csv') ? '\uFEFF' : '';
  const blob = new Blob([bom + content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

// Offline Parser Handlers
function initOfflineParser() {
  const fileInput = document.getElementById('htmlFileInput');
  const pasteArea = document.getElementById('htmlPasteArea');
  const parseBtn = document.getElementById('parseHtmlBtn');

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      pasteArea.value = evt.target.result;
    };
    reader.readAsText(file);
  });

  parseBtn.addEventListener('click', async () => {
    const html = pasteArea.value.trim();
    if (!html) {
      showToast('Please upload or paste HTML first.');
      return;
    }

    try {
      showLoading(true, 'Parsing HTML content offline...');
      const res = await fetch('/api/parse-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html })
      });

      const result = await res.json();
      showLoading(false);

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Parsing failed.');
      }

      if (result.data.length === 0) {
        showToast('No business profiles found in the provided HTML.');
        return;
      }

      // Switch to search tab to show results
      const searchTabTrigger = document.querySelector('#search-tab');
      bootstrap.Tab.getInstance(searchTabTrigger)?.show() || new bootstrap.Tab(searchTabTrigger).show();

      currentResults = result.data;
      currentCsv = result.csv;
      currentTxt = result.txt;
      currentFilename = result.filename || 'offline_extracted_leads.csv';

      renderMetrics(currentResults);
      renderTable(currentResults);
      resultsSection.classList.remove('d-none');

      downloadFile(currentCsv, currentFilename, 'text/csv;charset=utf-8');
      showToast(`Parsed ${result.count} businesses! CSV downloaded.`);
      resultsSection.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
      showLoading(false);
      showError(err.message);
    }
  });
}

// UI Helpers
function showLoading(show, message = 'Loading...') {
  if (show) {
    loadingTitle.textContent = message;
    loadingBanner.classList.remove('d-none');
    searchBtn.disabled = true;
  } else {
    loadingBanner.classList.add('d-none');
    searchBtn.disabled = false;
  }
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorAlert.classList.remove('d-none');
}

function hideError() {
  errorAlert.classList.add('d-none');
}

function showToast(msg) {
  const toastEl = document.getElementById('liveToast');
  document.getElementById('toastMessage').textContent = msg;
  const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
  toast.show();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
