/**
 * StockPredict — Dashboard Page
 * Market overview: 5 saham + sinyal prediksi
 */

const TICKERS = ['BBCA', 'BBRI', 'BBNI', 'BMRI', 'BRIS'];

async function renderDashboard(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Ringkasan pasar saham perbankan BEI — Update realtime dari model aktif</p>
    </div>

    <!-- Stat Cards -->
    <div class="stat-cards" id="dash-stat-cards">
      ${[...Array(4)].map(() => `
        <div class="stat-card primary">
          <div class="stat-icon"><div class="skeleton" style="width:24px;height:24px;border-radius:4px"></div></div>
          <div class="skeleton" style="height:12px;width:60%;margin-bottom:8px"></div>
          <div class="skeleton" style="height:28px;width:80%;margin-bottom:6px"></div>
          <div class="skeleton" style="height:12px;width:40%"></div>
        </div>
      `).join('')}
    </div>

    <!-- Market Overview Table -->
    <div class="card" style="margin-bottom: var(--space-5);">
      <div class="card-header">
        <span class="card-title">📊 Market Overview</span>
        <span style="font-size:0.75rem;color:var(--color-text-3)" id="dash-last-update">Memuat...</span>
      </div>
      <div class="table-wrapper">
        <table id="dash-market-table">
          <thead>
            <tr>
              <th>Emiten</th>
              <th>Harga Terakhir</th>
              <th>Perubahan</th>
              <th>Sinyal RF</th>
              <th>Probabilitas</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody id="dash-market-body">
            <tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-3)">
              <div class="skeleton" style="height:16px;width:200px;margin:0 auto"></div>
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Mini Charts Row -->
    <div class="grid-3" id="dash-mini-charts" style="margin-bottom: var(--space-5);">
      ${TICKERS.slice(0,3).map(t => `
        <div class="card">
          <div class="card-header">
            <span class="card-title" style="font-family:'JetBrains Mono',monospace">${t}</span>
          </div>
          <div class="chart-container" style="height:100px">
            <canvas id="mini-chart-${t}"></canvas>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="grid-2" id="dash-mini-charts-2" style="margin-bottom: var(--space-5);">
      ${TICKERS.slice(3,5).map(t => `
        <div class="card">
          <div class="card-header">
            <span class="card-title" style="font-family:'JetBrains Mono',monospace">${t}</span>
          </div>
          <div class="chart-container" style="height:100px">
            <canvas id="mini-chart-${t}"></canvas>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Load data
  await loadDashboardData();
}

async function loadDashboardData() {
  try {
    const overview = await MarketAPI.getOverview();
    renderMarketTable(overview);
    renderStatCards(overview);
    renderMiniCharts();
  } catch (e) {
    document.getElementById('dash-market-body').innerHTML = `
      <tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-bear)">
        ⚠ ${e.message}
      </td></tr>
    `;
    showToast('Gagal memuat data', e.message, 'error');
  }
}

function renderStatCards(overview) {
  const bullCount  = overview.filter(s => s.signal === 'NAIK').length;
  const bearCount  = overview.filter(s => s.signal !== 'NAIK' && s.signal !== null).length;
  const avgProb    = overview.filter(s => s.probability).reduce((a, s) => a + s.probability, 0) / (overview.filter(s => s.probability).length || 1);
  const posChange  = overview.filter(s => s.change_pct > 0).length;

  const container = document.getElementById('dash-stat-cards');
  container.innerHTML = `
    <div class="stat-card bull">
      <div class="stat-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></div>
      <div class="stat-label">Sinyal Naik</div>
      <div class="stat-value">${bullCount} / ${overview.length}</div>
      <div class="stat-change positive">emiten diprediksi naik</div>
    </div>
    <div class="stat-card bear">
      <div class="stat-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg></div>
      <div class="stat-label">Sinyal Stagnan/Turun</div>
      <div class="stat-value">${bearCount} / ${overview.length}</div>
      <div class="stat-change negative">emiten diprediksi stagnan</div>
    </div>
    <div class="stat-card primary">
      <div class="stat-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div class="stat-label">Rata-rata Probabilitas</div>
      <div class="stat-value">${(avgProb * 100).toFixed(1)}%</div>
      <div class="stat-change" style="color:var(--color-text-3)">keyakinan model Random Forest</div>
    </div>
    <div class="stat-card warn">
      <div class="stat-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      <div class="stat-label">Harga Positif Hari Ini</div>
      <div class="stat-value">${posChange} / ${overview.length}</div>
      <div class="stat-change" style="color:var(--color-text-3)">emiten mengalami kenaikan harga</div>
    </div>
  `;
}

function renderMarketTable(overview) {
  const tbody = document.getElementById('dash-market-body');
  const update = document.getElementById('dash-last-update');
  if (update) update.textContent = `Diperbarui: ${new Date().toLocaleTimeString('id-ID')}`;

  tbody.innerHTML = overview.map(s => {
    const changeClass = s.change_pct >= 0 ? 'positive' : 'negative';
    const signalBadge = s.signal === 'NAIK'
      ? '<span class="badge badge-bull">▲ NAIK</span>'
      : s.signal
        ? '<span class="badge badge-bear">▼ STAGNAN/TURUN</span>'
        : '<span class="badge badge-warn">— N/A</span>';

    const probBar = s.probability != null
      ? `<div style="display:flex;align-items:center;gap:8px">
           <div class="progress-bar" style="width:80px"><div class="progress-fill primary" style="width:${(s.probability*100).toFixed(0)}%"></div></div>
           <span class="mono" style="font-size:0.75rem">${(s.probability*100).toFixed(1)}%</span>
         </div>`
      : '<span style="color:var(--color-text-3)">—</span>';

    return `
      <tr>
        <td>
          <div style="display:flex;flex-direction:column">
            <strong style="font-family:'JetBrains Mono',monospace;font-size:0.875rem">${s.ticker}</strong>
            <span style="font-size:0.75rem;color:var(--color-text-3)">${s.company_name || ''}</span>
          </div>
        </td>
        <td class="mono">${formatCurrency(s.last_close)}</td>
        <td class="${changeClass} mono">${formatPct(s.change_pct)}</td>
        <td>${signalBadge}</td>
        <td>${probBar}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="App.navigate('prediction'); setTimeout(()=>setActiveTicker('${s.ticker}'),100)">
            Analisis
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function renderMiniCharts() {
  for (const ticker of TICKERS) {
    try {
      const prices = await StocksAPI.getPrices(ticker, { limit: 60 });
      const labels = prices.map(p => p.date.slice(5)); // MM-DD
      const closes = prices.map(p => p.close);
      createPriceChart(`mini-chart-${ticker}`, labels, closes);
    } catch (_) {
      // Silent fail for mini charts
    }
  }
}
