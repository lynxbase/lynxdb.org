import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import domino from '@mixmark-io/domino';
import TurndownService from 'turndown';
import { tables } from 'turndown-plugin-gfm';

const markdown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
markdown.use(tables);

function readPage(html, outputPath) {
  const document = domino.createDocument(html);
  const canonical = document.querySelector('link[rel="canonical"]').getAttribute('href');
  const alternate = document.querySelector('link[rel="alternate"][type="text/markdown"]').getAttribute('href');
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
    markdownUrl: new URL(alternate, canonical).href,
    markdownPath: join(dirname(outputPath), 'index.md'),
    content,
  };
}

const xmlText = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const linkLabel = text => text.replace(/[\\\[\]]/g, char => '\\' + char);
const markdownLink = (title, url) => `[${linkLabel(title)}](${url})`;
const pageLink = page => `- ${markdownLink(page.title, page.markdownUrl)}: ${page.description}`;

export async function writeDiscovery({ directories, results, outputMode, incremental }) {
  if (outputMode !== 'fs' || incremental) return;
  const output = dirname(directories.output);
  const home = readPage(await readFile(new URL('../../index.html', import.meta.url), 'utf8'), join(output, 'index.html'));
  const blogResult = results.find(result => result.url === '/' && result.inputPath.endsWith('/index.njk'));
  const blog = readPage(blogResult.content, blogResult.outputPath);
  const posts = results
    .filter(result => result.url && result.inputPath.includes('/_posts/') && result.inputPath.endsWith('.md'))
    .sort((a, b) => b.inputPath.localeCompare(a.inputPath))
    .map(result => readPage(result.content, result.outputPath));
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
    ...pages.map(page => writeFile(page.markdownPath, `Source: ${page.canonical}\n\n${page.content}\n`)),
    writeFile(join(output, 'sitemap.xml'), sitemap),
    writeFile(join(output, 'llms.txt'), index),
    writeFile(join(output, 'llms-full.txt'), full),
    writeFile(join(output, 'llmfull.txt'), full),
  ]);
}
