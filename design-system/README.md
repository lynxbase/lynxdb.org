LynxDB is a single-binary log analytics database. The system covers three surfaces: the marketing and docs site, the Web UI served by `lynxdb server`, and the output of the `lynxdb` CLI. All three share one palette, two typefaces and one rule: grey carries the interface, moss carries the brand, and every other colour means something.

## Principles

- **Neutral first.** About nine tenths of any screen is the `stone` ramp. Use `accent` for one thing per view: the run button, the install button, the active tab underline.
- **Colour is data.** A hue other than moss appears only when it encodes a log level, a status, a token type or a chart group. Never decorate with `ember`, `amber`, `lake` or `plum`.
- **Borders, not shadows.** Separate surfaces with `border-subtle` and `border-default` or with a surface step. `shadow-popover` is the only shadow, and only for things that float.
- **Mono is for data.** Code, log rows, figures and small labels are set in `mono`. Headlines, prose, navigation and buttons are set in `sans`.
- **Dense where people work, open where people read.** The Web UI runs on 13px text and 22px log rows; the site runs on 15px text and `space-16` sections.

## Colour

Six hue families, each with one job. Do not add a seventh.

| Family | Job | Use through |
| --- | --- | --- |
| `stone` | Grounds, borders, text | `bg-*`, `border-*`, `fg-*` |
| `moss` | Brand, primary action, success, INFO | `accent*`, `success`, `level-info`, `syntax-keyword` |
| `ember` | Errors, destructive actions | `danger*`, `level-error` |
| `amber` | Warnings, string literals | `warning*`, `level-warn`, `syntax-string` |
| `lake` | Notices, DEBUG, function names | `info*`, `level-debug`, `syntax-function` |
| `plum` | FATAL, numeric literals | `level-fatal`, `syntax-number` |

- Build with the semantic tokens. The numbered ramps (`stone-500`, `moss-700`) are primitives for defining tokens, illustrations and the logo, not for components.
- Page ground is `bg-app`, a grey, never white and never black. Panels sit on `bg-surface`, menus on `bg-raised`, code and table headers in `bg-sunken`.
- The marketing homepage is always dark and sits one step deeper: ground `stone-1000`, cards on `stone-950` with a `stone-800` hairline, headings `stone-50`, copy `stone-300`.
- On dark grounds `accent` is `lime-400`, the loud end of moss. Spend it on the primary button, the announcement bar, the LynxDB row of a comparison and one highlighted phrase in the headline. Never set body text in it and never use it on a light ground.
- Body text is `fg-default`. Secondary text is `fg-muted`. `fg-subtle` is for placeholders, disabled labels and axis ticks only; it does not pass 4.5:1.
- Text on an `accent` fill is `on-accent`, never a literal white: in the dark theme the fill is light moss and the label is dark.
- Moss as text is `accent-fg`, not `accent`. Tinted moss grounds are `accent-subtle` with an `accent-border` hairline.
- Focus is a solid 2px `focus-ring` outline at `space-half` offset on every interactive element. Do not remove it and do not replace it with a glow.
- Status is never colour alone. Print the word (`ok`, `warn`, `fail`, `ERROR`) and let `success`, `warning` and `danger` repeat it.
- Charts start grey: an ungrouped histogram is `viz-neutral`. Grouped series take `viz-1` to `viz-5` in order, always with a legend; past five groups fold the rest into `viz-neutral`.
- Both themes are complete. Docs default to light; the Web UI and the marketing homepage are dark. Put `data-theme="dark"` on a subtree to force it.
- Terminal blocks are always dark. Give the element `data-theme="dark"`; its ground is `stone-1000`, its text `stone-200`, its colours the `ansi-*` tokens.

## Typography

Two families. Do not add a third.

- `sans` is Geist. Use it for headlines, prose and help text.
- `mono` is JetBrains Mono. Use it for code, log rows, numbers that are data, and the `label` style.
- `label` (11px, weight 500, 0.08em tracking, uppercase) is for small technical captions: column headers, app tab labels, footer links, the caption of a query or a result. The pipe prefix (`lx-label--pipe`) belongs to captions of technical figures, not to section headings.
- Buttons and navigation are `sans`, weight 500, in sentence case.
- Headlines are weight 600 with negative tracking as given in each style. Do not use weight 700 or above in `sans`, and do not set headlines in `mono`.
- One `display-xl` per page, in two short lines, the second in `lime-400` on the homepage. Section headings on marketing pages are 36px on a 42px line, left-aligned, with at most one paragraph under them. Docs titles are `display-md`.
- Body copy is `body` on the site and `body-sm` in the app. Keep prose columns at or under `measure`.
- Log rows and data tables are `log`: 12px on a 20px line. Never go below 12px for anything a person reads.
- Turn ligatures off in all `mono` text (`font-variant-ligatures: none`): what a reader copies must be what they see.
- Italic is not shipped. Mark emphasis with weight 500 or with `accent-fg`.

## Layout and shape

- Spacing comes from the 4px scale: `space-1` to `space-24`. App panels pad `space-3` or `space-4`; site sections pad `space-16`.
- Radii are small: `radius-xs` for chips and bars, `radius-sm` for controls, `radius-md` for panels and code blocks, `radius-lg` for dialogs and the hero terminal. `radius-full` is for dots, toggles and the segmented control; there are no pill buttons.
- Controls are `control-md` (32px) by default, `control-sm` in toolbars, `control-lg` on marketing pages.
- Marketing pages are built from bordered cards on `radius-lg` and from full-width hairlines. Cards in a group may differ in width; none floats on a shadow.
- The site is 1280px wide with `space-12` side padding. The app is fluid with a `sidebar`-wide left rail and a `topbar`-high header.

## Voice

- Lead with what a person does to logs: search, follow a field, count, chart. "Search your logs. In milliseconds." "Search is the first step." How it is deployed (one binary, pipe or server) is a supporting fact, never the headline.
- Every performance figure names its benchmark, data size and machine, and links to the raw results.
- Sentence case for headlines and buttons in source text; the `label` style uppercases on its own.
- Name things by their real names: `lynxdb query`, PPL, token filters, time partitions, columnar parts. Readers are engineers.
- No exclamation marks, no emoji, no superlatives, no invented numbers. A benchmark figure appears only with a link to how it was measured.
- Commands and code are always copyable text in `mono`, never screenshots.
- Errors say what happened, where, and what to type instead.

## Logo

- The mark is the lynx curled into a disc. Use the faceted mark at 32px and above, the single-ink mark below 32px, in one-colour print and on photographs.
- On `bg-app` and `bg-surface` in the light theme use `lynxdb-mark-faceted-on-light.svg` or the `moss-800` ink. On dark grounds use `lynxdb-mark-faceted-on-dark.svg` or the `moss-300` ink. On an `accent` fill use the white ink.
- The wordmark is "LynxDB" in Geist 600 at -0.035em, in `fg-default`. Capital L, capital DB, no space. In a terminal context it is `lynxdb`, lowercase, in JetBrains Mono 500.
- In a lockup the mark is 1.5 times the wordmark's font size and sits 0.36em to its left.
- Keep clear space of half the mark's width on every side. Do not rotate, outline, recolour outside the moss ramp, or place the faceted mark on a mid-tone ground.
- The original gradient artwork is kept in the Logos group for reference and for large illustrative use; it is not for UI sizes.

## Iconography

- No icon set is chosen yet. Label controls with words in the `label` style.
- Where a glyph helps, use the characters the product already speaks: `|` pipe, `$` prompt, `/` search, `#` number field, `{}` object field, `·` separator. Set them in `mono` and colour them `fg-subtle` or `accent-fg`.
- Do not use emoji as icons.
