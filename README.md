# lynxdb.org

The LynxDB website: one static page at the repository root (`index.html`, `site.css` and a few ES
modules) and a [Markdown blog](blog-src/README.md). `assets/` holds the page's layout and motion kit.

Run `npm ci` and `npm run build:blog` after changing pages or posts. The build refreshes the static
blog, `sitemap.xml`, `llms.txt`, `llms-full.txt` (also at `llmfull.txt`), and the Markdown alternatives
linked from each page. The sitemap covers `lynxdb.org`; documentation has its own
[sitemap](https://docs.lynxdb.org/sitemap.xml). Keep the generated files with the source changes.

Run it locally over HTTP, since the page's modules do not run from `file://`:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

`design-system/` is the LynxDB brand system the page follows: tokens, logos, fonts and component
notes.
