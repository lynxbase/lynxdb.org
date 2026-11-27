// node --test worker/ (mise run test): who gets Markdown, and what the Worker answers them
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { markdownPath } from './index.js';
import { agentOf, markdownReason } from './agents.js';

const UA = {
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
  applebot: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
  preview: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  slack: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  traefik: 'Traefik health check',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  chatgptUser: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  claudeUser: 'Claude-User (claude-code/2.0.14; +https://support.anthropic.com/)',
  perplexity: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  meta: 'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
};

test('AI agents are named, browsers, search engines and link previews are not', () => {
  assert.equal(agentOf(UA.gptbot), 'GPTBot');
  assert.equal(agentOf(UA.chatgptUser), 'ChatGPT-User');
  assert.equal(agentOf(UA.claudeUser), 'Claude-User');
  assert.equal(agentOf(UA.perplexity), 'PerplexityBot');
  assert.equal(agentOf(UA.meta), 'meta-externalagent');
  for (const name of ['chrome', 'googlebot', 'bingbot', 'applebot', 'preview', 'slack', 'traefik']) {
    assert.equal(agentOf(UA[name]), null, name);
  }
  assert.equal(agentOf(''), null);
  assert.equal(agentOf(undefined), null);
});

const ask = (headers = {}, cf) => Object.assign(new Request('https://lynxdb.org/blog/', { headers }), cf ? { cf } : {});

test('an Accept header that ranks Markdown first asks for it', () => {
  assert.equal(markdownReason(ask({ accept: 'text/markdown' })), 'accept');
  assert.equal(markdownReason(ask({ accept: 'text/markdown, text/html;q=0.9' })), 'accept');
  assert.equal(markdownReason(ask({ accept: 'text/html, text/markdown;q=0.5' })), null);
  assert.equal(markdownReason(ask({ accept: 'text/markdown;q=0' })), null);
  assert.equal(markdownReason(ask({ accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'user-agent': UA.chrome })), null);
  assert.equal(markdownReason(ask({ 'user-agent': UA.chrome }, { verifiedBotCategory: 'AI Crawler' })), 'verified');
  assert.equal(markdownReason(ask({ 'user-agent': UA.googlebot }, { verifiedBotCategory: 'Search Engine Crawler' })), null);
});

test('blog pages map to their Markdown copies, files and other pages do not', () => {
  assert.equal(markdownPath('/blog'), '/blog.md');
  assert.equal(markdownPath('/blog/'), '/blog.md');
  assert.equal(markdownPath('/blog/lynxdb-on-jsonbench/'), '/blog/lynxdb-on-jsonbench.md');
  assert.equal(markdownPath('/blog/lynxdb-on-jsonbench'), '/blog/lynxdb-on-jsonbench.md');
  for (const path of ['/', '/blog/feed.xml', '/blog/lynxdb-on-jsonbench.md', '/blog/lynxdb-on-jsonbench/thumb.png', '/blog/a/b/']) {
    assert.equal(markdownPath(path), null, path);
  }
});

// the assets: every blog page and its Markdown copy, the rest 404
const FILES = {
  '/blog/': ['<!doctype html><title>Blog</title>', 'text/html'],
  '/blog.md': ['# LynxDB blog', 'text/markdown'],
  '/blog/lynxdb-on-jsonbench/': ['<!doctype html><title>Post</title>', 'text/html'],
  '/blog/lynxdb-on-jsonbench.md': ['# Fourteen blocks of 61,246', 'text/markdown'],
  '/blog/feed.xml': ['<feed/>', 'application/xml'],
  '/blog/no-copy/': ['<!doctype html><title>No copy</title>', 'text/html'],
};
const env = {
  ASSETS: {
    fetch: async request => {
      const file = FILES[new URL(request.url).pathname];
      return file ? new Response(file[0], { headers: { 'content-type': file[1] } }) : new Response('not found', { status: 404 });
    },
  },
};
const get = (path, headers) => worker.fetch(new Request(`https://lynxdb.org${path}`, { headers }), env);

test('an AI agent reads a blog page as Markdown at the page address', async () => {
  const response = await get('/blog/lynxdb-on-jsonbench/', { 'user-agent': UA.gptbot });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(response.headers.get('vary'), 'Accept, User-Agent');
  assert.equal(response.headers.get('link'), '<https://lynxdb.org/blog/lynxdb-on-jsonbench/>; rel="canonical"');
  assert.equal(await response.text(), '# Fourteen blocks of 61,246');

  const list = await get('/blog/', { 'user-agent': UA.claudeUser });
  assert.equal(await list.text(), '# LynxDB blog');
  assert.equal(list.headers.get('link'), '<https://lynxdb.org/blog/>; rel="canonical"');
});

test('browsers and search engines read the HTML, which varies on the same headers', async () => {
  for (const ua of [UA.chrome, UA.googlebot, UA.bingbot]) {
    const response = await get('/blog/lynxdb-on-jsonbench/', { 'user-agent': ua });
    assert.equal(response.headers.get('content-type'), 'text/html');
    assert.equal(response.headers.get('vary'), 'Accept, User-Agent');
  }
});

test('files, pages without a copy and other methods pass through untouched', async () => {
  const feed = await get('/blog/feed.xml', { 'user-agent': UA.gptbot });
  assert.equal(feed.headers.get('content-type'), 'application/xml');
  assert.equal(feed.headers.get('vary'), null);
  const noCopy = await get('/blog/no-copy/', { 'user-agent': UA.gptbot });
  assert.equal(await noCopy.text(), '<!doctype html><title>No copy</title>');
  const post = await worker.fetch(new Request('https://lynxdb.org/blog/', { method: 'POST', headers: { 'user-agent': UA.gptbot } }), env);
  assert.equal(post.headers.get('content-type'), 'text/html');
});
