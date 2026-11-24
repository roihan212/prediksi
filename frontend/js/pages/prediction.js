/**
 * StockPredict — Prediction Page
 * Prediksi real-time dari Yahoo Finance + riwayat per tanggal
 */

let _predTicker = 'BBCA';
let _realtimeInterval = null;  // timer auto-refresh
let _lastKnownPrice = 5800;    // harga acuan default
let _currentHistoryCache = []; // cache untuk unduh CSV

function setActiveTicker(ticker) {
  _predTicker = ticker;
  document.querySelectorAll('.stock-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ticker === ticker);
  });
  loadPredictionData();
}

async function renderPrediction(container) {
  // Stop interval lama jika ada
  if (_realtimeInterval) { clearInterval(_realtimeInterval); _realtimeInterval = null; }

  const today = new Date();
  const thirtyDaysAgo = new Date(today - 30 * 86400000);
  const fmt = d => d.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:var(--space-3)">
      <div>
        <h1 class="page-title">Prediksi Saham</h1>
        <p class="page-subtitle">Prediksi real-time dari data Yahoo Finance terbaru · 3 Algoritma ML</p>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-2)">
        <div id="realtime-status" style="display:flex;align-items:center;gap:6px;font-size:0.75rem;color:var(--color-text-3)">
          <span id="rt-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#666"></span>
          <span id="rt-label">Siap</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="loadRealtimePrediction()" id="btn-realtime">
          ⚡ Prediksi Sekarang
        </button>
      </div>
    </div>

    <!-- Ticker Selector -->
    <div class="stock-tabs" id="pred-ticker-tabs">
      ${TICKERS.map(t => `
        <button class="stock-tab ${t === _predTicker ? 'active' : ''}" data-ticker="${t}" onclick="setActiveTicker('${t}')">
          ${t}
        </button>
      `).join('')}
    </div>

    <!-- Real-time Info Bar -->
    <div id="rt-infobar" style="display:none;background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:8px;padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4);font-size:0.8rem;display:flex;gap:var(--space-5);flex-wrap:wrap">
      <span>📅 Data per: <strong id="rt-data-date">—</strong></span>
      <span>💰 Harga terakhir: <strong id="rt-last-price">—</strong></span>
      <span>🎯 Prediksi untuk: <strong id="rt-pred-date">—</strong></span>
      <span style="margin-left:auto;color:var(--color-text-3)" id="rt-timestamp">—</span>
    </div>

    <!-- Algorithm Comparison Cards -->
    <div class="grid-3" id="pred-algo-cards" style="margin-bottom:var(--space-4)">
      ${['RANDOM_FOREST', 'DECISION_TREE', 'LOGISTIC_REGRESSION'].map(algo => `
        <div class="glow-card" id="pred-card-${algo}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3)">
            <span style="font-size:0.7rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;letter-spacing:0.1em">${algo.replace(/_/g,' ')}</span>
            <div class="skeleton" style="height:22px;width:70px;border-radius:20px"></div>
          </div>
          <div class="skeleton" style="height:64px;width:100%;margin-bottom:var(--space-3)"></div>
          <div class="skeleton" style="height:12px;width:80%"></div>
        </div>
      `).join('')}
    </div>

    <!-- 🎯 Trading Plan & Actionable Recommendation Card -->
    <div class="card" id="trading-plan-card" style="margin-bottom:var(--space-5);border-left:4px solid var(--color-primary)">
      <div class="card-header" style="flex-wrap:wrap;gap:var(--space-2)">
        <span class="card-title">🎯 Rekomendasi Trading Plan & Manajemen Risiko</span>
        <span id="plan-badge" class="badge badge-bull">Analisis Model</span>
      </div>
      <div id="plan-content" style="padding:var(--space-2) var(--space-4) var(--space-4)">
        <div class="skeleton" style="height:70px;width:100%;border-radius:8px"></div>
      </div>
    </div>

    <!-- 💰 Simulasi Modal & Kalkulator Lot -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="card-header">
        <span class="card-title">💵 Kalkulator Simulasi Modal Investasi</span>
        <span style="font-size:0.75rem;color:var(--color-text-3)">1 Lot = 100 Lembar</span>
      </div>
      <div style="padding:var(--space-4);display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:var(--space-4)">
        <div>
          <label class="form-label" style="font-size:0.8rem">Modal Investasi Anda (Rp)</label>
          <div style="display:flex;gap:var(--space-2)">
            <input type="number" id="sim-capital" class="form-control" value="10000000" step="500000" oninput="calculateCapitalSimulation()" />
            <button class="btn btn-secondary btn-sm" onclick="calculateCapitalSimulation()">Hitung</button>
          </div>
        </div>
        <div id="sim-result" style="display:flex;flex-direction:column;gap:6px;font-size:0.85rem;justify-content:center;background:var(--color-surface-2);padding:var(--space-3);border-radius:8px;border:1px solid var(--color-border)">
          <span>Jumlah Pembelian: <strong id="sim-lots">—</strong></span>
          <span>Total Nilai Pembelian: <strong id="sim-total-cost">—</strong></span>
          <span>Potensi Laba (Target TP): <strong id="sim-tp-profit" style="color:var(--color-bull)">—</strong></span>
          <span>Batas Risiko (Stop Loss): <strong id="sim-sl-loss" style="color:var(--color-bear)">—</strong></span>
        </div>
      </div>
    </div>

    <!-- Riwayat Prediksi + Filter Tanggal -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="card-header" style="flex-wrap:wrap;gap:var(--space-3)">
        <span class="card-title">📋 Riwayat Prediksi</span>
        <div style="display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap">
          <select class="form-control" id="hist-algo-select" style="width:auto;padding:4px 8px;font-size:0.8rem" onchange="loadPredictionHistory()">
            <option value="">Semua Algoritma</option>
            <option value="RANDOM_FOREST" selected>Random Forest</option>
            <option value="DECISION_TREE">Decision Tree</option>
            <option value="LOGISTIC_REGRESSION">Logistic Regression</option>
          </select>
          <input type="date" id="hist-start" class="form-control" style="width:auto;padding:4px 8px;font-size:0.8rem"
                 value="${fmt(thirtyDaysAgo)}" onchange="loadPredictionHistory()">
          <span style="font-size:0.8rem;color:var(--color-text-3)">s/d</span>
          <input type="date" id="hist-end" class="form-control" style="width:auto;padding:4px 8px;font-size:0.8rem"
                 value="${fmt(today)}" onchange="loadPredictionHistory()">
          <button class="btn btn-secondary btn-sm" onclick="clearHistFilter()">Reset</button>
          <button class="btn btn-outline btn-sm" onclick="exportHistoryToCSV()" title="Unduh Riwayat ke File CSV Excel">
            📥 Unduh CSV
          </button>
        </div>
      </div>

      <!-- Summary stats -->
      <div id="hist-summary" style="display:flex;gap:var(--space-5);padding:var(--space-3) var(--space-4);background:var(--color-surface-2);border-bottom:1px solid var(--color-border);font-size:0.8rem;flex-wrap:wrap"></div>

      <!-- Chart -->
      <div style="padding:var(--space-4)">
        <div class="chart-container" style="height:200px">
          <canvas id="pred-history-chart"></canvas>
        </div>
      </div>

      <!-- Table -->
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Tanggal Prediksi</th>
              <th>Algoritma</th>
              <th>Sinyal</th>
              <th>Probabilitas</th>
              <th>Aktual</th>
              <th>Hasil</th>
            </tr>
          </thead>
          <tbody id="pred-history-table">
            <tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-3)">Memuat...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination info -->
      <div id="hist-pagination" style="padding:var(--space-3) var(--space-4);font-size:0.75rem;color:var(--color-text-3);border-top:1px solid var(--color-border)"></div>
    </div>
  `;

  // Load data awal: gunakan prediksi dari DB (cepat), lalu tawarkan refresh real-time
  await loadPredictionData();
}

// ── Load dari DB (prediksi tersimpan) ─────────────────────────
async function loadPredictionData() {
  try {
    const predictions = await PredictionsAPI.getLatest(_predTicker);
    renderAlgoCards(predictions, false);
    renderTradingPlan(predictions);
  } catch (e) {
    // Jika DB kosong, coba real-time
    showToast('Info', 'Memuat prediksi real-time...', 'info');
    await loadRealtimePrediction();
    return;
  }
  await loadPredictionHistory();
}

// ── Load Prediksi REAL-TIME dari Yahoo Finance ─────────────────
async function loadRealtimePrediction() {
  const dot   = document.getElementById('rt-dot');
  const label = document.getElementById('rt-label');
  const btn   = document.getElementById('btn-realtime');

  if (dot)   { dot.style.background = '#f59e0b'; dot.style.animation = 'pulse 1s infinite'; }
  if (label) label.textContent = 'Mengambil data terbaru...';
  if (btn)   btn.disabled = true;

  try {
    const data = await RealtimeAPI.predict(_predTicker);
    if (data.harga_terakhir) _lastKnownPrice = data.harga_terakhir;
    renderAlgoCards(data.predictions, true);
    renderTradingPlan(data.predictions, data.harga_terakhir);
    updateInfoBar(data);

    if (dot)   { dot.style.background = '#22c55e'; dot.style.animation = ''; }
    if (label) label.textContent = `Live · ${new Date().toLocaleTimeString('id-ID')}`;
    showToast('Real-time ✓', `Data saham ${_predTicker} berhasil diperbarui`, 'success');
  } catch (e) {
    if (dot)   { dot.style.background = '#ef4444'; dot.style.animation = ''; }
    if (label) label.textContent = 'Gagal ambil data';
    showToast('Gagal prediksi real-time', e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }

  await loadPredictionHistory();
}

function updateInfoBar(data) {
  const bar = document.getElementById('rt-infobar');
  if (bar) bar.style.display = 'flex';
  const el = id => document.getElementById(id);
  if (el('rt-data-date'))  el('rt-data-date').textContent  = formatDate(data.data_tanggal);
  if (el('rt-last-price')) el('rt-last-price').textContent = formatCurrency(data.harga_terakhir);
  if (el('rt-pred-date'))  el('rt-pred-date').textContent  = formatDate(data.prediksi_untuk);
  if (el('rt-timestamp'))  el('rt-timestamp').textContent  = `Diperbarui: ${new Date(data.timestamp).toLocaleTimeString('id-ID')}`;
}

// ── Render kartu algoritma ─────────────────────────────────────
function renderAlgoCards(predictions, isRealtime = false) {
  const algoOrder = ['RANDOM_FOREST', 'DECISION_TREE', 'LOGISTIC_REGRESSION'];
  const algoNames = {
    'RANDOM_FOREST':       'Random Forest',
    'DECISION_TREE':       'Decision Tree',
    'LOGISTIC_REGRESSION': 'Logistic Regression',
  };

  algoOrder.forEach(algo => {
    const card = document.getElementById(`pred-card-${algo}`);
    if (!card) return;

    const pred = predictions.find(p => p.algorithm === algo);
    const isRF = algo === 'RANDOM_FOREST';
    const rtBadge = isRealtime
      ? '<span style="font-size:0.65rem;background:#22c55e22;color:#22c55e;padding:1px 6px;border-radius:10px;margin-left:4px">⚡ Live</span>'
      : '';

    if (!pred) {
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3)">
          <span style="font-size:0.7rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;letter-spacing:0.1em">${algoNames[algo]}</span>
          <span class="badge badge-warn">Tidak Ada Data</span>
        </div>
        <p style="color:var(--color-text-3);font-size:0.8rem">Belum ada prediksi. Klik "Prediksi Sekarang" untuk prediksi real-time.</p>
      `;
      return;
    }

    const isNaik = pred.signal === 'NAIK';
    const signalColor = isNaik ? 'var(--color-bull)' : 'var(--color-bear)';
    const signalBadge = isNaik
      ? '<span class="badge badge-bull">▲ NAIK</span>'
      : '<span class="badge badge-bear">▼ STAGNAN/TURUN</span>';
    const prob = pred.probability != null ? (pred.probability * 100).toFixed(1) : null;

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3)">
        <span style="font-size:0.7rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;letter-spacing:0.1em">
          ${algoNames[algo]}${isRF ? ' ⭐' : ''}${rtBadge}
        </span>
        ${signalBadge}
      </div>
      <div style="text-align:center;padding:var(--space-4) 0">
        <div style="font-size:3rem;margin-bottom:var(--space-2)">${isNaik ? '📈' : '📉'}</div>
        <div style="font-size:1.25rem;font-weight:700;color:${signalColor}">${pred.signal}</div>
        ${prob ? `
          <div style="margin-top:var(--space-3)">
            <div style="--pct:${prob}" class="confidence-circle">
              <span class="confidence-text" style="color:${signalColor}">${prob}%</span>
            </div>
            <div style="font-size:0.75rem;color:var(--color-text-3);margin-top:var(--space-2)">Probabilitas Naik</div>
          </div>
        ` : ''}
      </div>
      <div style="font-size:0.75rem;color:var(--color-text-3);border-top:1px solid var(--color-border);padding-top:var(--space-3)">
        📅 ${formatDate(pred.prediction_date || pred.prediksi_untuk)} &nbsp;·&nbsp; ${pred.experiment_name || '—'}
      </div>
    `;
  });
}

// ── Riwayat prediksi dengan filter tanggal ────────────────────
async function loadPredictionHistory() {
  const algo  = document.getElementById('hist-algo-select')?.value || '';
  const start = document.getElementById('hist-start')?.value || '';
  const end   = document.getElementById('hist-end')?.value || '';

  try {
    const history = await RealtimeAPI.historyByDate(_predTicker, { algorithm: algo, start, end, limit: 200 });
    _currentHistoryCache = history; // simpan untuk CSV export

    // Chart akurasi
    createPredictionHistoryChart('pred-history-chart', history);

    // Summary stats
    renderHistorySummary(history);

    // Tabel
    renderPredictionTable(history);

    // Info pagination
    const pg = document.getElementById('hist-pagination');
    if (pg) pg.textContent = `Menampilkan ${history.length} prediksi`;

  } catch (e) {
    showToast('Gagal memuat riwayat', e.message, 'error');
  }
}

function clearHistFilter() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today - 30 * 86400000);
  const fmt = d => d.toISOString().split('T')[0];
  const s = document.getElementById('hist-start');
  const e = document.getElementById('hist-end');
  const a = document.getElementById('hist-algo-select');
  if (s) s.value = fmt(thirtyDaysAgo);
  if (e) e.value = fmt(today);
  if (a) a.value = 'RANDOM_FOREST';
  loadPredictionHistory();
}

function renderHistorySummary(history) {
  const el = document.getElementById('hist-summary');
  if (!el) return;

  const withActual = history.filter(p => p.actual_class !== null && p.actual_class !== undefined);
  const total   = withActual.length;
  const correct = withActual.filter(p => p.predicted_class === p.actual_class).length;
  const acc     = total > 0 ? (correct / total * 100).toFixed(1) : '—';
  const naik    = history.filter(p => p.signal === 'NAIK').length;
  const turun   = history.length - naik;

  el.innerHTML = `
    <span>📊 Total: <strong>${history.length}</strong></span>
    <span style="color:var(--color-bull)">▲ NAIK: <strong>${naik}</strong></span>
    <span style="color:var(--color-bear)">▼ TURUN: <strong>${turun}</strong></span>
    <span style="color:var(--color-accent)">🎯 Akurasi: <strong>${acc}${total > 0 ? '%' : ''}</strong>
      ${total > 0 ? `<span style="font-weight:400;color:var(--color-text-3)"> (${correct}/${total} benar)</span>` : ''}
    </span>
  `;
}

function renderPredictionTable(history) {
  const tbody = document.getElementById('pred-history-table');
  if (!tbody) return;

  if (!history.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-3)">Tidak ada riwayat prediksi pada rentang tanggal ini</td></tr>`;
    return;
  }

  tbody.innerHTML = history.map(p => {
    const isNaik = p.signal === 'NAIK';
    const signalBadge = isNaik
      ? '<span class="badge badge-bull">▲ NAIK</span>'
      : '<span class="badge badge-bear">▼ STAGNAN</span>';

    const actual = p.actual_class != null
      ? (p.actual_class === 1 ? '<span class="badge badge-bull">Naik</span>' : '<span class="badge badge-bear">Tidak Naik</span>')
      : '<span style="color:var(--color-text-3)">Menunggu</span>';

    let result = '<span style="color:var(--color-text-3)">—</span>';
    if (p.actual_class != null) {
      result = p.predicted_class === p.actual_class
        ? '<span style="color:var(--color-bull)">✓ Benar</span>'
        : '<span style="color:var(--color-bear)">✕ Salah</span>';
    }

    const algoShort = { 'RANDOM_FOREST': 'RF', 'DECISION_TREE': 'DT', 'LOGISTIC_REGRESSION': 'LR' };

    return `
      <tr>
        <td class="mono" style="font-size:0.8rem">${formatDate(p.prediction_date)}</td>
        <td><span class="indicator-tag" title="${p.algorithm}">${algoShort[p.algorithm] || p.algorithm}</span></td>
        <td>${signalBadge}</td>
        <td class="mono">${p.probability != null ? (p.probability*100).toFixed(1)+'%' : '—'}</td>
        <td>${actual}</td>
        <td>${result}</td>
      </tr>
    `;
  }).join('');
}

// ── 🎯 Trading Plan & Risk Management ─────────────────────────
function renderTradingPlan(predictions, priceOverride = null) {
  const container = document.getElementById('plan-content');
  const badge     = document.getElementById('plan-badge');
  if (!container) return;

  const rfPred = predictions.find(p => p.algorithm === 'RANDOM_FOREST') || predictions[0];
  if (!rfPred) {
    container.innerHTML = `<p style="color:var(--color-text-3);font-size:0.85rem">Data prediksi belum lengkap untuk menyusun trading plan.</p>`;
    return;
  }

  // Tentukan harga acuan
  const defaultPrices = { 'BBCA': 5800, 'BBRI': 3100, 'BMRI': 3990, 'BBNI': 3570, 'BRIS': 1200 };
  const entryPrice = priceOverride || rfPred.latest_close || defaultPrices[_predTicker] || 5000;
  _lastKnownPrice = entryPrice;

  const isNaik = rfPred.signal === 'NAIK';
  const prob   = rfPred.probability != null ? rfPred.probability : 0.5;

  let recommendation = 'HOLD / WAIT & SEE';
  let recClass = 'badge-warn';
  let recDesc = 'Sinyal pasar masih konsolidasi, disarankan menunggu konfirmasi tren berikutnya.';

  if (isNaik) {
    if (prob >= 0.58) {
      recommendation = '🚀 STRONG BUY';
      recClass = 'badge-bull';
      recDesc = 'Model Random Forest mendeteksi momentum beli yang kuat dengan probabilitas tinggi.';
    } else {
      recommendation = '📈 SPECULATIVE BUY';
      recClass = 'badge-bull';
      recDesc = 'Peluang kenaikan terbuka, disarankan akumulasi bertahap dengan manajemen risiko ketat.';
    }
  } else {
    recommendation = '⚠️ WAIT & SEE / AVOID';
    recClass = 'badge-bear';
    recDesc = 'Model memprediksi potensi stagnan atau koreksi turun. Tunda pembelian baru.';
  }

  if (badge) {
    badge.className = `badge ${recClass}`;
    badge.textContent = recommendation;
  }

  // Hitung Level Take Profit (+3.5%) dan Stop Loss (-2.0%)
  const tpPrice = Math.round(entryPrice * 1.035 / 5) * 5;  // pembulatan fraksi saham BEI
  const slPrice = Math.round(entryPrice * 0.980 / 5) * 5;
  const tpGain  = ((tpPrice - entryPrice) / entryPrice * 100).toFixed(1);
  const slLoss  = ((slPrice - entryPrice) / entryPrice * 100).toFixed(1);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:var(--space-3);margin-bottom:var(--space-3)">
      <div style="background:var(--color-surface-2);padding:var(--space-3);border-radius:8px">
        <div style="font-size:0.75rem;color:var(--color-text-3)">Harga Acuan (Entry)</div>
        <div style="font-size:1.25rem;font-weight:700;color:var(--color-text-1)">${formatCurrency(entryPrice)}</div>
        <div style="font-size:0.7rem;color:var(--color-text-3)">Harga pasar penutupan terakhir</div>
      </div>
      <div style="background:var(--color-surface-2);padding:var(--space-3);border-radius:8px;border-left:3px solid var(--color-bull)">
        <div style="font-size:0.75rem;color:var(--color-bull);font-weight:600">🎯 Target Ambil Untung (TP)</div>
        <div style="font-size:1.25rem;font-weight:700;color:var(--color-bull)">${formatCurrency(tpPrice)}</div>
        <div style="font-size:0.7rem;color:var(--color-bull)">Potensi Gain: +${tpGain}%</div>
      </div>
      <div style="background:var(--color-surface-2);padding:var(--space-3);border-radius:8px;border-left:3px solid var(--color-bear)">
        <div style="font-size:0.75rem;color:var(--color-bear);font-weight:600">🛡️ Batas Kerugian (Stop Loss)</div>
        <div style="font-size:1.25rem;font-weight:700;color:var(--color-bear)">${formatCurrency(slPrice)}</div>
        <div style="font-size:0.7rem;color:var(--color-bear)">Batas Risiko: ${slLoss}%</div>
      </div>
      <div style="background:var(--color-surface-2);padding:var(--space-3);border-radius:8px">
        <div style="font-size:0.75rem;color:var(--color-text-3)">Risk / Reward Ratio</div>
        <div style="font-size:1.25rem;font-weight:700;color:var(--color-accent)">1 : 1.75</div>
        <div style="font-size:0.7rem;color:var(--color-text-3)">Strategi terukur & rasional</div>
      </div>
    </div>
    <div style="font-size:0.8rem;color:var(--color-text-2);background:rgba(255,255,255,0.02);padding:var(--space-2) var(--space-3);border-radius:6px">
      💡 <strong>Catatan Strategi:</strong> ${recDesc}
    </div>
  `;

  // Update kalkulator simulasi
  calculateCapitalSimulation();
}

// ── 💵 Kalkulator Simulasi Modal Investasi ─────────────────────
function calculateCapitalSimulation() {
  const capInput = document.getElementById('sim-capital');
  const capital  = parseFloat(capInput?.value) || 10000000;
  const price    = _lastKnownPrice || 5000;

  const lotPrice = price * 100; // 1 lot = 100 lembar
  const lots     = Math.floor(capital / lotPrice);
  const totalCost = lots * lotPrice;
  const remainingCash = capital - totalCost;

  // TP +3.5%, SL -2.0%
  const potentialProfit = Math.round(totalCost * 0.035);
  const potentialLoss   = Math.round(totalCost * 0.020);

  const el = id => document.getElementById(id);
  if (el('sim-lots')) el('sim-lots').textContent = `${lots.toLocaleString('id-ID')} Lot (${(lots * 100).toLocaleString('id-ID')} lembar)`;
  if (el('sim-total-cost')) el('sim-total-cost').textContent = `${formatCurrency(totalCost)} (Sisa Kas: ${formatCurrency(remainingCash)})`;
  if (el('sim-tp-profit')) el('sim-tp-profit').textContent = `+${formatCurrency(potentialProfit)} (+3.5%)`;
  if (el('sim-sl-loss')) el('sim-sl-loss').textContent = `-${formatCurrency(potentialLoss)} (-2.0%)`;
}

// ── 📥 Unduh Riwayat Prediksi ke Format CSV (Excel) ───────────
function exportHistoryToCSV() {
  if (!_currentHistoryCache || !_currentHistoryCache.length) {
    showToast('Peringatan', 'Belum ada data riwayat untuk diunduh', 'warning');
    return;
  }

  const headers = ['Tanggal Prediksi', 'Emiten', 'Algoritma', 'Sinyal', 'Probabilitas (%)', 'Label Aktual', 'Evaluasi Hasil'];
  const rows = _currentHistoryCache.map(p => {
    const isNaik = p.signal === 'NAIK';
    const probStr = p.probability != null ? (p.probability * 100).toFixed(1) : '';
    const actualStr = p.actual_class != null ? (p.actual_class === 1 ? 'Naik' : 'Tidak Naik') : 'Menunggu';
    let resultStr = '—';
    if (p.actual_class != null) {
      resultStr = p.predicted_class === p.actual_class ? 'BENAR' : 'SALAH';
    }

    return [
      `"${p.prediction_date}"`,
      `"${_predTicker}"`,
      `"${p.algorithm}"`,
      `"${p.signal}"`,
      `"${probStr}"`,
      `"${actualStr}"`,
      `"${resultStr}"`
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Riwayat_Prediksi_${_predTicker}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Berhasil Diunduh', `File CSV riwayat ${_predTicker} berhasil disimpan`, 'success');
}
