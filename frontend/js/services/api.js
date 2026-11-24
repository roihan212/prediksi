/**
 * StockPredict — API Service
 * Semua komunikasi ke FastAPI backend (http://localhost:8000)
 *
 * Deteksi otomatis:
 * - Di browser/laptop  → http://localhost:8000
 * - Di HP (Capacitor)  → gunakan IP laptop dari localStorage, atau prompt user
 */

// Deteksi apakah berjalan di dalam Capacitor (Android/iOS APK)
const IS_CAPACITOR = window.location.protocol === 'capacitor:' ||
                     window.location.href.startsWith('capacitor://') ||
                     (typeof window.Capacitor !== 'undefined');

function getApiBase() {
  // 1. Cek apakah ada custom backend URL tersimpan (misal dari Render Cloud)
  const savedUrl = localStorage.getItem('sp_backend_url');
  if (savedUrl) {
    return `${savedUrl.replace(/\/$/, '')}/api/v1`;
  }

  // 2. Di HP (Capacitor APK)
  if (IS_CAPACITOR) {
    const savedIp = localStorage.getItem('sp_server_ip') || '192.168.1.16';
    return `http://${savedIp}:8000/api/v1`;
  }

  // 3. Di GitHub Pages (otomatis pakai cloud jika belum diset manual)
  if (window.location.hostname.includes('github.io')) {
    // URL Render default (akan diisi URL render Anda)
    return 'https://stockpredict-api.onrender.com/api/v1';
  }

  // 4. Default lokal
  return 'http://localhost:8000/api/v1';
}

const API_BASE = getApiBase();

// Fungsi untuk mengubah URL/IP server (dari halaman Admin)
function setServerIP(urlOrIp) {
  if (!urlOrIp) return;
  if (urlOrIp.startsWith('http://') || urlOrIp.startsWith('https://')) {
    localStorage.setItem('sp_backend_url', urlOrIp);
  } else {
    // Jika hanya IP angka
    localStorage.setItem('sp_server_ip', urlOrIp);
    localStorage.setItem('sp_backend_url', `http://${urlOrIp}:8000`);
  }
  // Reload agar API_BASE ter-update
  window.location.reload();
}

// ── Auth Token ────────────────────────────────────────────────
let _authToken = localStorage.getItem('sp_token') || null;

function setAuthToken(token) {
  _authToken = token;
  if (token) localStorage.setItem('sp_token', token);
  else localStorage.removeItem('sp_token');
}

function getAuthHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (_authToken) h['Authorization'] = `Bearer ${_authToken}`;
  return h;
}

// ── Generic Fetch Wrapper ─────────────────────────────────────
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: getAuthHeaders(),
    ...options,
  };
  try {
    const res = await fetch(url, config);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error('Tidak dapat terhubung ke server. Pastikan backend berjalan di port 8000.');
    }
    throw e;
  }
}

// ── Market ────────────────────────────────────────────────────
const MarketAPI = {
  /** GET /market/overview — snapshot semua 5 saham */
  getOverview: () => apiFetch('/market/overview'),
};

// ── Stocks ────────────────────────────────────────────────────
const StocksAPI = {
  /** GET /stocks/ — daftar emiten */
  list: () => apiFetch('/stocks/'),

  /** GET /stocks/{ticker} — detail emiten */
  get: (ticker) => apiFetch(`/stocks/${ticker}`),

  /**
   * GET /stocks/{ticker}/prices — harga historis OHLCV
   * @param {string} ticker
   * @param {object} params — { start, end, limit }
   */
  getPrices: (ticker, params = {}) => {
    const q = new URLSearchParams();
    if (params.start) q.set('start', params.start);
    if (params.end) q.set('end', params.end);
    if (params.limit) q.set('limit', params.limit);
    const qs = q.toString() ? `?${q}` : '';
    return apiFetch(`/stocks/${ticker}/prices${qs}`);
  },

  /**
   * GET /stocks/{ticker}/indicators — indikator teknikal
   * @param {string} ticker
   * @param {number} limit
   */
  getIndicators: (ticker, limit = 100) =>
    apiFetch(`/stocks/${ticker}/indicators?limit=${limit}`),
};

// ── Predictions ───────────────────────────────────────────────
const PredictionsAPI = {
  /** GET /predictions/{ticker}/latest — prediksi terbaru 3 model */
  getLatest: (ticker) => apiFetch(`/predictions/${ticker}/latest`),

  /**
   * GET /predictions/{ticker}/history
   * @param {string} ticker
   * @param {object} params — { algorithm, start, end, limit }
   */
  getHistory: (ticker, params = {}) => {
    const q = new URLSearchParams();
    if (params.algorithm) q.set('algorithm', params.algorithm);
    if (params.start)     q.set('start', params.start);
    if (params.end)       q.set('end', params.end);
    if (params.limit)     q.set('limit', params.limit);
    const qs = q.toString() ? `?${q}` : '';
    return apiFetch(`/predictions/${ticker}/history${qs}`);
  },
};

// ── Experiments ───────────────────────────────────────────────
const ExperimentsAPI = {
  /** GET /experiments/ */
  list: (algorithm) => {
    const q = algorithm ? `?algorithm=${algorithm}` : '';
    return apiFetch(`/experiments/${q}`);
  },

  /** GET /experiments/{id} */
  get: (id) => apiFetch(`/experiments/${id}`),

  /** POST /experiments/{id}/activate */
  activate: (id) => apiFetch(`/experiments/${id}/activate`, { method: 'POST' }),

  /**
   * POST /experiments/trigger — training baru
   * @param {object} payload — { algorithm, experiment_name, ticker, use_grid_search, custom_params }
   */
  trigger: (payload) =>
    apiFetch('/experiments/trigger', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ── Admin ─────────────────────────────────────────────────────
const AdminAPI = {
  /** POST /admin/login */
  login: (username, password) =>
    apiFetch('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => {
    setAuthToken(null);
  },

  isLoggedIn: () => !!_authToken,
};

// ── Real-Time Prediction ───────────────────────────────────────
const RealtimeAPI = {
  /**
   * GET /realtime/{ticker}/predict
   * Fetch harga terbaru Yahoo Finance → prediksi langsung (real-time)
   */
  predict: (ticker) => apiFetch(`/realtime/${ticker}/predict`),

  /**
   * GET /realtime/{ticker}/history-by-date
   * Riwayat prediksi dengan filter tanggal dari DB
   * @param {string} ticker
   * @param {object} params - { algorithm, start, end, limit }
   */
  historyByDate: (ticker, params = {}) => {
    const q = new URLSearchParams();
    if (params.algorithm) q.set('algorithm', params.algorithm);
    if (params.start)     q.set('start', params.start);
    if (params.end)       q.set('end', params.end);
    if (params.limit)     q.set('limit', params.limit);
    const qs = q.toString() ? `?${q}` : '';
    return apiFetch(`/realtime/${ticker}/history-by-date${qs}`);
  },
};

// ── Backtesting (derived from predictions history) ────────────
const BacktestAPI = {
  /**
   * Hitung metrik backtesting dari riwayat prediksi
   * Karena tidak ada endpoint khusus, kita hitung dari history predictions
   */
  run: async (ticker, algorithm = 'RANDOM_FOREST', limit = 200) => {
    const history = await PredictionsAPI.getHistory(ticker, { algorithm, limit });
    return computeBacktest(history);
  },
};

function computeBacktest(predictions) {
  const withActual = predictions.filter(p => p.actual_class !== null && p.actual_class !== undefined);
  if (withActual.length === 0) return null;

  let correct = 0, tp = 0, fp = 0, fn = 0, tn = 0;
  let wins = 0, losses = 0;

  withActual.forEach(p => {
    const pred = p.predicted_class;
    const actual = p.actual_class;
    if (pred === actual) correct++;
    if (pred === 1 && actual === 1) tp++;
    if (pred === 1 && actual === 0) fp++;
    if (pred === 0 && actual === 1) fn++;
    if (pred === 0 && actual === 0) tn++;
    if (pred === 1) { actual === 1 ? wins++ : losses++; }
  });

  const n = withActual.length;
  const accuracy  = correct / n;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1        = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const winRate   = wins + losses > 0 ? wins / (wins + losses) : 0;

  return {
    total: n, correct, accuracy, precision, recall, f1,
    tp, fp, fn, tn, wins, losses, winRate,
    confusionMatrix: [[tn, fp], [fn, tp]],
  };
}

// ── Helpers ───────────────────────────────────────────────────
function formatCurrency(val, symbol = 'Rp') {
  if (val == null) return '—';
  return `${symbol} ${Number(val).toLocaleString('id-ID')}`;
}

function formatPct(val, decimals = 2) {
  if (val == null) return '—';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${Number(val).toFixed(decimals)}%`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// Market status: BEI buka Senin-Jumat 09:00–16:00 WIB
function isMarketOpen() {
  const now = new Date();
  const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const day  = wib.getDay(); // 0=Sun
  const hour = wib.getHours();
  const min  = wib.getMinutes();
  const timeVal = hour * 60 + min;
  return day >= 1 && day <= 5 && timeVal >= 540 && timeVal < 960;
}
