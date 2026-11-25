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

  // 3. Di GitHub Pages (otomatis pakai tunnel HTTPS publik)
  if (window.location.hostname.includes('github.io')) {
    return 'https://tall-cats-flash.loca.lt/api/v1';
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
  const h = { 
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true'
  };
  if (_authToken) h['Authorization'] = `Bearer ${_authToken}`;
  return h;
}

// ── Static JSON Fallback (untuk GitHub Pages saat backend offline) ──
let _usingStaticFallback = false;

async function fetchStaticFallback(path) {
  const [cleanPath, queryStr] = path.split('?');
  const params = new URLSearchParams(queryStr || '');
  const cleanTicker = (t) => t.replace(/\.JK$/i, '').toUpperCase();

  let jsonFile = null;
  let postProcess = (data) => data;

  if (cleanPath === '/market/overview') {
    jsonFile = 'data/market_overview.json';
  } else if (cleanPath === '/stocks/' || cleanPath === '/stocks') {
    jsonFile = 'data/stocks_list.json';
  } else if (cleanPath === '/experiments/' || cleanPath === '/experiments') {
    jsonFile = 'data/experiments.json';
    const algo = params.get('algorithm');
    if (algo) postProcess = (d) => d.filter(e => e.algorithm === algo.toUpperCase());
  } else if (/^\/experiments\/(\d+)$/.test(cleanPath)) {
    const id = parseInt(cleanPath.match(/^\/experiments\/(\d+)$/)[1], 10);
    jsonFile = 'data/experiments.json';
    postProcess = (d) => d.find(e => e.id === id) || d[0];
  } else if (/^\/stocks\/([^/]+)$/.test(cleanPath)) {
    const t = cleanTicker(cleanPath.match(/^\/stocks\/([^/]+)$/)[1]);
    jsonFile = `data/stock_${t}.json`;
  } else if (/^\/stocks\/([^/]+)\/prices$/.test(cleanPath)) {
    const t = cleanTicker(cleanPath.match(/^\/stocks\/([^/]+)\/prices$/)[1]);
    jsonFile = `data/prices_${t}.json`;
    const limit = parseInt(params.get('limit') || '500', 10);
    const start = params.get('start');
    const end   = params.get('end');
    postProcess = (d) => {
      let arr = d;
      if (start) arr = arr.filter(p => p.date >= start);
      if (end)   arr = arr.filter(p => p.date <= end);
      return arr.slice(-limit);
    };
  } else if (/^\/stocks\/([^/]+)\/indicators$/.test(cleanPath)) {
    const t = cleanTicker(cleanPath.match(/^\/stocks\/([^/]+)\/indicators$/)[1]);
    jsonFile = `data/indicators_${t}.json`;
    const limit = parseInt(params.get('limit') || '100', 10);
    postProcess = (d) => d.slice(-limit);
  } else if (/^\/predictions\/([^/]+)\/latest$/.test(cleanPath)) {
    const t = cleanTicker(cleanPath.match(/^\/predictions\/([^/]+)\/latest$/)[1]);
    jsonFile = `data/pred_latest_${t}.json`;
  } else if (/^\/realtime\/([^/]+)\/predict$/.test(cleanPath)) {
    const t = cleanTicker(cleanPath.match(/^\/realtime\/([^/]+)\/predict$/)[1]);
    jsonFile = `data/pred_latest_${t}.json`;
    postProcess = (preds) => {
      const first = preds[0] || {};
      return {
        ticker: t,
        data_tanggal: first.latest_date || first.prediction_date || '',
        harga_terakhir: first.latest_close || null,
        prediksi_untuk: first.prediction_date || '',
        timestamp: new Date().toISOString(),
        predictions: preds,
      };
    };
  } else if (/^\/(predictions|realtime)\/([^/]+)\/(history|history-by-date)$/.test(cleanPath)) {
    const t = cleanTicker(cleanPath.match(/^\/(?:predictions|realtime)\/([^/]+)\/(?:history|history-by-date)$/)[2]);
    jsonFile = `data/pred_history_${t}.json`;
    const algo  = params.get('algorithm');
    const start = params.get('start');
    const end   = params.get('end');
    const limit = parseInt(params.get('limit') || '200', 10);
    postProcess = (d) => {
      let arr = d;
      if (algo)  arr = arr.filter(p => p.algorithm === algo.toUpperCase());
      if (start) arr = arr.filter(p => p.prediction_date >= start);
      if (end)   arr = arr.filter(p => p.prediction_date <= end);
      return arr.slice(0, limit);
    };
  } else if (/^\/news\/([^/]+)$/.test(cleanPath)) {
    const t = cleanTicker(cleanPath.match(/^\/news\/([^/]+)$/)[1]);
    jsonFile = `data/news_${t}.json`;
  }

  if (!jsonFile) throw new Error('Endpoint tidak tersedia dalam mode offline.');

  const res = await fetch(jsonFile);
  if (!res.ok) throw new Error(`Snapshot data (${jsonFile}) tidak ditemukan.`);
  const raw = await res.json();

  if (!_usingStaticFallback) {
    _usingStaticFallback = true;
    console.info('ℹ️ StockPredict berjalan menggunakan Snapshot Data GitHub (Mode Mandiri)');
  }
  return postProcess(raw);
}

// ── Generic Fetch Wrapper ─────────────────────────────────────
async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  // Timeout 3 detik untuk GET agar fallback cepat jika backend offline
  const timeoutMs = method === 'GET' ? 3500 : 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const config = {
    headers: getAuthHeaders(),
    signal: controller.signal,
    ...options,
  };

  try {
    const res = await fetch(url, config);
    clearTimeout(timer);
    if (!res.ok) {
      // Jika error 5xx atau 404 tunnel saat GET, coba fallback statis
      if (method === 'GET' && res.status >= 500) {
        return await fetchStaticFallback(path);
      }
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    if (method === 'GET') {
      try {
        return await fetchStaticFallback(path);
      } catch (fallbackErr) {
        // Jika fallback juga gagal, tampilkan error asli
      }
    }
    if (e instanceof TypeError || e.name === 'AbortError') {
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

// ── Market News & Sentiment API ────────────────────────────────
const NewsAPI = {
  /**
   * GET /news/{ticker}
   * Ambil berita terkini & skor sentimen pasar untuk emiten
   */
  getNews: (ticker, limit = 6) => apiFetch(`/news/${ticker}?limit=${limit}`),
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
