# Button

A sans, sentence-case action on a 6px radius. Use `lx-btn--primary` once per view for the thing the view is for (Run, Get started); everything else is the default outlined button or `lx-btn--ghost`.

- Provide a short label that starts with a verb or names the destination: "Run", "Get started", "See the benchmark", "Drop view". A label says where it leads; a bare "Install" does not.
- The primary fill is `accent` with `on-accent` text: dark moss with white text in the light theme, `lime-400` with dark text in the dark theme.
- Sizes: default is `control-md`; `lx-btn--sm` in toolbars, query footers and next to a command to copy; `lx-btn--lg` (44px) on marketing pages only.
- `lx-btn--ink` is a neutral strong button (`bg-inverse` with `fg-inverse`) for light marketing pages where moss should stay rare.
- `lx-btn--danger` is for destructive, irreversible actions and always names the object.
- A shortcut goes inside the button as an `lx-kbd`.
- Buttons do not scramble: the effect is for `mono` text only.
