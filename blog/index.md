Source: https://lynxdb.org/blog/

# Blog

Querying logs with LynxDB, how its engine reads them, and what each release changes.

[Feed](https://lynxdb.org/blog/feed.xml)

## [Twenty-eight bytes from the end: inside the LynxDB engine](https://lynxdb.org/blog/inside-the-lynxdb-engine/)

LynxDB opens a part file from its last 28 bytes, which locate a footer that describes every block: its first sort key, its key runs, its rows per hour. This post follows the Bluesky events from JSON lines into that footer, shows which queries end there and what the design costs, and sets each piece beside ClickHouse's MergeTree.

Evgenii Orlov · 27 November 2026 · 16 min read

## [Fourteen blocks of 61,246: how LynxDB answers JSONBench in 0.18 s](https://lynxdb.org/blog/lynxdb-on-jsonbench/)

LynxDB answers JSONBench's five queries over 1 billion Bluesky events in 0.18 s on a warm cache; ClickHouse's published result is 6.9 s. Most of the answer comes from metadata kept per block: the exact distinct count in Q2 opens 14 of 61,246 blocks. Without its sort key LynxDB takes 10.2 s, and ClickHouse is faster.

Evgenii Orlov · 27 November 2026 · 17 min read

## [Five questions for an access log, answered from the shell](https://lynxdb.org/blog/querying-an-access-log/)

lynxdb query loads a log file, runs one PPL query over it and exits, with no server to start. We ask a 1,000-line access log where its server errors come from and when they happened.

Evgenii Orlov · 27 November 2026 · 4 min read
