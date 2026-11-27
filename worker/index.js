/*
  The Worker in front of lynxdb.org's static assets. It runs only for the pages that have a Markdown
  copy, the home page and the blog (run_worker_first in wrangler.jsonc); every other address is
  served from the assets without it.

  A page asked for by an AI agent (agents.js) is answered with its Markdown copy at the same address:
  / with /index.md, /blog/ with /blog.md, /blog/slug/ with /blog/slug.md. Everyone else, search
  engines included, gets the HTML, whose Link header names the copy and llms.txt. Both answers vary on
  Accept and User-Agent, and the Markdown names the HTML page as canonical, so caches and indexes
  keep the two apart.
*/
import { markdownReason } from './agents.js';

const SITE = 'https://lynxdb.org';

// the page an address shows and its Markdown copy; null for files and for pages without a copy
export function pageOf(pathname) {
  if (pathname === '/') return { page: '/', markdown: '/index.md' };
  if (pathname === '/blog' || pathname === '/blog/') return { page: '/blog/', markdown: '/blog.md' };
  const post = pathname.match(/^\/blog\/([a-z0-9-]+)\/?$/);
  return post ? { page: `/blog/${post[1]}/`, markdown: `/blog/${post[1]}.md` } : null;
}

const VARY = 'Accept, User-Agent';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const page = pageOf(url.pathname);
    const reason = page && (request.method === 'GET' || request.method === 'HEAD') ? markdownReason(request) : null;

    if (reason) {
      const markdown = await env.ASSETS.fetch(new Request(new URL(page.markdown, url), { method: request.method }));
      if (markdown.ok) {
        const response = new Response(markdown.body, markdown);
        response.headers.set('Content-Type', 'text/markdown; charset=utf-8');
        response.headers.set('Vary', VARY);
        response.headers.set('Link', `<${SITE}${page.page}>; rel="canonical"`);
        console.log(JSON.stringify({ markdown: url.pathname, reason }));
        return response;
      }
    }

    const asset = await env.ASSETS.fetch(request);
    if (!page) return asset;
    const response = new Response(asset.body, asset);
    response.headers.set('Vary', VARY);
    if (asset.status === 200) {
      response.headers.set('Link', `<${SITE}${page.markdown}>; rel="alternate"; type="text/markdown", <${SITE}/llms.txt>; rel="describedby"`);
    }
    return response;
  },
};
