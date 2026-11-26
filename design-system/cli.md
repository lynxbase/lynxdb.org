# CLI

The `lynxdb` CLI is a design surface with the same rules as the site: grey first, colour as data, words before colour.

## Colour

- Emit the 16 ANSI slots, never 256-colour or truecolor codes. The user's terminal theme decides the actual hues, so output stays legible on light, dark and high-contrast themes.
- Colour is on only when the stream is a TTY. Check stdout and stderr separately.
- Turn colour off when `NO_COLOR` is set and non-empty or when `TERM=dumb`. Offer a `--color=auto|always|never` flag and honour `FORCE_COLOR` for pagers and CI. The flag wins over the environment.
- Never set a background colour. Never rely on colour for meaning: every coloured word already says `error`, `warning`, `ok`, `fail`.

| Meaning | ANSI slot | Style |
| --- | --- | --- |
| Prompt, LynxFlow stage names, `ok` | green (2) | stage names plain, `ok` bold |
| `error:`, `fail`, the offending token | red (1) | prefix bold |
| `warning:`, `warn` | yellow (3) | prefix bold |
| `hint:`, `help:` | cyan (6) | prefix bold |
| Function names in echoed queries | blue (4) | plain |
| Numbers in echoed queries, `FATAL` | magenta (5) | plain |
| Column headers, summaries, gutters, keys | bright black (8) | plain |
| Emphasis inside a message | default | bold |

The `ansi-*` tokens are the palette the site and Web UI use to draw terminals, and the values to ship as an optional "Lynx" terminal theme. The CLI itself never prints them.

## Output

- Results go to stdout, everything else (summaries, progress, warnings, errors) to stderr, so a pipe gets clean data.
- A table is space-aligned columns under dim uppercase headers. No box-drawing borders, no zebra stripes, no truncation when piped.
- Numbers are right-aligned. Durations carry a unit (`15 ms`, `3d 4h`).
- After a result print one dim summary line: rows, events scanned, elapsed time, separated by ` · `.
- When stdout is not a TTY, print no summary and no colour. Machine shapes (JSON, NDJSON, CSV) are chosen by an explicit format flag, never guessed.
- Key-value views (`lynxdb status`, `lynxdb config`) align keys in a dim first column and put state words in a fixed column.

## Messages

- Lowercase prefix, colon, then the message: `error: unknown stage \`eval\``. No stack traces, no "Oops".
- For a query error show the source line with a caret under the offending span, as compilers do.
- Follow every error with a `hint:` that contains the exact text to type, and a `help:` that names a command, when one exists.
- Legacy SPL spellings always answer with the LynxFlow equivalent.
- Exit non-zero on any `error:`.

## Progress

- No spinner for anything under one second. Above that, one line on stderr that rewrites in place on a TTY and prints once per stage when piped.
- No ASCII-art banner on start. `lynxdb server` prints its address, data directory and Web UI URL as an aligned key-value block and then logs.

## Help

- `lynxdb --help` lists commands in the order people need them, one line each, command in green, purpose in default text.
- Every command's help ends with two or three copyable examples.
