/**
 * StockPredict — Technical Indicators Page
 * RSI, MACD, Bollinger Bands, Stochastic
 */

let _techTicker = 'BBCA';

async function renderTechnical(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Indikator Teknikal</h1>
      <p class="page-subtitle">RSI, MACD, Bollinger Bands, dan Stochastic untuk 5 emiten perbankan</p>
    </div>

    <!-- Ticker Selector -->
    <div class="stock-tabs" id="tech-ticker-tabs">
      ${TICKERS.map(t => `
        <button class="stock-tab ${t === _techTicker ? 'active' : ''}" data-ticker="${t}" onclick="selectTechTicker('${t}')">
          ${t}
        </button>
      `).join('')}
    </div>

    <!-- Indicator Summary Cards -->
    <div class="grid-3" id="tech-summary-cards" style="margin-bottom:var(--space-5)">
      ${['RSI', 'MACD', 'Stochastic'].map(ind => `
        <div class="card" id="tech-card-${ind.toLowerCase()}">
          <div class="card-header"><span class="card-title">${ind}</span></div>
          <div class="skeleton" style="height:60px;border-radius:8px"></div>
        </div>
      `).join('')}
    </div>

    <!-- RSI Chart -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="card-header">
        <span class="card-title">RSI(14) — Relative Strength Index</span>
        <div style="display:flex;gap:var(--space-3);font-size:0.75rem;color:var(--color-text-3)">
          <span>🔴 Overbought: 70+</span>
          <span>🟢 Oversold: 30-</span>
        </div>
      </div>
      <div class="chart-container" style="height:200px">
        <canvas id="tech-rsi-chart"></canvas>
      </div>
      <!-- RSI Reference Lines Legend -->
      <div style="display:flex;gap:var(--space-5);padding:var(--space-3) 0;border-top:1px solid var(--color-border);margin-top:var(--space-3)">
        <div style="display:flex;align-items:center;gap:var(--space-2);font-size:0.75rem;color:var(--color-text-2)">
          <div style="width:24px;height:2px;background:var(--color-bear);border-radius:2px"></div> Overbought (70)
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-2);font-size:0.75rem;color:var(--color-text-2)">
          <div style="width:24px;height:2px;background:var(--color-bull);border-radius:2px"></div> Oversold (30)
        </div>
      </div>
    </div>

    <!-- MACD Chart -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="card-header">
        <span class="card-title">MACD — Moving Average Convergence Divergence</span>
      </div>
      <div class="chart-container" style="height:200px">
        <canvas id="tech-macd-chart"></canvas>
      </div>
    </div>

    <!-- Bollinger Bands Chart -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="card-header">
        <span class="card-title">Bollinger Bands (SMA 20, 2σ)</span>
      </div>
      <div class="chart-container" style="height:220px">
        <canvas id="tech-bb-chart"></canvas>
      </div>
    </div>

    <!-- Indicator Table -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">📋 Data Indikator Teknikal (30 terakhir)</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>RSI(14)</th>
              <th>MACD</th>
              <th>Signal</th>
              <th>Histogram</th>
              <th>SMA20</th>
              <th>SMA50</th>
              <th>BB Upper</th>
              <th>BB Lower</th>
              <th>Stoch %K</th>
            </tr>
          </thead>
          <tbody id="tech-indicator-table">
            <tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--color-text-3)">Memuat...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await loadTechnicalData();
}

function selectTechTicker(ticker) {
  _techTicker = ticker;
  document.querySelectorAll('.stock-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ticker === ticker);
  });
  loadTechnicalData();
}

async function loadTechnicalData() {
  try {
    const [indicators, prices] = await Promise.all([
      StocksAPI.getIndicators(_techTicker, 100),
      StocksAPI.getPrices(_techTicker, { limit: 100 }),
    ]);

    if (!indicators.length) {
      showToast('Data kosong', 'Belum ada data indikator. Jalankan pipeline feature engineering.', 'warn');
      return;
    }

    const labels   = indicators.map(i => i.date ? i.date.slice(0, 10) : '');
    const rsi      = indicators.map(i => i.rsi_14);
    const macdLine = indicators.map(i => i.macd_line);
    const macdSig  = indicators.map(i => i.macd_signal);
    const macdHist = indicators.map(i => i.macd_histogram);
    const bbUpper  = indicators.map(i => i.bb_upper);
    const bbMiddle = indicators.map(i => i.bb_middle);
    const bbLower  = indicators.map(i => i.bb_lower);

    // Align price to indicator dates
    const priceMap = {};
    prices.forEach(p => { priceMap[p.date.slice(0, 10)] = p.close; });
    const closePrices = labels.map(d => priceMap[d] ?? null);

    // Charts
    createRSIChart('tech-rsi-chart', labels, rsi);
    createMACDChart('tech-macd-chart', labels, macdLine, macdSig, macdHist);
    createBBChart('tech-bb-chart', labels, closePrices, bbUpper, bbMiddle, bbLower);

    // Summary Cards
    renderIndicatorSummaryCards(indicators[indicators.length - 1]);

    // Table
    renderIndicatorTable(indicators.slice().reverse().slice(0, 30));

  } catch (e) {
    showToast('Gagal memuat indikator', e.message, 'error');
  }
}

function renderIndicatorSummaryCards(latest) {
  if (!latest) return;

  // RSI
  const rsiCard = document.getElementById('tech-card-rsi');
  if (rsiCard) {
    const rsi = latest.rsi_14;
    const rsiLabel = rsi >= 70 ? '🔴 Overbought' : rsi <= 30 ? '🟢 Oversold' : '⚪ Netral';
    const rsiColor = rsi >= 70 ? 'var(--color-bear)' : rsi <= 30 ? 'var(--color-bull)' : 'var(--color-text-2)';
    rsiCard.innerHTML = `
      <div class="card-header"><span class="card-title">RSI(14)</span></div>
      <div class="card-value" style="color:${rsiColor}">${rsi != null ? rsi.toFixed(2) : '—'}</div>
      <div class="card-sub">${rsiLabel}</div>
      <div class="progress-bar" style="margin-top:var(--space-3)">
        <div class="progress-fill ${rsi >= 70 ? 'bear' : rsi <= 30 ? 'bull' : 'primary'}" style="width:${rsi ?? 50}%"></div>
      </div>
    `;
  }

  // MACD
  const macdCard = document.getElementById('tech-card-macd');
  if (macdCard) {
    const hist = latest.macd_histogram;
    const macdLabel = hist >= 0 ? '📈 Bullish Momentum' : '📉 Bearish Momentum';
    const macdColor = hist >= 0 ? 'var(--color-bull)' : 'var(--color-bear)';
    macdCard.innerHTML = `
      <div class="card-header"><span class="card-title">MACD</span></div>
      <div class="card-value" style="color:${macdColor}">${latest.macd_line != null ? latest.macd_line.toFixed(4) : '—'}</div>
      <div class="card-sub">${macdLabel}</div>
      <div style="margin-top:var(--space-3);display:flex;gap:var(--space-3)">
        <div><span style="font-size:0.7rem;color:var(--color-text-3)">Signal</span><br>
          <span class="mono" style="font-size:0.85rem">${latest.macd_signal != null ? latest.macd_signal.toFixed(4) : '—'}</span>
        </div>
        <div><span style="font-size:0.7rem;color:var(--color-text-3)">Histogram</span><br>
          <span class="mono" style="font-size:0.85rem;color:${macdColor}">${hist != null ? hist.toFixed(4) : '—'}</span>
        </div>
      </div>
    `;
  }

  // Stochastic
  const stochCard = document.getElementById('tech-card-stochastic');
  if (stochCard) {
    const k = latest.stoch_k;
    const d = latest.stoch_d;
    const stochLabel = k >= 80 ? '🔴 Overbought' : k <= 20 ? '🟢 Oversold' : '⚪ Netral';
    const stochColor = k >= 80 ? 'var(--color-bear)' : k <= 20 ? 'var(--color-bull)' : 'var(--color-text-2)';
    stochCard.innerHTML = `
      <div class="card-header"><span class="card-title">Stochastic</span></div>
      <div class="card-value" style="color:${stochColor}">${k != null ? k.toFixed(2) : '—'}</div>
      <div class="card-sub">${stochLabel}</div>
      <div style="margin-top:var(--space-3);display:flex;gap:var(--space-3)">
        <div><span style="font-size:0.7rem;color:var(--color-text-3)">%K</span><br>
          <span class="mono" style="font-size:0.85rem;color:${stochColor}">${k != null ? k.toFixed(2) : '—'}</span>
        </div>
        <div><span style="font-size:0.7rem;color:var(--color-text-3)">%D</span><br>
          <span class="mono" style="font-size:0.85rem">${d != null ? d.toFixed(2) : '—'}</span>
        </div>
      </div>
    `;
  }
}

function renderIndicatorTable(indicators) {
  const tbody = document.getElementById('tech-indicator-table');
  if (!tbody) return;

  const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : '—';

  tbody.innerHTML = indicators.map(ind => {
    const rsi = ind.rsi_14;
    const rsiClass = rsi >= 70 ? 'negative' : rsi <= 30 ? 'positive' : '';
    return `
      <tr>
        <td class="mono" style="font-size:0.8rem">${ind.date ? ind.date.slice(0, 10) : '—'}</td>
        <td class="mono ${rsiClass}">${fmt(ind.rsi_14)}</td>
        <td class="mono">${fmt(ind.macd_line, 4)}</td>
        <td class="mono">${fmt(ind.macd_signal, 4)}</td>
        <td class="mono ${ind.macd_histogram >= 0 ? 'positive' : 'negative'}">${fmt(ind.macd_histogram, 4)}</td>
        <td class="mono">${fmt(ind.sma_20, 0)}</td>
        <td class="mono">${fmt(ind.sma_50, 0)}</td>
        <td class="mono">${fmt(ind.bb_upper, 0)}</td>
        <td class="mono">${fmt(ind.bb_lower, 0)}</td>
        <td class="mono">${fmt(ind.stoch_k)}</td>
      </tr>
    `;
  }).join('');
}
