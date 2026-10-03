/* Pond sitrep: read-only view of public.get_bundled_dashboard_payload(p_user_id) */

const CONFIG = {
  supabaseUrl: 'https://mkzfdxhzmrnapvrhshte.supabase.co',
  // Publishable keys are meant to be visible in the browser. Never put a secret or service-role key here.
  publishableKey: 'sb_publishable_6ULJADr4CTiymQlKMIz4mg_BZ9C8iCG',
  userId: 455,
  refreshMs: 60_000,
  // The chart only shows logs from this moment on. Set to null to show everything the RPC returns.
  historyStart: '2026-10-02T21:00:00+08:00',
  // Target ranges used for the verdicts and the scale. Adjust to the species and tank you are keeping.
  targets: { tempC: [20, 28], ph: [7.0, 8.5] },
};

const METRICS = {
  tempC: { label: 'Water temperature', unit: '°C', decimals: 1 },
  ph: { label: 'pH', unit: '', decimals: 2 },
  tds: { label: 'Dissolved solids', unit: 'TDS', decimals: 0 },
  lux: { label: 'Light', unit: 'lux', decimals: 0 },
};

const demoMode = new URLSearchParams(location.search).has('demo');
const state = { payload: null, metric: 'tempC', loading: false, timer: null };
const $ = (id) => document.getElementById(id);

/* ---------- helpers ---------- */

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const fmt = (value, decimals = 1) => {
  const n = num(value);
  return n === null ? '—' : new Intl.NumberFormat('en-SG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
};

const SGT = { timeZone: 'Asia/Singapore', hour12: false };
const clock = (d = new Date()) => new Intl.DateTimeFormat('en-SG', { ...SGT, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
const stamp = (iso) => new Intl.DateTimeFormat('en-SG', { ...SGT, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const shortStamp = (iso) => new Intl.DateTimeFormat('en-SG', { ...SGT, day: 'numeric', month: 'short' }).format(new Date(iso));
const axisTime = (iso) => new Intl.DateTimeFormat('en-SG', { ...SGT, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const dayName = (iso, fallback) => (iso ? new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(iso)) : fallback);

const position = (value, [lo, hi]) => `${Math.min(100, Math.max(0, ((value - lo) / (hi - lo)) * 100))}%`;
const rangeState = (value, [lo, hi]) => (value < lo ? 'below' : value > hi ? 'above' : 'within');

/* ---------- data ---------- */

async function loadPayload() {
  if (demoMode) return demoPayload();
  const response = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/get_bundled_dashboard_payload`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.publishableKey,
      Authorization: `Bearer ${CONFIG.publishableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_id: CONFIG.userId }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`RPC ${response.status}: ${(await response.text()) || response.statusText}`);
  return response.json();
}

async function refresh() {
  if (state.loading) return;
  state.loading = true;
  $('refresh').disabled = true;
  $('status').textContent = 'Updating…';
  try {
    state.payload = await loadPayload();
    state.last = Date.now();
    renderAll();
    $('status').textContent = `${demoMode ? 'Demo data, ' : 'Updated '}${clock()} SGT`;
  } catch (error) {
    console.error(error);
    $('status').textContent = state.payload
      ? 'Could not update. Showing the last reading.'
      : 'Could not reach the pond data. Check your connection, then refresh.';
  } finally {
    state.loading = false;
    $('refresh').disabled = false;
  }
}

/* ---------- rendering ---------- */

function renderAll() {
  const p = state.payload || {};
  $('demo-banner').classList.toggle('hidden', !demoMode);
  renderHero(p);
  renderReadings(p);
  renderChart();
  renderOutside(p);
  renderOutlook(p);
}

function renderHero(p) {
  const water = num(p.raw_sensor?.temp);
  const air = num(p.nea_telemetry?.air_temp?.value);
  const [lo, hi] = CONFIG.targets.tempC;

  $('temp-value').textContent = fmt(water, 1);

  const verdict = $('temp-verdict');
  verdict.classList.remove('text-alert-soft');
  if (water === null) {
    verdict.textContent = 'No water temperature in the latest reading.';
  } else {
    const where = rangeState(water, [lo, hi]);
    const parts = [];
    if (where === 'within') parts.push(`Inside the ${lo}–${hi} °C target range.`);
    else {
      parts.push(`${fmt(where === 'below' ? lo - water : water - hi, 1)} °C ${where} the ${lo}–${hi} °C target range.`);
      verdict.classList.add('text-alert-soft');
    }
    if (air !== null) {
      const d = water - air;
      parts.push(Math.abs(d) < 0.05 ? 'Same as the air outside.' : `${fmt(Math.abs(d), 1)} °C ${d < 0 ? 'cooler' : 'warmer'} than the air outside.`);
    }
    verdict.textContent = parts.join(' ');
  }

  // scale: pond and air markers over the target band
  const known = [water, air, lo, hi].filter((v) => v !== null);
  const domain = [Math.floor(Math.min(...known) - 3), Math.ceil(Math.max(...known) + 3)];
  const band = $('scale-band');
  band.style.left = position(lo, domain);
  band.style.width = `${parseFloat(position(hi, domain)) - parseFloat(position(lo, domain))}%`;
  $('scale-water').style.visibility = water === null ? 'hidden' : 'visible';
  $('scale-air').style.visibility = air === null ? 'hidden' : 'visible';
  if (water !== null) { $('scale-water').style.left = position(water, domain); $('scale-water-val').textContent = `${fmt(water, 1)}°`; }
  if (air !== null) { $('scale-air').style.left = position(air, domain); $('scale-air-val').textContent = `${fmt(air, 1)}°`; }
  $('scale-caption').textContent = `The shaded band is the ${lo}–${hi} °C target range.`;
}

function renderReadings(p) {
  const s = p.raw_sensor || {};
  const h = (p.telemetry_history || []).filter(Boolean).at(-1) || {};
  $('ph-value').textContent = fmt(s.pH, 2);
  $('tds-value').textContent = fmt(s.TDS, 0);
  $('lux-value').textContent = fmt(s.LUX, 0);

  const ph = num(s.pH);
  const [plo, phi] = CONFIG.targets.ph;
  const phNote = $('ph-note');
  phNote.classList.toggle('text-alert-soft', ph !== null && rangeState(ph, [plo, phi]) !== 'within');
  phNote.classList.toggle('text-foam-dim', !(ph !== null && rangeState(ph, [plo, phi]) !== 'within'));
  phNote.textContent = ph === null ? '' : rangeState(ph, [plo, phi]) === 'within' ? `Inside ${plo}–${phi}` : `${rangeState(ph, [plo, phi]) === 'below' ? 'Below' : 'Above'} the ${plo}–${phi} range`;

  const change = (now, before, decimals, unit = '') => {
    const a = num(now), b = num(before);
    if (a === null || b === null) return '';
    const d = a - b;
    if (Math.abs(d) < Math.pow(10, -decimals) / 2) return 'No change since the last log';
    return `${d > 0 ? 'Up' : 'Down'} ${fmt(Math.abs(d), decimals)}${unit} since the last log`;
  };
  $('tds-note').textContent = change(s.TDS, h.tds, 0);
  $('lux-note').textContent = change(s.LUX, h.lux, 0);
}

function renderOutside(p) {
  const t = p.nea_telemetry || {};
  const f = p.nea_forecasts || {};
  const air = num(t.air_temp?.value), rain = num(t.rainfall?.value), wind = num(t.wind_speed?.value);
  const uv = num(f.uv_index?.data?.uv ?? f.uv_index?.data?.value);
  $('air-temp').textContent = air === null ? '—' : `${fmt(air, 1)} °C`;
  $('rainfall').textContent = rain === null ? '—' : `${fmt(rain, 1)} mm`;
  $('wind').textContent = wind === null ? '—' : `${fmt(wind, 1)} km/h`;
  $('uv').textContent = uv === null ? '—' : fmt(uv, 0);
  $('forecast-2h').textContent = f.forecast_2hr?.forecast ? `Next two hours: ${f.forecast_2hr.forecast.toLowerCase()}.` : 'No two-hour forecast available.';
}

function renderOutlook(p) {
  const f = p.nea_forecasts || {};
  const list = Array.isArray(f.outlook_4day) ? f.outlook_4day : [];
  const g = f.forecast_24hr?.general || {};
  const lo = num(g.temperature?.low), hi = num(g.temperature?.high);
  $('forecast-24h').textContent = g.forecast?.text ? `Today: ${g.forecast.text}${lo !== null && hi !== null ? `, ${lo}–${hi} °C` : ''}.` : '';

  if (!list.length) {
    $('outlook-list').innerHTML = '<p class="py-6 text-reed">No four-day outlook available right now.</p>';
    return;
  }
  $('outlook-list').innerHTML = list.map((item) => {
    const d = item.data || {};
    const day = d.day || dayName(d.timestamp || item.valid_period?.timestamp, item.slot_id || 'Day');
    const text = d.forecast?.summary || d.forecast?.text || '—';
    const tl = num(d.temperature?.low), th = num(d.temperature?.high);
    const wl = num(d.wind?.speed?.low), wh = num(d.wind?.speed?.high);
    const hl = num(d.relativeHumidity?.low), hh = num(d.relativeHumidity?.high);
    const bits = [
      wl !== null && wh !== null ? `Wind ${esc(d.wind?.direction || '')} ${wl}–${wh} km/h`.replace('  ', ' ') : '',
      hl !== null && hh !== null ? `Humidity ${hl}–${hh}%` : '',
    ].filter(Boolean).join(', ');
    return `
      <div class="grid gap-1 py-5 sm:grid-cols-[11rem_1fr_7rem] sm:gap-8 sm:items-baseline">
        <p class="font-semibold">${esc(day)}</p>
        <div><p>${esc(text)}</p>${bits ? `<p class="mt-1 text-sm text-reed">${bits}</p>` : ''}</div>
        <p class="text-lg font-semibold sm:text-right">${tl !== null && th !== null ? `${tl}–${th} °C` : ''}</p>
      </div>`;
  }).join('');
}

/* ---------- history chart (SVG sized to its container, so text stays crisp) ---------- */

function seriesFor(metric) {
  return (state.payload?.telemetry_history || [])
    .map((row) => ({ time: row?.time, value: num(row?.[metric]) }))
    .filter((r) => r.time && r.value !== null && new Date(r.time).getTime() >= historyStartMs())
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}

function historyStartMs() {
  const t = CONFIG.historyStart ? new Date(CONFIG.historyStart).getTime() : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

function renderChart() {
  const meta = METRICS[state.metric];
  const pts = seriesFor(state.metric);
  const host = $('chart');
  const readout = $('chart-readout');

  if (!pts.length) {
    host.innerHTML = '';
    readout.textContent = CONFIG.historyStart ? `No logs for this measurement since ${stamp(CONFIG.historyStart)}.` : 'No history for this measurement yet.';
    $('history-note').textContent = '';
    return;
  }

  const W = Math.max(280, host.clientWidth), H = Math.min(340, Math.max(220, W * 0.42));
  const m = { t: 14, r: 8, b: 30, l: 46 };
  const vals = pts.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (state.metric === 'tempC') { lo = Math.min(lo, CONFIG.targets.tempC[0]); hi = Math.max(hi, CONFIG.targets.tempC[1]); }
  if (state.metric === 'ph') { lo = Math.min(lo, CONFIG.targets.ph[0]); hi = Math.max(hi, CONFIG.targets.ph[1]); }
  const pad = (hi - lo || 1) * 0.1;
  lo -= pad; hi += pad;

  const t0 = new Date(pts[0].time).getTime(), t1 = new Date(pts.at(-1).time).getTime();
  const x = (p) => m.l + (t1 === t0 ? 0.5 : (new Date(p.time).getTime() - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (v) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const coords = pts.map((p) => ({ ...p, cx: x(p), cy: y(p.value) }));
  const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c.cx.toFixed(1)} ${c.cy.toFixed(1)}`).join('');

  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const target = state.metric === 'tempC' ? CONFIG.targets.tempC : state.metric === 'ph' ? CONFIG.targets.ph : null;
  const axisStamp = t1 - t0 < 3 * 86400_000 ? axisTime : shortStamp;
  const midTime = new Date((t0 + t1) / 2).toISOString();
  const last = coords.at(-1);

  host.innerHTML = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(meta.label)} since the experiment started, from ${esc(fmt(Math.min(...vals), meta.decimals))} to ${esc(fmt(Math.max(...vals), meta.decimals))} ${esc(meta.unit)}">
      ${target ? `<rect x="${m.l}" width="${W - m.l - m.r}" y="${y(target[1])}" height="${y(target[0]) - y(target[1])}" fill="#1d3a32" fill-opacity="0.07"/>` : ''}
      ${ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#c3c9bb"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#566259">${esc(fmt(v, meta.decimals))}</text>`).join('')}
      <path d="${line}" fill="none" stroke="#18221e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line id="cursor" y1="${m.t}" y2="${H - m.b}" stroke="#18221e" stroke-opacity="0.35" visibility="hidden"/>
      <circle id="focus" r="5" fill="#e8a317" stroke="#18221e" stroke-width="1.5" cx="${last.cx}" cy="${last.cy}"/>
      <text x="${m.l}" y="${H - 8}" font-size="12" fill="#566259">${esc(axisStamp(pts[0].time))}</text>
      <text x="${(m.l + W - m.r) / 2}" y="${H - 8}" font-size="12" text-anchor="middle" fill="#566259">${pts.length > 2 ? esc(axisStamp(midTime)) : ''}</text>
      <text x="${W - m.r}" y="${H - 8}" font-size="12" text-anchor="end" fill="#566259">${pts.length > 1 ? esc(axisStamp(pts.at(-1).time)) : ''}</text>
      <rect id="hit" x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent"/>
    </svg>`;

  const show = (c, isLatest) => {
    readout.innerHTML = `<span class="text-3xl font-bold tracking-tight">${esc(fmt(c.value, meta.decimals))}${meta.unit ? ` <span class="text-lg font-semibold text-reed">${esc(meta.unit)}</span>` : ''}</span><br><span class="text-sm text-reed">${isLatest ? 'Latest log, ' : ''}${esc(stamp(c.time))}</span>`;
    const f = $('focus'), cur = $('cursor');
    f.setAttribute('cx', c.cx); f.setAttribute('cy', c.cy);
    cur.setAttribute('x1', c.cx); cur.setAttribute('x2', c.cx);
    cur.setAttribute('visibility', isLatest ? 'hidden' : 'visible');
  };
  show(last, true);

  const hit = $('hit');
  const move = (e) => {
    const box = hit.getBoundingClientRect();
    const px = e.clientX - box.left + m.l;
    show(coords.reduce((a, b) => (Math.abs(b.cx - px) < Math.abs(a.cx - px) ? b : a)), false);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => show(last, true));

  const prev = coords.at(-2);
  const dir = !prev ? '' : last.value > prev.value ? 'higher than' : last.value < prev.value ? 'lower than' : 'the same as';
  const since = CONFIG.historyStart ? `${pts.length} ${pts.length === 1 ? 'log' : 'logs'} since ${stamp(CONFIG.historyStart)}. ` : '';
  $('history-note').textContent = prev
    ? `${since}${meta.label} is ${dir} the log before it. Hover or touch the chart to read earlier values.${target ? ' The shaded band is the target range.' : ''}`
    : `${since}More logs are needed before a trend can be drawn.`;
}

/* ---------- demo data (only used with ?demo=1; shaped like the RPC payload) ---------- */

function demoPayload() {
  const now = Date.now();
  const history = Array.from({ length: 168 }, (_, i) => {
    const t = new Date(now - (167 - i) * 3600_000);
    const hour = (t.getUTCHours() + 8) % 24;
    const day = Math.sin(((hour - 9) / 24) * Math.PI * 2);
    return {
      time: t.toISOString(),
      tempC: +(27.2 + day * 1.3 + Math.sin(i / 20) * 0.4).toFixed(2),
      ph: +(7.6 + Math.sin(i / 28) * 0.25 - day * 0.1).toFixed(2),
      tds: Math.round(284 + Math.sin(i / 16) * 14 + i * 0.15),
      lux: Math.max(0, Math.round(day * 24000 + (day > 0 ? 3000 : 0))),
    };
  });
  const latest = history.at(-1);
  const d = (n) => new Date(now + n * 86400_000).toISOString();
  return {
    raw_sensor: { temp: latest.tempC, pH: latest.ph, TDS: latest.tds + 6, LUX: latest.lux },
    telemetry_history: history,
    nea_telemetry: { air_temp: { value: 30.1 }, rainfall: { value: 0 }, wind_speed: { value: 9.4 } },
    nea_forecasts: {
      forecast_2hr: { forecast: 'Partly Cloudy' },
      uv_index: { data: { uv: 7 } },
      forecast_24hr: { general: { forecast: { text: 'Thundery showers in the afternoon' }, temperature: { low: 25, high: 33 } } },
      outlook_4day: [
        { slot_id: 'day1', data: { timestamp: d(1), forecast: { summary: 'Afternoon thundery showers' }, temperature: { low: 25, high: 33 }, relativeHumidity: { low: 60, high: 95 }, wind: { speed: { low: 10, high: 20 }, direction: 'SW' } } },
        { slot_id: 'day2', data: { timestamp: d(2), forecast: { summary: 'Partly cloudy, brief showers' }, temperature: { low: 25, high: 34 }, relativeHumidity: { low: 55, high: 90 }, wind: { speed: { low: 10, high: 20 }, direction: 'S' } } },
        { slot_id: 'day3', data: { timestamp: d(3), forecast: { summary: 'Fair and warm' }, temperature: { low: 26, high: 34 }, relativeHumidity: { low: 55, high: 90 }, wind: { speed: { low: 5, high: 15 }, direction: 'SE' } } },
        { slot_id: 'day4', data: { timestamp: d(4), forecast: { summary: 'Late afternoon showers' }, temperature: { low: 25, high: 33 }, relativeHumidity: { low: 60, high: 95 }, wind: { speed: { low: 10, high: 20 }, direction: 'SW' } } },
      ],
    },
  };
}

/* ---------- wiring ---------- */

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    state.metric = tab.dataset.metric;
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    renderChart();
  });
});

$('refresh').addEventListener('click', refresh);
let resizeFrame;
new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => state.payload && renderChart()); }).observe($('chart'));
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - (state.last || 0) > CONFIG.refreshMs) refresh(); });

refresh();
if (!demoMode) setInterval(() => { if (!document.hidden) refresh(); }, CONFIG.refreshMs);
