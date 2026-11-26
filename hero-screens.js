/*
  What the hero's console prints: LynxDB's JSONBench run on 1,000,000,000 Bluesky events
  (github.com/lynxbase/ClickBench/tree/main/json/lynxdb, results/20261120: m6i.8xlarge, commit
  ad9d7e3b, 20 November 2026). The events, files, load and merge times and sizes come from that run
  and its README (the JSON sizes from JSONBench's README); the query times are the ones JSONBench's
  page shows for it (README.md's chart), the same as in the page's benchmark section.
  The benchmark publishes no answers, so the result rows and the block counts are estimates: the
  same queries run with lynxdb 26.11.1.896 on the benchmark's first file (1,000,000 events, 75 blocks),
  times 1,000. The first posters (Q4) are that file's, the earliest events of the dataset.
  The console's look (the shell, its prompt, the bars, the stats line) is the landing page's design
  of the CLI, not its current output.
  No DOM here: hero.js plays it, and the still in index.html is printed from it (STILL).
*/
export const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// PPL and shell colours: the program, flags, commands, functions, strings, numbers
export function paint(text) {
  return esc(text).replace(
    /\b(lynxdb)\b|(\s--?[a-z][a-z-]*)|(\.format|\.help)\b|\b(source|where|and|in|stats|by|as|sort|head|eval|fields|explain|analyze|ingest|shell|query)\b|\b(count|distinct_count|min|max|hour)(?=\()|('[^'\n]*'?)|\b(\d[\d.]*)\b/g,
    (m, prog, flag, meta, kw, fn, str, n) =>
      prog ? `<span class="t-c">${prog}</span>` : flag ? `<span class="t-d">${flag}</span>` : meta ? `<span class="t-m">${meta}</span>`
        : kw ? `<span class="t-k">${kw}</span>` : fn ? `<span class="t-f">${fn}</span>` : str ? `<span class="t-s">${str}</span>` : `<span class="t-n">${n}</span>`);
}

const dim = s => `<span class="t-d">${s}</span>`;
const num = s => `<span class="t-n">${s}</span>`;
const ok = s => `<span class="t-ok">${s}</span>`;
const grp = n => Math.round(n).toLocaleString('en');
export const SHELL = 'bluesky ›';
export const prompt = () => `<span class="t-p">${SHELL}</span> `;
export const dollar = () => '<span class="t-p">$</span> ';
const stat = (rows, ms, rest) => `  ${ok('●')} <b>${rows} rows</b>  <b class="t-ms">${ms} ms</b>  ${dim(rest)}`;
const banner = () => dim('  LynxDB shell · bench:3100 · 1 index · 1,000,000,000 events · .help for commands');

/* ------------------------------------------------------------ the load: 1,000 files, 16 at a time */
export const LOAD = { files: 1000, seconds: 394, merge: 430, rate: '2.54M' };
export const INGEST_CMD = "lynxdb ingest 'bluesky/file_*.json.gz' --index bluesky --parallel 16";
const mmss = s => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
// a progress bar w characters wide, k of it done (drawn in CSS, so the columns after it stay put)
const bar = (k, w) => `<span class="bx__pb" style="--w: ${w}; --k: ${k.toFixed(3)}"></span>`;
// x: files done so far (0 to 1,000, fractional); the 16 streams are evenly out of step, so the files in
// flight are x+1 to x+16 and the one k places behind the first is (15 - k + frac(x)) / 16 done
export function ingest(x) {
  const done = Math.floor(x), f = x - done, lanes = [0, 4, 8, 12, 15];
  const out = [
    `  ${dim('index')}  bluesky   ${dim('sort key')} kind, commit.operation, commit.collection, did`,
    `  ${dim('files')}  1,000 · 125 GB gzip · ≈480 GB of JSON`,
    '',
  ];
  for (const k of lanes) {
    const j = done + 1 + k, p = Math.min(1, Math.max(0, (15 - k + f) / 16));
    if (j > LOAD.files) { out.push(''); continue; }
    out.push(`  ${dim(`file_${String(j).padStart(4, '0')}.json.gz`)}  ${bar(p, 26)}  ${num((p).toFixed(2) + 'M')}`);
  }
  out.push(`  ${dim(`+ ${Math.max(0, Math.min(11, LOAD.files - done - 5))} more files in flight`)}`);
  out.push(`  ${dim('total')}  ${bar(x / LOAD.files, 26)}  ${num(String(Math.floor(x / 10)).padStart(3) + '%')}  ${num(grp(x * 1e6).padStart(13))} events  ${num(LOAD.rate + '/s')}  ${num(mmss(x / LOAD.files * LOAD.seconds))}`);
  return out;
}
export function ingestDone(merged) {
  return [
    `  ${ok('✓')} <b>1,000,000,000 events</b> from 1,000 files in ${num('6m 34s')}, ${num('2.54M')} events/s`,
    merged ? `  ${ok('✓')} merged in ${num('7m 10s')} · <b>92.7 GB</b> on disk, ${num('5.2×')} smaller than the JSON`
      : `  ${dim('⠿ merging the parts…')}`,
  ];
}

/* ------------------------------------------------------------ Q1: a table with bars */
// on 1M: like 448,944, follow 360,374, post 90,816, repost 58,540, block 14,040, profile 11,762 of 15 rows
const Q1 = [['app.bsky.feed.like', 448944], ['app.bsky.graph.follow', 360374], ['app.bsky.feed.post', 90816],
  ['app.bsky.feed.repost', 58540], ['app.bsky.graph.block', 14040], ['app.bsky.actor.profile', 11762]];
const hbar = n => `<span class="bx__hb" style="--n: ${n.toFixed(2)}"></span>`;
export const Q1_TEXT = 'stats count() as count by commit.collection | sort - count';
export function q1Out() {
  const max = Q1[0][1];
  return [
    `  ${dim('commit.collection'.padEnd(26))}${dim('count'.padStart(13))}`,
    ...Q1.map(([c, n]) => `  ${c.padEnd(26)}${num(grp(n * 1000).padStart(13))}  ${hbar(n / max * 24)}`),
    `  ${dim('… 9 more rows')}`,
    '',
    stat(15, '1', '1,000,000,000 events counted from the index, 0 blocks read'),
  ];
}

/* ------------------------------------------------------------ Q4: JSON */
export const Q4_TEXT = ["where kind = 'commit' and commit.operation = 'create' and commit.collection = 'app.bsky.feed.post'",
  '| stats min(_time) as first_post_ts by did | sort first_post_ts | head 3'];
const Q4 = [['did:plc:yj3sjq3blzpynh27cumnp5ks', '2024-11-21T16:25:49.000167Z'], ['did:plc:l5o3qjrmfztir54cpwlv2eme', '2024-11-21T16:25:49.001905Z'],
  ['did:plc:s4bwqchfzm6gjqfeb6mexgbu', '2024-11-21T16:25:49.003907Z']];
export function q4Out() {
  return [
    '[',
    ...Q4.map(([d, t], i) => `  { ${dim('"did"')}: <span class="t-s">"${d}"</span>, ${dim('"first_post_ts"')}: <span class="t-s">"${t}"</span> }${i < 2 ? ',' : ''}`),
    ']',
    '',
    stat(3, '4', '9,000 blocks read, 66,000 skipped by the sort key and token filters'),
  ];
}

/* ------------------------------------------------------------ Q2: explain analyze */
export const Q2_TEXT = ["explain analyze where kind = 'commit' and commit.operation = 'create'",
  '| stats count() as count, distinct_count(did) as users by commit.collection | sort - count'];
export function q2Out() {
  const node = (name, text) => `  <b>${name.padEnd(10)}</b>${text}`;
  return [
    node('Sort', 'count desc'),
    node('Aggregate', `${esc('count(), distinct_count(did)')} ${dim('by')} commit.collection`),
    node('Filter', `kind = 'commit' ${dim('and')} commit.operation = 'create'  ${ok('pushed into the scan')}`),
    node('Scan', `bluesky ${dim('· reads 5 columns: _time, kind, commit.operation, commit.collection, did')}`),
    `  ${' '.repeat(10)}${dim('blocks')} ${num('75,000')}  ${ok('65,000 counted from the index')}  ${num('7,000')} read  ${dim('3,000 skipped by the sort key')}`,
    '',
    `  ${ok('●')} <b class="t-ms">49 ms</b>  ${dim('954,611,000 events matched')}`,
  ];
}

/* ------------------------------------------------------------ the scenes, as the panel shows them */
// grid: what the 1,000 squares of the index (1M events each) show; bar: the query lit in the panel
export const PANEL = {
  q1: { bar: 1, grid: 'index', note: '75,000 blocks from the index · 0 read' },
  q4: { bar: 4, grid: 'post', note: '9,000 blocks read · 66,000 skipped' },
  q2: { bar: 2, grid: 'creates', note: '65,000 blocks from the index · 7,000 read' },
};

// the still: the shell open on Q1, finished
export function still() {
  return [`${dollar()}${paint('lynxdb shell')}`, banner(), `${prompt()}${paint(Q1_TEXT)}`, ...q1Out()].join('\n');
}
export { banner };
