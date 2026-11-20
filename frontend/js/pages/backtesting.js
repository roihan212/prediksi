/**
 * StockPredict — Backtesting Page
 * Simulasi strategi trading berdasarkan prediksi model
 */

let _btTicker    = 'BBCA';
let _btAlgorithm = 'RANDOM_FOREST';

async function renderBacktesting(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Backtesting</h1>
      <p class="page-subtitle">Evaluasi performa model prediksi menggunakan data historis aktual</p>
    </div>

    <!-- Controls -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="margin-bottom:0;flex:1;min-width:180px">
          <label class="form-label">Emiten</label>
          <select class="form-control" id="bt-ticker-select" onchange="_btTicker=this.value">
            ${TICKERS.map(t => `<option value="${t}" ${t===_btTicker?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;flex:1;min-width:220px">
          <label class="form-label">Algoritma</label>
          <select class="form-control" id="bt-algo-select" onchange="_btAlgorithm=this.value">
            <option value="RANDOM_FOREST">Random Forest</option>
            <option value="DECISION_TREE">Decision Tree</option>
            <option value="LOGISTIC_REGRESSION">Logistic Regression</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;flex:1;min-width:160px">
          <label class="form-label">Jumlah Prediksi</label>
          <select class="form-control" id="bt-limit-select">
            <option value="100">100</option>
            <option value="200" selected>200</option>
            <option value="500">500</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="runBacktest()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Jalankan Backtest
        </button>
      </div>
    </div>

    <!-- Results -->
    <div id="bt-results">
      <div style="text-align:center;padding:4rem;color:var(--color-text-3)">
        <div style="font-size:3rem;margin-bottom:1rem">🔬</div>
        <h3 style="color:var(--color-text-2)">Pilih parameter dan klik "Jalankan Backtest"</h3>
        <p style="margin-top:0.5rem">Sistem akan menghitung akurasi prediksi berdasarkan riwayat prediksi vs data aktual</p>
      </div>
    </div>
  `;
}

async function runBacktest() {
  const ticker    = document.getElementById('bt-ticker-select').value;
  const algorithm = document.getElementById('bt-algo-select').value;
  const limit     = parseInt(document.getElementById('bt-limit-select').value);

  _btTicker    = ticker;
  _btAlgorithm = algorithm;

  const resultsDiv = document.getElementById('bt-results');
  resultsDiv.innerHTML = `
    <div style="text-align:center;padding:3rem;color:var(--color-text-3)">
      <div class="skeleton" style="height:200px;margin-bottom:1rem;border-radius:12px"></div>
      <div class="skeleton" style="height:16px;width:60%;margin:0 auto"></div>
    </div>
  `;

  try {
    const history = await PredictionsAPI.getHistory(ticker, { algorithm, limit });
    const result  = computeBacktest(history);

    if (!result || result.total === 0) {
      resultsDiv.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <h3>Tidak Ada Data Aktual</h3>
          <p>Riwayat prediksi belum memiliki label aktual untuk evaluasi. Prediksi hanya bisa dievaluasi setelah hari trading berlalu.</p>
        </div>
      `;
      return;
    }

    renderBacktestResults(result, ticker, algorithm, history);
    showToast('Backtest selesai', `${result.total} prediksi dievaluasi`, 'success');

  } catch (e) {
    resultsDiv.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠</div><h3>Error</h3><p>${e.message}</p></div>`;
    showToast('Backtest gagal', e.message, 'error');
  }
}

function renderBacktestResults(result, ticker, algorithm, history) {
  const algoName = algorithm.replace(/_/g, ' ');
  const resultsDiv = document.getElementById('bt-results');

  resultsDiv.innerHTML = `
    <!-- KPI Cards -->
    <div class="stat-cards" style="margin-bottom:var(--space-5)">
      <div class="stat-card ${result.accuracy >= 0.6 ? 'bull' : result.accuracy >= 0.5 ? 'warn' : 'bear'}">
        <div class="stat-label">Akurasi</div>
        <div class="accuracy-display">
          <span class="accuracy-number">${(result.accuracy * 100).toFixed(1)}</span>
          <span class="accuracy-suffix">%</span>
        </div>
        <div class="stat-change ${result.accuracy >= 0.5 ? 'positive' : 'negative'}">
          ${result.correct} dari ${result.total} benar
        </div>
      </div>
      <div class="stat-card primary">
        <div class="stat-label">Precision</div>
        <div class="stat-value">${(result.precision * 100).toFixed(1)}%</div>
        <div class="stat-change" style="color:var(--color-text-3)">TP / (TP+FP)</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-label">Recall</div>
        <div class="stat-value">${(result.recall * 100).toFixed(1)}%</div>
        <div class="stat-change" style="color:var(--color-text-3)">TP / (TP+FN)</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-label">F1-Score</div>
        <div class="stat-value">${(result.f1 * 100).toFixed(1)}%</div>
        <div class="stat-change" style="color:var(--color-text-3)">Harmonic Mean P/R</div>
      </div>
      <div class="stat-card ${result.winRate >= 0.5 ? 'bull' : 'bear'}">
        <div class="stat-label">Win Rate (saat NAIK)</div>
        <div class="stat-value">${(result.winRate * 100).toFixed(1)}%</div>
        <div class="stat-change" style="color:var(--color-text-3)">${result.wins}W / ${result.losses}L</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid-2" style="margin-bottom:var(--space-5)">
      <!-- Metrics Bar Chart -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">📊 Perbandingan Metrik — ${ticker} (${algoName})</span>
        </div>
        <div class="chart-container" style="height:220px">
          <canvas id="bt-metric-chart"></canvas>
        </div>
      </div>

      <!-- Confusion Matrix -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🔢 Confusion Matrix</span>
        </div>
        <div class="chart-container" style="height:220px">
          <canvas id="bt-confusion-chart"></canvas>
        </div>
      </div>
    </div>

    <!-- Confusion Matrix Detail -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="card-header">
        <span class="card-title">📋 Detail Confusion Matrix</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-4);max-width:400px;margin:0 auto;padding:var(--space-4) 0">
        <div style="background:var(--color-bull-dim);border:1px solid var(--color-bull);border-radius:var(--radius-md);padding:var(--space-4);text-align:center">
          <div style="font-size:0.7rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;margin-bottom:var(--space-1)">True Negative</div>
          <div style="font-size:2rem;font-weight:700;color:var(--color-bull)">${result.tn}</div>
          <div style="font-size:0.7rem;color:var(--color-text-3)">Prediksi STAGNAN, Aktual STAGNAN</div>
        </div>
        <div style="background:var(--color-bear-dim);border:1px solid var(--color-bear);border-radius:var(--radius-md);padding:var(--space-4);text-align:center">
          <div style="font-size:0.7rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;margin-bottom:var(--space-1)">False Positive</div>
          <div style="font-size:2rem;font-weight:700;color:var(--color-bear)">${result.fp}</div>
          <div style="font-size:0.7rem;color:var(--color-text-3)">Prediksi NAIK, Aktual STAGNAN</div>
        </div>
        <div style="background:var(--color-bear-dim);border:1px solid var(--color-bear);border-radius:var(--radius-md);padding:var(--space-4);text-align:center">
          <div style="font-size:0.7rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;margin-bottom:var(--space-1)">False Negative</div>
          <div style="font-size:2rem;font-weight:700;color:var(--color-bear)">${result.fn}</div>
          <div style="font-size:0.7rem;color:var(--color-text-3)">Prediksi STAGNAN, Aktual NAIK</div>
        </div>
        <div style="background:var(--color-bull-dim);border:1px solid var(--color-bull);border-radius:var(--radius-md);padding:var(--space-4);text-align:center">
          <div style="font-size:0.7rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;margin-bottom:var(--space-1)">True Positive</div>
          <div style="font-size:2rem;font-weight:700;color:var(--color-bull)">${result.tp}</div>
          <div style="font-size:0.7rem;color:var(--color-text-3)">Prediksi NAIK, Aktual NAIK</div>
        </div>
      </div>
    </div>

    <!-- Running Accuracy Chart -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">📈 Running Accuracy Over Time</span>
      </div>
      <div class="chart-container" style="height:220px">
        <canvas id="bt-running-accuracy-chart"></canvas>
      </div>
    </div>
  `;

  // Render charts
  createMetricBarChart('bt-metric-chart',
    ['Accuracy', 'Precision', 'Recall', 'F1-Score'],
    [result.accuracy, result.precision, result.recall, result.f1]
  );

  createConfusionChart('bt-confusion-chart', result.confusionMatrix);
  createPredictionHistoryChart('bt-running-accuracy-chart', history);
}
