/**
 * StockPredict — ML Experiments Page
 * List eksperimen training, metrik, feature importance
 */

async function renderExperiments(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Eksperimen ML</h1>
      <p class="page-subtitle">Riwayat training model, perbandingan metrik, dan feature importance</p>
    </div>

    <!-- Filter + Trigger -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="margin-bottom:0;flex:1;min-width:200px">
          <label class="form-label">Filter Algoritma</label>
          <select class="form-control" id="exp-algo-filter" onchange="loadExperiments()">
            <option value="">Semua Algoritma</option>
            <option value="RANDOM_FOREST">Random Forest</option>
            <option value="DECISION_TREE">Decision Tree</option>
            <option value="LOGISTIC_REGRESSION">Logistic Regression</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="showTriggerModal()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Training Baru
        </button>
      </div>
    </div>

    <!-- Experiments List -->
    <div id="exp-list">
      ${[...Array(3)].map(() => `
        <div class="card" style="margin-bottom:var(--space-4)">
          <div style="display:flex;gap:var(--space-4)">
            <div class="skeleton" style="width:60px;height:60px;border-radius:10px;flex-shrink:0"></div>
            <div style="flex:1">
              <div class="skeleton" style="height:16px;width:40%;margin-bottom:8px"></div>
              <div class="skeleton" style="height:12px;width:60%;margin-bottom:6px"></div>
              <div class="skeleton" style="height:12px;width:30%"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Trigger Modal -->
    <div id="exp-trigger-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:500;display:none;align-items:center;justify-content:center;backdrop-filter:blur(4px)">
      <div class="card" style="width:480px;max-width:95vw;position:relative;z-index:501">
        <div class="card-header">
          <span class="card-title" style="font-size:1rem;color:var(--color-text-1)">🚀 Mulai Training Baru</span>
          <button class="btn-icon" onclick="hideTriggerModal()" style="border:none;background:none;font-size:1.2rem">✕</button>
        </div>
        <div class="form-group">
          <label class="form-label">Nama Eksperimen</label>
          <input type="text" class="form-control" id="exp-name-input" placeholder="RF-v2-BBCA-2025" />
        </div>
        <div class="form-group">
          <label class="form-label">Algoritma</label>
          <select class="form-control" id="exp-algo-input">
            <option value="RANDOM_FOREST">Random Forest</option>
            <option value="DECISION_TREE">Decision Tree</option>
            <option value="LOGISTIC_REGRESSION">Logistic Regression</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Filter Emiten (opsional)</label>
          <select class="form-control" id="exp-ticker-input">
            <option value="">Semua Emiten</option>
            ${TICKERS.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label style="display:flex;align-items:center;gap:var(--space-3);cursor:pointer">
            <input type="checkbox" id="exp-gridsearch-input" style="width:16px;height:16px">
            <span style="font-size:0.875rem;color:var(--color-text-2)">Gunakan Grid Search (lebih lambat, hasil lebih optimal)</span>
          </label>
        </div>
        <div style="display:flex;gap:var(--space-3);margin-top:var(--space-5)">
          <button class="btn btn-outline" onclick="hideTriggerModal()">Batal</button>
          <button class="btn btn-primary" onclick="triggerTraining()">🚀 Mulai Training</button>
        </div>
      </div>
    </div>
  `;

  await loadExperiments();
}

async function loadExperiments() {
  const filter = document.getElementById('exp-algo-filter')?.value;
  const listDiv = document.getElementById('exp-list');

  try {
    const experiments = await ExperimentsAPI.list(filter);

    if (!experiments.length) {
      listDiv.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔬</div>
          <h3>Belum Ada Eksperimen</h3>
          <p>Klik "Training Baru" untuk memulai eksperimen machine learning pertama.</p>
        </div>
      `;
      return;
    }

    listDiv.innerHTML = experiments.map(exp => renderExperimentCard(exp)).join('');

  } catch (e) {
    listDiv.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠</div><h3>Gagal memuat</h3><p>${e.message}</p></div>`;
    showToast('Gagal memuat eksperimen', e.message, 'error');
  }
}

function renderExperimentCard(exp) {
  const algoColors = {
    'RANDOM_FOREST':       'primary',
    'DECISION_TREE':       'warn',
    'LOGISTIC_REGRESSION': 'bull',
  };
  const algoEmoji = {
    'RANDOM_FOREST':       '🌲',
    'DECISION_TREE':       '🌿',
    'LOGISTIC_REGRESSION': '📐',
  };
  const color = algoColors[exp.algorithm] || 'primary';
  const emoji = algoEmoji[exp.algorithm] || '🤖';

  const metrics = exp.metrics || {};
  const acc  = metrics.accuracy != null ? (metrics.accuracy * 100).toFixed(1) : '—';
  const f1   = metrics.f1 != null ? (metrics.f1 * 100).toFixed(1) : '—';
  const auc  = metrics.roc_auc != null ? metrics.roc_auc.toFixed(3) : '—';

  // Feature importance (top 3)
  let fiHtml = '';
  if (exp.feature_importance && typeof exp.feature_importance === 'object') {
    const fi = Object.entries(exp.feature_importance)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    fiHtml = `<div style="margin-top:var(--space-3);display:flex;gap:var(--space-2);flex-wrap:wrap">
      ${fi.map(([k, v]) => `<span class="indicator-tag">${k}: ${(v*100).toFixed(1)}%</span>`).join('')}
    </div>`;
  }

  return `
    <div class="card" style="margin-bottom:var(--space-4);transition:transform 200ms ease" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
      <div style="display:flex;gap:var(--space-4);align-items:flex-start">
        <div class="stat-icon" style="width:52px;height:52px;background:var(--color-${color}-dim);color:var(--color-${color});font-size:1.5rem;flex-shrink:0">
          ${emoji}
        </div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:var(--space-2)">
            <div>
              <div style="font-size:0.975rem;font-weight:700;color:var(--color-text-1)">${exp.experiment_name || 'Unnamed'}</div>
              <div style="font-size:0.75rem;color:var(--color-text-3);margin-top:2px">
                <span class="indicator-tag">${exp.algorithm?.replace(/_/g, ' ')}</span>
                &nbsp; ID: ${exp.id} &nbsp;·&nbsp; ${formatDate(exp.created_at)}
                ${exp.is_active ? '<span class="badge badge-bull" style="margin-left:6px">● Aktif</span>' : ''}
              </div>
            </div>
            <div style="display:flex;gap:var(--space-2)">
              ${!exp.is_active ? `<button class="btn btn-outline btn-sm" onclick="activateExperiment(${exp.id})">Set Aktif</button>` : ''}
              <button class="btn btn-outline btn-sm" onclick="showExperimentDetail(${exp.id})">Detail →</button>
            </div>
          </div>

          <!-- Metrics row -->
          <div style="display:flex;gap:var(--space-5);margin-top:var(--space-3);flex-wrap:wrap">
            <div>
              <div style="font-size:0.65rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;letter-spacing:0.06em">Accuracy</div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--color-accent);font-family:'JetBrains Mono',monospace">${acc}%</div>
            </div>
            <div>
              <div style="font-size:0.65rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;letter-spacing:0.06em">F1-Score</div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--color-primary);font-family:'JetBrains Mono',monospace">${f1}%</div>
            </div>
            <div>
              <div style="font-size:0.65rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;letter-spacing:0.06em">AUC-ROC</div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--color-warn);font-family:'JetBrains Mono',monospace">${auc}</div>
            </div>
            ${metrics.training_samples ? `
            <div>
              <div style="font-size:0.65rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;letter-spacing:0.06em">Samples</div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--color-text-2);font-family:'JetBrains Mono',monospace">${Number(metrics.training_samples).toLocaleString('id-ID')}</div>
            </div>` : ''}
          </div>
          ${fiHtml}
        </div>
      </div>
    </div>
  `;
}

async function showExperimentDetail(id) {
  try {
    const exp = await ExperimentsAPI.get(id);

    const overlay = document.createElement('div');
    overlay.id = 'exp-detail-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:600;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:var(--space-5)';

    const metrics = exp.metrics || {};
    const fi = exp.feature_importance && typeof exp.feature_importance === 'object'
      ? Object.entries(exp.feature_importance).sort((a, b) => b[1] - a[1])
      : [];

    overlay.innerHTML = `
      <div class="card" style="width:700px;max-width:95vw;max-height:85vh;overflow-y:auto;position:relative">
        <div class="card-header" style="position:sticky;top:0;background:var(--color-bg-2);z-index:1;padding-bottom:var(--space-3);border-bottom:1px solid var(--color-border)">
          <div>
            <div style="font-size:1rem;font-weight:700;color:var(--color-text-1)">${exp.experiment_name}</div>
            <div style="font-size:0.75rem;color:var(--color-text-3)">${exp.algorithm} · ${formatDate(exp.created_at)}</div>
          </div>
          <button class="btn-icon" onclick="document.getElementById('exp-detail-overlay').remove()" style="border:none;background:none;font-size:1.2rem;flex-shrink:0">✕</button>
        </div>

        <!-- Metrics grid -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3);margin:var(--space-4) 0">
          ${[
            ['Accuracy',  metrics.accuracy,  'accent'],
            ['Precision', metrics.precision, 'primary'],
            ['Recall',    metrics.recall,    'primary'],
            ['F1-Score',  metrics.f1,        'warn'],
            ['AUC-ROC',   metrics.roc_auc,   'warn'],
          ].map(([label, val, color]) => `
            <div style="background:var(--color-surface);border-radius:var(--radius-md);padding:var(--space-3)">
              <div style="font-size:0.65rem;font-weight:600;color:var(--color-text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:var(--space-1)">${label}</div>
              <div style="font-size:1.25rem;font-weight:700;color:var(--color-${color});font-family:'JetBrains Mono',monospace">${val != null ? (label === 'AUC-ROC' ? val.toFixed(3) : (val*100).toFixed(1)+'%') : '—'}</div>
            </div>
          `).join('')}
        </div>

        <!-- Feature Importance -->
        ${fi.length > 0 ? `
          <div class="card-header" style="margin-bottom:var(--space-3)"><span class="card-title">Feature Importance</span></div>
          <div class="chart-container" style="height:${Math.min(fi.length * 30 + 40, 300)}px;margin-bottom:var(--space-4)">
            <canvas id="exp-detail-fi-chart"></canvas>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-4)">
            ${fi.map(([k, v]) => `<span class="indicator-tag">${k}: ${(v*100).toFixed(2)}%</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;

    document.body.appendChild(overlay);

    // Render chart after DOM is ready
    if (fi.length > 0) {
      setTimeout(() => {
        createFeatureImportanceChart('exp-detail-fi-chart', fi.map(([name, value]) => ({ name, value })));
      }, 50);
    }

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

  } catch (e) {
    showToast('Gagal memuat detail', e.message, 'error');
  }
}

async function activateExperiment(id) {
  try {
    await ExperimentsAPI.activate(id);
    showToast('Model diaktifkan', 'Model berhasil dijadikan model produksi aktif', 'success');
    loadExperiments();
  } catch (e) {
    showToast('Gagal mengaktifkan', e.message, 'error');
  }
}

function showTriggerModal() {
  const modal = document.getElementById('exp-trigger-modal');
  if (modal) { modal.style.display = 'flex'; }
}

function hideTriggerModal() {
  const modal = document.getElementById('exp-trigger-modal');
  if (modal) { modal.style.display = 'none'; }
}

async function triggerTraining() {
  const name       = document.getElementById('exp-name-input')?.value?.trim();
  const algorithm  = document.getElementById('exp-algo-input')?.value;
  const ticker     = document.getElementById('exp-ticker-input')?.value || null;
  const gridSearch = document.getElementById('exp-gridsearch-input')?.checked;

  if (!name) {
    showToast('Nama diperlukan', 'Masukkan nama eksperimen terlebih dahulu', 'warn');
    return;
  }

  try {
    const result = await ExperimentsAPI.trigger({
      experiment_name: name,
      algorithm,
      ticker,
      use_grid_search: gridSearch,
    });
    hideTriggerModal();
    showToast('Training dimulai!', `Task ID: ${result.task_id}`, 'success');
    setTimeout(loadExperiments, 2000);
  } catch (e) {
    showToast('Gagal memulai training', e.message, 'error');
  }
}
