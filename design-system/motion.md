# Motion

Motion is budgeted by how often a person sees it. The more frequent the interaction, the less it may move.

| Frequency | Examples | Motion |
| --- | --- | --- |
| Hundreds of times a day | Typing a query, keyboard shortcuts, new rows in a live tail | None |
| Tens of times a day | Hover, tab change, row selection | `duration-fast` colour change only |
| A few times a day | Dropdown, popover, tooltip, toggle | `duration-base`, opacity and a 4px or 0.96-scale transform |
| Once a session | Dialog, drawer, the hero reveal | `duration-slow` |

## Rules

- Never animate an action started from the keyboard: running a query with the shortcut, moving through log rows, opening the command menu.
- Animate `opacity` and `transform` only. Do not animate width, height, top or left, and never write `transition: all`.
- Everything that enters or answers input uses `ease-out`. Elements already on screen that move use `ease-in-out`. Nothing uses ease-in.
- Nothing appears from scale 0. Enter from 0.96 and opacity 0, anchored to the element that opened it.
- A pressed button scales to 0.97 for `duration-fast`.
- New log rows in a live tail are appended without animation. Do not flash, slide or fade rows.
- No looping or autoplaying motion on any page. The terminal cursor does not blink. The one exception is an explanatory figure, at most one per page: it may loop while at least a third of it is on screen, must stop when scrolled away or when the tab is hidden, and must rest in its final frame. The ingest and search figure on Homepage B is the reference.
- `stroke-dashoffset` on an SVG path is allowed inside such a figure, to show data moving along a wire.
- Under `prefers-reduced-motion: reduce` every duration is 0 and ScrambleText is skipped.

## ScrambleText

The one expressive effect. On hover or keyboard focus a short mono label is searched glyph by glyph and resolves left to right, as if the engine were scanning for the term.

- Use it on `mono` labels and figures on the site: footer links, benchmark values, headline numbers. Do not use it on `sans` text (navigation, buttons, headlines, prose), in the Web UI, or on anything longer than 32 characters.
- It runs only in `mono`, where every candidate glyph has the width of the final one, so neighbours never move.
- One run lasts 28ms per character, clamped to 200ms and `duration-scramble`. It does not restart while the pointer stays inside the link.
- Only letters and digits change; punctuation, signs and spaces stay where they are. Unresolved glyphs are `accent-fg`; resolved text keeps its own colour.
- A figure scrambles when the pointer enters its row or tile (`data-scramble-host`), so the target is as large as the thing it describes.
- The real text stays in `aria-label` and is restored exactly at the end. Without JavaScript the label is plain text.
- At most one scramble surface per region: the values of one chart, or the links of the footer, not every word on the page.
