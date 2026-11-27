// The 30-query figure of the JSONBench post: LynxDB's time per query divided by ClickHouse's,
// VictoriaLogs' or the faster of the two, cold or hot. The page is built showing the faster of the
// two, cold, and its rows open without script (details/summary); this module shows the controls and
// recomputes the bars, the ratios, the groups and the counts from queries.json next to it.

const EVEN = 0.85;     // a ratio between EVEN and 1 / EVEN counts as about even
const DECADES = 4;     // the axis runs from 1e-4 to 1e4, 1x in the middle
const NAMES = { best: 'the faster of ClickHouse and VictoriaLogs', ch: 'ClickHouse', vl: 'VictoriaLogs' };

const fig = document.querySelector('[data-fig-ratio]');
if (fig) init(fig);

async function init(fig) {
  let data;
  try {
    const res = await fetch(new URL('queries.json', import.meta.url));
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return;   // the figure keeps the view it was built with
  }
  const list = fig.querySelector('.fig-bars');
  const rows = new Map([...list.querySelectorAll('.fig-qrow')].map(li => [li.dataset.q, li]));
  const heads = Object.fromEntries([...list.querySelectorAll('.fig-sub[data-group]')].map(li => [li.dataset.group, li]));
  const title = fig.querySelector('.fig-head b');
  const unit = fig.querySelector('.fig-head span');
  const count = fig.querySelector('.fig-count');
  const controls = fig.querySelector('.fig-controls');
  const state = { vs: 'best', run: 'cold' };

  controls.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const key = 'vs' in btn.dataset ? 'vs' : 'run';
    state[key] = btn.dataset[key];
    for (const b of btn.parentElement.children) b.setAttribute('aria-pressed', String(b === btn));
    render();
  });

  function render() {
    const computed = data.queries.map(q => ({ q, r: ratio(q, state.vs, state.run) }));
    const timed = computed.filter(x => x.r !== null);
    computed.sort((a, b) => (a.r ?? Infinity) - (b.r ?? Infinity));
    const order = { fast: [], even: [], slow: [], none: [] };
    for (const { q, r } of computed) {
      const li = rows.get(q.id);
      if (!li) continue;
      const bar = li.querySelector('.fig-track > i');
      if (r === null) {
        bar.style.setProperty('--x0', '50%');
        bar.style.setProperty('--w', '0%');
        bar.style.visibility = 'hidden';
        li.querySelector('summary > b').textContent = 'n/a';
      } else {
        const pos = Math.min(100, Math.max(0, (Math.log10(r) + DECADES) / (2 * DECADES) * 100));
        bar.style.visibility = '';
        bar.style.setProperty('--x0', r < 1 ? `min(${pos.toFixed(1)}%, calc(50% - 3px))` : '50%');
        bar.style.setProperty('--w', `${(r < 1 ? 50 - pos : pos - 50).toFixed(1)}%`);
        li.querySelector('summary > b').textContent = `${formatRatio(r)}×`;
      }
      order[group(r)].push(li);
    }
    for (const g of ['fast', 'even', 'slow', 'none']) {
      const head = heads[g];
      head.hidden = !order[g].length;
      head.querySelector('b > span').textContent = order[g].length;
      list.append(head, ...order[g]);
    }
    title.textContent = `LynxDB against ${NAMES[state.vs]}`;
    unit.textContent = `${state.run} time ratio, log scale`;
    count.querySelector('b').textContent = timed.filter(x => x.r < 1).length;
    count.querySelector('span').textContent = timed.length;
  }

  controls.hidden = false;
}

function ratio(q, vs, run) {
  const mine = q.lynxdb[run];
  let theirs;
  if (vs === 'best') {
    const both = [q.clickhouse[run], q.victorialogs[run]].filter(t => t !== null);
    theirs = both.length ? Math.min(...both) : null;
  } else {
    theirs = (vs === 'ch' ? q.clickhouse : q.victorialogs)[run];
  }
  return mine === null || theirs === null ? null : mine / theirs;
}

function group(r) {
  if (r === null) return 'none';
  return r <= EVEN ? 'fast' : r < 1 / EVEN ? 'even' : 'slow';
}

// two significant digits below 1x, one decimal below 10x, whole numbers above (as the page is built)
function formatRatio(r) {
  if (r < 1) return String(Number(r.toPrecision(2)));
  return r < 10 ? r.toFixed(1) : r.toFixed(0);
}
