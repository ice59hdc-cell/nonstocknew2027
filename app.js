(() => {
'use strict';
const D = window.DATA;
const ANOM = 24; // อัตราสำรองเกินนี้ (เดือน) ถือว่าผิดปกติ
const MN = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
const MFULL = ['ตุลาคม', 'พฤศจิกายน', 'ธันวาคม', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน'];
const T = D.targets;
const calYear = (fy, m) => (m <= 3 ? fy - 1 : fy);
const mLabel = (fy, m) => `${MN[m - 1]} ${String(calYear(fy, m) % 100).padStart(2, '0')}`;
const mFull = (fy, m) => `${MFULL[m - 1]} ${calYear(fy, m)}`;

/* ---------- ข้อมูล ---------- */
const Store = window.Store;
let UNITS, IDX, LAST, fyList, defaultFy;
function buildData() {
  UNITS = Store.units().filter(u => u.active);
  const activeIds = new Set(UNITS.map(u => u.id));
  const lateKeys = new Set(Store.late().map(l => l.join('|')));
  IDX = {};          // 'uid|fy' -> [ , rec_m1, rec_m2, ... ]
  LAST = {};         // fy -> เดือนล่าสุดที่มีข้อมูล
  const count = {};
  for (const [fy, m, uid, A, B, C, src] of Store.txns()) {
    if (!activeIds.has(uid)) continue;
    const k = uid + '|' + fy;
    (IDX[k] ||= [])[m] = { fy, m, uid, A: A ?? 0, B: B ?? 0, C, src, late: lateKeys.has([fy, m, uid].join('|')), anom: C != null && C > ANOM };
    LAST[fy] = Math.max(LAST[fy] || 0, m);
    count[fy] = (count[fy] || 0) + 1;
  }
  fyList = Object.keys(count).map(Number).sort((a, b) => b - a);
  defaultFy = fyList.find(fy => count[fy] >= UNITS.length / 2) ?? fyList[0];
}
buildData();

/* ---------- ระดับอัตราสำรอง ---------- */
const BANDS = [
  { key: 'low2', label: 'ต่ำมาก (< 1 เดือน)', short: 'ต่ำมาก', tone: 'bad' },
  { key: 'low1', label: 'ค่อนข้างต่ำ (1–2)', short: 'ค่อนข้างต่ำ', tone: 'warn' },
  { key: 'ok', label: 'เหมาะสม (2–3)', short: 'เหมาะสม', tone: 'good' },
  { key: 'hi1', label: 'ค่อนข้างสูง (3–4)', short: 'ค่อนข้างสูง', tone: 'hi' },
  { key: 'hi2', label: 'สูงเกิน (> 4)', short: 'สูงเกิน', tone: 'hi' },
  { key: 'na', label: 'ไม่มีข้อมูล', short: 'ไม่มีข้อมูล', tone: 'none' },
];
function bandOf(r) {
  if (r == null) return 5;
  if (r < T.warnLow) return 0;
  if (r < T.greenMin) return 1;
  if (r <= T.greenMax) return 2;
  if (r <= T.warnHigh) return 3;
  return 4;
}

/* ---------- สถานะ ---------- */
const HOT_DEFAULT = 1.5; // สำรองเกินค่านี้ (เดือน) ไฮไลต์สีแดง
const state = { fy: defaultFy, from: 1, to: LAST[defaultFy] || 1, dist: new Set(), aff: '', q: '', excl: true, band: null, metric: 'B', hot: HOT_DEFAULT, onlyHot: false, sort: { key: 'B', dir: -1 } };
try { const h = parseFloat(localStorage.getItem('drugdash-hot')); if (h >= 0) state.hot = h; } catch (_) { /* ไม่มี storage */ }
const isHot = r => r != null && r > state.hot;
let STATS = [];

/* ---------- ตัวช่วย ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf0 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = v => (v == null ? '–' : Math.abs(v) >= 1e6 ? nf2.format(v / 1e6) + ' ล้าน' : nf0.format(v));
const moneyAxis = v => (Math.abs(v) >= 1e6 ? nf1.format(v / 1e6) + ' ล้าน' : Math.abs(v) >= 1e3 ? nf0.format(v / 1e3) + ' พัน' : nf0.format(v));
const pct = v => (v == null ? '–' : nf1.format(v * 100) + '%');
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const affShort = a => (a && a.includes('ส่วนจังหวัด') ? 'อบจ.' : a || '–');
const toneVar = t => ({ bad: '--bad', warn: '--warn', good: '--good', hi: '--hi', none: '--muted' }[t]);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- คำนวณรายหน่วย ---------- */
function computeStats() {
  const { fy, from, to, excl } = state;
  STATS = UNITS.map(u => {
    const byM = IDX[u.id + '|' + fy] || [];
    let nRep = 0, nLate = 0, nVal = 0, A = 0, B = 0, lastM = 0, anomN = 0;
    for (let m = from; m <= to; m++) {
      const r = byM[m];
      if (!r) continue;
      nRep++;
      if (r.late) nLate++;
      if (r.anom) anomN++;
      if (excl && r.anom) continue;
      nVal++; A += r.A; B = r.B; lastM = m;
    }
    const avgA = nVal ? A / nVal : 0;
    const reserve = nVal && avgA > 0 ? B / avgA : null;
    return { u, byM, nExp: to - from + 1, nRep, nLate, nVal, A, avgA, B: nVal ? B : null, reserve, band: bandOf(reserve), lastM, anomN };
  });
}
function filtered(skip) {
  const q = state.q.trim().toLowerCase();
  return STATS.filter(s =>
    (skip === 'district' || !state.dist.size || state.dist.has(s.u.district)) &&
    (!state.aff || s.u.aff === state.aff) &&
    (!q || s.u.name.toLowerCase().includes(q)) &&
    (skip === 'band' || state.band == null || s.band === state.band) &&
    (!state.onlyHot || isHot(s.reserve)));
}
function agg(list) {
  let A = 0, B = 0, pairB = 0, pairA = 0, nRep = 0, nExp = 0, late = 0, withData = 0, anom = 0;
  for (const s of list) {
    nRep += s.nRep; nExp += s.nExp; late += s.nLate; anom += s.anomN;
    if (s.B == null) continue;
    withData++; A += s.A; B += s.B;
    if (s.avgA > 0) { pairB += s.B; pairA += s.avgA; }
  }
  return { A, B, reserve: pairA > 0 ? pairB / pairA : null, nRep, nExp, late, withData, n: list.length, anom, avgA: pairA };
}
function series(list) {
  const lm = LAST[state.fy], out = [];
  for (let m = 1; m <= 12; m++) {
    if (m > lm) { out.push(null); continue; }
    let A = 0, B = 0, n = 0, late = 0;
    for (const s of list) {
      const r = s.byM[m];
      if (!r) continue;
      n++; if (r.late) late++;
      if (state.excl && r.anom) continue;
      A += r.A; B += r.B;
    }
    out.push({ m, A, B, n, late, total: list.length, reserve: A > 0 ? B / A : null });
  }
  return out;
}
function momChange(list) {
  const m2 = state.to, m1 = m2 - 1;
  if (m1 < 1) return null;
  let b1 = 0, b2 = 0, n = 0;
  for (const s of list) {
    const r1 = s.byM[m1], r2 = s.byM[m2];
    if (!r1 || !r2 || (state.excl && (r1.anom || r2.anom))) continue;
    b1 += r1.B; b2 += r2.B; n++;
  }
  return n >= 3 && b1 > 0 ? { pct: (b2 - b1) / b1, n } : null;
}

/* ---------- แสดงผล: KPI ---------- */
function renderKpis(list) {
  const a = agg(list), band = bandOf(a.reserve), rr = a.nExp ? a.nRep / a.nExp : null;
  const mom = momChange(list);
  const risk = { low: list.filter(s => s.band === 0).length, hi: list.filter(s => s.band === 4).length, hot: list.filter(s => isHot(s.reserve)).length };
  const hotAgg = isHot(a.reserve), aggTone = hotAgg ? 'bad' : BANDS[band].tone;
  const rrTone = rr == null ? 'none' : rr >= 0.95 ? 'good' : rr >= 0.8 ? 'warn' : 'bad';
  const rangeLen = state.to - state.from + 1;
  const card = (tone, lbl, val, unit, note) => `<div class="kpi ${tone}"><div class="lbl">${lbl}</div><div class="val">${val}<small>${unit}</small></div><div class="note">${note}</div></div>`;
  $('kpis').innerHTML =
    card('', 'มูลค่าคงคลังล่าสุด (B)', money(a.B), 'บาท',
      mom ? `${mom.pct >= 0 ? '▲' : '▼'} ${nf1.format(Math.abs(mom.pct) * 100)}% จาก${MFULL[state.to - 2]} (${mom.n} หน่วยที่รายงานทั้งสองเดือน)` : `จาก ${a.withData} หน่วยที่มีข้อมูล`) +
    card('', 'มูลค่าเบิกจ่ายรวมในช่วง (A)', money(a.A), 'บาท',
      `เฉลี่ย ${money(a.withData ? a.A / a.withData / rangeLen : 0)} บาท/หน่วย/เดือน`) +
    card(aggTone + (hotAgg ? ' hot' : ''), 'อัตราสำรองยาภาพรวม', a.reserve == null ? '–' : nf2.format(a.reserve), 'เดือน',
      `${hotAgg ? `<span class="pill bad">▲ เกิน ${nf1.format(state.hot)} เดือน</span>` : `<span class="pill ${BANDS[band].tone}">${BANDS[band].short}</span>`} เกณฑ์นโยบาย ${T.greenMin}–${T.greenMax} เดือน`) +
    card(rrTone, 'อัตราการรายงาน', pct(rr), '',
      `${nf0.format(a.nRep)} จาก ${nf0.format(a.nExp)} หน่วย-เดือน · ล่าช้า ${a.late}`) +
    card(risk.hot ? 'bad hot' : 'good', `หน่วยที่สำรองเกิน ${nf1.format(state.hot)} เดือน`, nf0.format(risk.hot), 'แห่ง',
      `${list.length ? pct(risk.hot / list.length) : '–'} ของหน่วยที่แสดง · ต่ำกว่า ${T.warnLow} เดือน ${risk.low}`);
}

/* ---------- แสดงผล: ข้อสังเกต ---------- */
function renderInsights(list) {
  const a = agg(list), items = [];
  if (!list.length) { $('insights').innerHTML = '<li>ไม่พบหน่วยบริการตามตัวกรองที่เลือก</li>'; return; }
  const rr = a.nExp ? a.nRep / a.nExp : 0;
  const miss = list.filter(s => !s.byM[state.to]);
  items.push([rr >= 0.95 ? 'good' : rr >= 0.8 ? 'warn' : 'bad',
    `รายงานแล้ว <b>${pct(rr)}</b> ของช่วงที่เลือก · ${mFull(state.fy, state.to)} ยังไม่รายงาน <b>${miss.length}</b> จาก ${list.length} หน่วย` +
    (miss.length && miss.length <= 5 ? ` (${miss.map(s => esc(s.u.name)).join(', ')})` : '')]);
  const b = bandOf(a.reserve);
  const hots = list.filter(s => isHot(s.reserve)).sort((x, y) => y.reserve - x.reserve);
  if (hots.length) items.push(['bad', `<b>${hots.length}</b> จาก ${list.length} หน่วย (${pct(hots.length / list.length)}) มีสำรองเกิน <b>${nf1.format(state.hot)} เดือน</b> สูงสุด ${hots.slice(0, 3).map(s => `${esc(s.u.name)} (${nf2.format(s.reserve)})`).join(', ')}`]);
  const lows = list.filter(s => s.band === 0).sort((x, y) => x.reserve - y.reserve);
  const his = list.filter(s => s.band === 4).sort((x, y) => y.reserve - x.reserve);
  items.push([BANDS[b].tone === 'good' ? 'good' : BANDS[b].tone === 'bad' ? 'bad' : BANDS[b].tone === 'warn' ? 'warn' : 'hi',
    `อัตราสำรองภาพรวม <b>${a.reserve == null ? '–' : nf2.format(a.reserve)} เดือน</b> (${BANDS[b].short}) เทียบเกณฑ์ ${T.greenMin}–${T.greenMax} เดือน`]);
  if (lows.length) items.push(['bad', `<b>${lows.length}</b> หน่วยมียาเหลือไม่ถึง ${T.warnLow} เดือน เสี่ยงขาดแคลน เช่น ${lows.slice(0, 3).map(s => `${esc(s.u.name)} (${nf2.format(s.reserve)})`).join(', ')}`]);
  if (his.length) items.push(['hi', `<b>${his.length}</b> หน่วยมียาเหลือเกิน ${T.warnHigh} เดือน เสี่ยงยาค้าง/หมดอายุ เช่น ${his.slice(0, 3).map(s => `${esc(s.u.name)} (${nf2.format(s.reserve)})`).join(', ')}`]);
  const byD = groupBy(list, s => s.u.district);
  if (byD.length > 1 && a.B > 0) {
    const top = byD.map(([d, l]) => [d, agg(l).B]).sort((x, y) => y[1] - x[1])[0];
    items.push(['', `อำเภอ${esc(top[0])} มีคงคลังสูงสุด ${money(top[1])} บาท คิดเป็น <b>${pct(top[1] / a.B)}</b> ของยอดรวม`]);
  }
  if (a.anom) items.push(['warn', `พบ <b>${a.anom}</b> รายการที่อัตราสำรองเกิน ${ANOM} เดือน ${state.excl ? 'ถูกตัดออกจากการคำนวณแล้ว' : 'กำลังรวมอยู่ในการคำนวณ'} ควรตรวจสอบยอดเบิกจ่าย`]);
  $('insights').innerHTML = items.map(([t, h]) => `<li class="${t}">${h}</li>`).join('');
}
function groupBy(list, fn) {
  const m = new Map();
  for (const s of list) { const k = fn(s); (m.get(k) || m.set(k, []).get(k)).push(s); }
  return [...m.entries()];
}

/* ---------- แผนภูมิ ---------- */
const charts = {};
const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(c, _a, o) {
    if (!o || !o.fmt) return;
    const { ctx } = c, meta = c.getDatasetMeta(0);
    ctx.save(); ctx.fillStyle = cssVar('--ink'); ctx.font = `12px ${Chart.defaults.font.family}`; ctx.textBaseline = 'middle';
    meta.data.forEach((bar, i) => {
      const v = c.data.datasets[0].data[i];
      if (v == null) return;
      ctx.fillText(o.fmt(v, i), bar.x + 6, bar.y);
    });
    ctx.restore();
  },
};
function mk(id, cfg) {
  charts[id]?.destroy();
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: reduceMotion ? false : { duration: 250 } }, cfg.options);
  charts[id] = new Chart($(id), cfg);
  return charts[id];
}
function baseScales(fmtY) {
  const grid = cssVar('--grid'), tick = cssVar('--muted');
  return {
    x: { grid: { display: false }, ticks: { color: tick } },
    y: { beginAtZero: true, grid: { color: grid }, ticks: { color: tick, callback: fmtY || (v => v) } },
  };
}
const inRange = m => m >= state.from && m <= state.to;
const monthLabels = () => MN.map((n, i) => mLabel(state.fy, i + 1));

function renderTrend(list) {
  const s = series(list), cA = cssVar('--c-a'), cB = cssVar('--c-b');
  const shade = (hex, i) => (inRange(i + 1) ? hex : alpha(hex, 0.3));
  mk('cTrend', {
    type: 'bar',
    data: {
      labels: monthLabels(),
      datasets: [
        { label: 'คงคลัง (B)', data: s.map(x => x && x.B), backgroundColor: s.map((_, i) => shade(cB, i)), borderRadius: 3 },
        { label: 'เบิกจ่าย (A)', data: s.map(x => x && x.A), backgroundColor: s.map((_, i) => shade(cA, i)), borderRadius: 3 },
      ],
    },
    options: {
      scales: baseScales(moneyAxis),
      plugins: {
        legend: { labels: { color: cssVar('--ink'), usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${nf0.format(c.parsed.y)} บาท`, afterBody: i => { const x = s[i[0].dataIndex]; return x ? `รายงาน ${x.n}/${x.total} หน่วย` : ''; } } },
      },
      onClick: (_e, els) => { if (els.length) { const m = els[0].index + 1; if (LAST[state.fy] >= m) { state.from = m; state.to = m; syncControls(); render(); } } },
    },
  });
}
function renderReserve(list) {
  const s = series(list), g = cssVar('--good'), br = cssVar('--c-b'), red = cssVar('--bad');
  const dot = (x, i) => { const c = x && isHot(x.reserve) ? red : br; return inRange(i + 1) ? c : alpha(c, 0.4); };
  mk('cReserve', {
    type: 'line',
    data: {
      labels: monthLabels(),
      datasets: [
        { label: 'อัตราสำรอง', data: s.map(x => x && x.reserve), borderColor: br, backgroundColor: br, borderWidth: 2.5, tension: 0.25, spanGaps: false,
          pointRadius: s.map((_, i) => (inRange(i + 1) ? 5 : 3)), pointBackgroundColor: s.map(dot), pointBorderColor: s.map(dot), order: 0 },
        { label: '_min', data: s.map(() => T.greenMin), borderWidth: 0, pointRadius: 0, order: 2 },
        { label: `เกณฑ์เหมาะสม ${T.greenMin}–${T.greenMax} เดือน`, data: s.map(() => T.greenMax), borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: alpha(g, 0.2), order: 2 },
        { label: `ไฮไลต์แดง: เกิน ${nf1.format(state.hot)} เดือน`, data: s.map(() => state.hot), borderColor: red, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, order: 1 },
      ],
    },
    options: {
      scales: baseScales(v => nf1.format(v)),
      plugins: {
        legend: { labels: { color: cssVar('--ink'), usePointStyle: true, boxWidth: 8, filter: it => !it.text.startsWith('_'), generateLabels: ch => Chart.defaults.plugins.legend.labels.generateLabels(ch).map(l => (l.datasetIndex === 0 ? { ...l, fillStyle: br, strokeStyle: br } : l)) } },
        tooltip: { filter: it => it.datasetIndex === 0, callbacks: { label: c => `สำรอง ${nf2.format(c.parsed.y)} เดือน` } },
      },
    },
  });
}
function renderReport(list) {
  const s = series(list), good = cssVar('--good'), warn = cssVar('--warn'), none = cssVar('--line');
  mk('cReport', {
    type: 'bar',
    data: {
      labels: monthLabels(),
      datasets: [
        { label: 'รายงานแล้ว', data: s.map(x => x && x.n - x.late), backgroundColor: good, stack: 's' },
        { label: 'ล่าช้า', data: s.map(x => x && x.late), backgroundColor: warn, stack: 's' },
        { label: 'ยังไม่รายงาน', data: s.map(x => x && x.total - x.n), backgroundColor: none, stack: 's' },
      ],
    },
    options: {
      scales: { x: { ...baseScales().x, stacked: true }, y: { ...baseScales().y, stacked: true } },
      plugins: { legend: { labels: { color: cssVar('--ink'), usePointStyle: true, boxWidth: 8 } } },
    },
  });
}
function renderBand() {
  const list = filtered('band'), counts = BANDS.map((_, i) => list.filter(s => s.band === i).length);
  const sel = state.band;
  mk('cBand', {
    type: 'bar',
    data: {
      labels: BANDS.map(b => b.label),
      datasets: [{ data: counts, borderRadius: 3, backgroundColor: BANDS.map((b, i) => { const c = cssVar(toneVar(b.tone)); return sel == null || sel === i ? c : alpha(c, 0.3); }) }],
    },
    options: {
      indexAxis: 'y',
      layout: { padding: { right: 32 } },
      scales: { x: { ...baseScales().y, display: false }, y: { grid: { display: false }, ticks: { color: cssVar('--ink') } } },
      plugins: { legend: { display: false }, valueLabels: { fmt: v => nf0.format(v) }, tooltip: { callbacks: { label: c => `${c.parsed.x} หน่วย` } } },
      onClick: (_e, els) => { if (els.length) { const i = els[0].index; state.band = state.band === i ? null : i; render(); } },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
    },
    plugins: [valueLabels],
  });
}
const METRICS = {
  B: { label: 'คงคลัง', get: a => a.B, fmt: v => money(v) + ' บาท' },
  A: { label: 'เบิกจ่าย', get: a => a.A, fmt: v => money(v) + ' บาท' },
  R: { label: 'อัตราสำรอง', get: a => a.reserve, fmt: v => nf2.format(v) + ' เดือน' },
  P: { label: 'อัตรารายงาน', get: a => (a.nExp ? a.nRep / a.nExp : null), fmt: v => pct(v) },
};
function renderDist() {
  const m = METRICS[state.metric];
  const rows = groupBy(filtered('district'), s => s.u.district).map(([d, l]) => ({ d, v: m.get(agg(l)) })).filter(r => r.v != null).sort((x, y) => y.v - x.v);
  const sel = state.dist, brand = cssVar('--brand');
  const colorFor = r => {
    const c = state.metric === 'R' ? (isHot(r.v) ? cssVar('--bad') : cssVar('--good')) : brand;
    return !sel.size || sel.has(r.d) ? c : alpha(c, 0.3);
  };
  const c = mk('cDist', {
    type: 'bar',
    data: { labels: rows.map(r => r.d), datasets: [{ data: rows.map(r => r.v), backgroundColor: rows.map(colorFor), borderRadius: 3 }] },
    options: {
      indexAxis: 'y',
      layout: { padding: { right: state.metric === 'R' || state.metric === 'P' ? 56 : 84 } },
      scales: { x: { ...baseScales().y, display: false }, y: { grid: { display: false }, ticks: { color: cssVar('--ink'), autoSkip: false } } },
      plugins: { legend: { display: false }, valueLabels: { fmt: v => (state.metric === 'R' ? nf2.format(v) : state.metric === 'P' ? pct(v) : money(v)) }, tooltip: { callbacks: { label: x => m.fmt(x.parsed.x) } } },
      onClick: (_e, els) => { if (els.length) { const d = rows[els[0].index].d; state.dist.has(d) ? state.dist.delete(d) : state.dist.add(d); syncControls(); render(); } },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
    },
    plugins: [valueLabels],
  });
  c.canvas.setAttribute('aria-label', `กราฟแท่งเปรียบเทียบ${m.label}รายอำเภอ: ` + rows.map(r => `${r.d} ${m.fmt(r.v)}`).join(', '));
}

/* ---------- ตาราง ---------- */
const COLS = [
  { key: 'name', label: 'หน่วยบริการ', get: s => s.u.name },
  { key: 'district', label: 'อำเภอ', get: s => s.u.district },
  { key: 'aff', label: 'สังกัด', get: s => affShort(s.u.aff) },
  { key: 'A', label: 'เบิกจ่าย (A)', num: true, get: s => s.A },
  { key: 'B', label: 'คงคลัง (B)', num: true, get: s => s.B },
  { key: 'reserve', label: 'สำรอง (เดือน)', num: true, get: s => s.reserve },
  { key: 'rep', label: 'รายงาน', num: true, get: s => s.nRep / s.nExp },
  { key: 'trend', label: 'คงคลังรายเดือน' },
];
function spark(byM) {
  const W = 96, H = 22, pts = [];
  let max = 0;
  for (let m = 1; m <= 12; m++) if (byM[m] && !(state.excl && byM[m].anom)) max = Math.max(max, byM[m].B);
  if (!max) return '';
  let d = '', pen = false;
  for (let m = 1; m <= 12; m++) {
    const r = byM[m];
    if (!r || (state.excl && r.anom)) { pen = false; continue; }
    const x = ((m - 1) / 11) * (W - 4) + 2, y = H - 2 - (r.B / max) * (H - 4);
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; pen = true; pts.push([x, y]);
  }
  const dots = pts.length === 1 ? `<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="2" fill="var(--brand)"/>` : '';
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--brand)" stroke-width="1.6"/>${dots}</svg>`;
}
function renderTable(list) {
  const { key, dir } = state.sort, col = COLS.find(c => c.key === key) || COLS[4];
  const rows = [...list].sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y, 'th') : x - y) * dir;
  });
  $('tbl').querySelector('thead').innerHTML = '<tr>' + COLS.map(c =>
    `<th scope="col" class="${c.num ? 'num' : ''}"${key === c.key ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c.key === 'trend' ? c.label : `<button type="button" data-sort="${c.key}">${c.label}</button>`}</th>`).join('') + '</tr>';
  $('tbl').querySelector('tbody').innerHTML = rows.length ? rows.map(s => {
    const b = BANDS[s.band];
    const hot = isHot(s.reserve);
    return `<tr class="clickable${hot ? ' hot' : ''}" data-uid="${esc(s.u.id)}">
      <td><button type="button">${esc(s.u.name)}</button>${s.anomN ? `<span class="anom" title="มีรายการอัตราสำรองเกิน ${ANOM} เดือน">⚠ ผิดปกติ ${s.anomN}</span>` : ''}</td>
      <td>${esc(s.u.district)}</td><td>${esc(affShort(s.u.aff))}</td>
      <td class="num">${s.B == null ? '–' : nf0.format(s.A)}</td><td class="num">${s.B == null ? '–' : nf0.format(s.B)}</td>
      <td class="num ${hot ? 'hot-val' : ''}">${s.reserve == null ? '–' : nf2.format(s.reserve)} ${hot ? `<span class="pill bad">▲ เกิน ${nf1.format(state.hot)}</span>` : `<span class="pill ${b.tone}">${b.short}</span>`}</td>
      <td class="num">${s.nRep}/${s.nExp}${s.nLate ? ` <span class="pill warn">ล่าช้า ${s.nLate}</span>` : ''}</td>
      <td>${spark(s.byM)}</td></tr>`;
  }).join('') : '<tr class="empty"><td colspan="8">ไม่พบหน่วยบริการตามตัวกรอง</td></tr>';
  $('tblSub').textContent = `${rows.length} จาก ${UNITS.length} หน่วย · ${mFull(state.fy, state.from)}${state.from !== state.to ? ' – ' + mFull(state.fy, state.to) : ''} · คลิกชื่อหน่วยเพื่อดูรายละเอียด`;
  return rows;
}

/* ---------- รายละเอียดหน่วย ---------- */
const dlg = $('drawer');
function openUnit(uid) {
  const s = STATS.find(x => x.u.id === uid);
  if (!s) return;
  const lm = LAST[state.fy], recs = [];
  for (let m = 1; m <= lm; m++) recs.push(s.byM[m] || null);
  $('drTitle').textContent = s.u.name;
  $('drSub').textContent = `อำเภอ${s.u.district} · ${s.u.aff} · ปีงบประมาณ ${state.fy}`;
  const b = BANDS[s.band];
  $('drKpis').innerHTML = `<div>คงคลังล่าสุด<b>${s.B == null ? '–' : nf0.format(s.B)}</b></div><div>เบิกจ่ายรวมในช่วง<b>${s.B == null ? '–' : nf0.format(s.A)}</b></div><div>อัตราสำรอง<b>${s.reserve == null ? '–' : nf2.format(s.reserve)}</b><span class="pill ${isHot(s.reserve) ? 'bad' : b.tone}">${isHot(s.reserve) ? '▲ เกิน ' + nf1.format(state.hot) : b.short}</span></div>`;
  $('drTbl').querySelector('tbody').innerHTML = recs.map((r, i) => {
    const m = i + 1, bd = r ? BANDS[bandOf(r.C)] : null, hot = r && isHot(r.C);
    return r ? `<tr${hot ? ' class="hot"' : ''}><td>${mLabel(state.fy, m)}</td><td class="num">${nf0.format(r.A)}</td><td class="num">${nf0.format(r.B)}</td><td class="num ${hot ? 'hot-val' : ''}">${r.C == null ? '–' : nf2.format(r.C)} ${hot ? `<span class="pill bad">▲ เกิน ${nf1.format(state.hot)}</span>` : `<span class="pill ${bd.tone}">${bd.short}</span>`}</td><td>${r.late ? 'ล่าช้า' : 'รายงานแล้ว'}${r.anom ? ' · ผิดปกติ' : ''}</td></tr>`
      : `<tr><td>${mLabel(state.fy, m)}</td><td class="num">–</td><td class="num">–</td><td class="num">–</td><td>ยังไม่รายงาน</td></tr>`;
  }).join('');
  dlg.showModal();
  const cA = cssVar('--c-a'), cB = cssVar('--c-b');
  mk('cUnit', {
    type: 'bar',
    data: {
      labels: recs.map((_, i) => mLabel(state.fy, i + 1)),
      datasets: [
        { type: 'line', label: 'คงคลัง (B)', data: recs.map(r => r && r.B), borderColor: cB, backgroundColor: cB, tension: 0.25, borderWidth: 2.5, order: 0 },
        { label: 'เบิกจ่าย (A)', data: recs.map(r => r && r.A), backgroundColor: cA, borderRadius: 3, order: 1 },
      ],
    },
    options: { scales: baseScales(moneyAxis), plugins: { legend: { labels: { color: cssVar('--ink'), usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${nf0.format(c.parsed.y)} บาท` } } } },
  });
}
dlg.addEventListener('close', () => { charts.cUnit?.destroy(); delete charts.cUnit; });
dlg.addEventListener('click', e => {
  const r = dlg.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
});
$('drClose').addEventListener('click', () => dlg.close());

/* ---------- ตัวกรอง ---------- */
function opt(v, t, sel) { return `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t)}</option>`; }
const paintAnomCount = () => { $('anomCount').textContent = `(${Store.txns().filter(t => t[5] != null && t[5] > ANOM && UNITS.some(u => u.id === t[2])).length} รายการ)`; };
function buildControls() {
  $('fFy').innerHTML = fyList.map(fy => opt(fy, 'พ.ศ. ' + fy, fy === state.fy)).join('');
  const dists = [...new Set(UNITS.map(u => u.district))].sort((a, b) => a.localeCompare(b, 'th'));
  $('fDist').innerHTML = opt('', 'ทุกอำเภอ') + dists.map(d => opt(d, d)).join('');
  const affs = [...new Set(UNITS.map(u => u.aff))].sort();
  $('fAff').innerHTML = opt('', 'ทุกสังกัด') + affs.map(a => opt(a, a)).join('');
  paintAnomCount();
  $('distMetric').innerHTML = Object.entries(METRICS).map(([k, v]) => `<button type="button" data-metric="${k}" aria-pressed="${k === state.metric}">${v.label}</button>`).join('');
  syncControls();
}
function syncControls() {
  const lm = LAST[state.fy];
  const months = f => Array.from({ length: lm }, (_, i) => opt(i + 1, mFull(state.fy, i + 1), i + 1 === f)).join('');
  $('fFrom').innerHTML = months(state.from);
  $('fTo').innerHTML = months(state.to);
  $('fDist').value = state.dist.size === 1 ? [...state.dist][0] : '';
  $('fAff').value = state.aff;
  $('fFy').value = state.fy;
}
function renderChips() {
  const chips = [...state.dist].map(d => ({ t: 'อำเภอ' + d, rm: () => state.dist.delete(d) }));
  if (state.band != null) chips.push({ t: 'ระดับสำรอง: ' + BANDS[state.band].short, rm: () => (state.band = null) });
  $('chips').innerHTML = chips.map((c, i) => `<span class="chip">${esc(c.t)}<button type="button" data-chip="${i}" aria-label="เอาตัวกรอง ${esc(c.t)} ออก">✕</button></span>`).join('');
  $('chips').onclick = e => { const i = e.target.dataset?.chip; if (i != null) { chips[i].rm(); syncControls(); render(); } };
}

/* ---------- ส่งออก CSV ---------- */
let currentRows = [];
$('csvBtn').addEventListener('click', () => {
  const head = ['รหัสหน่วย', 'หน่วยบริการ', 'อำเภอ', 'สังกัด', 'เบิกจ่าย(A)', 'คงคลัง(B)', 'อัตราสำรอง(เดือน)', 'ระดับ', 'รายงาน(เดือน)', 'เดือนที่ควรรายงาน', 'ล่าช้า', `สำรองเกิน ${state.hot} เดือน`];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.map(q).join(',')].concat(currentRows.map(s => [s.u.id, s.u.name, s.u.district, s.u.aff, s.B == null ? '' : s.A.toFixed(2), s.B == null ? '' : s.B.toFixed(2), s.reserve == null ? '' : s.reserve.toFixed(2), BANDS[s.band].short, s.nRep, s.nExp, s.nLate, isHot(s.reserve) ? 'เกิน' : ''].map(q).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `คลังยา_${state.fy}_${String(state.from).padStart(2, '0')}-${String(state.to).padStart(2, '0')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ---------- วนวาด ---------- */
function render() {
  computeStats();
  const list = filtered();
  renderChips();
  renderKpis(list);
  renderInsights(list);
  renderTrend(list);
  renderReserve(list);
  renderReport(list);
  renderBand();
  renderDist();
  currentRows = renderTable(list);
  paintAnomCount();
}

/* ---------- เหตุการณ์ ---------- */
$('fFy').onchange = e => { state.fy = +e.target.value; state.from = 1; state.to = LAST[state.fy]; syncControls(); render(); };
$('fFrom').onchange = e => { state.from = +e.target.value; if (state.to < state.from) state.to = state.from; syncControls(); render(); };
$('fTo').onchange = e => { state.to = +e.target.value; if (state.from > state.to) state.from = state.to; syncControls(); render(); };
$('fDist').onchange = e => { state.dist = e.target.value ? new Set([e.target.value]) : new Set(); render(); };
$('fAff').onchange = e => { state.aff = e.target.value; render(); };
$('fQ').oninput = e => { state.q = e.target.value; render(); };
$('fHot').value = state.hot;
$('fHot').onchange = e => {
  const v = parseFloat(e.target.value);
  state.hot = v >= 0 ? v : HOT_DEFAULT;
  e.target.value = state.hot;
  try { localStorage.setItem('drugdash-hot', String(state.hot)); } catch (_) { /* ไม่มี storage */ }
  render();
};
$('fOnlyHot').onchange = e => { state.onlyHot = e.target.checked; render(); };
$('fAnom').onchange = e => { state.excl = e.target.checked; render(); };
$('clearBtn').onclick = () => {
  Object.assign(state, { fy: defaultFy, from: 1, to: LAST[defaultFy], dist: new Set(), aff: '', q: '', band: null, excl: true, onlyHot: false });
  $('fQ').value = ''; $('fAnom').checked = true; $('fOnlyHot').checked = false; syncControls(); render();
};
$('distMetric').onclick = e => {
  const k = e.target.dataset?.metric;
  if (!k) return;
  state.metric = k;
  $('distMetric').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.metric === k)));
  renderDist();
};
$('tbl').addEventListener('click', e => {
  const sb = e.target.closest('[data-sort]');
  if (sb) {
    const k = sb.dataset.sort;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'name' || k === 'district' || k === 'aff' ? 1 : -1) };
    currentRows = renderTable(filtered());
    $('tbl').querySelector(`[data-sort="${k}"]`)?.focus();
    return;
  }
  const tr = e.target.closest('tr[data-uid]');
  if (tr) openUnit(tr.dataset.uid);
});

/* ---------- ธีม ---------- */
const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
function paintThemeBtn() {
  $('themeBtn').textContent = isDark() ? 'โหมดสว่าง' : 'โหมดมืด';
  $('themeBtn').setAttribute('aria-pressed', String(isDark()));
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  paintThemeBtn();
  try { localStorage.setItem('drugdash-theme', t); } catch (_) { /* ไม่มี storage */ }
}
$('themeBtn').onclick = () => { setTheme(isDark() ? 'light' : 'dark'); render(); };
try { const saved = localStorage.getItem('drugdash-theme'); if (saved) document.documentElement.dataset.theme = saved; } catch (_) { /* ไม่มี storage */ }
paintThemeBtn();

/* ---------- เริ่มต้น ---------- */
Chart.defaults.font.family = '"Sarabun","Noto Sans Thai","Leelawadee UI","Tahoma",sans-serif';
Chart.defaults.font.size = 12;
$('orgName').textContent = D.org || '';
const paintStamp = () => {
  $('stamp').textContent = (Store.edited() ? 'มีการแก้ไขข้อมูลในเครื่องนี้ · ' : '') + 'ไฟล์ต้นฉบับอัปเดต ' + new Date(D.lastUpdate).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
};
paintStamp();
$('syncAt').textContent = D.lastSync ? new Date(D.lastSync).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '–';
// ข้อสังเกตจากไฟล์เดิม
$('kiList').innerHTML = D.insights.map(i => `<li><b>${esc(i.title)}</b><span class="meta">${esc(i.source)} · ความสำคัญ: ${esc(i.priority)}</span><div>${esc(i.insight)}</div><div class="muted">ข้อเสนอ: ${esc(i.action)}</div></li>`).join('');
buildControls();
render();

/* ---------- เชื่อมกับหน้าบันทึกข้อมูล ---------- */
function refreshData() {
  const oldLast = LAST[state.fy], wasAll = state.to === oldLast && state.from === 1;
  buildData();
  if (!fyList.includes(state.fy)) { state.fy = defaultFy; state.from = 1; state.to = LAST[state.fy] || 1; }
  else {
    if (wasAll) state.to = LAST[state.fy];
    state.to = Math.min(state.to, LAST[state.fy]);
    state.from = Math.min(state.from, state.to);
  }
  if (state.dist.size) state.dist = new Set([...state.dist].filter(d => UNITS.some(u => u.district === d)));
  if (state.aff && !UNITS.some(u => u.aff === state.aff)) state.aff = '';
  paintStamp();
  buildControls();
  render();
}
window.App = { esc, nf0, nf1, nf2, MN, MFULL, mLabel, mFull, calYear, ANOM, T, refreshData, hot: () => state.hot, isHot, onTheme: f => $('themeBtn').addEventListener('click', f) };
})();
