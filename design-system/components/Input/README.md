# Input

A bordered field on `bg-surface` with a `border-control` edge that holds 3:1 in both themes.

- Provide a visible `lx-label` above it; placeholder text is `fg-subtle` and is never the only label.
- Add `lx-input--mono` for anything typed into a shell or a query: paths, addresses, LynxFlow.
- Errors set `lx-input--invalid` and a help line that starts with the word "Error:" in `danger`.
- Affixes (`from`, `/`, a unit) are `lx-affix` spans; trailing shortcuts are `lx-kbd`.
