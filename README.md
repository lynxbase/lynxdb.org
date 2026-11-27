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
changes: the host serves the repository as it is, with no build step. The sitemap covers
`lynxdb.org`; documentation has its own [sitemap](https://docs.lynxdb.org/sitemap.xml).

`design-system/` is the LynxDB brand system the page follows: tokens, logos, fonts and component
notes.
