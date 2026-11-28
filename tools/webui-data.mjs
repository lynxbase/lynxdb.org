#!/usr/bin/env node
/*
  Writes webui-data.js, the events the Web UI in #server searches, from lynxdb's testdata/logs/access.log:

    node tools/webui-data.mjs ../lynxdb/testdata/logs/access.log

  Every line of the log is kept, packed as numbers: milliseconds after the first minute, then host, level,
  method, path, status, user, response_time and bytes, with the text fields as indexes into their value
  lists. webui.js rebuilds each line exactly as the log has it (msg is always "<method> <path> completed",
  and the timestamp drops trailing zeros from its milliseconds), so a line that does not fit that shape
  stops the script instead of changing in the figure.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('usage: node tools/webui-data.mjs <path to access.log>'); process.exit(2); }

const LINE = /^(\S+) host=(\S+) level=(\S+) method=(\S+) path=(\S+) status=(\d+) user=(\S+) response_time=(\d+) bytes=(\d+) msg="(.*)"$/;
const DICT = ['host', 'level', 'method', 'path', 'user'];
const lines = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean);
const first = Date.parse(lines[0].slice(0, lines[0].indexOf(' ')));
const base = first - (first % 60000);
const dict = Object.fromEntries(DICT.map(k => [k, []]));
const idx = (k, v) => { let i = dict[k].indexOf(v); if (i < 0) i = dict[k].push(v) - 1; return i; };
const stamp = ms => new Date(ms).toISOString().replace(/\.?0+Z$/, 'Z');

const events = [];
for (const line of lines) {
  const m = line.match(LINE);
  if (!m) throw new Error(`unexpected line: ${line}`);
  const [, ts, host, level, method, p, status, user, rt, bytes, msg] = m;
  const t = Date.parse(ts);
  if (stamp(t) !== ts || msg !== `${method} ${p} completed`) throw new Error(`line would not rebuild: ${line}`);
  if (events.length && t < events[events.length - 9]) throw new Error(`log is not in time order at: ${line}`);
  events.push(t - base, idx('host', host), idx('level', level), idx('method', method), idx('path', p), +status, idx('user', user), +rt, +bytes);
}

const out = `// Every event of lynxdb/testdata/logs/access.log (${lines.length} lines), written by tools/webui-data.mjs.
// One event is nine numbers, oldest first: milliseconds after \`base\`, host, level, method, path, status, user,
// response_time, bytes; host, level, method, path and user index their lists. msg is "<method> <path> completed".
export default ${JSON.stringify({ base: new Date(base).toISOString(), ...dict, events })};
`;
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'webui-data.js');
fs.writeFileSync(dest, out);
console.log(`${dest}: ${lines.length} events, ${out.length} bytes`);
