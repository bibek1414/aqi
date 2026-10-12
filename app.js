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
  PAGE_SIZE: 10
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
let totalPages = 1;
let totalRecords = 0;

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

      // If a brand new reading arrived from the sensor, refresh history records
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
 * Fetch AQI history from API and render history table with 10-item pagination
 */
async function fetchHistoryAqi(page = currentPage) {
  try {
    // Attempt request with page query parameter
    const url = new URL(CONFIG.API_HISTORY);
    if (page > 1) {
      url.searchParams.set('page', page);
    }

    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const rawList = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
    
    totalRecords = typeof data.count === 'number' ? data.count : rawList.length;
    totalPages = Math.max(1, Math.ceil(totalRecords / CONFIG.PAGE_SIZE));
    currentPage = Math.min(Math.max(1, page), totalPages);

    // If API returned more than PAGE_SIZE in results (client-side slicing fallback)
    const displayedRecords = (rawList.length > CONFIG.PAGE_SIZE)
      ? rawList.slice((currentPage - 1) * CONFIG.PAGE_SIZE, currentPage * CONFIG.PAGE_SIZE)
      : rawList;

    renderHistoryTable(displayedRecords);
    updatePaginationUI(totalRecords, currentPage);
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
    return null;
  }
}

/**
 * Update pagination numbers, status text, and navigation buttons
 */
function updatePaginationUI(total, current) {
  if (!paginationInfo || !prevPageBtn || !nextPageBtn || !pageNumbersList) return;

  const start = total === 0 ? 0 : (current - 1) * CONFIG.PAGE_SIZE + 1;
  const end = Math.min(current * CONFIG.PAGE_SIZE, total);
  paginationInfo.textContent = `Showing ${start} to ${end} of ${total} records`;

  prevPageBtn.disabled = (current <= 1);
  nextPageBtn.disabled = (current >= totalPages);

  // Render page number buttons
  pageNumbersList.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `page-num-btn ${i === current ? 'active' : ''}`;
    btn.textContent = i;
    btn.setAttribute('aria-label', `Page ${i}`);
    btn.addEventListener('click', () => {
      if (currentPage !== i) {
        fetchHistoryAqi(i);
      }
    });
    pageNumbersList.appendChild(btn);
  }
}

/**
 * Render history table rows
 */
function renderHistoryTable(records) {
  if (!records || records.length === 0) {
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="3" class="loading-cell">No history records found.</td>
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
