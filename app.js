/**
 * Air Quality Dashboard Application
 * Connects to Baliyo Ventures AQI APIs:
 * - Latest: https://yachu.baliyoventures.com/api/aqi/latest/
 * - History: https://yachu.baliyoventures.com/api/aqi/
 */

const CONFIG = {
  API_LATEST: 'https://yachu.baliyoventures.com/api/aqi/latest/',
  API_HISTORY: 'https://yachu.baliyoventures.com/api/aqi/',
  REFRESH_INTERVAL_MS: 1 * 60 * 1000, // Every 1 minute (60,000 ms)
  MAX_SCALE_AQI: 300,
  PAGE_SIZE: 20 // Default page size: 20 records
};

// AQI Category Definitions matching the gauge scale
const AQI_CATEGORIES = [
  {
    min: 0,
    max: 50,
    index: 0,
    name: 'Good',
    gaugeColor: '#00b050',
    badgeColor: '#00b050',
    textColor: '#ffffff',
    advisory: 'Air quality is considered satisfactory, and air pollution poses little or no risk. Ideal for all outdoor activities.'
  },
  {
    min: 51,
    max: 100,
    index: 1,
    name: 'Moderate',
    gaugeColor: '#ffff00',
    badgeColor: '#d97706', // readable warm amber for text/badge
    textColor: '#ffffff',
    advisory: 'Air quality is acceptable. Sensitive individuals with respiratory conditions should consider limiting prolonged outdoor exertion.'
  },
  {
    min: 101,
    max: 150,
    index: 2,
    name: 'Unhealthy for Sensitive Groups',
    gaugeColor: '#ff7e00',
    badgeColor: '#ff7e00',
    textColor: '#ffffff',
    advisory: 'Members of sensitive groups (children, elderly, people with asthma) may experience health effects. General public is less affected.'
  },
  {
    min: 151,
    max: 200,
    index: 3,
    name: 'Unhealthy',
    gaugeColor: '#ff0000',
    badgeColor: '#ff0000',
    textColor: '#ffffff',
    advisory: 'Everyone may begin to experience adverse health effects. Sensitive groups may experience more serious effects. Avoid outdoor exercise.'
  },
  {
    min: 201,
    max: 250,
    index: 4,
    name: 'Very Unhealthy',
    gaugeColor: '#7030a0',
    badgeColor: '#7030a0',
    textColor: '#ffffff',
    advisory: 'Health alert: The risk of health effects is increased for everyone. Keep windows closed and wear high-efficiency masks outdoors.'
  },
  {
    min: 251,
    max: Infinity,
    index: 5,
    name: 'Very Hazardous',
    gaugeColor: '#7e0023',
    badgeColor: '#7e0023',
    textColor: '#ffffff',
    advisory: 'Health warning of emergency conditions. The entire population is likely to be affected. Remain indoors and run air purifiers.'
  }
];

// State
let currentAqi = 0;
let lastSeenId = null;
let lastSeenDateTime = null;
let refreshTimer = null;
let isFetching = false;
let currentPage = 1;
let pageSize = CONFIG.PAGE_SIZE;
let totalPages = 1;
let totalRecords = 0;

// Filter state
let currentFilter = {
  startDate: '', // 'YYYY-MM-DD'
  endDate: '',   // 'YYYY-MM-DD'
  preset: 'all'
};

// DOM Elements
const needleGroup = document.getElementById('needle-group');
const aqiValueNumber = document.getElementById('aqi-value-number');
const statusBadge = document.getElementById('status-badge');
const lastUpdatedTime = document.getElementById('last-updated-time');
const legendItems = document.querySelectorAll('.legend-item');
const adviceHeadline = document.getElementById('advice-headline');
const adviceDescription = document.getElementById('advice-description');
const refreshBtn = document.getElementById('refresh-btn');
const connectionStatus = document.getElementById('connection-status');
const liveIndicator = document.getElementById('live-indicator');
const historyTableBody = document.getElementById('history-table-body');
const paginationInfo = document.getElementById('pagination-info');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageNumbersList = document.getElementById('page-numbers-list');
const pageSizeSelect = document.getElementById('page-size-select');
const recordsTotalBadge = document.getElementById('records-total-badge');
const historyFilterForm = document.getElementById('history-filter-form');
const filterStartDate = document.getElementById('filter-start-date');
const filterEndDate = document.getElementById('filter-end-date');
const resetFilterBtn = document.getElementById('reset-filter-btn');
const presetChips = document.querySelectorAll('.preset-chip');
const filterStatusBanner = document.getElementById('filter-status-banner');
const filterStatusText = document.getElementById('filter-status-text');
const clearFilterPillBtn = document.getElementById('clear-filter-pill-btn');

/**
 * Determine category information for a given AQI value
 */
function getAqiCategory(aqi) {
  const value = Math.round(Number(aqi));
  for (const cat of AQI_CATEGORIES) {
    if (value >= cat.min && value <= cat.max) {
      return cat;
    }
  }
  return AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

/**
 * Animate the numeric AQI counter smoothly
 */
function animateCounter(startVal, endVal, durationMs = 1000) {
  const startTime = performance.now();
  const start = Number(startVal) || 0;
  const target = Number(endVal) || 0;

  function updateNumber(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    // Ease out cubic
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (target - start) * easeOut);
    aqiValueNumber.textContent = isNaN(current) ? '--' : current;

    if (progress < 1) {
      requestAnimationFrame(updateNumber);
    } else {
      aqiValueNumber.textContent = target;
    }
  }

  requestAnimationFrame(updateNumber);
}

/**
 * Calculate needle rotation angle based on AQI value
 * Gauge scale: 0 AQI = -90 deg (left), 300 AQI = +90 deg (right)
 */
function updateNeedleAngle(aqi) {
  const numericAqi = Math.max(0, Math.min(CONFIG.MAX_SCALE_AQI, Number(aqi) || 0));
  // Needle polygon is drawn vertically at 0 degrees.
  // 0 AQI corresponds to -90 deg, 300 AQI corresponds to +90 deg
  const angle = -90 + (numericAqi / CONFIG.MAX_SCALE_AQI) * 180;
  needleGroup.style.transform = `rotate(${angle.toFixed(2)}deg)`;
}

/**
 * Highlight the active category in the legend and status badge
 */
function updateCategoryUI(category) {
  // Update status badge
  statusBadge.textContent = category.name;
  statusBadge.style.backgroundColor = category.badgeColor;
  statusBadge.style.color = category.textColor;

  // Highlight active legend row
  legendItems.forEach((item) => {
    const rangeIndex = parseInt(item.getAttribute('data-range'), 10);
    if (rangeIndex === category.index) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update health advice box
  adviceHeadline.textContent = `${category.name} Health Advisory`;
  adviceDescription.textContent = category.advisory;
}

/**
 * Format ISO datetime string into human readable format
 */
function formatDateTime(isoString) {
  if (!isoString) return 'Just now';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch {
    return isoString;
  }
}

/**
 * Helper to format date as YYYY-MM-DD in local time
 */
function formatDateYMD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fetch latest AQI reading from API
 */
async function fetchLatestAqi() {
  try {
    const response = await fetch(CONFIG.API_LATEST, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const newAqi = parseInt(data.aqi, 10);

    const isFirstLoad = (lastSeenId === null);
    const isNewData = (data.id !== lastSeenId || data.dateTime !== lastSeenDateTime);

    if (isFirstLoad || isNewData) {
      // New data arrived: animate needle and counter to new reading
      updateNeedleAngle(newAqi);
      animateCounter(currentAqi, newAqi);
      currentAqi = newAqi;
      lastSeenId = data.id;
      lastSeenDateTime = data.dateTime;

      // Update category highlighting and health advisory
      const category = getAqiCategory(newAqi);
      updateCategoryUI(category);

      // Refresh history records if new reading arrived
      if (!isFirstLoad) {
        fetchHistoryAqi(currentPage);
      }
    }

    // Update timestamp
    lastUpdatedTime.textContent = formatDateTime(data.dateTime);

    // Connection indicator
    connectionStatus.textContent = 'Live';
    liveIndicator.style.backgroundColor = '#ecfdf5';
    liveIndicator.style.borderColor = '#a7f3d0';
    liveIndicator.style.color = '#065f46';

    return data;
  } catch (error) {
    console.error('Failed to fetch latest AQI:', error);
    connectionStatus.textContent = 'Offline';
    liveIndicator.style.backgroundColor = '#fef2f2';
    liveIndicator.style.borderColor = '#fecaca';
    liveIndicator.style.color = '#991b1b';
    return null;
  }
}

/**
 * Fetch AQI history with page, page_size, start_date and end_date parameters
 * Format: ?page=1&page_size=20&start_date=...&end_date=...
 */
async function fetchHistoryAqi(page = currentPage) {
  try {
    const url = new URL(CONFIG.API_HISTORY);
    url.searchParams.set('page', page);
    url.searchParams.set('page_size', pageSize);
    url.searchParams.set('start_date', currentFilter.startDate || '');
    url.searchParams.set('end_date', currentFilter.endDate || '');

    const response = await fetch(url.toString(), { cache: 'no-store' });
    
    // Graceful recovery for 404 (e.g., page requested out of bounds)
    if (!response.ok) {
      if (response.status === 404 && page > 1) {
        currentPage = 1;
        return fetchHistoryAqi(1);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const rawList = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
    
    totalRecords = typeof data.count === 'number' ? data.count : rawList.length;
    totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(Math.max(1, page), totalPages);

    // Fallback slicing if server returned more items than requested
    const displayedRecords = (rawList.length > pageSize)
      ? rawList.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      : rawList;

    renderHistoryTable(displayedRecords);
    updatePaginationUI(totalRecords, currentPage);
    updateRecordsCountBadge(totalRecords);
    updateFilterStatusUI();
    return displayedRecords;
  } catch (error) {
    console.error('Failed to fetch AQI history:', error);
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="3" class="loading-cell" style="color: #ef4444;">
          Unable to load history records. (${error.message})
        </td>
      </tr>
    `;
    updatePaginationUI(0, 1);
    updateRecordsCountBadge(0);
    return null;
  }
}

/**
 * Update total records badge
 */
function updateRecordsCountBadge(total) {
  if (!recordsTotalBadge) return;
  recordsTotalBadge.textContent = `${total} ${total === 1 ? 'record' : 'records'}`;
}

/**
 * Update filter banner and chips UI
 */
function updateFilterStatusUI() {
  if (!filterStatusBanner || !filterStatusText) return;

  const hasFilter = Boolean(currentFilter.startDate || currentFilter.endDate);
  if (hasFilter) {
    filterStatusBanner.style.display = 'inline-flex';
    const startText = currentFilter.startDate || 'Start';
    const endText = currentFilter.endDate || 'End';
    filterStatusText.textContent = `${startText} → ${endText} (${totalRecords} found)`;
  } else {
    filterStatusBanner.style.display = 'none';
  }
}

/**
 * Update active chip style
 */
function updatePresetChipsUI(activePreset) {
  presetChips.forEach((chip) => {
    if (chip.getAttribute('data-preset') === activePreset) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

/**
 * Apply quick filter preset
 */
function applyPreset(preset) {
  const now = new Date();
  let start = '';
  let end = '';

  if (preset === 'today') {
    start = formatDateYMD(now);
    end = formatDateYMD(now);
  } else if (preset === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    start = formatDateYMD(yesterday);
    end = formatDateYMD(yesterday);
  } else if (preset === '7days') {
    const past7 = new Date(now);
    past7.setDate(past7.getDate() - 6);
    start = formatDateYMD(past7);
    end = formatDateYMD(now);
  } else {
    // 'all'
    start = '';
    end = '';
  }

  filterStartDate.value = start;
  filterEndDate.value = end;
  currentFilter.startDate = start;
  currentFilter.endDate = end;
  currentFilter.preset = preset;
  updatePresetChipsUI(preset);

  currentPage = 1;
  fetchHistoryAqi(1);
}

/**
 * Reset date filter
 */
function resetDateFilter() {
  filterStartDate.value = '';
  filterEndDate.value = '';
  currentFilter.startDate = '';
  currentFilter.endDate = '';
  currentFilter.preset = 'all';
  updatePresetChipsUI('all');

  currentPage = 1;
  fetchHistoryAqi(1);
}

// Global hook for reset button inside empty table state
window.resetHistoryFilter = resetDateFilter;

/**
 * Update pagination numbers, status text, and navigation buttons
 */
function updatePaginationUI(total, current) {
  if (!paginationInfo || !prevPageBtn || !nextPageBtn || !pageNumbersList) return;

  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  paginationInfo.textContent = `Showing ${start} to ${end} of ${total} records`;

  prevPageBtn.disabled = (current <= 1);
  nextPageBtn.disabled = (current >= totalPages || total === 0);

  // Render page number buttons with smart ellipsis
  pageNumbersList.innerHTML = '';
  if (totalPages <= 1) return;

  let pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    if (current <= 4) {
      pages = [1, 2, 3, 4, 5, '...', totalPages];
    } else if (current >= totalPages - 3) {
      pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    } else {
      pages = [1, '...', current - 1, current, current + 1, '...', totalPages];
    }
  }

  pages.forEach((p) => {
    if (p === '...') {
      const span = document.createElement('span');
      span.className = 'page-ellipsis';
      span.textContent = '…';
      span.style.padding = '0 0.35rem';
      span.style.color = '#94a3b8';
      pageNumbersList.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-num-btn ${p === current ? 'active' : ''}`;
      btn.textContent = p;
      btn.setAttribute('aria-label', `Page ${p}`);
      btn.addEventListener('click', () => {
        if (currentPage !== p) {
          fetchHistoryAqi(p);
        }
      });
      pageNumbersList.appendChild(btn);
    }
  });
}

/**
 * Render history table rows
 */
function renderHistoryTable(records) {
  if (!records || records.length === 0) {
    const isFiltered = Boolean(currentFilter.startDate || currentFilter.endDate);
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="3" class="loading-cell">
          <div style="padding: 1.25rem 0;">
            <p style="font-weight: 600; color: #475569; margin-bottom: 0.35rem;">No AQI records found</p>
            <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.75rem;">
              ${isFiltered ? 'No records match your selected date range.' : 'No sensor observations recorded yet.'}
            </p>
            ${isFiltered ? '<button type="button" class="filter-btn filter-btn-secondary" style="font-size: 0.8rem; padding: 0.35rem 0.75rem; margin: 0 auto;" onclick="window.resetHistoryFilter()">Clear Filters</button>' : ''}
          </div>
        </td>
      </tr>
    `;
    return;
  }

  historyTableBody.innerHTML = records.map((record) => {
    const val = parseInt(record.aqi, 10);
    const cat = getAqiCategory(val);

    return `
      <tr>
        <td>
          <span class="aqi-pill" style="background-color: ${cat.badgeColor};">
            ${val}
          </span>
        </td>
        <td>
          <span class="table-status-tag" style="background-color: ${cat.badgeColor}20; color: ${cat.badgeColor};">
            ${cat.name}
          </span>
        </td>
        <td>${formatDateTime(record.dateTime)}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Refresh all dashboard data
 */
async function refreshDashboard() {
  if (isFetching) return;
  isFetching = true;

  refreshBtn.classList.add('spinning');
  try {
    await Promise.all([fetchLatestAqi(), fetchHistoryAqi(currentPage)]);
  } finally {
    isFetching = false;
    setTimeout(() => {
      refreshBtn.classList.remove('spinning');
    }, 400);
  }
}

/**
 * Setup recurring auto-refresh and event handlers
 */
function init() {
  // Initial load
  refreshDashboard();

  // Setup periodic polling
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshDashboard, CONFIG.REFRESH_INTERVAL_MS);

  // Manual refresh click handler
  refreshBtn.addEventListener('click', () => {
    refreshDashboard();
  });

  // Filter form submit
  if (historyFilterForm) {
    historyFilterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const start = filterStartDate.value.trim();
      const end = filterEndDate.value.trim();

      if (start && end && start > end) {
        alert('Start date cannot be after end date.');
        return;
      }

      currentFilter.startDate = start;
      currentFilter.endDate = end;
      currentFilter.preset = 'custom';
      updatePresetChipsUI('custom');
      currentPage = 1;
      fetchHistoryAqi(1);
    });
  }

  // Filter reset button
  if (resetFilterBtn) {
    resetFilterBtn.addEventListener('click', resetDateFilter);
  }

  // Clear filter pill button in banner
  if (clearFilterPillBtn) {
    clearFilterPillBtn.addEventListener('click', resetDateFilter);
  }

  // Preset chips click
  presetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const preset = chip.getAttribute('data-preset');
      applyPreset(preset);
    });
  });

  // Page size selector handler
  if (pageSizeSelect) {
    pageSizeSelect.value = pageSize;
    pageSizeSelect.addEventListener('change', (e) => {
      const newSize = parseInt(e.target.value, 10) || 20;
      pageSize = newSize;
      currentPage = 1;
      fetchHistoryAqi(1);
    });
  }

  // Pagination Previous / Next buttons
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      fetchHistoryAqi(currentPage - 1);
    }
  });

  nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      fetchHistoryAqi(currentPage + 1);
    }
  });
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', init);
