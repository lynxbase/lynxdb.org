/*
  The hero's console: a loop of four scenes on the JSONBench machine (hero-screens.js holds what it
  prints and where every number comes from). The load of 1,000 files fills the index squares 16 at a
  time; then the shell runs three of the benchmark's queries, and each lights the squares it reads,
  the ones it answers from the index and the ones it skips, and its time in the panel. loop.js plays
  it while a third of it is on screen; phones and reduced motion keep the still in index.html.
*/
import { figureLoop } from './loop.js';
import * as H from './hero-screens.js';

const win = document.querySelector('.hero__window[data-ui-pause-host]');
const bx = win && win.querySelector('.bx');
if (bx) init();

function init() {
  const $ = s => bx.querySelector(s);
  const scr = $('.bx__screen'), note = $('.bx__note'), legend = $('.bx__legend'), canvas = $('.bx__grid canvas');
  const bars = [...bx.querySelectorAll('.bx__bars li')];
  let lines = [];
  const show = () => { scr.innerHTML = lines.join('\n'); };

  /* ---------------------------------------------------------- the index squares: 1,000, one per 1M events */
  const COLS = 50, N = 1000, CELL = 5, GAP = 2;
  const COLOUR = { empty: '#1b1f1b', stored: '#3a5c42', flight: '#d8f5a6', read: '#8fd16b', index: '#2f5d3c', skipped: '#1b1f1b' };
  const ctx = canvas.getContext('2d');
  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = COLS * (CELL + GAP) - GAP, h = (N / COLS) * (CELL + GAP) - GAP;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // the creates sit between the few account and identity events, in the sort key's order: profile,
  // like, post, repost, block, follow, then the small collections; a scan reads the blocks where one
  // collection meets the next and counts the rest from the index
  const edges = [25, 470, 557, 614, 628, 966, 972, 976];
  const MODES = {
    index: () => 'index',
    post: i => (i >= 452 && i < 572 ? 'read' : 'skipped'),
    creates: i => (i < 20 || i >= 980 ? 'skipped' : edges.some(e => Math.abs(i - e) < 6) ? 'read' : 'index'),
  };
  let mode = MODES.index, from = null, sweep = 1, fill = null;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < N; i++) {
      let st;
      if (fill != null) st = i < Math.floor(fill) ? 'stored' : i < Math.floor(fill) + 16 ? 'flight' : 'empty';
      else st = (from && i / N >= sweep ? from : mode)(i);
      ctx.fillStyle = COLOUR[st];
      ctx.fillRect((i % COLS) * (CELL + GAP), Math.floor(i / COLS) * (CELL + GAP), CELL, CELL);
    }
  }
  const setLegend = kind => {
    legend.innerHTML = kind === 'load'
      ? '<span class="s-stored">stored</span><span class="s-flight">in flight</span><span class="s-empty">waiting</span>'
      : '<span class="s-read">read</span><span class="s-index">from index</span><span class="s-empty">skipped</span>';
  };
  function panel(id) {
    const p = H.PANEL[id];
    bars.forEach(b => b.classList.toggle('is-on', +b.dataset.q === p.bar));
    note.textContent = p.note;
    setLegend('query');
  }
  // the next state runs over the squares left to right, the way the scan walks the sorted index
  async function scanTo(name, wait) {
    from = mode; mode = MODES[name]; fill = null;
    for (let t = 0; t <= 1; t += 0.08) { sweep = t; draw(); await wait(32); }
    from = null; sweep = 1; draw();
  }

  /* ---------------------------------------------------------- the terminal */
  async function type(prefix, text, wait, cps = 90) {
    lines.push(prefix);
    const at = lines.length - 1, step = Math.max(1, Math.round(cps / 60));
    for (let n = step; n < text.length + step; n += step) {
      lines[at] = prefix + H.paint(text.slice(0, n)) + '<span class="bx__caret"></span>';
      show();
      await wait(1000 / 60);
    }
    lines[at] = prefix + H.paint(text);
    show();
  }
  async function print(out, wait, gap = 34) {
    for (const l of out) { lines.push(l); show(); await wait(gap); }
  }
  const cont = '<span class="t-d">        · </span>';

  /* ---------------------------------------------------------- the scenes */
  const head = () => H.ingest(0).slice(0, 3);
  const loadEnd = () => {
    lines = [`${H.dollar()}${H.paint(H.INGEST_CMD)}`, ...head(), ...H.ingestDone(true)];
    fill = null; mode = MODES.index; from = null;
    note.textContent = '1,000 files · 92.7 GB on disk';
    setLegend('query');
    bars.forEach(b => b.classList.remove('is-on'));
    show(); draw();
  };
  const SCENES = [
    { // the load: 1,000 files, 16 at a time, 394 s, then the merge
      async run(wait) {
        lines = []; show();
        bars.forEach(b => b.classList.remove('is-on'));
        setLegend('load');
        fill = 0; draw();
        await type(H.dollar(), H.INGEST_CMD, wait, 110);
        const base = lines.length;
        for (let t = 0; t <= 1.0001; t += 1 / 84) {
          const x = Math.min(H.LOAD.files, t * H.LOAD.files);
          lines.length = base; lines.push(...H.ingest(x)); show();
          fill = x; draw();
          note.textContent = `${Math.floor(x)} of 1,000 files · ${(x / 1000).toFixed(2)}B events`;
          await wait(33);
        }
        lines.length = base; lines.push(...head(), ...H.ingestDone(false)); show();
        fill = N; draw();
        await wait(700);
        loadEnd();
        await wait(1500);
      },
      end: loadEnd,
    },
    { // the shell opens and counts every collection from the index
      async run(wait) {
        lines = []; show();
        await type(H.dollar(), 'lynxdb shell', wait);
        await wait(120);
        lines.push(H.banner()); show();
        await type(H.prompt(), H.Q1_TEXT, wait);
        await wait(180);
        panel('q1');
        await Promise.all([scanTo('index', wait), print(H.q1Out(), wait)]);
        await wait(1700);
      },
      end() { lines = H.still().split('\n'); show(); panel('q1'); mode = MODES.index; fill = null; from = null; draw(); },
    },
    { // JSON out: the first three accounts to post, reading one band of the index
      async run(wait) {
        lines = [H.banner()]; show();
        await type(H.prompt(), '.format json', wait);
        await wait(160);
        await type(H.prompt(), H.Q4_TEXT[0], wait, 130);
        await type(cont, H.Q4_TEXT[1], wait, 130);
        await wait(180);
        panel('q4');
        await Promise.all([scanTo('post', wait), print(H.q4Out(), wait)]);
        await wait(1800);
      },
      end() {
        lines = [H.banner(), `${H.prompt()}${H.paint('.format json')}`, `${H.prompt()}${H.paint(H.Q4_TEXT[0])}`, cont + H.paint(H.Q4_TEXT[1]), ...H.q4Out()];
        show(); panel('q4'); mode = MODES.post; fill = null; from = null; draw();
      },
    },
    { // the plan of a query that counts most of its answer from the index
      async run(wait) {
        lines = [H.banner()]; show();
        await type(H.prompt(), '.format table', wait);
        await wait(160);
        await type(H.prompt(), H.Q2_TEXT[0], wait, 130);
        await type(cont, H.Q2_TEXT[1], wait, 130);
        await wait(180);
        panel('q2');
        await Promise.all([scanTo('creates', wait), print(H.q2Out(), wait, 60)]);
        await wait(2000);
      },
      end() {
        lines = [H.banner(), `${H.prompt()}${H.paint('.format table')}`, `${H.prompt()}${H.paint(H.Q2_TEXT[0])}`, cont + H.paint(H.Q2_TEXT[1]), ...H.q2Out()];
        show(); panel('q2'); mode = MODES.creates; fill = null; from = null; draw();
      },
    },
  ];
  // the still is the shell on Q1; the loop starts from it with the load
  const first = () => SCENES[1].end();

  size();
  addEventListener('resize', () => { size(); draw(); });
  figureLoop({ root: win, box: win, scenes: SCENES, first, rest: 1800 });
}
