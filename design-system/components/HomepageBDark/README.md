# HomepageBDark

Homepage variant B on a dark ground. Same page, same demo engine and same keys as `HomepageB`; only the colours change.

- Both previews are built from one template. Every colour on the page is a local `--hb-*` variable with a light and a dark value, switched by `data-theme` on the page root, so the two cannot drift apart.
- Ground is `stone-1000`, the product window and the section wells are `stone-950`, code boxes inside wells sink back to `stone-1000`. Hairlines are `stone-800` and `stone-700`.
- Lime does the work moss does on light: the prompt mark, the selected row's bar, the lit cells in the figures. Search matches are lime text on a 20% lime wash, not a solid lime chip, so a screen of matches does not glare.
- The strongest button inverts to `stone-100` with dark text. The pressed example chip does the same.
- The page pins `data-theme="dark"` on its root. See `HomepageB` for what each reference product contributed and for the keyboard rules.
