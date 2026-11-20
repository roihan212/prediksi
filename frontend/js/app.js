/**
 * StockPredict — App Router & Core
 * SPA Router, navigation, topbar clock, market status
 */

const PAGES = {
  dashboard:   { render: renderDashboard,   title: 'Dashboard',             breadcrumb: 'Dashboard' },
  prediction:  { render: renderPrediction,  title: 'Prediksi Saham',        breadcrumb: 'Prediksi' },
  stocks:      { render: renderStocks,      title: 'Data Saham',            breadcrumb: 'Saham' },
  backtesting: { render: renderBacktesting, title: 'Backtesting',           breadcrumb: 'Backtesting' },
  technical:   { render: renderTechnical,   title: 'Indikator Teknikal',    breadcrumb: 'Indikator Teknikal' },
  experiments: { render: renderExperiments, title: 'Eksperimen ML',         breadcrumb: 'Eksperimen ML' },
  admin:       { render: renderAdmin,       title: 'Admin Panel',           breadcrumb: 'Admin Panel' },
};

let _currentPage = null;

// ── App Object ────────────────────────────────────────────────
const App = {
  navigate(pageKey) {
    if (!PAGES[pageKey]) return;
    if (_currentPage === pageKey) return;

    _currentPage = pageKey;

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === pageKey);
    });

    // Update breadcrumb
    const bc = document.getElementById('breadcrumb');
    if (bc) bc.textContent = PAGES[pageKey].breadcrumb;

    // Update page title
    document.title = `StockPredict — ${PAGES[pageKey].title}`;

    // Render page
    const container = document.getElementById('page-container');
    if (container) {
      container.innerHTML = '';
      PAGES[pageKey].render(container);
    }

    // Close mobile sidebar
    closeSidebar();
  },
};

// ── Navigation Setup ──────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const page = el.dataset.page;
      if (page) App.navigate(page);
    });
  });

  // Hamburger (mobile)
  const hamburger = document.getElementById('btn-hamburger');
  const overlay   = document.getElementById('sidebar-overlay');
  const sidebar   = document.getElementById('sidebar');

  if (hamburger) hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  });

  if (overlay) overlay.addEventListener('click', closeSidebar);

  // Refresh button
  const btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      if (_currentPage) {
        const container = document.getElementById('page-container');
        container.innerHTML = '';
        PAGES[_currentPage].render(container);
        showToast('Data diperbarui', '', 'info');

        // Spin the icon
        const icon = btnRefresh.querySelector('i');
        if (icon) {
          icon.style.transition = 'transform 600ms ease';
          icon.style.transform  = 'rotate(360deg)';
          setTimeout(() => { icon.style.transform = ''; }, 600);
        }
      }
    });
  }
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('visible');
}

// ── Clock ─────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('topbar-time');
  if (!el) return;

  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleString('id-ID', {
      weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
  tick();
  setInterval(tick, 1000);
}

// ── Market Status ─────────────────────────────────────────────
function updateMarketStatus() {
  const el = document.getElementById('market-status');
  if (!el) return;

  function check() {
    const open = isMarketOpen();
    el.className = `market-status ${open ? 'open' : ''}`;
    el.querySelector('.status-text').textContent = open ? 'Pasar Buka' : 'Pasar Tutup';
  }
  check();
  setInterval(check, 60000);
}

// ── Lucide Icons ──────────────────────────────────────────────
function initIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  setupNavigation();
  startClock();
  updateMarketStatus();

  // Boot to dashboard
  App.navigate('dashboard');
});
