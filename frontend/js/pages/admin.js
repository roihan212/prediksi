/**
 * StockPredict — Admin Panel Page
 * Login JWT + pengaturan sistem
 */

async function renderAdmin(container) {
  const isLoggedIn = AdminAPI.isLoggedIn();

  if (!isLoggedIn) {
    renderAdminLogin(container);
  } else {
    renderAdminDashboard(container);
  }
}

function renderAdminLogin(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:70vh">
      <div class="card" style="width:400px;max-width:95vw">
        <div style="text-align:center;margin-bottom:var(--space-6)">
          <div style="width:64px;height:64px;background:var(--color-primary-dim);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;margin:0 auto var(--space-4);font-size:1.75rem">🔐</div>
          <h2 style="font-size:1.25rem;font-weight:700;color:var(--color-text-1)">Admin Panel</h2>
          <p style="font-size:0.875rem;color:var(--color-text-3);margin-top:var(--space-1)">Login untuk mengelola sistem StockPredict</p>
        </div>
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" class="form-control" id="admin-username" placeholder="admin" autocomplete="username" />
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" class="form-control" id="admin-password" placeholder="••••••••" autocomplete="current-password"
            onkeydown="if(event.key==='Enter') doAdminLogin()" />
        </div>
        <div id="admin-login-error" style="display:none;padding:var(--space-3);background:var(--color-bear-dim);border:1px solid var(--color-bear);border-radius:var(--radius-md);font-size:0.8rem;color:var(--color-bear);margin-bottom:var(--space-4)"></div>
        <button class="btn btn-primary" style="width:100%" onclick="doAdminLogin()">
          Masuk →
        </button>
      </div>
    </div>
  `;
}

async function doAdminLogin() {
  const username = document.getElementById('admin-username')?.value?.trim();
  const password = document.getElementById('admin-password')?.value;
  const errDiv   = document.getElementById('admin-login-error');

  if (!username || !password) {
    showError(errDiv, 'Username dan password diperlukan');
    return;
  }

  try {
    const result = await AdminAPI.login(username, password);
    if (result.access_token) {
      setAuthToken(result.access_token);
      showToast('Login berhasil', `Selamat datang, ${username}`, 'success');
      renderAdminDashboard(document.getElementById('page-container'));
    } else {
      showError(errDiv, 'Token tidak valid dari server');
    }
  } catch (e) {
    showError(errDiv, e.message || 'Login gagal. Periksa kredensial Anda.');
  }
}

function showError(el, msg) {
  if (!el) return;
  el.style.display = 'block';
  el.textContent   = msg;
}

function renderAdminDashboard(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Admin Panel</h1>
      <p class="page-subtitle">Kelola sistem, model aktif, dan data ingestion</p>
      <button class="btn btn-outline btn-sm" style="margin-top:var(--space-3)" onclick="doAdminLogout()">🔓 Logout</button>
    </div>

    <div class="grid-2" style="margin-bottom:var(--space-5)">
      <!-- Quick Actions -->
      <div class="card">
        <div class="card-header"><span class="card-title">⚡ Aksi Cepat</span></div>
        <div style="display:flex;flex-direction:column;gap:var(--space-3)">
          <button class="btn btn-outline" style="justify-content:flex-start" onclick="App.navigate('experiments')">
            🔬 Kelola Eksperimen & Training
          </button>
          <button class="btn btn-outline" style="justify-content:flex-start" onclick="App.navigate('prediction')">
            🤖 Lihat Prediksi Live
          </button>
          <button class="btn btn-outline" style="justify-content:flex-start" onclick="App.navigate('backtesting')">
            📊 Jalankan Backtesting
          </button>
          <button class="btn btn-outline" style="justify-content:flex-start" onclick="App.navigate('technical')">
            📈 Indikator Teknikal
          </button>
        </div>
      </div>

      <!-- Server & Connection Settings -->
      <div class="card">
        <div class="card-header"><span class="card-title">🌐 Pengaturan Koneksi Server Backend</span></div>
        <p style="font-size:0.8rem;color:var(--color-text-3);margin-bottom:var(--space-3)">
          Masukkan URL Cloud Backend (misal: https://stockpredict-api.onrender.com) atau IP laptop.
        </p>
        <div class="form-group" style="margin-bottom:var(--space-3)">
          <label class="form-label" style="font-size:0.75rem">URL Backend / IP Server</label>
          <div style="display:flex;gap:var(--space-2)">
            <input type="text" class="form-control" id="server-ip-input" placeholder="https://stockpredict-api.onrender.com" 
                   value="${localStorage.getItem('sp_backend_url') || localStorage.getItem('sp_server_ip') || ''}" />
            <button class="btn btn-primary btn-sm" onclick="saveServerIPSetting()">Simpan</button>
          </div>
        </div>
        <div class="metric-row">
          <span class="metric-label">API Aktif</span>
          <span class="metric-value mono" style="font-size:0.75rem">${API_BASE}</span>
        </div>
      </div>
    </div>

      <!-- System Info -->
      <div class="card">
        <div class="card-header"><span class="card-title">ℹ️ Informasi Sistem</span></div>
        <div class="metric-row">
          <span class="metric-label">Backend URL</span>
          <span class="metric-value mono" style="font-size:0.75rem">http://localhost:8000</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Dokumentasi API</span>
          <a href="http://localhost:8000/docs" target="_blank" style="color:var(--color-primary);font-size:0.875rem;font-weight:600">localhost:8000/docs ↗</a>
        </div>
        <div class="metric-row">
          <span class="metric-label">Emiten Terdaftar</span>
          <span class="metric-value">BBCA, BBRI, BBNI, BMRI, BRIS</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Model Utama</span>
          <span class="metric-value">Random Forest</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Auth Token</span>
          <span class="metric-value" style="color:var(--color-bull)">● Aktif</span>
        </div>
      </div>
    </div>

    <!-- API Status -->
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="card-header">
        <span class="card-title">🔌 Status API Endpoints</span>
        <button class="btn btn-outline btn-sm" onclick="checkApiStatus()">Cek Status</button>
      </div>
      <div id="admin-api-status">
        <div class="empty-state" style="padding:var(--space-5)">
          <p>Klik "Cek Status" untuk memeriksa konektivitas API</p>
        </div>
      </div>
    </div>

    <!-- Model Management -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">🌲 Manajemen Model Aktif</span>
        <button class="btn btn-outline btn-sm" onclick="loadActiveModels()">Refresh</button>
      </div>
      <div id="admin-active-models">
        <div class="skeleton" style="height:80px;border-radius:8px"></div>
      </div>
    </div>
  `;

  checkApiStatus();
  loadActiveModels();
}

function saveServerIPSetting() {
  const ip = document.getElementById('server-ip-input')?.value?.trim();
  if (!ip) {
    showToast('Peringatan', 'Masukkan IP server yang valid', 'warning');
    return;
  }
  setServerIP(ip);
}

function doAdminLogout() {
  AdminAPI.logout();
  showToast('Logout berhasil', '', 'info');
  renderAdminLogin(document.getElementById('page-container'));
}

async function checkApiStatus() {
  const endpoints = [
    { name: 'Market Overview', url: '/market/overview' },
    { name: 'Stocks List',     url: '/stocks/' },
    { name: 'Experiments',     url: '/experiments/' },
  ];

  const div = document.getElementById('admin-api-status');
  if (!div) return;

  div.innerHTML = endpoints.map(ep => `
    <div class="metric-row" id="api-status-${ep.name.replace(/ /g,'_')}">
      <span class="metric-label">${ep.name}</span>
      <span style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--color-text-3)">
        <div class="skeleton" style="width:60px;height:16px;border-radius:4px"></div>
      </span>
    </div>
  `).join('');

  for (const ep of endpoints) {
    const rowId = `api-status-${ep.name.replace(/ /g,'_')}`;
    const row = document.getElementById(rowId);
    if (!row) continue;

    try {
      const start = Date.now();
      await apiFetch(ep.url);
      const ms = Date.now() - start;
      row.querySelector('span:last-child').innerHTML = `<span style="color:var(--color-bull)">✓ OK</span> <span style="color:var(--color-text-3);font-family:'JetBrains Mono',monospace">${ms}ms</span>`;
    } catch (e) {
      row.querySelector('span:last-child').innerHTML = `<span style="color:var(--color-bear)">✕ Error</span>`;
    }
  }
}

async function loadActiveModels() {
  const div = document.getElementById('admin-active-models');
  if (!div) return;

  try {
    const experiments = await ExperimentsAPI.list();
    const activeExp   = experiments.find(e => e.is_active);
    const allByAlgo   = {};
    experiments.forEach(e => {
      if (!allByAlgo[e.algorithm]) allByAlgo[e.algorithm] = [];
      allByAlgo[e.algorithm].push(e);
    });

    div.innerHTML = `
      <div class="metric-row">
        <span class="metric-label">Model Produksi Aktif</span>
        <span class="metric-value">${activeExp ? activeExp.experiment_name : '—'} ${activeExp ? `<span class="badge badge-bull">● Live</span>` : ''}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Total Eksperimen</span>
        <span class="metric-value">${experiments.length}</span>
      </div>
      ${Object.entries(allByAlgo).map(([algo, exps]) => `
        <div class="metric-row">
          <span class="metric-label">${algo.replace(/_/g,' ')}</span>
          <span class="metric-value">${exps.length} run</span>
        </div>
      `).join('')}
      <div style="margin-top:var(--space-4)">
        <button class="btn btn-outline btn-sm" onclick="App.navigate('experiments')">
          Lihat Semua Eksperimen →
        </button>
      </div>
    `;
  } catch (e) {
    div.innerHTML = `<p style="color:var(--color-text-3);font-size:0.875rem;padding:var(--space-3) 0">${e.message}</p>`;
  }
}
