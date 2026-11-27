import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import domino from '@mixmark-io/domino';
import TurndownService from 'turndown';
import { tables } from 'turndown-plugin-gfm';
import yaml from 'js-yaml';
import { markdownUrl, readableDate, readingTime } from './filters.js';

const markdown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
markdown.use(tables);

// Where a page's Markdown is written (markdownUrl in filters.js gives its address): the home page's
// at /index.md; a page in a folder, /blog/ or /blog/slug/, next to the folder as blog.md or slug.md,
// and as folder/index.md too, the address the first version of these files had.
function markdownPaths(outputPath, root) {
  const folder = dirname(outputPath);
  return folder === root ? [join(root, 'index.md')] : [`${folder}.md`, join(folder, 'index.md')];
}

// Figures drawn in HTML keep their words and numbers and lose the drawing: a figure's title and unit
// become one line, each bar a line "label: value (note)", the caption an italic line under them.
function flattenFigures(document, main) {
  for (const element of main.querySelectorAll('.fig [aria-hidden="true"], .fig-track, .fig-axis, .fig-blocks, .fig-ranges, .fig-share, .fig-arrow')) {
    element.parentNode.removeChild(element);
  }
  // inline parts of a drawn figure sit side by side without spaces; keep them apart as words
  for (const br of main.querySelectorAll('.fig br')) br.parentNode.replaceChild(document.createTextNode(' '), br);
  for (const element of main.querySelectorAll('.fig span, .fig b, .fig strong, .fig em, .fig small, .fig code')) {
    if (element.nextSibling) element.parentNode.insertBefore(document.createTextNode(' '), element.nextSibling);
  }
  for (const head of main.querySelectorAll('.fig-head')) {
    const title = head.querySelector('b, strong');
    const note = Array.from(head.children).filter(child => child !== title).map(child => child.textContent.trim()).filter(Boolean).join(', ');
    const line = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = (title ?? head).textContent.trim();
    line.appendChild(strong);
    if (title && note) line.appendChild(document.createTextNode(` (${note})`));
    head.parentNode.replaceChild(line, head);
  }
  for (const bar of main.querySelectorAll('.fig-bar')) {
    if (bar.closest('summary')) continue;
    const label = bar.querySelector('span')?.textContent.trim() ?? '';
    const value = bar.querySelector('b')?.textContent.trim() ?? '';
    const note = bar.querySelector('small')?.textContent.trim();
    bar.textContent = `${label}: ${value}${note ? ` (${note})` : ''}`;
  }
  // a box is its title and its lines: "Title: line; line"
  for (const box of main.querySelectorAll('.fig-box')) {
    const title = box.querySelector('b, strong');
    const rest = Array.from(box.children).filter(child => child !== title && !child.contains(title))
      .map(child => child.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const line = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = (title ?? box).textContent.replace(/\s+/g, ' ').trim();
    line.appendChild(strong);
    if (title && rest.length) line.appendChild(document.createTextNode(`: ${rest.join('; ')}`));
    box.parentNode.replaceChild(line, box);
  }
  // a flow's row is one line, its parts in reading order; a group frame's label leads its rows
  for (const row of main.querySelectorAll('.fig-flow__row')) {
    const line = document.createElement('p');
    line.textContent = Array.from(row.children).map(child => child.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' → ');
    row.parentNode.replaceChild(line, row);
  }
  for (const label of main.querySelectorAll('.fig-frame__label')) {
    const line = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = label.textContent.replace(/\s+/g, ' ').trim();
    line.appendChild(strong);
    label.parentNode.replaceChild(line, label);
  }
  // the bars are a list, not a sequence
  for (const ordered of main.querySelectorAll('.fig ol')) {
    const list = document.createElement('ul');
    while (ordered.firstChild) list.appendChild(ordered.firstChild);
    ordered.parentNode.replaceChild(list, ordered);
  }
  for (const caption of main.querySelectorAll('figure.fig > figcaption')) {
    const line = document.createElement('p');
    const em = document.createElement('em');
    while (caption.firstChild) em.appendChild(caption.firstChild);
    line.appendChild(em);
    caption.parentNode.replaceChild(line, caption);
  }
}

function readPage(html, outputPath, root) {
  const document = domino.createDocument(html);
  const canonical = document.querySelector('link[rel="canonical"]').getAttribute('href');
  const title = document.querySelector('meta[property="og:title"]').getAttribute('content');
  const description = document.querySelector('meta[name="description"]').getAttribute('content');
  const main = document.querySelector('main');

  // Keep the editorial content and examples. Drop controls, repeated navigation and the Web UI tour.
  for (const element of main.querySelectorAll('script, style, button, svg, nav, .hero__window, #server .app, .post__rail, .toc, .more, .post__end, img[data-theme-image="dark"], img[alt=""]')) {
    element.parentNode.removeChild(element);
  }
  for (const visual of main.querySelectorAll('.eg__ui[aria-label], .ig[aria-label]')) {
    const summary = document.createElement('p');
    summary.textContent = visual.getAttribute('aria-label');
    visual.parentNode.replaceChild(summary, visual);
  }
  flattenFigures(document, main);
  for (const callout of main.querySelectorAll('aside.callout')) {
    const quote = document.createElement('blockquote');
    const label = callout.querySelector('.callout__label');
    const body = callout.querySelector('.callout__body') ?? callout;
    if (label) {
      const line = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = label.textContent.trim();
      line.appendChild(strong);
      quote.appendChild(line);
      if (body !== callout) label.parentNode.removeChild(label);
    }
    while (body.firstChild) quote.appendChild(body.firstChild);
    callout.parentNode.replaceChild(quote, callout);
  }
  for (const separator of main.querySelectorAll('.post-meta__sep')) {
    separator.parentNode.replaceChild(document.createTextNode(' · '), separator);
  }
  for (const element of main.querySelectorAll('.pill__more, .btn-row a + a, .ingest__list small, .get__meta a')) {
    element.parentNode.insertBefore(document.createTextNode(' '), element);
  }
  for (const card of main.querySelectorAll('a.next__card')) {
    const heading = card.querySelector('h3');
    const link = document.createElement('a');
    link.href = card.getAttribute('href');
    link.textContent = heading.textContent;
    heading.textContent = '';
    heading.appendChild(link);
    const block = document.createElement('div');
    while (card.firstChild) block.appendChild(card.firstChild);
    card.parentNode.replaceChild(block, card);
  }
  for (const command of main.querySelectorAll('.cmd > code')) {
    const pre = document.createElement('pre');
    command.className = 'language-shell';
    command.parentNode.replaceChild(pre, command);
    pre.appendChild(command);
  }
  for (const pre of Array.from(main.querySelectorAll('pre'))) {
    if (pre.firstElementChild?.tagName === 'CODE') continue;
    const code = document.createElement('code');
    code.className = 'language-console';
    code.textContent = pre.textContent;
    pre.textContent = '';
    pre.appendChild(code);
  }
  for (const element of main.querySelectorAll('a[href], img[src]')) {
    const attribute = element.tagName === 'A' ? 'href' : 'src';
    element.setAttribute(attribute, new URL(element.getAttribute(attribute), canonical).href);
  }
  const content = markdown.turndown(main);
  return {
    title,
    description,
    canonical,
    markdownUrl: markdownUrl(canonical),
    markdownPaths: markdownPaths(outputPath, root),
    content,
  };
}

// A post's Markdown is its source, which the page was built from: the front matter becomes a title,
// a byline and the excerpt; figures drawn in HTML become text as above; scripts and the dark copies
// of pictures go; links and pictures get absolute addresses, outside code blocks.
function figureMarkdown(html, canonical) {
  const document = domino.createDocument(`<main>${html}</main>`);
  const main = document.querySelector('main');
  flattenFigures(document, main);
  for (const element of main.querySelectorAll('button, script, style, svg')) element.parentNode.removeChild(element);
  for (const element of main.querySelectorAll('a[href], img[src]')) {
    const attribute = element.tagName === 'A' ? 'href' : 'src';
    element.setAttribute(attribute, new URL(element.getAttribute(attribute), canonical).href);
  }
  return markdown.turndown(main);
}

const absoluteLinks = (line, canonical) =>
  line.replace(/(\]\()([^)\s]+)(\))/g, (all, open, url, close) =>
    /^(#|[a-z][a-z0-9+.-]*:)/i.test(url) ? all : open + new URL(url, canonical).href + close);

async function postMarkdown(inputPath, page) {
  const source = await readFile(inputPath, 'utf8');
  const [, front, body] = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const data = yaml.load(front);
  const [year, month, day] = inputPath.split('/').pop().slice(0, 10).split('-').map(Number);
  const byline = [(data.authors ?? []).join(', '), readableDate(new Date(Date.UTC(year, month - 1, day))), readingTime(source)];
  let fence = null;
  const lines = body
    .replace(/<script\b[\s\S]*?<\/script>[ \t]*\n?/g, '')
    .replace(/^<figure\b[\s\S]*?<\/figure>[ \t]*$/gm, html => figureMarkdown(html, page.canonical))
    .split('\n')
    .filter(line => !/^!\[[^\]]*\]\([^)]*-dark\.[a-z]+\)\s*$/.test(line))
    .map(line => line.replace(/^> (Note|Tip|Warning) /, '> **$1:** '))
    .map(line => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
      if (marker && (!fence || marker.startsWith(fence))) {
        fence = fence ? null : marker;
        return line;
      }
      return fence ? line : absoluteLinks(line, page.canonical);
    });
  return [`# ${data.title}`, '', byline.filter(Boolean).join(' · '), '', data.excerpt ?? '', '', lines.join('\n').trim()]
    .join('\n').replace(/\n{3,}/g, '\n\n');
}

const xmlText = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const linkLabel = text => text.replace(/[\\\[\]]/g, char => '\\' + char);
const markdownLink = (title, url) => `[${linkLabel(title)}](${url})`;
const pageLink = page => `- ${markdownLink(page.title, page.markdownUrl)}: ${page.description}`;

export async function writeDiscovery({ directories, results, outputMode, incremental }) {
  if (outputMode !== 'fs' || incremental) return;
  const output = dirname(directories.output);
  const home = readPage(await readFile(new URL('../../index.html', import.meta.url), 'utf8'), join(output, 'index.html'), output);
  const blogResult = results.find(result => result.url === '/' && result.inputPath.endsWith('/index.njk'));
  const blog = readPage(blogResult.content, blogResult.outputPath, output);
  const postResults = results
    .filter(result => result.url && result.inputPath.includes('/_posts/') && result.inputPath.endsWith('.md'))
    .sort((a, b) => b.inputPath.localeCompare(a.inputPath))
    .map(result => ({ result, page: readPage(result.content, result.outputPath, output) }));
  const posts = await Promise.all(postResults.map(async ({ result, page }) =>
    ({ ...page, content: await postMarkdown(result.inputPath, page) })));
  const pages = [home, blog, ...posts];
  const entry = (title, url, description) => `- ${markdownLink(title, url)}: ${description}`;
  const index = [
    '# LynxDB',
    '',
    `> ${home.description}`,
    '',
    '## Website',
    '',
    pageLink(home),
    pageLink(blog),
    '',
    '## Documentation and source',
    '',
    entry('Documentation', 'https://docs.lynxdb.org/', 'LynxDB reference and guides.'),
    entry('Quick start', 'https://docs.lynxdb.org/docs/getting-started/quickstart/', 'Run a local query or start a server.'),
    entry('PPL reference', 'https://docs.lynxdb.org/docs/ppl/overview/', 'Piped Processing Language syntax and examples.'),
    entry('Source code', 'https://github.com/lynxbase/lynxdb', 'LynxDB source and release history.'),
    ...(posts.length ? ['', '## Blog posts', '', ...posts.map(pageLink)] : []),
    '',
    '## Optional',
    '',
    entry('Full website and blog text', new URL('llms-full.txt', home.canonical).href, 'The home page, blog index and published posts in one Markdown file.'),
    entry('Blog feed', new URL('feed.xml', blog.canonical).href, 'Atom feed of published posts.'),
    '',
  ].join('\n');
  const full = [
    '# LynxDB website and blog',
    '',
    `> ${home.description}`,
    '',
    'The documentation is published separately at https://docs.lynxdb.org/.',
    '',
    ...pages.map(page => `---\n\nSource: ${page.canonical}\n\n${page.content}\n\n`),
  ].join('\n').trimEnd() + '\n';
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map(page => `  <url><loc>${xmlText(page.canonical)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');

  await Promise.all([
    ...pages.flatMap(page => page.markdownPaths.map(path => writeFile(path, `Source: ${page.canonical}\n\n${page.content}\n`))),
    writeFile(join(output, 'sitemap.xml'), sitemap),
    writeFile(join(output, 'llms.txt'), index),
    writeFile(join(output, 'llms-full.txt'), full),
    writeFile(join(output, 'llmfull.txt'), full),
  ]);
}
