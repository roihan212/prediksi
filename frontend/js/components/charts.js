/**
 * StockPredict — Chart Components
 * Wrapper reusable untuk Chart.js
 */

// ── Chart defaults ────────────────────────────────────────────
Chart.defaults.color = 'hsl(220, 10%, 65%)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.animation.duration = 600;

const CHART_COLORS = {
  primary:  'hsl(217, 91%, 60%)',
  accent:   'hsl(161, 94%, 45%)',
  bull:     'hsl(142, 76%, 52%)',
  bear:     'hsl(0, 84%, 60%)',
  warn:     'hsl(38, 92%, 60%)',
  grid:     'hsl(222, 14%, 18%)',
  text2:    'hsl(220, 10%, 65%)',
};

function gradient(ctx, color, alpha1 = 0.4, alpha2 = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  const c = color.replace('hsl', 'hsla').replace(')', `, ${alpha1})`);
  const c2 = color.replace('hsl', 'hsla').replace(')', `, ${alpha2})`);
  g.addColorStop(0, c);
  g.addColorStop(1, c2);
  return g;
}

const chartRegistry = {};

function destroyChart(key) {
  if (chartRegistry[key]) {
    chartRegistry[key].destroy();
    delete chartRegistry[key];
  }
}

// ── Price Chart (Line / Candlestick-style Line) ───────────────
function createPriceChart(canvasId, labels, closes, volume) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  chartRegistry[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Harga Penutupan',
        data: closes,
        borderColor: CHART_COLORS.primary,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        fill: true,
        backgroundColor: gradient(ctx, CHART_COLORS.primary),
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsl(222, 18%, 10%)',
          borderColor: 'hsl(222, 14%, 24%)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (ctx) => ` Rp ${Number(ctx.raw).toLocaleString('id-ID')}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: CHART_COLORS.grid, drawTicks: false },
          ticks: { maxTicksLimit: 8, maxRotation: 0 },
        },
        y: {
          grid: { color: CHART_COLORS.grid },
          ticks: { callback: (v) => `Rp ${(v / 1000).toFixed(0)}k` },
        },
      },
    },
  });
  return chartRegistry[canvasId];
}

// ── OHLCV Bar Chart ───────────────────────────────────────────
function createVolumeChart(canvasId, labels, volumes, closes, prevCloses) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const colors = closes.map((c, i) =>
    (i === 0 || c >= (prevCloses?.[i] ?? c))
      ? 'hsla(142, 76%, 52%, 0.7)'
      : 'hsla(0, 84%, 60%, 0.7)'
  );

  chartRegistry[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Volume',
        data: volumes,
        backgroundColor: colors,
        borderRadius: 2,
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsl(222, 18%, 10%)',
          borderColor: 'hsl(222, 14%, 24%)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (ctx) => ` Vol: ${Number(ctx.raw).toLocaleString('id-ID')}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: {
          grid: { color: CHART_COLORS.grid },
          ticks: { callback: (v) => `${(v / 1e6).toFixed(0)}M` },
        },
      },
    },
  });
  return chartRegistry[canvasId];
}

// ── RSI Chart ─────────────────────────────────────────────────
function createRSIChart(canvasId, labels, rsiValues) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  chartRegistry[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'RSI(14)',
        data: rsiValues,
        borderColor: CHART_COLORS.warn,
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsl(222, 18%, 10%)',
          borderColor: 'hsl(222, 14%, 24%)',
          borderWidth: 1,
          callbacks: { label: (ctx) => ` RSI: ${Number(ctx.raw).toFixed(2)}` },
        },
        annotation: { display: false },
      },
      scales: {
        x: { grid: { color: CHART_COLORS.grid }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: {
          grid: { color: CHART_COLORS.grid },
          min: 0, max: 100,
          ticks: { callback: (v) => `${v}` },
        },
      },
    },
  });
  return chartRegistry[canvasId];
}

// ── MACD Chart ────────────────────────────────────────────────
function createMACDChart(canvasId, labels, macdLine, signalLine, histogram) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const histColors = histogram.map(v =>
    v >= 0 ? 'hsla(142, 76%, 52%, 0.6)' : 'hsla(0, 84%, 60%, 0.6)'
  );

  chartRegistry[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'MACD',
          data: macdLine,
          borderColor: CHART_COLORS.primary,
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.3,
          order: 1,
        },
        {
          type: 'line',
          label: 'Signal',
          data: signalLine,
          borderColor: CHART_COLORS.warn,
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.3,
          order: 1,
        },
        {
          type: 'bar',
          label: 'Histogram',
          data: histogram,
          backgroundColor: histColors,
          borderRadius: 2,
          order: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: CHART_COLORS.text2, boxWidth: 12 } },
        tooltip: {
          backgroundColor: 'hsl(222, 18%, 10%)',
          borderColor: 'hsl(222, 14%, 24%)',
          borderWidth: 1,
        },
      },
      scales: {
        x: { grid: { color: CHART_COLORS.grid }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: { grid: { color: CHART_COLORS.grid } },
      },
    },
  });
  return chartRegistry[canvasId];
}

// ── Bollinger Bands Chart ─────────────────────────────────────
function createBBChart(canvasId, labels, prices, bbUpper, bbMiddle, bbLower) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  chartRegistry[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'BB Upper',
          data: bbUpper,
          borderColor: 'hsla(217, 91%, 60%, 0.5)',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: '+1',
          backgroundColor: 'hsla(217, 91%, 60%, 0.05)',
          tension: 0.3,
        },
        {
          label: 'BB Middle (SMA20)',
          data: bbMiddle,
          borderColor: 'hsla(217, 91%, 60%, 0.8)',
          borderWidth: 1.5,
          borderDash: [6, 3],
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          label: 'Harga',
          data: prices,
          borderColor: CHART_COLORS.primary,
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          label: 'BB Lower',
          data: bbLower,
          borderColor: 'hsla(217, 91%, 60%, 0.5)',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: CHART_COLORS.text2, boxWidth: 12 } },
        tooltip: {
          backgroundColor: 'hsl(222, 18%, 10%)',
          borderColor: 'hsl(222, 14%, 24%)',
          borderWidth: 1,
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: Rp ${Number(ctx.raw).toLocaleString('id-ID')}` },
        },
      },
      scales: {
        x: { grid: { color: CHART_COLORS.grid }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: { grid: { color: CHART_COLORS.grid }, ticks: { callback: (v) => `Rp ${(v / 1000).toFixed(0)}k` } },
      },
    },
  });
  return chartRegistry[canvasId];
}

// ── Accuracy / Metric Bar Chart ───────────────────────────────
function createMetricBarChart(canvasId, labels, values, colors) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  chartRegistry[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors || [
          'hsla(217, 91%, 60%, 0.7)',
          'hsla(161, 94%, 45%, 0.7)',
          'hsla(38, 92%, 60%, 0.7)',
          'hsla(142, 76%, 52%, 0.7)',
        ],
        borderRadius: 6,
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsl(222, 18%, 10%)',
          borderColor: 'hsl(222, 14%, 24%)',
          borderWidth: 1,
          callbacks: { label: (ctx) => ` ${(ctx.raw * 100).toFixed(1)}%` },
        },
      },
      scales: {
        x: { grid: { color: CHART_COLORS.grid }, min: 0, max: 1, ticks: { callback: (v) => `${(v * 100).toFixed(0)}%` } },
        y: { grid: { display: false } },
      },
    },
  });
  return chartRegistry[canvasId];
}

// ── Confusion Matrix Chart (2x2 grid using bar chart) ─────────
function createConfusionChart(canvasId, [[tn, fp], [fn, tp]]) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  chartRegistry[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['True Negative\n(Benar STAGNAN)', 'False Positive\n(Salah NAIK)', 'False Negative\n(Salah STAGNAN)', 'True Positive\n(Benar NAIK)'],
      datasets: [{
        data: [tn, fp, fn, tp],
        backgroundColor: [
          'hsla(142, 76%, 52%, 0.7)',
          'hsla(0, 84%, 60%, 0.7)',
          'hsla(0, 84%, 60%, 0.7)',
          'hsla(142, 76%, 52%, 0.7)',
        ],
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsl(222, 18%, 10%)',
          borderColor: 'hsl(222, 14%, 24%)',
          borderWidth: 1,
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: CHART_COLORS.grid } },
      },
    },
  });
  return chartRegistry[canvasId];
}

// ── Feature Importance Bar Chart ──────────────────────────────
function createFeatureImportanceChart(canvasId, featureData) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Sort descending
  const sorted = [...featureData].sort((a, b) => b.value - a.value).slice(0, 14);
  const labels = sorted.map(f => f.name);
  const values = sorted.map(f => f.value);
  const max = Math.max(...values);
  const colors = values.map(v => {
    const ratio = v / max;
    return `hsla(217, 91%, ${40 + ratio * 30}%, 0.8)`;
  });

  chartRegistry[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsl(222, 18%, 10%)',
          borderColor: 'hsl(222, 14%, 24%)',
          borderWidth: 1,
          callbacks: { label: (ctx) => ` Importance: ${(ctx.raw * 100).toFixed(2)}%` },
        },
      },
      scales: {
        x: { grid: { color: CHART_COLORS.grid } },
        y: { grid: { display: false }, ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } } },
      },
    },
  });
  return chartRegistry[canvasId];
}

// ── Prediction History Chart (accuracy line) ──────────────────
function createPredictionHistoryChart(canvasId, predictions) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const withActual = predictions
    .filter(p => p.actual_class !== null && p.actual_class !== undefined)
    .slice().reverse();

  let correct = 0;
  const runningAccuracy = withActual.map((p, i) => {
    if (p.predicted_class === p.actual_class) correct++;
    return parseFloat(((correct / (i + 1)) * 100).toFixed(1));
  });

  const labels = withActual.map(p => formatDate(p.prediction_date));

  chartRegistry[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Running Accuracy (%)',
        data: runningAccuracy,
        borderColor: CHART_COLORS.accent,
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        backgroundColor: gradient(ctx, CHART_COLORS.accent, 0.2),
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsl(222, 18%, 10%)',
          borderColor: 'hsl(222, 14%, 24%)',
          borderWidth: 1,
          callbacks: { label: (ctx) => ` Accuracy: ${ctx.raw}%` },
        },
      },
      scales: {
        x: { grid: { color: CHART_COLORS.grid }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: { grid: { color: CHART_COLORS.grid }, min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
      },
    },
  });
  return chartRegistry[canvasId];
}
