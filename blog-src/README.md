# The LynxDB blog

Posts are Markdown files in `blog-src/_posts/`. `npm run build:blog` turns them into static pages in
`blog/` at the site root, next to the landing page (`index.html`), so the site is served as plain
files with no build step on the host. The built `blog/` is committed.

## Write a post

1. Add `blog-src/_posts/YYYY-MM-DD-slug.md`. The date in the name is the post's date; the rest of
   the name is its address, `blog/slug/`.
2. Start it with front matter, as DuckDB's posts do:

   ```yaml
   ---
   layout: post
   title: "Five questions for an access log, answered from the shell"
   authors:
     - LynxDB team
   thumb: thumb.png          # the picture on the list of posts, 1200 x 630
   image: thumb.png          # the picture link previews show (og:image); a PNG or JPEG
   excerpt: "One or two sentences. They lead the post and stand under its title on the list."
   tags: ["Using LynxDB"]    # the first tag is shown in the post's breadcrumb
   ---
   ```

3. Put the post's pictures in `blog-src/_posts/slug/` (the folder named like the address) and refer
   to them by file name: `![…](chart.svg)`. They are copied next to the built page.
4. Every author name must have an entry in `blog-src/_data/site/authors.yml`, with the avatar's path
   from the site root:

   ```yaml
   LynxDB team:
     picture: img/lynxdb-appicon-moss.svg
   ```

## What the Markdown can hold

Standard CommonMark with tables, plus these forms:

| Write | Get |
| --- | --- |
| `## Heading`, `### Heading` | A heading that links to itself, listed in the post's contents |
| ` ```ppl `, ` ```json `, ` ```yaml `, ` ```sql `, ` ```text ` | A code sheet with its language named and a copy button, highlighted at build time |
| ` ```console ` | A terminal. Lines starting with `$ ` are commands (a trailing `\` continues one onto the next line); the rest is output. The copy button copies the commands only. The CLI's result tables, row counts and statistics footer get the CLI's own colours. |
| ` ```shell ` | A terminal holding a script: every line is copied |
| `> Note …`, `> Tip …`, `> Warning …` | A callout with that label |
| A quote whose last paragraph starts with `—` | The quote, with that paragraph as its attribution |
| An image alone in a paragraph, optionally with `*Caption*` on the next line | A figure with a caption |
| Two images where the second's name ends in `-dark` (`chart.svg`, `chart-dark.svg`) | A figure that shows the picture drawn for the reader's theme |
| `text[^name]` and `[^name]: note` | A numbered footnote, listed under Notes at the end |

Commands and their output are what LynxDB printed: run each command and paste its output as it is.
Short inline code never breaks across lines; a drawn chart is an SVG that embeds its font, so it
looks the same in every browser.

## Build and preview

```shell
mise run build                          # blog-src/ -> blog/, from an empty blog/
mise run serve                          # the repository root, then open http://127.0.0.1:8765/blog/
```

`mise run watch` rebuilds on every save. Serve the repository root, not `blog/`: the pages load
the landing's `site.css`, `theme.js`, fonts and marks one or two levels up. `mise run build` deletes
`blog/` first, since everything in it is build output, so the pages of a removed post go with it;
`npm run build:blog` alone writes over `blog/` and leaves them.

## Files

```
blog-src/
  eleventy.config.js      the build: input blog-src/, output blog/
  _lib/markdown.js        markdown-it and the forms above; Prism highlights code at build time
  _lib/filters.js         dates, reading time, the contents list, relative paths
  _layouts/base.njk       the page: the landing's head, bar and footer
  _layouts/post.njk       a post: header, contents, the column, more posts
  _includes/              the bar, the footer, a post card, the byline
  _data/site.yml          the blog's title, description and the site's address
  _data/site/authors.yml  authors and their avatars
  _posts/                 YYYY-MM-DD-slug.md, and slug/ with that post's pictures
  index.njk               the list of posts
  feed.njk                the Atom feed, blog/feed.xml
  blog.css, blog.js       the blog's own styles and script
blog/                     the built site: index.html, feed.xml, slug/index.html and pictures
```

Every page links the landing's `assets/system.css`, `assets/motion/motion.css` and `site.css`, then
`blog.css`, so the blog follows the landing's tokens, type and both themes. `theme.js` from the
landing runs the theme switch; `blog.js` runs the phone menu, the copy buttons and the contents
rail. The landing's bar and footer markup is copied into `_includes/nav.njk` and
`_includes/footer.njk`; change them there when the landing's change.

## Why Eleventy

DuckDB builds its blog with Jekyll 4.4.1 on GitHub Pages. Jekyll 4.4 needs Ruby 2.7 or later, and
the machine this was set up on has only macOS's Ruby 2.6.10, so the blog uses Eleventy 3 instead,
the closest small tool on Node: posts stay plain Markdown in Git, with Jekyll's `_posts`,
`_layouts`, `_includes` and `_data` folders and DuckDB's front matter, and markdown-it with Prism
highlights code at build time so no highlighter runs in the browser. Moving to Jekyll later means
porting the templates (Nunjucks to Liquid) and the Markdown forms above (kramdown plugins); the
posts themselves carry over.

## What DuckDB's blog has

From duckdb.org/news/, the post at duckdb.org/2026/11/25/star-trek-queries-duckdb and the
duckdb/duckdb-web repository (`_layouts/post.html`, `_includes/card.html`, `_data/authors.yml`,
`_plugins/`, `js/noteboxes.js`, `js/copy_button.js`):

| DuckDB | Here |
| --- | --- |
| Posts in `_posts/YYYY-MM-DD-slug.md`, `layout: post`, front matter `title`, `authors`, `thumb`, `image`, `excerpt`, `tags` | The same |
| Authors kept in `_data/authors.yml`: a `picture` (photo) or an `icon`, an optional `role` | `_data/site/authors.yml` with `picture`; no roles |
| Post header: a Blog breadcrumb with the tag, the title, date and reading time ("29 min read", code left out of the count, 150 words a minute), authors with 24px round avatars | The same; 200 words a minute |
| The post's thumbnail shown large under the header, then the excerpt as a bold "TL;DR" | The excerpt as the lead paragraph; the thumbnail is left off the post, because ours is a picture of a terminal and commands in a post are copyable text |
| "In this article" contents on the right, h2 and h3, the section in view marked in bold with a bar on the rail's line | "On this page", the same marking; below 1024px a collapsible block above the text |
| Headings that link to themselves, a link icon after the last word | The same |
| Code blocks highlighted by Rouge at build time, a copy button, no copy button on console output, no language label | Prism at build time, a language label and a copy button on every block; a console block copies its commands without prompts or output |
| Images with a caption line (`{: .caption }`), light and dark variants in front of one caption | The same, with `*Caption*` on the line under the image and `-dark` names |
| Tables, including query results | Tables; query results stay in the terminal as the CLI prints them |
| Note boxes from a keyword starting a blockquote: Note, Warning, Tip, Bestpractice, Deprecated, Update, Installation, Quote, New | Note, Tip and Warning |
| Quotes with an attribution line (avatar when the person is an author) | The attribution line; no avatar |
| Footnotes (kramdown) | Footnotes, numbered, with a link back |
| Links in the text marked with an external-link icon | Left out: in a post with many links the icons crowd the line |
| "Recent posts" under a post: three cards and a link to all posts | "More posts", the same |
| A call to action and the site footer under every post | The landing's close and footer |
| The list: "Engineering Blog", tag filter buttons, a search box, a three-column grid of cards (thumbnail, title, date, reading time, avatars and names), every post on one page, no pagination | The same grid, newest first, the newest post as a wide first card, cards with the excerpt; no tag filter and no search, which pay off once there are enough posts to filter |
| An Atom feed (`feed.xml`) | `blog/feed.xml`, with each post's full text |
| A light and a dark theme with a switch in the bar | The landing's themes and switch |
| A search overlay across the site (Cmd+K) | Left out: the site has no search |
