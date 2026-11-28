/*
  The Web UI in #server: lynxdb server's search page, searching the 1,000 events of lynxdb's
  testdata/logs/access.log (webui-data.js) in the page. Its clock stands at 2025-01-15 08:07:00 UTC: a relative
  time range ends there, and the live tail plays the events logged after it. Every control works: the time
  range (a preset, an absolute range, or a drag across the histogram), Run and the live tail, a field's summary
  whose values filter the query, the field list's filter and fold, the histogram's toggle, the table's sort,
  the table, list and raw views, the pages, and an opened event's fields as key and value or as JSON.
  While at least a third of the window is on screen a short tour uses those controls, one action every 2.5 to
  4 s, and starts again from its first picture (design-system/motion.md): it stops on its first picture when
  scrolled away or when the tab is hidden, its pause button holds it, and a visitor who uses a control takes
  over from it. Phones and reduced motion get the first picture and the working controls, with no tour.
*/
import ui from './assets/ui/ui.js';
import { figureLoop } from './loop.js';
import DATA from './webui-data.js';

const OUT = 'cubic-bezier(.2, 0, 0, 1)', INOUT = 'cubic-bezier(.4, 0, .2, 1)';
const NOW = Date.parse('2025-01-15T08:07:00Z');
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const PRESETS = [[5, 'minutes', MIN], [15, 'minutes', MIN], [30, 'minutes', MIN], [1, 'hour', HOUR], [3, 'hours', HOUR], [6, 'hours', HOUR],
  [24, 'hours', HOUR], [7, 'days', DAY]].map(([n, unit, ms]) => ({ ms: n * ms, label: `Last ${n} ${unit}` }));
const FIELDS = ['_time', 'host', 'level', 'method', 'path', 'status', 'user', 'response_time', 'bytes', 'msg'];
const NUM = new Set(['status', 'response_time', 'bytes']);
// the selected fields stand under each event in the list; the rest are available
const SELECTED = ['host', 'level', 'status'], AVAILABLE = ['method', 'path', 'user', 'response_time', 'bytes', 'msg'];
const START = [{ f: 'status', op: '>=', v: 500 }], HOST = { f: 'host', op: '=', v: 'api-02' };
// bar widths for the histogram and tick spacing for its axis
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400].map(s => s * 1e3);
const ROW_H = 26, HEAD_H = 28, PHONE_PAGE = 10, BARS = 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const base = Date.parse(DATA.base), EVENTS = [];
for (let i = 0; i < DATA.events.length; i += 9) {
  const [dt, h, l, m, p, status, u, response_time, bytes] = DATA.events.slice(i, i + 9), t = base + dt;
  const method = DATA.method[m], path = DATA.path[p];
  EVENTS.push({ t, _time: new Date(t).toISOString().replace(/\.?0+Z$/, 'Z'), host: DATA.host[h], level: DATA.level[l], method, path, status,
    user: DATA.user[u], response_time, bytes, msg: `${method} ${path} completed` });
}
const FIRST = EVENTS[0].t;

const reducedQ = matchMedia('(prefers-reduced-motion: reduce)'), phoneQ = matchMedia('(max-width: 639px)');
const moving = () => !reducedQ.matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n.toLocaleString('en');
const iso = t => new Date(t).toISOString();
const day = t => iso(t).slice(0, 10);
const hms = t => iso(t).slice(11, 19);
const hmsms = t => iso(t).slice(11, 23);
const hm = (t, sec = t % MIN) => (sec ? hms(t) : iso(t).slice(11, 16));
const md = t => { const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const stamp = t => `${day(t)} ${hms(t)}`;
const dur = ms => (ms < MIN ? `${ms / 1e3} s` : ms < HOUR ? `${ms / MIN} min` : ms < DAY ? `${ms / HOUR} h` : `${ms / DAY} d`);
// a tail event arrives after a pause that follows the real gap before it, squeezed into 140-340 ms
const gapMs = (a, b) => Math.min(340, Math.max(140, (b - a) / 1e3 * 55));

/* ------------------------------------------------------------ the query */
const condText = c => (NUM.has(c.f) ? `${c.f} ${c.op} ${c.v}` : `${c.f}${c.op}"${c.v}"`);
const test = (c, e) => (c.op === '>=' ? e[c.f] >= c.v : e[c.f] === c.v);
const matches = (conds, e) => conds.every(c => test(c, e));
const queryLines = conds => ['source=web', ...(conds.length ? [`| where ${conds.map(condText).join(' and ')}`] : []), '| fields _time, level, host, status, msg'];
const rangeOf = r => (r.ms ? [NOW - r.ms, NOW] : [r.from, r.to]);
const rangeLabel = r => {
  if (r.ms) return r.label;
  const sec = r.from % MIN || r.to % MIN, a = hm(r.from, sec), b = hm(r.to, sec);
  return day(r.from) === day(r.to - 1) ? `${md(r.from)}, ${a}–${b}` : `${md(r.from)} ${a} – ${md(r.to)} ${b}`;
};
// 2025-01-15 08:02:00 (seconds and milliseconds optional, a T and a Z allowed), now, or now-30m
function parseTime(s) {
  const rel = s.trim().match(/^now(?:\s*-\s*(\d+)\s*([smhdw]))?$/i);
  if (rel) return NOW - (rel[1] ? +rel[1] * { s: 1e3, m: MIN, h: HOUR, d: DAY, w: 7 * DAY }[rel[2].toLowerCase()] : 0);
  const d = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?\s*(?:Z|UTC)?$/i);
  if (!d) return null;
  const [Y, M, D, h = 0, m = 0, sec = 0] = d.slice(1, 7).map(x => +(x ?? 0)), t = Date.UTC(Y, M - 1, D, h, m, sec, +(d[7] ?? '0').padEnd(3, '0'));
  const back = new Date(t);
  return back.getUTCMonth() === M - 1 && back.getUTCDate() === D && h < 24 && m < 60 && sec < 60 ? t : null;
}

const cx = document.querySelector('.cx');
if (cx) init(cx);

function init(cx) {
  const $ = s => cx.querySelector(s);
  const box = cx.closest('[data-ui-pause-host]');
  const el = {
    ln: $('.cx__ln'), code: $('.cx__code'), btn: $('.cx__btn'), label: $('.cx__btn-label'), more: $('.cx__more'), menu: $('.cx__menu'),
    modes: [...cx.querySelectorAll('.cx__mode')], stat: $('.cx__stat'), progress: $('.cx__progress'),
    when: $('.cx__when'), whenLabel: $('.cx__when-label'), picker: $('.cx__picker'), presets: $('.cx__presets'), abs: $('.cx__abs'), err: $('.cx__err'),
    chartBtn: $('.cx__chart-toggle'), chartBody: $('.cx__chartbody'), match: $('.cx__match'), step: $('.cx__step'), reset: $('.cx__reset'),
    plot: $('.cx__plot'), bars: $('.cx__bars'), tip: $('.cx__tip'), axis: $('.cx__axis'),
    work: $('.cx__work'), side: $('.cx__side'), sideBody: $('.cx__sidebody'), sideBtn: $('.cx__side-toggle'), filter: $('.cx__filter input'), pop: $('.cx__pop'),
    logs: $('.cx__logs'), tabs: [...cx.querySelectorAll('.cx__view')], count: $('.cx__count'), pages: $('.cx__pages'), scroll: $('.cx__scroll'),
    table: $('.cx__table'), rows: $('.cx__rows'), list: $('.cx__list'), raw: $('.cx__raw'), empty: $('.cx__empty'), sorts: [...cx.querySelectorAll('.cx__sort')],
  };
  const PANEL = { table: el.rows, list: el.list, raw: el.raw };
  const S = { conds: START, range: PRESETS[1], zoomedFrom: null, hits: [], total: 0, span: null, page: 1, size: 8, view: 'table',
    sort: { key: '_time', dir: -1 }, open: new Set(), detail: 'fields', side: true, chart: true, live: false, tail: 0, filter: '' };
  const eventOf = new WeakMap();
  let uid = 0, popField = null;

  el.presets.insertAdjacentHTML('beforeend', PRESETS.map((p, i) =>
    `<button class="cx__preset" type="button" data-preset="${i}" aria-pressed="false"><svg aria-hidden="true"><use href="#cx-i-check"/></svg>${p.label}</button>`).join(''));
  const presetBtns = [...el.presets.querySelectorAll('.cx__preset')];

  /* ------------------------------------------------------------ the query text */
  const paint = text => esc(text)
    .replace(/\b(source|where|and|fields)\b|(&quot;[^\n]*?(?:&quot;|(?=\n|\u0001|$)))/g, (m, k, s) => (k ? `<span class="t-k">${k}</span>` : `<span class="t-s">${s}</span>`))
    .replace('\u0001', '<span class="cx__caret"></span>');
  const setCode = (lines, caretLine = -1) => {
    el.ln.textContent = lines.map((l, i) => i + 1).join('\n');
    el.code.innerHTML = paint(lines.map((l, i) => (i === caretLine ? l + '\u0001' : l)).join('\n'));
  };

  /* ------------------------------------------------------------ the search */
  const cmp = (a, b) => {
    const k = S.sort.key, x = k === '_time' ? a.t : a[k], y = k === '_time' ? b.t : b[k];
    return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * S.sort.dir || b.t - a.t;
  };
  function search() {
    const [from, to] = rangeOf(S.range), inRange = EVENTS.filter(e => e.t >= from && e.t < to);
    S.total = inRange.length;
    S.hits = inRange.filter(e => matches(S.conds, e)).sort(cmp);
    S.page = 1; S.tail = 0;
    S.open.clear();
    // the histogram covers the part of the range that holds events, in at most 60 bars
    const lo = FIRST > from && FIRST < to ? FIRST : from, step = STEPS.find(s => (to - lo) / s <= BARS) ?? DAY;
    const b0 = Math.floor(lo / step) * step, n = Math.max(1, Math.ceil((to - b0) / step)), bins = Array.from({ length: n }, () => [0, 0]);
    for (const e of inRange) bins[Math.floor((e.t - b0) / step)][matches(S.conds, e) ? 1 : 0]++;
    S.span = { from, to, b0, step, n, bins };
  }
  const tailEvents = () => EVENTS.filter(e => e.t >= NOW && matches(S.conds, e));

  /* ------------------------------------------------------------ the histogram */
  function drawChart(grow) {
    const NS = 'http://www.w3.org/2000/svg', W = 1000, H = 88, { n, bins } = S.span;
    const gap = n > 40 ? 3 : 4, bw = (W - gap * (n - 1)) / n, max = Math.max(1, ...bins.map(b => b[0] + b[1]));
    const rect = (x, y, w, h, cls) => {
      const r = document.createElementNS(NS, 'rect');
      for (const [k, v] of Object.entries({ x, y, width: w, height: h })) r.setAttribute(k, v.toFixed(2));
      if (cls) r.setAttribute('class', cls);
      return r;
    };
    const sel = rect(0, 0, 0, H, 'cx__sel'), baseLine = rect(0, H - 1, W, 1, 'cx__base');
    const gs = bins.map(([other, hit], k) => {
      const g = document.createElementNS(NS, 'g');
      let y = H;
      for (const [c, cls] of [[other, ''], [hit, 'e']]) {
        if (!c) continue;
        const h = Math.max(1, c / max * (H - 2));
        y -= h;
        g.append(rect(k * (bw + gap), y, bw, h, cls));
      }
      return g;
    });
    el.bars.replaceChildren(sel, baseLine, ...gs);
    drawAxis();
    // the bars rise from the baseline left to right, about 0.6 s in all
    if (grow && moving()) gs.forEach((g, k) => g.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
      { duration: 320, delay: k * (300 / n), easing: OUT, fill: 'backwards' }));
  }
  function drawAxis() {
    const { b0, step, n } = S.span, total = step * n, w = el.plot.clientWidth || 1000;
    const tick = STEPS.find(s => total / s <= Math.max(3, Math.floor(w / 96))) ?? DAY, labels = [];
    for (let t = Math.ceil(b0 / tick) * tick; t <= b0 + total; t += tick) {
      const x = (t - b0) / total;
      labels.push(`<span class="${x < .03 ? 'is-first' : x > .97 ? 'is-last' : ''}" style="left:${(x * 100).toFixed(3)}%">${t % DAY ? hm(t, tick % MIN) : md(t)}</span>`);
    }
    el.axis.innerHTML = labels.join('');
  }
  const binAt = x => { const r = el.plot.getBoundingClientRect(); return Math.min(S.span.n - 1, Math.max(0, Math.floor((x - r.left) / r.width * S.span.n))); };
  const binTime = k => [S.span.b0 + k * S.span.step, Math.min(S.span.b0 + (k + 1) * S.span.step, S.span.to)];
  function tipFor(i, j) {
    const [a] = binTime(i), [, b] = binTime(j);
    let hit = 0, other = 0;
    for (let k = i; k <= j; k++) { other += S.span.bins[k][0]; hit += S.span.bins[k][1]; }
    el.tip.innerHTML = `<b>${hms(a)}–${hms(b)}</b>` + (S.conds.length
      ? `<span><i class="e"></i>${fmt(hit)} ${esc(el.match.textContent)}</span><span><i></i>${fmt(other)} other</span>`
      : `<span><i></i>${fmt(hit)} events</span>`) + (drag ? '' : '<span class="cx__hint2">Click or drag to zoom in</span>');
    el.tip.hidden = false;
    const pw = el.plot.clientWidth, tw = el.tip.offsetWidth, mid = ((i + j + 1) / 2) / S.span.n * pw;
    el.tip.style.left = `${Math.min(pw - tw, Math.max(0, mid - tw / 2)).toFixed(1)}px`;
    [...el.bars.querySelectorAll('g')].forEach((g, k) => g.classList.toggle('is-hot', k >= i && k <= j));
  }
  function clearTip() {
    el.tip.hidden = true;
    for (const g of el.bars.querySelectorAll('g.is-hot')) g.classList.remove('is-hot');
  }
  // a drag across the bars (or a click on one) zooms the time range to them; Reset zoom goes back
  let drag = null;
  function drawSel() {
    const s = el.bars.querySelector('.cx__sel');
    if (!drag || !s) { s?.setAttribute('width', '0'); return; }
    const i = Math.min(binAt(drag.x0), binAt(drag.x)), j = Math.max(binAt(drag.x0), binAt(drag.x)), u = 1000 / S.span.n;
    s.setAttribute('x', (i * u).toFixed(2));
    s.setAttribute('width', ((j - i + 1) * u).toFixed(2));
    tipFor(i, j);
  }
  function zoom(i, j) {
    const [from] = binTime(i), [, to] = binTime(j);
    S.zoomedFrom ??= S.range;
    S.range = { from: Math.max(from, S.span.from), to };
    runQuery();
  }
  el.plot.addEventListener('pointermove', e => {
    if (drag) { drag.x = e.clientX; drawSel(); } else if (e.pointerType === 'mouse') tipFor(binAt(e.clientX), binAt(e.clientX));
  });
  el.plot.addEventListener('pointerleave', () => { if (!drag) clearTip(); });
  el.plot.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return;
    e.preventDefault();
    drag = { x0: e.clientX, x: e.clientX };
    el.plot.setPointerCapture(e.pointerId);
    drawSel();
  });
  el.plot.addEventListener('pointerup', e => {
    if (!drag) return;
    const i = Math.min(binAt(drag.x0), binAt(e.clientX)), j = Math.max(binAt(drag.x0), binAt(e.clientX));
    drag = null;
    drawSel();
    clearTip();
    zoom(i, j);
  });
  el.plot.addEventListener('pointercancel', () => { drag = null; drawSel(); clearTip(); });
  el.reset.addEventListener('click', () => {
    if (!S.zoomedFrom) return;
    S.range = S.zoomedFrom;
    S.zoomedFrom = null;
    runQuery();
  });

  /* ------------------------------------------------------------ the field list and a field's summary */
  function renderSide() {
    const q = S.filter.trim().toLowerCase();
    const group = (name, keys, on) => {
      const shown = keys.filter(k => k.includes(q));
      if (!shown.length) return '';
      return `<span class="cx__group"><span>${name}</span><span>${shown.length}</span></span><ul class="cx__fields">${shown.map(k => {
        const n = new Set(S.hits.map(e => e[k])).size;
        return `<li><button class="cx__field${on ? ' is-on' : ''}" type="button" data-field="${k}" aria-haspopup="dialog" aria-expanded="${popField === k}"`
          + ` aria-label="${k}, ${n} value${n === 1 ? '' : 's'}" title="${n} value${n === 1 ? '' : 's'} in the matching events">`
          + `<i aria-hidden="true">${NUM.has(k) ? '#' : 'a'}</i>${k}<span class="n" aria-hidden="true">${fmt(n)}</span></button></li>`;
      }).join('')}</ul>`;
    };
    el.sideBody.innerHTML = group('Selected', SELECTED, true) + group('Available', AVAILABLE, false) || `<p class="cx__none">No field matches “${esc(q)}”</p>`;
  }
  const fieldBtn = k => el.sideBody.querySelector(`[data-field="${k}"]`);
  function renderPop() {
    const k = popField, vals = S.hits.map(e => e[k]), counts = new Map();
    for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1] || (NUM.has(k) ? a[0] - b[0] : String(a[0]).localeCompare(b[0]))).slice(0, 6);
    let html = `<div class="cx__pophead"><b>${k}</b><span>${fmt(counts.size)} value${counts.size === 1 ? '' : 's'}</span></div>`;
    if (!vals.length) html += '<p class="cx__popsub">No events match in this time range</p>';
    else {
      html += `<p class="cx__popsub">${counts.size > top.length ? `Top ${top.length} values` : 'Values'} in ${fmt(vals.length)} event${vals.length === 1 ? '' : 's'}</p>`;
      const list = !NUM.has(k) || counts.size <= 12;
      if (!list) {
        const sum = vals.reduce((a, b) => a + b, 0);
        html += `<dl class="cx__stats">${[['min', Math.min(...vals)], ['avg', Math.round(sum / vals.length)], ['max', Math.max(...vals)]]
          .map(([t, v]) => `<div><dt>${t}</dt><dd>${fmt(v)}</dd></div>`).join('')}</dl>`;
      }
      else {
        html += `<div class="cx__vals">${top.map(([v, c]) => {
          const on = S.conds.some(x => x.f === k && x.op === '=' && x.v === v);
          return `<button class="cx__val" type="button" data-v="${esc(v)}" aria-pressed="${on}" aria-label="${on ? 'Remove the filter' : 'Filter by'} ${k}=${esc(v)}, ${c} events">`
            + `<svg aria-hidden="true"><use href="#cx-i-check"/></svg><span>${esc(v)}</span><span class="bar" aria-hidden="true"><i style="width:${(c / top[0][1] * 100).toFixed(1)}%"></i></span>`
            + `<span class="c">${fmt(c)}</span><span class="p">${Math.round(c / vals.length * 100)}%</span></button>`;
        }).join('')}</div><p class="cx__popfoot">Select a value to filter the query by it</p>`;
      }
    }
    el.pop.innerHTML = html;
    el.pop.setAttribute('aria-label', `Values of ${k}`);
  }
  function openPop(k, focus) {
    closeMenu(); closePicker();
    popField = k;
    renderPop();
    for (const b of el.sideBody.querySelectorAll('.cx__field')) b.setAttribute('aria-expanded', String(b.dataset.field === k));
    el.pop.hidden = false;
    const b = fieldBtn(k), w = el.work.getBoundingClientRect(), top = b.getBoundingClientRect().top - w.top - 10;
    el.pop.style.top = `${Math.max(0, Math.min(top, w.height - el.pop.offsetHeight)).toFixed(1)}px`;
    if (moving()) el.pop.animate([{ opacity: 0, transform: 'translateX(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: OUT });
    if (focus) (el.pop.querySelector('.cx__val') || b).focus();
  }
  function closePop(focusBack) {
    if (el.pop.hidden) return;
    const k = popField;
    popField = null;
    el.pop.hidden = true;
    for (const b of el.sideBody.querySelectorAll('.cx__field')) b.setAttribute('aria-expanded', 'false');
    if (focusBack) fieldBtn(k)?.focus();
  }
  // a value adds field=value to the query in place of any condition on that field; the same value again takes it off
  function filterBy(k, v) {
    const had = S.conds.find(c => c.f === k && c.op === '=' && c.v === v);
    S.conds = had ? S.conds.filter(c => c !== had) : [...S.conds.filter(c => c.f !== k), { f: k, op: '=', v }];
    setCode(queryLines(S.conds));
    closePop(true);
    runQuery();
  }

  /* ------------------------------------------------------------ events: table rows, list items, raw lines */
  const hlKeys = e => new Set(S.conds.filter(c => test(c, e)).map(c => c.f));
  const rawHtml = e => {
    const hl = hlKeys(e);
    return `<span class="ts">${e._time}</span> ` + FIELDS.slice(1).map(k => {
      const v = k === 'msg' ? `"${esc(e[k])}"` : esc(e[k]);
      return `<span class="k">${k}=</span>${hl.has(k) ? `<span class="hl">${v}</span>` : v}`;
    }).join(' ');
  };
  const expBtn = e => `<button class="cx__exp" type="button" aria-expanded="false" aria-label="Fields of the ${hmsms(e.t)} event"><svg aria-hidden="true"><use href="#cx-i-chev"/></svg></button>`;
  const lv = e => (e.level === 'ERROR' ? ' class="lv-e"' : '');
  function itemEl(e) {
    if (S.view === 'raw') {
      const div = document.createElement('div');
      div.className = 'cx__line';
      div.innerHTML = rawHtml(e);
      div.classList.toggle('is-sel', S.open.has(e));
      return div;
    }
    const ev = document.createElement('div');
    ev.className = 'cx__ev';
    ev.innerHTML = S.view === 'table'
      ? `<div class="cx__row cx__item">${expBtn(e)}<span>${hmsms(e.t)}</span><span${lv(e)}>${e.level}</span><span>${e.host}</span><span>${e.status}</span><span>${esc(e.msg)}</span></div>`
      : `<div class="cx__li cx__item">${expBtn(e)}<time datetime="${e._time}"><span>${day(e.t)}</span><span>${hmsms(e.t)}</span></time>`
        + `<div class="cx__evtext">${rawHtml(e)}<div class="cx__chips">${SELECTED.map(k => `<span>${k} = <b${k === 'level' ? lv(e) : ''}>${esc(e[k])}</b></span>`).join('')}</div></div></div>`;
    eventOf.set(ev, e);
    if (S.open.has(e)) openItem(ev, true);
    return ev;
  }
  const json = e => Object.fromEntries(FIELDS.map(k => [k, e[k]]));
  function detailBody(e) {
    if (S.detail === 'fields') return `<dl class="cx__kv">${FIELDS.map(k => `<dt>${k}</dt><dd${k === 'level' ? lv(e) : ''}>${esc(e[k])}</dd>`).join('')}</dl>`;
    const p = s => `<span class="j-p">${s}</span>`;
    return `<pre class="cx__json">${p('{')}\n${FIELDS.map((k, i) => `  "${k}"${p(':')} ${typeof e[k] === 'number' ? `<span class="j-n">${e[k]}</span>` : `<span class="j-s">"${esc(e[k])}"</span>`}${i < FIELDS.length - 1 ? p(',') : ''}`).join('\n')}\n${p('}')}</pre>`;
  }
  function openItem(ev, on) {
    const e = eventOf.get(ev), btn = ev.querySelector('.cx__exp');
    let d = ev.querySelector('.cx__detail');
    if (on && !d) {
      d = document.createElement('div');
      d.className = 'cx__detail';
      d.id = `cx-ev-${++uid}`;
      d.innerHTML = `<div class="cx__dhead"><div class="cx__seg" role="group" aria-label="Show the fields as">`
        + `<button type="button" data-as="fields" aria-pressed="${S.detail === 'fields'}">Fields</button><button type="button" data-as="json" aria-pressed="${S.detail === 'json'}">JSON</button></div>`
        + `<button class="cx__copy" type="button"><svg aria-hidden="true"><use href="#cx-i-copy"/></svg><span>Copy JSON</span></button></div><div class="cx__dbody">${detailBody(e)}</div>`;
      ev.append(d);
      btn.setAttribute('aria-controls', d.id);
    }
    if (d) d.hidden = !on;
    ev.classList.toggle('is-open', on);
    btn.setAttribute('aria-expanded', String(on));
    if (on) S.open.add(e); else S.open.delete(e);
  }
  function setDetail(mode) {
    S.detail = mode;
    for (const ev of el.scroll.querySelectorAll('.cx__ev.is-open')) {
      ev.querySelectorAll('.cx__seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.as === mode)));
      ev.querySelector('.cx__dbody').innerHTML = detailBody(eventOf.get(ev));
    }
  }
  function copyEvent(btn) {
    const label = btn.querySelector('span'), say = text => {
      label.textContent = text;
      setTimeout(() => { label.textContent = 'Copy JSON'; }, 1400);
    };
    const text = JSON.stringify(json(eventOf.get(btn.closest('.cx__ev'))), null, 2);
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => say('Copied'), () => say('Copy failed'));
  }

  /* ------------------------------------------------------------ pages */
  // as many rows as the window holds; a phone shows ten and grows instead
  const fitSize = () => (phoneQ.matches ? PHONE_PAGE : Math.max(5, Math.floor((el.scroll.clientHeight - HEAD_H) / ROW_H)));
  const pageCount = () => Math.max(1, Math.ceil(S.hits.length / S.size));
  // the first and last page, two around the current one, and a gap where pages are left out
  function pageList(cur, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const keep = [...new Set([1, Math.max(2, cur - 1), cur, Math.min(total - 1, cur + 1), total])].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
    return keep.flatMap((p, i) => (i && p - keep[i - 1] > 1 ? ['…', p] : [p]));
  }
  function renderPager() {
    const pages = pageCount(), lo = (S.page - 1) * S.size, shown = Math.min(S.size, S.hits.length - lo);
    el.count.innerHTML = S.hits.length ? `<b>${fmt(lo + 1)}–${fmt(lo + shown)}</b> of ${fmt(S.hits.length)}` : '';
    if (!S.hits.length) { el.pages.replaceChildren(); return; }
    const arrow = (d, name) => `<button class="cx__pg" type="button" data-step="${d}" aria-label="${name} page"${(d < 0 ? S.page <= 1 : S.page >= pages) ? ' disabled' : ''}>`
      + `<svg aria-hidden="true"><use href="#cx-i-${d < 0 ? 'left' : 'chev'}"/></svg></button>`;
    const focused = el.pages.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    el.pages.innerHTML = arrow(-1, 'Previous') + pageList(S.page, pages).map(p => (p === '…'
      ? '<span class="cx__pg cx__pg--gap" aria-hidden="true">…</span>'
      : `<button class="cx__pg" type="button" data-pg="${p}" aria-label="Page ${p}"${p === S.page ? ' aria-current="page"' : ''}>${p}</button>`)).join('') + arrow(1, 'Next');
    if (focused) {
      const b = el.pages.querySelector(`[aria-label="${focused}"]`);
      (b && !b.disabled ? b : el.pages.querySelector('[aria-current]')).focus();
    }
  }
  function renderPage(top = true) {
    S.page = Math.min(Math.max(1, S.page), pageCount());
    const lo = (S.page - 1) * S.size, none = !S.hits.length;
    for (const [v, n] of Object.entries({ table: el.table, list: el.list, raw: el.raw })) n.hidden = v !== S.view || (none && v !== 'table');
    for (const [v, n] of Object.entries(PANEL)) if (v !== S.view) n.replaceChildren();
    PANEL[S.view].replaceChildren(...S.hits.slice(lo, lo + S.size).map(itemEl));
    el.empty.hidden = !none;
    renderPager();
    if (top) el.scroll.scrollTop = 0;
  }
  const pageBtn = n => el.pages.querySelector(`[data-pg="${n}"]`);
  function setPage(p) {
    S.page = p;
    renderPage();
  }
  function renderSort() {
    for (const b of el.sorts) {
      const on = b.dataset.key === S.sort.key;
      b.toggleAttribute('data-dir', on);
      if (on) b.dataset.dir = S.sort.dir < 0 ? 'desc' : 'asc';
      b.setAttribute('aria-label', `Sort by ${b.dataset.key}${on ? `, now ${S.sort.dir < 0 ? 'descending' : 'ascending'}` : ''}`);
      b.querySelector('svg')?.remove();
      if (on) b.insertAdjacentHTML('beforeend', '<svg aria-hidden="true"><use href="#cx-i-sort"/></svg>');
    }
  }
  function sortBy(key) {
    S.sort = key === S.sort.key ? { key, dir: -S.sort.dir } : { key, dir: key === '_time' || NUM.has(key) ? -1 : 1 };
    S.hits.sort(cmp);
    S.page = 1;
    renderSort();
    renderPage();
  }

  /* ------------------------------------------------------------ the whole page of results */
  function render(anim) {
    const [from, to] = rangeOf(S.range);
    el.whenLabel.textContent = rangeLabel(S.range);
    el.when.title = `${stamp(from)} – ${stamp(to)} UTC`;
    el.stat.innerHTML = `<b>${fmt(S.hits.length)}</b> of ${fmt(S.total)} events`;
    el.match.textContent = S.conds.map(condText).join(', ') || 'events';
    cx.classList.toggle('is-all', !S.conds.length);
    el.step.textContent = `${dur(S.span.step)} per bar`;
    el.reset.hidden = !S.zoomedFrom;
    drawChart(anim);
    renderSide();
    if (popField) renderPop();
    S.size = fitSize();
    renderSort();
    renderPage();
    if (anim && moving()) el.scroll.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 120, easing: OUT, fill: 'backwards' });
  }
  async function runQuery(wait = sleep) {
    if (S.live) setLive(false);
    if (moving()) {
      el.progress.animate([{ opacity: 1, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)', offset: .8 }, { opacity: 0, transform: 'scaleX(1)' }],
        { duration: 420, easing: INOUT });
      await wait(300);
    }
    search();
    render(true);
  }
  new ResizeObserver(() => {
    if (S.span) drawAxis();
    const size = fitSize();
    if (size === S.size || !S.hits.length) { S.size = size; return; }
    const first = (S.page - 1) * S.size;
    S.size = size;
    S.page = Math.floor(first / size) + 1;
    renderPage(false);
  }).observe(el.scroll);

  /* ------------------------------------------------------------ the live tail */
  let streamTok = 0;
  function setLive(on) {
    S.live = on;
    cx.classList.toggle('is-live', on);
    el.label.textContent = on ? 'Stop' : 'Run';
    el.modes.forEach(m => m.setAttribute('aria-checked', String((m.dataset.mode === 'tail') === on)));
    if (on) { S.tail = 0; el.stat.innerHTML = '<b>0</b> new events'; } else streamTok++;
  }
  function startTail() {
    S.sort = { key: '_time', dir: -1 };
    search();
    render(false);
    setLive(true);
  }
  // new events go on top of the first page as they arrive, with no motion of their own (LynxDB LogTable)
  function arrive(e) {
    S.hits.unshift(e);
    el.stat.innerHTML = `<b>${++S.tail}</b> new event${S.tail === 1 ? '' : 's'}`;
    if (S.page === 1) renderPage(false); else renderPager();
    renderSide();
  }
  async function stream(wait) {
    const tok = streamTok;
    let last = NOW;
    for (const e of tailEvents()) {
      await wait(gapMs(last, e.t));
      if (tok !== streamTok) return;
      arrive(e);
      last = e.t;
    }
  }

  /* ------------------------------------------------------------ views and panels */
  function setView(v, focus) {
    S.view = v;
    el.tabs.forEach(t => {
      const on = t.getAttribute('aria-controls') === `cx-${v}`;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    renderPage();
  }
  // the panel goes at once and what stays slides into its new place (FLIP), 240 ms
  function slide(node, axis, from) {
    if (from == null) return;
    const r = node.getBoundingClientRect(), d = from - (axis === 'x' ? r.left : r.top);
    if (Math.abs(d) > 1) node.animate([{ transform: `translate${axis.toUpperCase()}(${d}px)` }, { transform: 'none' }], { duration: 240, easing: INOUT });
  }
  function setSide(on, anim) {
    if (S.side === on) return;
    S.side = on;
    closePop();
    const from = anim && moving() ? el.logs.getBoundingClientRect().left : null;
    cx.classList.toggle('is-side-off', !on);
    el.sideBtn.setAttribute('aria-expanded', String(on));
    el.sideBtn.setAttribute('aria-label', on ? 'Hide fields' : 'Show fields');
    slide(el.logs, 'x', from);
    if (on && from != null) el.sideBody.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 80, easing: OUT, fill: 'backwards' });
  }
  function setChart(on, anim) {
    if (S.chart === on) return;
    S.chart = on;
    closePop();
    const from = anim && moving() ? el.work.getBoundingClientRect().top : null;
    cx.classList.toggle('is-chart-off', !on);
    el.chartBtn.setAttribute('aria-expanded', String(on));
    el.chartBtn.setAttribute('aria-label', on ? 'Hide histogram' : 'Show histogram');
    el.chartBtn.querySelector('use').setAttribute('href', on ? '#cx-i-eye' : '#cx-i-eye-off');
    slide(el.work, 'y', from);
    if (on && from != null) el.chartBody.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 80, easing: OUT, fill: 'backwards' });
  }

  /* ------------------------------------------------------------ the run menu and the time range */
  const float = node => { if (moving()) node.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: OUT }); };
  let menuTok = 0;
  function openMenu(focus) {
    closePicker(); closePop();
    menuTok++;
    el.menu.hidden = false;
    el.more.setAttribute('aria-expanded', 'true');
    float(el.menu);
    if (focus) (el.modes.find(m => m.getAttribute('aria-checked') === 'true') || el.modes[0]).focus();
  }
  function closeMenu(focusBack) {
    if (el.menu.hidden) return;
    const tok = ++menuTok, done = () => { if (tok === menuTok) el.menu.hidden = true; };
    el.more.setAttribute('aria-expanded', 'false');
    if (moving()) el.menu.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: OUT }).finished.then(done, done);
    else done();
    if (focusBack) el.more.focus();
  }
  function chooseMode(mode) {
    closeMenu(true);
    if (mode === 'tail') { if (!S.live) { startTail(); stream(sleep); } }
    else runQuery();
  }
  const inputs = [...el.abs.querySelectorAll('input')];
  function openPicker(focus) {
    closeMenu(); closePop();
    const [from, to] = rangeOf(S.range);
    presetBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(PRESETS[i] === S.range)));
    inputs[0].value = stamp(from);
    inputs[1].value = stamp(to);
    showError(null);
    el.picker.hidden = false;
    el.when.setAttribute('aria-expanded', 'true');
    float(el.picker);
    if (focus) (presetBtns.find(b => b.getAttribute('aria-pressed') === 'true') || inputs[0]).focus();
  }
  function closePicker(focusBack) {
    if (el.picker.hidden) return;
    el.picker.hidden = true;
    el.when.setAttribute('aria-expanded', 'false');
    if (focusBack) el.when.focus();
  }
  function showError(msg, input) {
    el.err.textContent = msg || '';
    inputs.forEach(i => (i === input ? i.setAttribute('aria-invalid', 'true') : i.removeAttribute('aria-invalid')));
    input?.focus();
  }
  function setRange(r) {
    S.range = r;
    S.zoomedFrom = null;
    closePicker(true);
    runQuery();
  }
  el.abs.addEventListener('submit', e => {
    e.preventDefault();
    const [a, b] = inputs.map(i => parseTime(i.value));
    if (a == null) return showError('From is not a time. Type one such as 2025-01-15 08:02:00 or now-30m.', inputs[0]);
    if (b == null) return showError('To is not a time. Type one such as 2025-01-15 08:05:00 or now.', inputs[1]);
    if (a >= b) return showError('From has to be earlier than To.', inputs[0]);
    if (a >= NOW) return showError('From is after now, 08:07:00 UTC, and nothing is stored after it yet.', inputs[0]);
    setRange({ from: a, to: Math.min(b, NOW) });
  });
  inputs.forEach(i => i.addEventListener('input', () => showError(null)));

  /* ------------------------------------------------------------ the first picture */
  function first() {
    closeMenu(); closePicker(); closePop();
    hidePointer();
    cx.classList.remove('is-live', 'is-dim');
    S.live = false;
    streamTok++;
    el.label.textContent = 'Run';
    el.modes.forEach(m => m.setAttribute('aria-checked', String(m.dataset.mode === 'run')));
    setSide(true, false);
    setChart(true, false);
    Object.assign(S, { conds: START, range: PRESETS[1], zoomedFrom: null, sort: { key: '_time', dir: -1 }, detail: 'fields', filter: '' });
    el.filter.value = '';
    setCode(queryLines(START));
    search();
    S.view = 'table';
    setView('table');
    render(false);
  }

  /* ------------------------------------------------------------ the controls */
  el.sideBtn.addEventListener('click', () => setSide(!S.side, true));
  el.chartBtn.addEventListener('click', () => setChart(!S.chart, true));
  el.filter.addEventListener('input', () => { S.filter = el.filter.value; closePop(); renderSide(); });
  el.sideBody.addEventListener('click', e => {
    const b = e.target.closest('.cx__field');
    if (b) (popField === b.dataset.field ? closePop() : openPop(b.dataset.field, e.detail === 0));
  });
  el.pop.addEventListener('click', e => {
    const b = e.target.closest('.cx__val');
    if (b) filterBy(popField, NUM.has(popField) ? +b.dataset.v : b.dataset.v);
  });
  el.tabs.forEach(t => t.addEventListener('click', () => setView(t.getAttribute('aria-controls').slice(3))));
  // the arrow keys move between the tabs in the kit's tablist handling (assets/system.js); the events follow its choice
  $('.cx__views').addEventListener('keydown', () => {
    const v = el.tabs.find(t => t.getAttribute('aria-selected') === 'true').getAttribute('aria-controls').slice(3);
    if (v !== S.view) setView(v);
  });
  el.sorts.forEach(b => b.addEventListener('click', () => sortBy(b.dataset.key)));
  el.pages.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b && !b.disabled) setPage(b.dataset.pg ? +b.dataset.pg : S.page + +b.dataset.step);
  });
  el.scroll.addEventListener('click', e => {
    const seg = e.target.closest('.cx__seg button');
    if (seg) return setDetail(seg.dataset.as);
    const copy = e.target.closest('.cx__copy');
    if (copy) return copyEvent(copy);
    const item = e.target.closest('.cx__item');
    if (!item || e.target.closest('.cx__detail')) return;
    // a click that took over from the tour may land on a row the tour just redrew: use the row now showing that event
    let ev = item.parentElement;
    if (!ev.isConnected) ev = [...PANEL[S.view].children].find(n => eventOf.get(n) === eventOf.get(ev));
    if (ev) openItem(ev, !ev.classList.contains('is-open'));
  });
  el.btn.addEventListener('click', () => (S.live ? setLive(false) : runQuery()));
  el.more.addEventListener('click', () => (el.menu.hidden ? openMenu(false) : closeMenu()));
  el.more.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && el.menu.hidden) { e.preventDefault(); openMenu(true); } });
  el.modes.forEach(m => m.addEventListener('click', () => chooseMode(m.dataset.mode)));
  el.menu.addEventListener('keydown', e => {
    const k = el.modes.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); el.modes[(k + (e.key === 'ArrowDown' ? 1 : el.modes.length - 1)) % el.modes.length].focus(); }
    else if (e.key === 'Tab') closeMenu();
  });
  el.when.addEventListener('click', () => (el.picker.hidden ? openPicker(false) : closePicker()));
  el.when.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && el.picker.hidden) { e.preventDefault(); openPicker(true); } });
  presetBtns.forEach((b, i) => b.addEventListener('click', () => setRange(PRESETS[i])));
  el.presets.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const k = presetBtns.indexOf(document.activeElement), n = presetBtns.length;
    presetBtns[(k + (e.key === 'ArrowDown' ? 1 : n - 1) + n) % n].focus();
  });
  el.picker.addEventListener('focusout', e => { if (e.relatedTarget && !el.picker.contains(e.relatedTarget) && e.relatedTarget !== el.when) closePicker(); });
  el.pop.addEventListener('focusout', e => { if (e.relatedTarget && !el.pop.contains(e.relatedTarget) && !e.relatedTarget.closest('.cx__field')) closePop(); });
  cx.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (drag) { drag = null; drawSel(); clearTip(); }
    else if (!el.picker.hidden) closePicker(true);
    else if (!el.pop.hidden) closePop(true);
    else if (!el.menu.hidden) closeMenu(true);
    else return;
    e.preventDefault();
  });
  document.addEventListener('pointerdown', e => {
    if (!el.menu.hidden && !e.target.closest('.cx__split')) closeMenu();
    if (!el.picker.hidden && !e.target.closest('.cx__time')) closePicker();
    if (!el.pop.hidden && !e.target.closest('.cx__pop, .cx__field')) closePop();
  });

  /* ------------------------------------------------------------ the tour */
  const ptr = document.createElement('div'), ring = document.createElement('i');
  ptr.className = 'cx__pointer';
  ptr.innerHTML = ui.POINTER_SVG;
  ring.className = 'cx__ring';
  ptr.setAttribute('aria-hidden', 'true');
  ring.setAttribute('aria-hidden', 'true');
  cx.append(ptr, ring);
  let px = null, py = null;
  const pos = (x, y, s = 1) => `translate(${(x - 4.5).toFixed(1)}px, ${(y - 2.8).toFixed(1)}px)${s === 1 ? '' : ` scale(${s})`}`;
  function hidePointer() { ptr.style.opacity = '0'; px = py = null; }
  async function moveTo(target, ms, wait) {
    const c = cx.getBoundingClientRect(), r = target.getBoundingClientRect();
    const x = r.left - c.left + r.width / 2, y = r.top - c.top + r.height / 2;
    if (px == null) { px = x + 70; py = y + 56; }
    ptr.style.opacity = '1';
    ptr.style.transform = pos(x, y);
    ptr.animate([{ transform: pos(px, py) }, { transform: pos(x, y) }], { duration: ms, easing: INOUT });
    px = x; py = y;
    await wait(ms);
  }
  async function press(target, wait) {
    ptr.animate([{ transform: pos(px, py) }, { transform: pos(px, py, .94) }, { transform: pos(px, py) }], { duration: 200, easing: OUT });
    ring.animate([{ opacity: 1, transform: `translate(${px}px, ${py}px) scale(.5)` }, { opacity: 0, transform: `translate(${px}px, ${py}px) scale(1.3)` }],
      { duration: 320, easing: OUT });
    target.classList.add('is-press');
    await wait(110);
    target.classList.remove('is-press');
    await wait(60);
  }
  const visible = n => n && n.getClientRects().length > 0;
  const openRow = () => el.rows.children[1];

  // one action a scene; end() sets the scene's last state at once when the tour is held mid-scene
  const SCENES = [
    { // the next page of the 169 errors
      skip: () => !pageBtn(2),
      async run(wait) {
        await moveTo(pageBtn(2), 600, wait);
        await press(pageBtn(2), wait);
        setPage(2);
        await wait(1700);
      },
      end() { setPage(2); },
    },
    { // the query narrowed to one host and run: the bars grow again and the rows change
      async run(wait) {
        const add = ' and host="api-02"', lines = queryLines(START);
        await moveTo(el.code, 450, wait);
        for (let n = 1; n <= add.length; n++) {
          setCode([lines[0], lines[1] + add.slice(0, n), lines[2]], 1);
          await wait(48);
        }
        await wait(150);
        await moveTo(el.btn, 600, wait);
        await press(el.btn, wait);
        S.conds = [...START, HOST];
        setCode(queryLines(S.conds));
        await runQuery(wait);
        await wait(1100);
      },
      end() { S.conds = [...START, HOST]; setCode(queryLines(S.conds)); search(); render(false); },
    },
    { // the time range: Last 5 minutes from its presets, in 5 s bars
      async run(wait) {
        await moveTo(el.when, 600, wait);
        await press(el.when, wait);
        openPicker(false);
        await wait(420);
        await moveTo(presetBtns[0], 480, wait);
        await press(presetBtns[0], wait);
        closePicker();
        S.range = PRESETS[0];
        await runQuery(wait);
        await wait(1400);
      },
      end() { closePicker(); S.range = PRESETS[0]; search(); render(false); },
    },
    { // Live tail from the Run menu: the next eight api-02 errors arrive on top
      async run(wait) {
        await moveTo(el.more, 550, wait);
        await press(el.more, wait);
        openMenu(false);
        await wait(320);
        const item = el.modes.find(m => m.dataset.mode === 'tail');
        await moveTo(item, 360, wait);
        await press(item, wait);
        closeMenu();
        startTail();
        await stream(wait);
        await wait(300);
      },
      end() {
        closeMenu();
        if (!S.live) startTail();
        for (const e of tailEvents().slice(S.tail)) arrive(e);
      },
    },
    { // an event opens to every field
      skip: () => !openRow(),
      async run(wait) {
        const ev = openRow();
        await moveTo(ev.querySelector('.cx__exp'), 650, wait);
        await press(ev.querySelector('.cx__item'), wait);
        openItem(ev, true);
        await wait(1500);
      },
      end() { const ev = openRow(); if (ev && !ev.classList.contains('is-open')) openItem(ev, true); },
    },
    { // the same fields as JSON
      skip: () => !openRow()?.classList.contains('is-open'),
      async run(wait) {
        const b = openRow().querySelector('[data-as="json"]');
        await moveTo(b, 500, wait);
        await press(b, wait);
        setDetail('json');
        await wait(1900);
      },
      end() { setDetail('json'); },
    },
    { // the events as a list: each raw event with its selected fields under it
      async run(wait) {
        await moveTo(el.tabs[1], 600, wait);
        await press(el.tabs[1], wait);
        setView('list');
        await wait(2000);
      },
      end() { setView('list'); },
    },
    { // a field's summary: the status codes among these errors (the field list has no room under 1024px)
      skip: () => !visible(el.side) || !S.side,
      async run(wait) {
        const b = fieldBtn('status');
        await moveTo(b, 650, wait);
        await press(b, wait);
        openPop('status');
        await wait(2300);
        closePop();
      },
      end() { closePop(); },
    },
    { // back to the first picture: the window dims, the first query runs again
      async run(wait) {
        hidePointer();
        cx.classList.add('is-dim');
        await wait(180);
        first();
        el.bars.replaceChildren();
        await wait(180);
        drawChart(true);
        await wait(1900);
      },
      end() { first(); },
    },
  ];

  // a visitor who uses a control takes over: the tour holds where it is and the pause button shows Play
  const loop = figureLoop({ root: cx, box, scenes: SCENES, first, onHold: hidePointer });
  cx.addEventListener('pointerdown', e => { if (e.isTrusted) loop.takeOver(); });
  cx.addEventListener('focusin', e => { if (e.target.matches(':focus-visible')) loop.takeOver(); });
}
