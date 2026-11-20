/**
 * StockPredict — Stocks Page
 * Harga historis OHLCV + grafik candlestick-style
 */

let _stocksTicker = 'BBCA';
let _stocksPeriod  = '3M'; // 1M, 3M, 6M, 1Y, 5Y

const PERIOD_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 252, '5Y': 1260 };

async function renderStocks(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Data Saham</h1>
      <p class="page-subtitle">Harga historis OHLCV untuk 5 emiten perbankan BEI</p>
    </div>

    <!-- Ticker + Period Selector -->
    <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-5);align-items:center">
      <div class="stock-tabs" style="margin-bottom:0">
        ${TICKERS.map(t => `
          <button class="stock-tab ${t === _stocksTicker ? 'active' : ''}" data-ticker="${t}" onclick="selectStockTicker('${t}')">
            ${t}
          </button>
        `).join('')}
      </div>
      <div style="margin-left:auto;display:flex;gap:var(--space-2)">
        ${Object.keys(PERIOD_DAYS).map(p => `
          <button class="btn btn-outline btn-sm ${p === _stocksPeriod ? 'btn-primary' : ''}" id="period-btn-${p}" onclick="selectStockPeriod('${p}')">${p}</button>
        `).join('')}
      </div>
    </div>

    <!-- Price Chart -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="card-header">
        <span class="card-title" id="stocks-chart-title">Harga Penutupan — <span style="font-family:'JetBrains Mono',monospace" id="stocks-ticker-label">BBCA</span></span>
        <div id="stocks-price-badge" style="display:flex;gap:var(--space-3);align-items:center">
          <div class="skeleton" style="height:28px;width:120px"></div>
        </div>
      </div>
      <div class="chart-container" style="height:300px">
        <canvas id="stocks-price-chart"></canvas>
      </div>
    </div>

    <!-- Volume Chart -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="card-header">
        <span class="card-title">Volume Perdagangan</span>
      </div>
      <div class="chart-container" style="height:140px">
        <canvas id="stocks-volume-chart"></canvas>
      </div>
    </div>

    <!-- OHLCV Stats -->
    <div class="stat-cards" id="stocks-ohlcv-stats" style="margin-bottom:var(--space-5)">
      ${['Open', 'High', 'Low', 'Close', 'Volume'].map(f => `
        <div class="stat-card primary">
          <div class="stat-label">${f} (Terakhir)</div>
          <div class="stat-value skeleton" id="stocks-stat-${f.toLowerCase()}" style="height:28px;width:80%"></div>
        </div>
      `).join('')}
    </div>

    <!-- Price Table -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">📋 Data Historis (100 terakhir)</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Open</th>
              <th>High</th>
              <th>Low</th>
              <th>Close</th>
              <th>Volume</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody id="stocks-price-table">
            <tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--color-text-3)">Memuat...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await loadStocksData();
}

function selectStockTicker(ticker) {
  _stocksTicker = ticker;
  document.querySelectorAll('.stock-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ticker === ticker);
  });
  const label = document.getElementById('stocks-ticker-label');
  if (label) label.textContent = ticker;
  loadStocksData();
}

function selectStockPeriod(period) {
  _stocksPeriod = period;
  Object.keys(PERIOD_DAYS).forEach(p => {
    const btn = document.getElementById(`period-btn-${p}`);
    if (!btn) return;
    btn.className = `btn btn-sm ${p === period ? 'btn-primary' : 'btn-outline'}`;
  });
  loadStocksData();
}

async function loadStocksData() {
  const limit = PERIOD_DAYS[_stocksPeriod] || 90;

  try {
    const prices = await StocksAPI.getPrices(_stocksTicker, { limit });

    if (!prices.length) {
      showToast('Data kosong', 'Tidak ada data harga tersedia', 'warn');
      return;
    }

    // Charts
    const labels    = prices.map(p => p.date.slice(0, 10));
    const closes    = prices.map(p => p.close);
    const opens     = prices.map(p => p.open);
    const volumes   = prices.map(p => p.volume);

    createPriceChart('stocks-price-chart', labels, closes);
    createVolumeChart('stocks-volume-chart', labels, volumes, closes, opens);

    // Stats
    const last = prices[prices.length - 1];
    const prev = prices[prices.length - 2];
    const changePct = prev ? ((last.close - prev.close) / prev.close * 100).toFixed(2) : null;

    const badge = document.getElementById('stocks-price-badge');
    if (badge) {
      const changeClass = changePct >= 0 ? 'positive' : 'negative';
      badge.innerHTML = `
        <span style="font-size:1.25rem;font-weight:700;font-family:'JetBrains Mono',monospace">${formatCurrency(last.close)}</span>
        ${changePct != null ? `<span class="${changeClass}" style="font-weight:600">${formatPct(parseFloat(changePct))}</span>` : ''}
      `;
    }

    // OHLCV stats
    const statsMap = {
      open:   formatCurrency(last.open),
      high:   formatCurrency(last.high),
      low:    formatCurrency(last.low),
      close:  formatCurrency(last.close),
      volume: Number(last.volume).toLocaleString('id-ID'),
    };
    Object.entries(statsMap).forEach(([k, v]) => {
      const el = document.getElementById(`stocks-stat-${k}`);
      if (el) {
        el.className = 'stat-value';
        el.textContent = v;
      }
    });

    // Table (last 100)
    renderPriceTable(prices.slice().reverse().slice(0, 100));

  } catch (e) {
    showToast('Gagal memuat data saham', e.message, 'error');
  }
}

function renderPriceTable(prices) {
  const tbody = document.getElementById('stocks-price-table');
  if (!tbody) return;

  tbody.innerHTML = prices.map((p, i) => {
    const prev = prices[i + 1];
    const changePct = prev ? ((p.close - prev.close) / prev.close * 100).toFixed(2) : null;
    const changeClass = changePct >= 0 ? 'positive' : 'negative';

    return `
      <tr>
        <td class="mono" style="font-size:0.8rem">${p.date}</td>
        <td class="mono">${formatCurrency(p.open)}</td>
        <td class="mono">${formatCurrency(p.high)}</td>
        <td class="mono">${formatCurrency(p.low)}</td>
        <td class="mono"><strong>${formatCurrency(p.close)}</strong></td>
        <td class="mono">${Number(p.volume).toLocaleString('id-ID')}</td>
        <td class="${changeClass} mono">${changePct != null ? formatPct(parseFloat(changePct)) : '—'}</td>
      </tr>
    `;
  }).join('');
}
