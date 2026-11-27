// The Markdown a post is written in, rendered to the blog's HTML at build time. On top of CommonMark
// with tables (markdown-it): heading anchors, footnotes, Note/Tip/Warning callouts, quotes with an
// attribution line, figures with captions, scrollable tables and code highlighted by Prism, so no
// highlighter runs in the browser. blog-src/README.md shows each form as an author writes it.
import fs from 'node:fs';
import path from 'node:path';
import markdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItFootnote from 'markdown-it-footnote';
import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';

loadLanguages(['bash', 'json', 'yaml', 'sql', 'go', 'python']);

// PPL as LynxDB runs it: commands, functions before an opening parenthesis, strings, numbers with
// an optional time unit, and the pipe
Prism.languages.ppl = {
  string: { pattern: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, greedy: true },
  function: /\b[a-z_][a-z0-9_]*(?=\()/i,
  keyword: /\b(?:source|search|where|fields|stats|eventstats|streamstats|eval|sort|head|tail|top|rare|dedup|rename|timechart|chart|bin|span|by|as|and|or|not|in|like|parse|grok|rex|lookup|join|append|fillnull|table|desc|asc)\b/i,
  number: /\b\d+(?:\.\d+)?(?:ms|s|m|h|d|w)?\b/,
  pipe: /\|/,
  operator: /[<>!=]=?|[-+*/%]/,
  punctuation: /[(),]/,
};

const TERMINAL = new Set(['console', 'shell', 'sh', 'bash']);
const CALLOUTS = { Note: 'note', Tip: 'tip', Warning: 'warning' };

export const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------------ terminals
// A console block is a session: lines starting with "$ " are commands (a trailing backslash carries
// the command to the next line), the rest is what the command printed. The output keeps the CLI's
// own colours: box rules and the row count dim, the header row bold, numbers in the number colour.
function shellLine(cmd) {
  // a single-quoted argument of lynxdb is PPL; other quoted text is a string, the program names bright
  const isLynx = /\blynxdb\b/.test(cmd);
  return cmd.split(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/).map((part, i) => {
    if (i % 2) return isLynx && part[0] === "'"
      ? `<span class="t-q">'${Prism.highlight(part.slice(1, -1), Prism.languages.ppl, 'ppl')}'</span>`
      : `<span class="t-s">${esc(part)}</span>`;
    return esc(part).replace(/(^\s*|\|\s*)(lynxdb|cat|curl|brew|docker|go|head|tail|grep|jq)\b/g, '$1<span class="t-c">$2</span>');
  }).join('');
}

function outputLine(line, state) {
  // a result table is set in its own box with a tighter line, so its rules join (blog.css .t-table)
  if (/^\s*[┌├└]/.test(line)) {
    const edge = line.trim()[0];
    if (edge === '┌') state.header = true;
    return `${edge === '┌' ? '<span class="t-table">' : ''}<span class="t-d">${esc(line)}</span>${edge === '└' ? '</span>' : ''}`;
  }
  if (/^\s*│/.test(line)) {
    const header = state.header;
    state.header = false;
    return line.split('│').map((cell, i, all) => {
      if (i === 0 || i === all.length - 1) return esc(cell);
      if (header) return `<b>${esc(cell)}</b>`;
      return /^\s*-?[\d,]+(?:\.\d+)?\s*$/.test(cell) ? `<span class="t-n">${esc(cell)}</span>` : esc(cell);
    }).join('<span class="t-d">│</span>');
  }
  if (/^\(\d[\d,]* rows?\)$/.test(line.trim()) || /^─+$/.test(line.trim())) return `<span class="t-d">${esc(line)}</span>`;
  // the statistics footer: a dim label and a bold value
  const stat = /^(\s+)(Rows|Took|Scanned)(\s+)(\S.*)$/.exec(line);
  if (stat) return `${stat[1]}<span class="t-d">${stat[2]}</span>${stat[3]}<b>${esc(stat[4])}</b>`;
  return esc(line);
}

function terminal(code, lang) {
  if (lang !== 'console') {
    return Prism.highlight(code, Prism.languages.bash, 'bash');
  }
  const state = { header: false };
  const lines = code.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const prompt = /^\$ (.*)$/.exec(lines[i]);
    if (!prompt) { out.push(outputLine(lines[i], state)); continue; }
    // the command and the lines it continues onto, highlighted as one so a quoted query can span them
    const cmd = [prompt[1]];
    while (/\\$/.test(cmd[cmd.length - 1]) && i + 1 < lines.length) cmd.push(lines[++i]);
    out.push(`<span class="t-p">$</span> <span class="t-cmd">${shellLine(cmd.join('\n'))}</span>`);
  }
  return out.join('\n');
}

function fence(tokens, idx) {
  const info = tokens[idx].info.trim().split(/\s+/)[0].toLowerCase();
  const lang = info || 'text';
  const code = tokens[idx].content.replace(/\n$/, '');
  const dark = TERMINAL.has(lang);
  const body = dark ? terminal(code, lang)
    : Prism.languages[lang] ? Prism.highlight(code, Prism.languages[lang], lang) : esc(code);
  const dots = dark ? '<svg class="code__dots" viewBox="0 0 46 10" aria-hidden="true"><circle cx="5" cy="5" r="5"/><circle cx="23" cy="5" r="5"/><circle cx="41" cy="5" r="5"/></svg>' : '';
  return `<figure class="code${dark ? ' code--term' : ''}" data-lang="${esc(lang)}">`
    + `<div class="code__bar">${dots}</div>`
    + `<pre class="code__pre" tabindex="0"><code class="language-${esc(lang)}">${body}</code></pre></figure>\n`;
}

// ------------------------------------------------------------------ callouts and quotes
// > Note|Tip|Warning text   becomes an aside with that label (DuckDB writes its boxes the same way).
// > text
// >
// > — who said it           becomes a figure: the quote and its attribution as the caption.
function closeOf(tokens, i) {
  for (let j = i + 1, depth = 0; j < tokens.length; j++) {
    if (tokens[j].type === 'blockquote_open') depth++;
    if (tokens[j].type === 'blockquote_close') { if (depth === 0) return j; depth--; }
  }
  return -1;
}

function asides(state) {
  const t = state.tokens;
  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'blockquote_open') continue;
    const end = closeOf(t, i);
    const first = t[i + 2];
    const word = first?.type === 'inline' && /^(Note|Tip|Warning)(?=\s|$)\s*/.exec(first.content);
    if (word) {
      t[i].meta = t[end].meta = { callout: CALLOUTS[word[1]], label: word[1] };
      first.content = first.content.slice(word[0].length);
      if (!first.content.trim()) t.splice(i + 1, 3);
      continue;
    }
    // the attribution: the quote's last paragraph, when it starts with an em dash, an en dash or --
    const last = t[end - 2];
    const dash = last?.type === 'inline' && end - 3 > i + 1 && /^(?:—|–|--)\s*/.exec(last.content);
    if (dash) {
      t[i].meta = t[end].meta = { quote: true };
      last.content = last.content.slice(dash[0].length);
      t[end - 3].meta = t[end - 1].meta = { attribution: true };
    }
  }
}

// ------------------------------------------------------------------ figures
// A paragraph that holds only an image, optionally its dark variant (the same name ending in -dark)
// and a caption in emphasis on the next line, becomes a figure:
//   ![Server errors per minute](errors-per-minute.svg)
//   ![Server errors per minute](errors-per-minute-dark.svg)
//   *Server errors per minute in access.log.*
function imageSize(file) {
  try {
    const buf = fs.readFileSync(file);
    if (buf.slice(1, 4).toString() === 'PNG') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    const root = /<svg\b[^>]*>/.exec(buf.toString('utf8', 0, 2000))?.[0] || '';
    const w = /\swidth="(\d+)"/.exec(root), h = /\sheight="(\d+)"/.exec(root);
    if (w && h) return [+w[1], +h[1]];
    const vb = /\sviewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/.exec(root);
    if (vb) return [+vb[1], +vb[2]];
  } catch { /* a remote image or a missing file: no size, the browser measures it */ }
  return null;
}

function figures(state) {
  const t = state.tokens;
  const dir = state.env?.page?.inputPath ? path.join(path.dirname(state.env.page.inputPath), state.env.page.fileSlug) : null;
  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'paragraph_open' || t[i + 1]?.type !== 'inline') continue;
    const kids = t[i + 1].children;
    const blank = k => k.type === 'softbreak' || (k.type === 'text' && !k.content.trim());
    const images = [];
    let p = 0;
    for (; p < kids.length; p++) {
      if (kids[p].type === 'image') images.push(kids[p]);
      else if (!blank(kids[p])) break;
    }
    if (!images.length || images.length > 2) continue;
    let q = kids.length - 1;
    while (q >= p && blank(kids[q])) q--;
    let caption = [];
    if (p <= q) {
      if (kids[p].type !== 'em_open' || kids[q].type !== 'em_close') continue;
      caption = kids.slice(p + 1, q);
    }
    const themed = images.length === 2 && /-dark\.\w+$/.test(images[1].attrGet('src'));
    if (images.length === 2 && !themed) continue;
    images.forEach((img, n) => {
      const src = img.attrGet('src');
      const size = dir && !/^[a-z]+:|^\//i.test(src) ? imageSize(path.join(dir, src)) : null;
      if (size) { img.attrSet('width', String(size[0])); img.attrSet('height', String(size[1])); }
      img.attrSet('loading', 'lazy');
      img.attrSet('decoding', 'async');
      if (themed) img.attrSet('data-theme-image', n ? 'dark' : 'light');
    });
    t[i].meta = t[i + 2].meta = { figure: true };
    const html = content => Object.assign(new state.Token('html_inline', '', 0), { content });
    const media = [html('<span class="figure__media">'), ...images, html('</span>')];
    t[i + 1].children = caption.length ? [...media, html('<figcaption>'), ...caption, html('</figcaption>')] : media;
  }
}

// ------------------------------------------------------------------ the renderer
export function createMarkdown() {
  const md = markdownIt({ html: true, linkify: false, typographer: false });

  md.use(markdownItAnchor, {
    level: [2, 3],
    slugify,
    permalink: markdownItAnchor.permalink.headerLink({ class: 'heading-link' }),
  });
  md.use(markdownItFootnote);
  md.core.ruler.after('block', 'blog_asides', asides);
  md.core.ruler.push('blog_figures', figures);

  const r = md.renderer.rules;
  r.fence = fence;
  r.code_block = (tokens, idx) => fence([{ info: 'text', content: tokens[idx].content }], 0);

  r.blockquote_open = (tk, i, o, e, self) => {
    const m = tk[i].meta;
    if (m?.callout) return `<aside class="callout callout--${m.callout}"><p class="callout__label">${m.label}</p><div class="callout__body">\n`;
    if (m?.quote) return '<figure class="pull-quote"><blockquote>\n';
    return self.renderToken(tk, i, o);
  };
  r.blockquote_close = (tk, i, o, e, self) => {
    const m = tk[i].meta;
    if (m?.callout) return '</div></aside>\n';
    if (m?.quote) return '</figure>\n';
    return self.renderToken(tk, i, o);
  };
  r.paragraph_open = (tk, i, o, e, self) => {
    if (tk[i].meta?.figure) return '<figure class="figure">';
    if (tk[i].meta?.attribution) return '</blockquote>\n<figcaption class="pull-quote__by">';
    return self.renderToken(tk, i, o);
  };
  r.paragraph_close = (tk, i, o, e, self) => {
    if (tk[i].meta?.figure) return '</figure>\n';
    if (tk[i].meta?.attribution) return '</figcaption>\n';
    return self.renderToken(tk, i, o);
  };

  // short inline code stays on one line (a flag such as -F never breaks at its hyphen); long paths may wrap
  r.code_inline = (tk, i) => `<code${tk[i].content.length <= 24 ? ' class="nowrap"' : ''}>${esc(tk[i].content)}</code>`;
  r.table_open = () => '<div class="table-wrap"><table>\n';
  r.table_close = () => '</table></div>\n';

  // footnotes: plain numbers (no brackets), a Notes heading, and a drawn arrow back to the text
  r.footnote_caption = (tk, i) => String(tk[i].meta.id + 1) + (tk[i].meta.subId > 0 ? `:${tk[i].meta.subId}` : '');
  r.footnote_ref = (tk, i, o, env, self) => {
    const id = self.rules.footnote_anchor_name(tk, i, o, env, self);
    const n = self.rules.footnote_caption(tk, i, o, env, self);
    const ref = tk[i].meta.subId > 0 ? `${id}:${tk[i].meta.subId}` : id;
    return `<sup class="fn-ref"><a href="#fn${id}" id="fnref${ref}" aria-describedby="notes-title">${n}</a></sup>`;
  };
  r.footnote_block_open = () => '<section class="footnotes" aria-labelledby="notes-title">\n<h2 class="footnotes__title" id="notes-title">Notes</h2>\n<ol class="footnotes__list">\n';
  r.footnote_block_close = () => '</ol>\n</section>\n';
  r.footnote_anchor = (tk, i, o, env, self) => {
    let id = self.rules.footnote_anchor_name(tk, i, o, env, self);
    if (tk[i].meta.subId > 0) id += `:${tk[i].meta.subId}`;
    return ` <a href="#fnref${id}" class="fn-back" aria-label="Back to the text"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2.5M2.5 6 6 2.5 9.5 6"/></svg></a>`;
  };
  return md;
}
