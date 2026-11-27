# lynxdb.org

The LynxDB website: one static page at the repository root (`index.html`, `site.css` and a few ES
modules), with no build step. `assets/` holds the files of the page's layout and motion kit it loads.

Run it locally over HTTP, since the page's modules do not run from `file://`:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

`design-system/` is the LynxDB brand system the page follows: tokens, logos, fonts and component
notes.
