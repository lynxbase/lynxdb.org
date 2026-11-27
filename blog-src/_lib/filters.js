// Template filters. Every link a page writes is relative, so the built site works from any host
// path and the pages reach the landing's files (site.css, theme.js, fonts, img) one level up.

const depth = url => url.split('/').filter(Boolean).length;

// from a page's URL inside the blog to the site root (the landing) and to the blog's own root
export const toSite = url => '../'.repeat(depth(url) + 1);
export const toBlog = url => '../'.repeat(depth(url)) || './';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const readableDate = d => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
export const isoDate = d => d.toISOString().slice(0, 10);

// prose at 200 words a minute, counted in the post's Markdown; code blocks are left out of the count,
// as DuckDB's filter does
export function readingTime(markdown) {
  const prose = markdown
    .replace(/^---\n[\s\S]*?\n---\n/, ' ')
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\]\([^)]*\)/g, ' ')
    .replace(/[#>*_`|[\]-]+/g, ' ');
  const words = prose.split(/\s+/).filter(w => /\w/.test(w)).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

// the post's h2 and h3 headings (the ones markdown-it-anchor linked) as a nested list
export function toc(html) {
  const items = [];
  for (const m of html.matchAll(/<h([23]) id="([^"]+)"[^>]*>\s*<a class="heading-link"[^>]*>([\s\S]*?)<\/a>\s*<\/h\1>/g)) {
    // an h3 before the first h2 stands at the top level
    const level = +m[1] === 3 && !items.some(it => it.level === 2) ? 2 : +m[1];
    items.push({ level, id: m[2], text: m[3].replace(/<[^>]+>/g, '').trim() });
  }
  if (items.length < 2) return '';
  let out = '<ol class="toc__list">';
  items.forEach((it, i) => {
    out += `<li><a href="#${it.id}">${it.text}</a>`;
    const next = items[i + 1];
    if (next?.level > it.level) out += '<ol>';
    else out += '</li>';
    if (it.level === 3 && (!next || next.level < 3)) out += '</ol></li>';
  });
  return out + '</ol>';
}

// feed readers show every image and ignore the page's theme: keep the light variant only
export const feedHtml = html => html.replace(/<img\b[^>]*data-theme-image="dark"[^>]*>/g, '');

export const others = (posts, url) => posts.filter(p => p.url !== url).slice(0, 3);
