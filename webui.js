/*
  The Web UI in #server. Every control works: the field list and the histogram hide, the Run button's
  menu switches to a live tail, a row opens to all its fields, and the events show as a table or as raw
  lines. While at least a third of the window is on screen a short tour uses those controls, one action
  every 2.5 to 4 s, and starts again from its first picture. It is the page's one looping figure
  (design-system/motion.md): it stops on its first picture when scrolled away or when the tab is hidden, its
  pause button holds it, and a visitor who uses a control takes over from it. Phones and reduced motion
  get the first picture and the working controls, with no tour.
*/
import ui from './assets/ui/ui.js';
import { figureLoop } from './loop.js';
import DATA from './webui-data.js';

const OUT = 'cubic-bezier(.2, 0, 0, 1)', INOUT = 'cubic-bezier(.4, 0, .2, 1)';
const QUERIES = {
  q1: { lines: ['source=web', '| where status >= 500', '| fields _time, level, host, status, msg'], legend: 'status >= 500',
        hl: { status: v => +v >= 500 } },
  q2: { lines: ['source=web', '| where status >= 500 and host="api-02"', '| fields _time, level, host, status, msg'], legend: 'api-02, status >= 500',
        hl: { status: v => +v >= 500, host: v => v === 'api-02' } },
};
const FIELDS = ['_time', 'host', 'level', 'method', 'path', 'status', 'user', 'response_time', 'bytes', 'msg'];
const RANGE = '2025-01-15 08:00–08:07 UTC', TAIL_FROM = '2025-01-15T08:07:00.000Z';

const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');
const moving = () => !reducedQ.matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const parse = line => {
  const sp = line.indexOf(' '), f = { _time: line.slice(0, sp) };
  for (const m of line.slice(sp + 1).matchAll(/(\w+)=("([^"]*)"|\S+)/g)) f[m[1]] = m[3] ?? m[2];
  return f;
};
// 2025-01-15T08:06:07.05Z -> 08:06:07.050
const hms = ts => { const [s, ms = ''] = ts.slice(11, -1).split('.'); return `${s}.${(ms + '000').slice(0, 3)}`; };
const secs = ts => Date.parse(ts) / 1000;
// a tail event arrives after a pause that follows the real gap before it, squeezed into 140-340 ms
const gapMs = (a, b) => Math.min(340, Math.max(140, (secs(b) - secs(a)) * 55));

const cx = document.querySelector('.cx');
if (cx) init(cx);

function init(cx) {
  const $ = s => cx.querySelector(s);
  const box = cx.closest('[data-ui-pause-host]');
  const el = {
    side: $('.cx__side'), sideBody: $('.cx__sidebody'), sideBtn: $('.cx__side-toggle'), main: $('.cx__main'),
    code: $('.cx__code'), btn: $('.cx__btn'), label: $('.cx__btn-label'), more: $('.cx__more'), menu: $('.cx__menu'),
    modes: [...cx.querySelectorAll('.cx__mode')], stat: $('.cx__stat'), range: $('.cx__meta .nw'), progress: $('.cx__progress'),
    chart: $('.cx__chart'), chartBtn: $('.cx__chart-toggle'), bars: $('.cx__bars'), match: $('.cx__match'),
    logs: $('.cx__logs'), tabs: [...cx.querySelectorAll('.cx__view')], table: $('.cx__table'), rows: $('.cx__rows'), raw: $('.cx__raw'),
  };
  const S = { q: 'q1', lines: [], open: new Set(), view: 'table', side: true, chart: true, live: false, tail: 0 };
  const rowOf = new Map(), rawOf = new Map(), lineOf = new WeakMap();
  let uid = 0;

  /* ------------------------------------------------------------ the query text */
  const paint = text => esc(text)
    .replace(/\b(source|where|and|fields)\b|(&quot;[^\n]*?(?:&quot;|(?=\n|\u0001|$)))/g, (m, k, s) => (k ? `<span class="t-k">${k}</span>` : `<span class="t-s">${s}</span>`))
    .replace('\u0001', '<span class="cx__caret"></span>');
  const setCode = (lines, caretLine = -1) => {
    el.code.innerHTML = paint(lines.map((l, i) => (i === caretLine ? l + '\u0001' : l)).join('\n'));
  };

  /* ------------------------------------------------------------ rows and raw lines */
  function rowEl(line) {
    const f = parse(line), t = hms(f._time), ev = document.createElement('div');
    ev.className = 'cx__ev';
    ev.innerHTML = `<div class="cx__row"><button class="cx__exp" type="button" aria-expanded="false" aria-label="Fields of the ${t} event"><svg aria-hidden="true"><use href="#cx-i-chev"/></svg></button>`
      + `<span>${t}</span><span${f.level === 'ERROR' ? ' class="lv-e"' : ''}>${esc(f.level)}</span><span>${esc(f.host)}</span><span>${esc(f.status)}</span><span>${esc(f.msg)}</span></div>`;
    lineOf.set(ev, line);
    rowOf.set(line, ev);
    if (S.open.has(line)) openRow(ev, true);
    return ev;
  }
  function rawEl(line) {
    const sp = line.indexOf(' '), hl = QUERIES[S.q].hl, div = document.createElement('div');
    div.className = 'cx__line';
    div.innerHTML = `<span class="ts">${esc(line.slice(0, sp))}</span> ` + line.slice(sp + 1).replace(/(\w+)=("[^"]*"|\S+)/g,
      (m, k, v) => `<span class="k">${k}=</span>${hl[k]?.(v) ? `<span class="hl">${esc(v)}</span>` : esc(v)}`);
    div.classList.toggle('is-sel', S.open.has(line));
    rawOf.set(line, div);
    return div;
  }
  function renderRows() {
    rowOf.clear(); rawOf.clear();
    el.rows.replaceChildren(...S.lines.map(rowEl));
    el.raw.replaceChildren(...S.lines.map(rawEl));
  }
  function openRow(ev, on) {
    const line = lineOf.get(ev), btn = ev.querySelector('.cx__exp');
    let dl = ev.querySelector('.cx__detail');
    if (on && !dl) {
      const f = parse(line);
      dl = document.createElement('dl');
      dl.className = 'cx__detail';
      dl.id = `cx-ev-${++uid}`;
      dl.innerHTML = FIELDS.map(k => `<dt>${k}</dt><dd${k === 'level' && f.level === 'ERROR' ? ' class="lv-e"' : ''}>${esc(f[k] ?? '')}</dd>`).join('');
      ev.append(dl);
      btn.setAttribute('aria-controls', dl.id);
    }
    if (dl) dl.hidden = !on;
    ev.classList.toggle('is-open', on);
    btn.setAttribute('aria-expanded', String(on));
    if (on) S.open.add(line); else S.open.delete(line);
    rawOf.get(line)?.classList.toggle('is-sel', on);
  }

  /* ------------------------------------------------------------ the histogram */
  function bars(hist, grow) {
    const NS = 'http://www.w3.org/2000/svg', W = 360, H = 72, gap = 3;
    const bw = (W - gap * (hist.length - 1)) / hist.length, max = Math.max(...hist.map(d => d[0] + d[1]));
    const gs = hist.map(([other, hit], k) => {
      const g = document.createElementNS(NS, 'g');
      let y = H;
      for (const [n, cls] of [[other, ''], [hit, 'e']]) {
        if (!n) continue;
        const h = n / max * H, r = document.createElementNS(NS, 'rect');
        y -= h;
        r.setAttribute('x', (k * (bw + gap)).toFixed(2));
        r.setAttribute('y', y.toFixed(2));
        r.setAttribute('width', bw.toFixed(2));
        r.setAttribute('height', h.toFixed(2));
        if (cls) r.setAttribute('class', cls);
        g.append(r);
      }
      return g;
    });
    el.bars.replaceChildren(...gs);
    // the bars rise from the baseline left to right, about 0.6 s in all
    if (grow && moving()) gs.forEach((g, k) => g.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
      { duration: 320, delay: k * 9, easing: OUT, fill: 'backwards' }));
  }

  /* ------------------------------------------------------------ results, tail, views, panels */
  let streamTok = 0;
  function results(q, anim) {
    const d = DATA[q];
    streamTok++;
    S.q = q; S.tail = 0; S.open.clear();
    S.lines = d.rows.slice();
    renderRows();
    el.stat.innerHTML = `<b>${d.count}</b> of ${DATA.total.toLocaleString('en')} events`;
    el.range.textContent = RANGE;
    el.match.textContent = QUERIES[q].legend;
    bars(d.hist, anim);
    if (anim && moving()) for (const n of [el.rows, el.raw]) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 120, easing: OUT, fill: 'backwards' });
  }
  async function runQuery(q, wait = sleep) {
    if (S.live) setLive(false);
    if (moving()) {
      el.progress.animate([{ opacity: 1, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)', offset: .8 }, { opacity: 0, transform: 'scaleX(1)' }],
        { duration: 420, easing: INOUT });
      await wait(300);
    }
    results(q, true);
  }
  function setLive(on) {
    S.live = on;
    cx.classList.toggle('is-live', on);
    el.label.textContent = on ? 'Stop' : 'Run';
    el.modes.forEach(m => m.setAttribute('aria-checked', String((m.dataset.mode === 'tail') === on)));
    if (on) {
      S.tail = 0;
      el.stat.innerHTML = '<b>0</b> new events';
      el.range.textContent = 'since 08:07:00 UTC';
    } else streamTok++;
  }
  // new events go on top as they arrive, with no motion of their own (LynxDB LogTable)
  function arrive(line) {
    S.lines.unshift(line);
    el.rows.prepend(rowEl(line));
    el.raw.prepend(rawEl(line));
    el.stat.innerHTML = `<b>${++S.tail}</b> new event${S.tail === 1 ? '' : 's'}`;
  }
  async function stream(wait) {
    const tok = streamTok, lines = DATA[S.q].tail;
    let last = TAIL_FROM;
    for (const line of lines) {
      const ts = line.slice(0, line.indexOf(' '));
      await wait(gapMs(last, ts));
      if (tok !== streamTok) return;
      arrive(line);
      last = ts;
    }
  }
  function startTail() {
    results(S.q, false);
    setLive(true);
  }
  function setView(v, focus) {
    S.view = v;
    el.tabs.forEach(t => {
      const on = t.getAttribute('aria-controls') === (v === 'raw' ? 'cx-raw' : 'cx-table');
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    el.table.hidden = v !== 'table';
    el.raw.hidden = v !== 'raw';
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
    const from = anim && moving() ? el.main.getBoundingClientRect().left : null;
    cx.classList.toggle('is-side-off', !on);
    el.sideBtn.setAttribute('aria-expanded', String(on));
    el.sideBtn.setAttribute('aria-label', on ? 'Hide fields' : 'Show fields');
    slide(el.main, 'x', from);
    if (on && from != null) el.sideBody.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 80, easing: OUT, fill: 'backwards' });
  }
  function setChart(on, anim) {
    if (S.chart === on) return;
    S.chart = on;
    const from = anim && moving() ? el.logs.getBoundingClientRect().top : null;
    cx.classList.toggle('is-chart-off', !on);
    el.chartBtn.setAttribute('aria-expanded', String(on));
    el.chartBtn.setAttribute('aria-label', on ? 'Hide histogram' : 'Show histogram');
    el.chartBtn.querySelector('use').setAttribute('href', on ? '#cx-i-eye' : '#cx-i-eye-off');
    slide(el.logs, 'y', from);
    if (on && from != null) $('.cx__chartbody').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 80, easing: OUT, fill: 'backwards' });
  }

  /* ------------------------------------------------------------ the run menu */
  let menuTok = 0;
  function openMenu(focus) {
    menuTok++;
    el.menu.hidden = false;
    el.more.setAttribute('aria-expanded', 'true');
    if (moving()) el.menu.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: OUT });
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
    else runQuery(S.q);
  }

  /* ------------------------------------------------------------ the first picture */
  function first() {
    closeMenu();
    hidePointer();
    cx.classList.remove('is-live', 'is-dim');
    S.live = false;
    el.label.textContent = 'Run';
    el.modes.forEach(m => m.setAttribute('aria-checked', String(m.dataset.mode === 'run')));
    setSide(true, false);
    setChart(true, false);
    setView('table');
    setCode(QUERIES.q1.lines);
    results('q1', false);
  }

  /* ------------------------------------------------------------ the controls */
  el.sideBtn.addEventListener('click', () => setSide(!S.side, true));
  el.chartBtn.addEventListener('click', () => setChart(!S.chart, true));
  el.tabs.forEach(t => t.addEventListener('click', () => setView(t.id === 'cx-tab-raw' ? 'raw' : 'table')));
  $('.cx__bar').addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setView(S.view === 'table' ? 'raw' : 'table', true);
    }
  });
  el.rows.addEventListener('click', e => {
    // a click that took over from the tour may land on a row the tour just redrew: use the row now showing that event
    const hit = e.target.closest('.cx__ev'), ev = hit && (rowOf.get(lineOf.get(hit)) || hit);
    if (ev && ev.isConnected && !e.target.closest('.cx__detail')) openRow(ev, !ev.classList.contains('is-open'));
  });
  el.btn.addEventListener('click', () => (S.live ? setLive(false) : runQuery(S.q)));
  el.more.addEventListener('click', () => (el.menu.hidden ? openMenu(false) : closeMenu()));
  el.more.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && el.menu.hidden) { e.preventDefault(); openMenu(true); } });
  el.modes.forEach(m => m.addEventListener('click', () => chooseMode(m.dataset.mode)));
  el.menu.addEventListener('keydown', e => {
    const k = el.modes.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); el.modes[(k + (e.key === 'ArrowDown' ? 1 : el.modes.length - 1)) % el.modes.length].focus(); }
    else if (e.key === 'Tab') closeMenu();
  });
  document.addEventListener('pointerdown', e => { if (!el.menu.hidden && !e.target.closest('.cx__split')) closeMenu(); });

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
  const visible = n => n.getClientRects().length > 0;

  // one action a scene; end() sets the scene's last state at once when the tour is held mid-scene
  const SCENES = [
    { // a query narrowed to one host and run: the bars grow again and the rows change
      async run(wait) {
        const add = ' and host="api-02"', base = QUERIES.q1.lines;
        await moveTo(el.code, 450, wait);
        for (let n = 1; n <= add.length; n++) {
          setCode([base[0], base[1] + add.slice(0, n), base[2]], 1);
          await wait(48);
        }
        await wait(150);
        await moveTo(el.btn, 600, wait);
        await press(el.btn, wait);
        setCode(QUERIES.q2.lines);
        await runQuery('q2', wait);
        await wait(1100);
      },
      end() { setCode(QUERIES.q2.lines); if (S.q !== 'q2') results('q2', false); },
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
        for (const line of DATA[S.q].tail.slice(S.tail)) arrive(line);
      },
    },
    { // the histogram hides and the events take its room
      async run(wait) {
        await moveTo(el.chartBtn, 650, wait);
        await press(el.chartBtn, wait);
        setChart(false, true);
        await wait(1900);
      },
      end() { setChart(false, false); },
    },
    { // an event opens to every field
      async run(wait) {
        const ev = el.rows.children[1];
        await moveTo(ev.querySelector('.cx__exp'), 650, wait);
        await press(ev.querySelector('.cx__row'), wait);
        openRow(ev, true);
        await wait(1900);
      },
      end() { const ev = el.rows.children[1]; if (ev && !ev.classList.contains('is-open')) openRow(ev, true); },
    },
    { // the same events as raw lines, the opened one marked
      async run(wait) {
        await moveTo(el.tabs[1], 600, wait);
        await press(el.tabs[1], wait);
        setView('raw');
        await wait(2000);
      },
      end() { setView('raw'); },
    },
    { // the field list folds into its rail (it has no room under 1024px, so the scene is skipped there)
      skip: () => !visible(el.sideBtn),
      async run(wait) {
        await moveTo(el.sideBtn, 700, wait);
        await press(el.sideBtn, wait);
        setSide(false, true);
        await wait(1900);
      },
      end() { setSide(false, false); },
    },
    { // back to the first picture: the window dims, the first query runs again
      async run(wait) {
        hidePointer();
        cx.classList.add('is-dim');
        await wait(180);
        first();
        el.bars.replaceChildren();
        await wait(180);
        results('q1', true);
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
