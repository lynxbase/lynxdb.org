# LogLevel

The level word of a log event, coloured by its `level-*` token.

- Always print the word, uppercase, padded to five characters so rows align.
- TRACE is regular weight and grey; every other level is weight 600.
- Do not put levels on tinted chips inside log rows: at 22px row height the colour of the word is enough.
