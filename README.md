# lynxdb.org

The LynxDB website: one static page at the repository root (`index.html`, `site.css` and a few ES
modules) and a [Markdown blog](blog-src/README.md). `assets/` holds the page's layout and motion kit.

The tools and tasks are in `mise.toml` ([mise](https://mise.jdx.dev); Node is pinned in `mise.lock`):

```sh
mise run build    # the blog into blog/, sitemap.xml, llms.txt, llms-full.txt (also llmfull.txt), Markdown pages
mise run serve    # the site on http://127.0.0.1:8765, over HTTP: the page's modules do not run from file://
mise run watch    # rebuild the blog on every save
mise run check    # build HEAD in a temporary worktree and fail if its committed output is stale
mise run hooks    # run that check on every commit this clone pushes (.githooks/pre-push)
```

Run `mise run build` after changing pages or posts and commit the generated files with the source
changes: the host serves the repository as it is, with no build step.

Every page has a Markdown copy next to its address, for agents and readers that want the text:
`/blog/slug/` at `/blog/slug.md`, `/blog/` at `/blog.md` and the home page at `/index.md`. A post's
copy is its own Markdown source, with its figures turned into text; the home page and the list of
posts are converted from their HTML. Each page links its copy with
`<link rel="alternate" type="text/markdown">`, `llms.txt` lists them, and `_headers` has Cloudflare
serve them as UTF-8 `text/markdown`, as `mise run serve` does. The sitemap covers
`lynxdb.org`; documentation has its own [sitemap](https://docs.lynxdb.org/sitemap.xml).

## AI agents read the blog as Markdown

A blog page asked for by an AI agent is answered with its Markdown copy at the page's own address:
`/blog/` with `/blog.md`, `/blog/slug/` with `/blog/slug.md`. A browser, a search engine (Googlebot,
Bingbot, Applebot) and a link preview get the HTML, as before. The Worker's script
(`worker/index.js`) runs for `/blog` and `/blog/*` only; every other address is served from the
assets without it.

A request gets Markdown when any of these holds (`worker/agents.js`):

- its `Accept` header ranks `text/markdown` at least as high as `text/html`;
- Cloudflare has verified it as a bot of the AI Crawler, AI Assistant or AI Search category;
- its `User-Agent` names one of about 140 AI crawlers and agents: training crawlers (GPTBot,
  ClaudeBot, CCBot, Bytespider), AI search (OAI-SearchBot, Claude-SearchBot, PerplexityBot,
  meta-webindexer), assistants fetching a page for a user (ChatGPT-User, Claude-User,
  Perplexity-User, MistralAI-User, Google's URL context), coding agents (Claude Code, Gemini CLI,
  Codex, Cursor, opencode) and data providers for agents (Exa, Tavily, Firecrawl, Diffbot).

The list comes from [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt) and the
operators' pages; names generic enough to occur in other clients are left out. A Markdown answer
carries `Content-Type: text/markdown; charset=utf-8`, `Vary: Accept, User-Agent` and a `Link` to the
HTML page as canonical, and Workers Logs record the page and the agent. To see what an agent reads:

```sh
curl -A 'GPTBot/1.2' https://lynxdb.org/blog/
curl -H 'Accept: text/markdown' https://lynxdb.org/blog/lynxdb-on-jsonbench/
```

`mise run test` tests the matching and the answers; a deploy runs it, and `mise run smoke` asks a
blog page as GPTBot, Claude-User, Chrome and Googlebot.

## Deploy

The site is a Cloudflare Worker with static assets and no script (`wrangler.jsonc`). Pushing a tag
deploys it: `.github/workflows/deploy.yml` checks that the tagged commit is on `main` and holds the
site its sources build (`mise run check`), stages the files the host serves into `dist/` (`mise run
dist`: the pages, `assets/`, the blog, the Markdown copies, `llms*.txt`, `robots.txt`, `sitemap.xml`,
`_headers` and `404.html`, without `blog-src/`, `design-system/`, the tools or the configuration),
deploys them with Wrangler, and fetches every page of the new deployment (`mise run smoke <URL>`). The
Actions tab runs it again for a chosen tag.

```sh
git tag 2026.11.27 && git push origin 2026.11.27
```

It needs two repository secrets: `CF_ACCOUNT_ID` and `CF_API_TOKEN`, an API token with Account,
Workers Scripts: Edit and Zone, Workers Routes: Edit on lynxdb.org. `mise run deploy` deploys `dist/` from a machine where `wrangler login` was
run, without the checks of a tag. `wrangler.jsonc` names its addresses, `lynxdb.org` and
`www.lynxdb.org`, and every deploy keeps them attached; the Worker has no `workers.dev` address.

`design-system/` is the LynxDB brand system the page follows: tokens, logos, fonts and component
notes.
