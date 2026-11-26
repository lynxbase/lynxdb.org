/*
  The ingest figure in #ingest. The wires from each source to the server and on to the queries are
  drawn from where the boxes stand. A source under the pointer lights its wire and the server names
  the endpoint it writes to. loop.js rolls the PPL list by one query every few seconds while a third
  of the figure is on screen, with the pulses on the wires; each answer is lynxdb 26.11.1.896's for
  that query on lynxdb/testdata/logs/access.log (the web index of the Web UI above).
*/
import { figureLoop } from './loop.js';

const ig = document.querySelector('.ig');
if (ig) init();

function init() {
  const $ = s => ig.querySelector(s);
  const svg = $('.ig__wires'), node = $('.ig__node'), at = $('.ig__at'), q = $('.ig__q'), list = $('.ig__list'), res = $('.ig__res');
  const tiles = [...ig.querySelectorAll('.ig__src li')];
  const home = at.textContent;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------- the wires */
  const NS = 'http://www.w3.org/2000/svg';
  let wires = [];
  function draw() {
    const box = ig.getBoundingClientRect(), n = node.getBoundingClientRect(), r = q.getBoundingClientRect();
    if (!box.width || !n.width) return;
    const x = v => (v - box.left).toFixed(1), y = v => (v - box.top).toFixed(1);
    const curve = (x1, y1, x2, y2) => { const m = (x1 + x2) / 2; return `M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}`; };
    const paths = tiles.map((t, i) => {
      const b = t.getBoundingClientRect(), ny = n.top + n.height * (0.3 + 0.4 * i / (tiles.length - 1));
      return curve(+x(b.right), +y(b.top + b.height / 2), +x(n.left), +y(ny));
    });
    // on a tablet the queries sit under the sources and the server: no wire to them there
    const out = r.left > n.right ? curve(+x(n.right), +y(n.top + n.height / 2), +x(r.left), +y(r.top + r.height / 2)) : null;
    svg.replaceChildren();
    wires = [];
    [...paths, out].forEach((d, i) => {
      if (!d) return;
      for (const cls of ['', 'p']) {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        if (cls) p.setAttribute('class', cls);
        p.dataset.i = i;
        // each pulse its own pace and start, so they never march in step
        if (cls) p.style.cssText = `--d: ${(2.4 + (i * 0.37) % 1.2).toFixed(2)}s; --at: ${(-(i * 0.61) % 2.4).toFixed(2)}s`;
        svg.append(p);
        wires.push(p);
      }
    });
  }
  new ResizeObserver(draw).observe(ig);

  /* ---------------------------------------------------------- a source under the pointer */
  tiles.forEach((t, i) => {
    t.addEventListener('pointerenter', () => {
      ig.classList.add('is-hot');
      t.classList.add('is-hot');
      wires.forEach(p => p.classList.toggle('is-hot', +p.dataset.i === i));
      at.textContent = t.dataset.at;
    });
    t.addEventListener('pointerleave', () => {
      ig.classList.remove('is-hot');
      t.classList.remove('is-hot');
      wires.forEach(p => p.classList.remove('is-hot'));
      at.textContent = home;
    });
  });

  /* ---------------------------------------------------------- the queries and their answers */
  const ANSWERS = [
    [['ERROR', 294], ['INFO', 359], ['WARN', 347]],
    [['api-02', 48], ['web-02', 43], ['web-03', 41]],
    [['/api/v1/auth/login', 22], ['/api/v1/users', 21], ['/api/v1/health', 16]],
    [['/api/v1/orders', 120], ['/api/v1/auth/login', 112], ['/api/v1/users', 110]],
    [['charlie', 159], ['eve', 158], ['grace', 147]],
    [['200', 43], ['404', 9], ['500', 9]],
    [['charlie', 4318545], ['grace', 3981649], ['eve', 3950355]],
    [['api-02', 67], ['web-02', 58], ['web-03', 57]],
  ];
  const N = ANSWERS.length;
  // the list holds the queries twice, so it rolls on from the last to the first without a jump back
  const items = [...list.children];
  items.forEach(li => list.append(li.cloneNode(true)));
  const all = [...list.children];
  const fmt = v => (Number.isInteger(v) ? v.toLocaleString('en') : v.toFixed(1));
  const answer = (k, grow) => {
    const rows = ANSWERS[k % N], max = Math.max(...rows.map(r => r[1]));
    res.innerHTML = rows.map(([l, v]) => `<div><span>${l}</span><i style="--w: ${(v / max * 100).toFixed(1)}%"></i><b>${fmt(v)}</b></div>`).join('');
    if (grow && !reduced()) {
      res.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'cubic-bezier(.2, 0, 0, 1)' });
      res.querySelectorAll('i').forEach((b, j) => b.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }],
        { duration: 360, delay: j * 50, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'backwards' }));
    }
  };
  let k = 0;
  const show = (to, glide) => {
    all.forEach(li => { li.style.transition = glide && !reduced() ? 'transform 420ms cubic-bezier(.4, 0, .2, 1), background-color 160ms, color 160ms' : 'none'; });
    list.style.setProperty('--k', to);
    all.forEach((li, j) => li.classList.toggle('is-on', j === to));
    k = to;
  };
  const step = {
    async run(wait) {
      // past the last query the list stands on its copy of the first: put it back on the first, unseen
      if (k >= N) { show(k - N, false); await wait(30); }
      show(k + 1, true);
      await wait(260);
      res.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'cubic-bezier(.2, 0, 0, 1)' });
      await wait(120);
      answer(k, true);
      await wait(2300);
    },
    end() { show(k % N, false); answer(k, false); },
  };
  const first = () => { show(0, false); answer(0, false); };
  figureLoop({ root: ig, box: q, scenes: [step], first, rest: 1200, onRun: on => ig.classList.toggle('is-live', on) });
}
