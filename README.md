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
