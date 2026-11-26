# HomepageB

Homepage variant B, light: the hero is a product window that answers PPL queries over 240 sample events in the browser, and the page can be driven from the keyboard.

Each of the nine reference products contributed one decision:

- Linear: left-aligned headline at weight 500 with tight tracking, a two-tone statement paragraph, and three `FIG 0.x` columns divided by hairlines.
- Superhuman: the window types its first query once on load, so the response is seen before anything is read. Section headings state an outcome with a number.
- Raycast: a dock of example chips under the window, one key each, and a command menu on Cmd or Ctrl with K.
- Stripe: a band of four figures with one lit and three dimmed, a counter in the status bar that grows with every query, and a boxes-and-wires diagram with LynxDB in the middle.
- Vercel: three-column rows (heading, visual, one line of proof plus a short list), and the install command as a copyable pill next to the main button.
- Granola: a Raw, Parsed, Answer toggle on the window, and three one-line answers to objections (no schema, no index, no cluster).
- Perplexity: the query box is the page, and every answer has a numbered evidence pane beside it.
- Cursor: the engine proposes the next query and Tab accepts it. Sections sit in wells one step darker than the ground.
- Things: one accent, few words, and motion only where it explains something: the one intro and the one figure.

Rules:

- Keys: `/` focuses the query, `1` to `4` load examples, the arrows pick a row, Enter opens the events behind that row, Tab in the query accepts the suggested next query, Esc goes back, Cmd or Ctrl with K opens the command menu. Shift with Tab and Esc leave the query field.
- The window runs a small demo engine written for this page: search terms, `where`, `stats`, `sort`, `head`, `fields`, `top` and `timechart span=Nm count()`. The timing in the status bar is measured in the visitor's browser.
- The intro typing runs once, is skipped under `prefers-reduced-motion`, and stops on the first key or pointer press.
- The figure under "Send it what you have" is the page's one looping animation. Packets run along the wires from five protocols into LynxDB, new blocks land in today's partition, a query types itself, a sweep crosses the blocks and marks the few that are read, and the counts come out on the right. One loop is about nine seconds. It runs only while a third of it is on screen, stops when the tab is hidden, and under `prefers-reduced-motion` stays on its final frame. The counts are real results of that query on the 240 sample events; the 120 blocks are a schematic.
- Buttons on this page are pills and the strongest one is `lx-btn--ink`. This is local to variant B; the system's buttons keep `radius-md`.
- Benchmark figures and the terminal, HTTP and stream examples come from the LynxDB README, BENCHMARKS.md and API docs.
- The page pins `data-theme="light"` on its root. `HomepageBDark` is the same page on a dark ground, built from the same template through local `--hb-*` colour variables.
