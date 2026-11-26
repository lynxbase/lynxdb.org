# LogTable

Raw events, one per 22px row: time, level, source, message.

- Provide events newest first. Time is `fg-muted`, the level uses LogLevel, the source is `fg-muted`, the message is `fg-default`.
- Dim the keys of key=value pairs with `kv`; highlight search matches with `hl`.
- The selected row gets `aria-selected="true"`: `bg-selected` and a 2px `accent` inset on the left.
- Rows never wrap in the list; the full event opens in a detail view.
- New rows in a live tail appear without animation.
