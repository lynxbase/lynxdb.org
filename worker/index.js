/*
  The Worker in front of lynxdb.org's static assets. It runs only for the blog (run_worker_first in
  wrangler.jsonc); every other address is served from the assets without it.

  A blog page asked for by an AI agent (agents.js) is answered with the page's Markdown copy at the
  same address: /blog/ with /blog.md, /blog/slug/ with /blog/slug.md. Everyone else, search engines
  included, gets the HTML. Both answers vary on Accept and User-Agent, and the Markdown names the
  HTML page as canonical, so caches and indexes keep the two apart.
*/
import { markdownReason } from './agents.js';

// the Markdown copy of a blog page: /blog or /blog/ and /blog/slug or /blog/slug/; null for files
export function markdownPath(pathname) {
  if (pathname === '/blog' || pathname === '/blog/') return '/blog.md';
  const page = pathname.match(/^\/blog\/([a-z0-9-]+)\/?$/);
  return page ? `/blog/${page[1]}.md` : null;
}

const VARY = 'Accept, User-Agent';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const copy = markdownPath(url.pathname);
    const reason = copy && (request.method === 'GET' || request.method === 'HEAD') ? markdownReason(request) : null;

    if (reason) {
      const markdown = await env.ASSETS.fetch(new Request(new URL(copy, url), { method: request.method }));
      if (markdown.ok) {
        const page = new URL(copy === '/blog.md' ? '/blog/' : copy.replace(/\.md$/, '/'), url);
        const response = new Response(markdown.body, markdown);
        response.headers.set('Content-Type', 'text/markdown; charset=utf-8');
        response.headers.set('Vary', VARY);
        response.headers.set('Link', `<https://lynxdb.org${page.pathname}>; rel="canonical"`);
        console.log(JSON.stringify({ markdown: url.pathname, reason }));
        return response;
      }
    }

    const asset = await env.ASSETS.fetch(request);
    if (!copy) return asset;
    const response = new Response(asset.body, asset);
    response.headers.set('Vary', VARY);
    return response;
  },
};
