---
layout: post
title: "Twenty-eight bytes from the end: inside the LynxDB engine"
authors:
  - Evgenii Orlov
thumb: thumb.png
image: thumb.png
excerpt: "LynxDB opens a part file from its last 28 bytes, which locate a footer that describes every block: its first sort key, its key runs, its rows per hour. This post follows the Bluesky events from JSON lines into that footer, shows which queries end there and what the design costs, and sets each piece beside ClickHouse's MergeTree."
tags: ["Engine"]
---

[The previous post](../lynxdb-on-jsonbench/) counted what each JSONBench query reads from a billion Bluesky events. This one opens the files behind those counts and sets them beside ClickHouse's MergeTree. Mechanisms are as the code has them at commit 314ce56f (25 November 2026). Numbers at 1 billion events come from the previous post's measurement runs (main 657aa79f, m6i.8xlarge, 24 and 25 November); a few come from a store of the first million events on my laptop, an Apple M4 Pro, and say so. Sizes on disk and bytes read are in decimal units; memory is in GiB.

## From an index to a column chunk

LynxDB keeps an index as six levels in one directory. The index (`bluesky`) fixes its sort key, time fields and partition width when it is created. A partition is a fixed span of event time, a UTC day by default; merges stay inside one and retention drops whole ones. The JSONBench entry asks for 366 days, so one partition holds the dataset. A run is one sorted sequence of rows in a partition: each flush writes one run per partition it touches, and runs overlap in key and time until they are merged. A part is one file holding a contiguous key range of a run. A block holds up to 16,384 rows, and a column chunk holds the values of one path of one kind in a block, so a path that arrives with two types gets two chunks. After the final merge the 1B store is one run of 92 parts and 61,246 blocks, about 16,300 rows each.

ClickHouse's MergeTree has one level fewer. Each part of a table is sorted by the `ORDER BY` key on its own, and background merges combine the parts of a partition into larger ones ([parts](https://clickhouse.com/docs/parts)). A part is a directory, with a data file and a marks file per column in the Wide format. Its rows fall into granules of at most `index_granularity` rows, 8,192 by default, the smallest set of rows ClickHouse reads ([MergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)).

<figure class="fig">
<div class="fig-panel">
<div class="fig-head"><b>From an index to a column chunk</b><span>the 1B store beside a MergeTree table</span></div>
<div class="fig-ladder">
<div class="fig-ladder__head">LynxDB, counts at 1B</div><div class="fig-ladder__head">ClickHouse MergeTree</div>
<div class="fig-box"><b>Index</b><span>sort key, time fields, partition width</span></div><div class="fig-box"><b>Table</b><span>ORDER BY five columns, one JSON column</span></div>
<span class="fig-arrow fig-arrow--down"></span><span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Partition<small>1</small></b><span>a span of event time, 366 days here</span></div><div class="fig-box"><b>Partition</b><span>any PARTITION BY expression, none here</span></div>
<span class="fig-arrow fig-arrow--down"></span><span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Run<small>1</small></b><span>one sorted sequence of rows</span></div><div class="fig-box is-none"><b>No run</b><span>each part is sorted on its own</span></div>
<span class="fig-arrow fig-arrow--down"></span><span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Part file<small>92</small></b><span>a key range of a run, one file</span></div><div class="fig-box"><b>Part</b><span>a directory, files per column</span></div>
<span class="fig-arrow fig-arrow--down"></span><span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Block<small>61,246</small></b><span>up to 16,384 rows</span></div><div class="fig-box"><b>Granule</b><span>up to 8,192 rows, one mark</span></div>
<span class="fig-arrow fig-arrow--down"></span><span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Column chunk</b><span>one path and kind in a block</span></div><div class="fig-box"><b>Column data</b><span>the granule's rows in the column's .bin, found by its mark</span></div>
</div>
</div>
<figcaption>The levels of LynxDB's 1B store beside those of a MergeTree table. LynxDB's counts are from the measurement run on main 657aa79f (25 November 2026); ClickHouse's levels follow its MergeTree documentation, and its table is the JSONBench entry's.</figcaption>
</figure>

## The part file, front to back

The writer emits a part in one pass ([part/format.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/part/format.go)). An 8-byte header holds the magic `LXPT` and the format version. The blocks follow, each a sequence of column chunks, with the token filters of every group of up to 128 blocks behind the group's last block. Then come the column directories of all blocks, the footer, and a 28-byte trailer: the footer's offset, length and CRC-32C, the version and the magic again[^dict]. A directory has a 28-byte entry per chunk (path, kind, encoding, number of values, place in the file, checksum), followed by numeric bounds and a constant where the chunk has one. The footer describes every block without touching its data.

<figure class="fig">
<div class="fig-panel">
<div class="fig-head"><b>A part file, front to back</b><span>byte ranges in file order, not to scale</span></div>
<div class="fig-file">
<span class="fig-band">header<small>8 B</small></span><em>at open</em>
<span class="fig-band" style="--h: 44px">block 0: column chunks</span><em>when a query opens it</em>
<span class="fig-band" style="--h: 44px">block 1: column chunks</span><em>when a query opens it</em>
<span class="fig-band is-gap">up to 128 blocks a group</span><em></em>
<span class="fig-band">token-filter pages of the group</span><em>page by page, per probe</em>
<span class="fig-band is-gap">more groups</span><em></em>
<span class="fig-band">column directories, one per block</span><em>on a block's first open</em>
<span class="fig-band is-mark" style="--h: 30px">footer</span><em>at open, kept in memory</em>
<span class="fig-band">trailer<small>28 B</small></span><em>at open, read first</em>
</div>
<div class="fig-group">
<div class="fig-head"><b>The footer's records</b><span>bytes in the 1M store</span></div>
<div class="fig-cols is-narrow">
<div class="fig-box"><b>Paths</b><span>names, sort key</span><em>12,081&nbsp;B</em></div>
<div class="fig-box"><b>Block index</b><span>52&nbsp;B a block: rows, time bounds, offsets</span><em>3,915&nbsp;B</em></div>
<div class="fig-box"><b>Filter entries</b><span>16&nbsp;B a filter, 20&nbsp;B a group</span><em>9,662&nbsp;B</em></div>
<div class="fig-box"><b>First keys</b><span>a block's first key, the part's last</span><em>6,815&nbsp;B</em></div>
<div class="fig-box"><b>Key statistics</b><span>KeyShared, KeyRuns per depth</span><em>449&nbsp;B</em></div>
<div class="fig-box"><b>Totals</b><span>rows, bytes, time bounds</span><em>465&nbsp;B</em></div>
<div class="fig-box"><b>Value counts</b><span>string paths of up to 256 values</span><em>323,884&nbsp;B</em></div>
<div class="fig-box"><b>Time buckets</b><span>rows per minute, hour, day</span><em>5,275&nbsp;B</em></div>
</div>
</div>
</div>
<figcaption>A part's byte ranges in file order, when the server reads each, and the records of the footer. Sizes are from the store of the first million events on my laptop (15 parts, 75 blocks, read with build 7c88422e): column chunks take 91.0% of its 98.2 MB, token-filter pages 8.6%, footers 0.37% and directories 0.06%.</figcaption>
</figure>

`GET /api/v1/indexes/{index}/columns` reports how an index's bytes divide over these regions. For the footers of the 1M store, served on my laptop:

```console
$ curl -s 127.0.0.1:3331/api/v1/indexes/bluesky/columns \
    | jq -r '.data.breakdown[] | select(.name|test("^footer")) | "\(.name) \(.bytes)"' \
    | column -t
footer.counted_values  323884
footer.paths           12006
footer.filter_entries  9262
footer.block_keys      6815
footer.time_counts     5275
footer.block_index     3915
footer.totals          465
footer.key_stats       449
footer.filter_groups   400
footer.sort_key        75
```

A reader opens a part from its end: it reads the trailer, checks the footer's checksum and validates its records, for instance that each block's time buckets add up to its rows. The server maps every file twice ([dir.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/dir.go)), with the kernel's read-ahead for the footer and directories and with random access for chunks and filter pages. It copies the block index, filter entries, time buckets and first keys onto the heap, so finding a block reads no page of the file. A block's directory is copied when a query first opens the block; chunks and filter pages are read when a query needs them and checked against their own checksums.

On the 1B store the server reads 151 MiB from the device in 1.39 s while it starts. About 34 MB of that is its own executable, which it reads into the page cache before it listens; the rest is what opening the 92 parts reads: their footers, and no column data. The benchmark's `check` passes only after that, so no query pays for it.

ClickHouse keeps the same pieces in separate files of a part's directory ([sparse primary indexes](https://clickhouse.com/docs/guides/best-practices/sparse-primary-indexes)). `primary.idx` holds one mark per granule, the key of its first row, and is meant to stay in memory; the ClickHouse entry loads it at startup. A marks file per column locates each granule's compressed block in the column's `.bin` file and its offset once decompressed, and in `.mrk2` files its row count. LynxDB's first keys play the part of `primary.idx` and its directories that of the marks, except that a directory entry also carries the chunk's value count, bounds and constant, which ClickHouse keeps per granule only in a declared `minmax` skip index.

## Key runs let Q2 count without opening blocks

For every block the writer stores two records about the sort key ([part/writer.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/part/writer.go)). `KeyShared` is the number of leading key columns that the block's first row shares with the row before it. `KeyRuns` at depth d is the number of distinct values that the first d key columns take in the block. The writer finds, for each row, the first key column that differs from the row before; `KeyRuns(d)` is one plus the number of rows that differ within the first d columns. With four key columns that is five varints a block, 449 bytes for the 75 blocks of the 1M store.

<figure class="fig">
<div class="fig-panel">
<div class="fig-head"><b>Key runs in three blocks of one part</b><span>sort key: kind, operation, collection, did</span></div>
<div class="fig-cols is-narrow" style="--col-min: 170px">
<div class="fig-box"><b><i class="is-meta"></i>Block 1</b><span>likes</span><span>rows 16,384</span><span>KeyShared 3</span><span>KeyRuns 1 1 1 4,286</span><em>count += 16,384<br>users += 4,286</em></div>
<div class="fig-box"><b><i class="is-read"></i>Block 2</b><span>likes, then posts</span><span>rows 16,384</span><span>KeyShared 3</span><span>KeyRuns 1 1 2 4,385</span><em>opened: the collection changes</em></div>
<div class="fig-box"><b><i class="is-meta"></i>Block 3</b><span>posts</span><span>rows 16,384</span><span>KeyShared 4</span><span>KeyRuns 1 1 1 9,764</span><em>count += 16,384<br>users += 9,763</em></div>
</div>
<ul class="fig-legend is-row"><li><i class="is-meta"></i>counted from the footer</li><li><i class="is-read"></i>opened, rows read</li></ul>
</div>
<figcaption>Three consecutive blocks of one part of the 1M store, with the values their footer holds, and what Q2 does with each. Block 3's first row continues the last user of block 2 (KeyShared 4), so it adds one user fewer than its KeyRuns at depth 4.</figcaption>
</figure>

Q2 counts a block that lies inside `commit`, `create` and holds one collection from these records alone, as the previous post showed ([exec/agg_ordered.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/exec/agg_ordered.go)). The first block of a part stores `KeyShared` 0; for it the reader compares the block's first key with the last key of the part before it, which that part's footer keeps. A flush cuts its run between keys, so no user spans two of its parts: in the 1M store each part's first row shares three key columns with the previous part's last row, never four.

In the 1M store these records predict Q2's counters exactly. Seven blocks hold a key change inside the range or cross its end and must be opened, three lie outside it, and the other 65 are counted, which is what the query reports.

The count is exact only within one key-ordered stream, so the planner takes this path only when the key ranges form one. While overlapping runs wait to be merged, or with daily partitions, a block inside one collection contributes the entries of its `did` dictionary instead, read without the rest of the block (`counted_by_entries`). On daily partitions with the same key, Q2 counted 63,003 blocks that way and opened 1,090, and took 2.77 s cold against 0.056 s.

ClickHouse's sparse index holds the key of each granule's first row and nothing about what lies between. It finds where `commit`, `create` begins and ends, and, as I understand it, `uniqExact` then reads `did` for every matching row. ClickHouse would do this work at write time instead, with a projection that has a `GROUP BY`, stored in each part as a hidden AggregatingMergeTree part ([projections](https://clickhouse.com/docs/data-modeling/projections)); the entry defines none.

## Time buckets per minute, hour and day

Every block also counts its rows per UTC minute, hour and day ([part/timecounts.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/part/timecounts.go)). The writer counts the rows once, in the narrowest width whose span stays under 65,536 buckets, and adds those up for the wider widths. It keeps a record only if the record fits in 4 KiB, about two bytes a bucket, which holds a day of minutes, and stores the records widest first.

A query uses them when it counts rows by `hour(_time)` or `bin(_time, w)`, alone or with columns that hold one value throughout the block ([exec/agg_time.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/exec/agg_time.go)). The executor picks the widest record whose width divides the time keys' widths, hours for `hour(_time)` and minutes for a 5-minute bin, and under a plain time range the narrowest. The block's directory must settle every other predicate for all its rows, or the block is counted row by row and the reason goes to a `time_missed_*` counter. Q3 at 1B counted 37,523 blocks from hour records and missed 5.

The dataset's events run from 21 November to 4 December 2024. In key order a block holds a slice of accounts with all their events, so most blocks span the twelve days: their minute records outgrow 4 KiB and are dropped, and their time bounds overlap any window. A 5-minute count therefore took 3.48 s cold on this design, reading 4.7 GB, against 0.0064 s on daily partitions without a key. VictoriaLogs keeps daily partitions ([key concepts](https://docs.victoriametrics.com/victorialogs/keyconcepts/)) and a sparse index of timestamps, and stores each stream's logs together ([FAQ](https://docs.victoriametrics.com/victorialogs/faq/)); it answered the window in 0.048 s.

## What rules a block out before it is opened

The scan ([scan.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/scan.go)) applies its rules in a fixed order. Per part: its time bounds, then the footer's value counts, which drop a part that lacks the string of an equality such as `commit.collection = 'app.bsky.feed.post'`, then a binary search of the first keys for the key prefix or the ranges of an `in` list. Per block: its time bounds, a cache of blocks that an earlier query with the same condition found empty, and the token filters. An opened block can still be rejected by its directory before any chunk is decoded. Each rule has its counter in `meta.stats`:

| Counter | Decided by | Cold, 1B, sort key |
| --- | --- | --- |
| `skipped_by_time` | part and block time bounds | Q4: 5,481 |
| `skipped_by_key` | first keys | Q2: 3,265 |
| `skipped_by_token` | footer value counts, token filters | rare word: 58,973 |
| `skipped_as_empty` | blocks an earlier query found empty | 0 on every cold try |
| `skipped_by_stats` | an opened block's directory | regular expression: 55,471 |
| `counted_by_index` | footer value counts, key runs | Q2: 57,967 |
| `counted_by_time` | time buckets | Q3: 37,523 |

A part dropped by its value counts is booked under the token counter; as far as I can tell, that is where most of Q4's 52,047 token skips come from.

Token filters are the one per-block structure kept outside the footer ([tokenfilter/cells.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/tokenfilter/cells.go)). The writer hashes every token, a maximal run of letters and digits, case-folded, to 64 bits. A column whose encoded chunk reaches 16 KiB gets a filter of its own, so that a search can tell which columns to read; the block's smaller columns share one. A filter splits its hashes into cells by their high bits and keeps each cell as a sorted set of shortened hashes coded after Elias and Fano, aiming at one false positive in 800 probes for a column's own filter and one in 200 for the shared one. A group's filters are stored in stripes, so that probing one token across the group reads one stripe of at most 48 KiB, in 4 KiB pages with their own checksums. On the 1B store they take 7.88 GB of 91.88 GB, 8.6%.

In ClickHouse such filters are opt-in. A data-skipping index is declared per expression, summarizes `GRANULARITY` granules, and comes as `minmax`, `set`, `bloom_filter`, the deprecated `tokenbf_v1`, or a `text` index, an inverted index that is generally available from 26.2 ([skipping indexes](https://clickhouse.com/docs/optimize/skipping-indexes)). The JSONBench entry declares none. VictoriaLogs, like LynxDB, writes bloom filters for every block, to skip blocks without a given word.

## Ingest: from a JSON line to a merged part

The entry's load script decompresses 16 files at once and posts each as one request. The server reads a request's body on one goroutine and parses it on another ([rest/ingest.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/api/rest/ingest.go)), into the first free one of the store's append buffers, one per CPU. The 16 requests parse in parallel; by my reading of the code, one request does not spread over more cores.

The parser writes JSON straight into typed column builders, with no document tree in between ([shred/parse.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/shred/parse.go)). A nested member becomes its dotted path, and each value goes to the column of its kind there, so a field that is a string in one event and a number in the next gets two columns, and an explicit `null` stays apart from a missing field. Arrays, empty objects and objects nested deeper than 64 levels are kept whole in a binary variant column; past 256 levels the line is refused, which keeps out 4 objects of the dataset nested 2,163 levels deep. Members beyond a batch's 8,192 columns go into one variant object, `_rest`. Nothing keeps the original line.

A flush starts when a buffer has waited a second, when buffered input reaches its budget, or on a sync. Up to two run at once, each sorting its batches by partition and key on half the CPUs, cutting the run into parts of disjoint key ranges and writing them in parallel at zstd's fastest level ([store_run.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/store_run.go)). Each chunk takes the encoding that suits it, among them a constant, a sorted dictionary of up to 65,536 values with row counts per value when there are at most 256, numeric differences for strings such as time-ordered IDs, and presence alone.

Merges are tiered: the eight oldest runs of a tier become one run of the next, and at most 64 runs may wait ([store.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/store.go)). A merge re-encodes the blocks of flushed runs at zstd's default level, copies other blocks unchanged where the key order allows, and splits large ranges among workers under a shared budget of decoded blocks. The load ends by compacting the partition into one run.

<figure class="fig">
<div class="fig-panel">
<div class="fig-head"><b>From 16 gzip streams to 92 parts</b><span>the entry's load at 1B</span></div>
<div class="fig-ladder" style="--ladder: minmax(0, 1fr)">
<div class="fig-box"><b>Load script<small>16 streams</small></b><span>gzip -dc | curl, one request per file</span></div>
<span class="fig-arrow fig-arrow--down"></span>
<div class="fig-dash">
<div class="fig-dash__label">server, in memory</div>
<div class="fig-ladder" style="--ladder: minmax(0, 1fr)">
<div class="fig-box"><b>Request<small>2 goroutines</small></b><span>the body read on one, parsed on the other</span></div>
<span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Shred</b><span>JSON into typed column builders by dotted path</span></div>
<span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Append buffers<small>32</small></b><span>one per CPU, the first free one taken</span></div>
</div>
</div>
<span class="fig-arrow fig-arrow--down"></span>
<div class="fig-dash">
<div class="fig-dash__label">server, on disk</div>
<div class="fig-ladder" style="--ladder: minmax(0, 1fr)">
<div class="fig-box"><b>Flush<small>tier 0</small></b><span>sort by partition and key, cut by key range, zstd fastest</span></div>
<span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Tiered merges<small>15,022 parts, 99.23 GB</small></b><span>8 runs of a tier into 1, zstd default</span></div>
<span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Compact<small>92 parts, 91.88 GB</small></b><span>every run of the partition into one</span></div>
</div>
</div>
</div>
</div>
<figcaption>The path of an event from the entry's load script to a merged part. Part counts and sizes are from the measurement run on main 657aa79f (25 November 2026), where the load took 803.5 s, 402.8 s of it in the final compaction; the published run took 824 s, 430 s of it merging.</figcaption>
</figure>

The ClickHouse entry inserts one file at a time with `FORMAT JSONAsObject`. A JSON column keeps the typed paths its type declares as columns, up to `max_dynamic_paths` other paths (1,024 by default) as subcolumns, and the rest in shared data ([JSON type](https://clickhouse.com/docs/sql-reference/data-types/newjson)). The entry declares five typed paths and sets `max_dynamic_paths = 0`, so every other field, the post text included, goes to shared data, written as `map_with_buckets` in the parts that inserts create and as `advanced` in merged ones. Since 25.8 the advanced format also stores a copy of the data in the original format, which, in the words of ClickHouse's blog, "effectively doubles the storage requirement" ([JSON data type gets even better](https://clickhouse.com/blog/json-data-type-gets-even-better)). The previous post's sample of the 26.11 table found 94 to 102 bytes a row in fresh parts and 191 to 199 in merged ones; LynxDB's store takes about 92. ClickHouse also stores JSON paths flattened but forms nested objects again on output, where LynxDB returns the dotted paths as they are.

## The hash path, before and after 8655937b

Without a sort key, Q2, Q3 and Q5 group rows in hash tables ([exec/agg_partition.go](https://github.com/lynxbase/lynxdb/blob/main/pkg/colstore/exec/agg_partition.go)). Each scan goroutine fills a table of its own, up to 65,536 groups, and then hands groups on. Where they go changed on 24 November.

Before, a goroutine appended each handed-on group, as its hash, key and state, to a private log split into 256 hash partitions, and logged each (value hash, group) pair of a distinct count the same way. The 32 logs lived until the scan ended, when the partitions were merged one at a time. A log grows with every row whose group did not fit the table, so memory grew with the rows scanned, however few the groups.

Since commit 8655937b the logs are staging buffers under one budget, 1 GiB for all goroutines together and as much again for distinct values. A goroutine that has spent its share merges what it holds into hash partitions that every goroutine shares: eight per goroutine, between 256 and 4,096, so 256 on 32 vCPUs, each a table behind a mutex. Distinct values go into per-partition sets of 128-bit MurmurHash3 hashes. A table slot holds a 16-bit fingerprint and the key's place, and keys live in chunks that never move, so a table grows without copying them.

<figure class="fig">
<div class="fig-panel">
<div class="fig-cols is-pair">
<div class="fig-group">
<div class="fig-head"><b>Before</b><span>main 400bddbb</span></div>
<div class="fig-ladder" style="--ladder: minmax(0, 1fr)">
<div class="fig-box"><b>32 scan goroutines</b><span>a table each, up to 65,536 groups</span></div>
<span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>A private log each</b><div class="fig-cells"><i style="--h: 44px"></i><i style="--h: 58px"></i><i style="--h: 40px"></i><i style="--h: 62px"></i><i style="--h: 50px"></i><i style="--h: 46px"></i><i style="--h: 60px"></i><i style="--h: 48px"></i></div><span>256 partitions each, kept until the scan ends</span></div>
<span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Merge after the scan</b><span>one partition at a time</span></div>
</div>
<ul class="fig-legend"><li>peak, top accounts <b>38.71 GiB</b></li></ul>
</div>
<div class="fig-group">
<div class="fig-head"><b>After</b><span>8655937b</span></div>
<div class="fig-ladder" style="--ladder: minmax(0, 1fr)">
<div class="fig-box"><b>32 scan goroutines</b><span>a table each, up to 65,536 groups</span></div>
<span class="fig-arrow fig-arrow--down"></span>
<div class="fig-dash"><div class="fig-dash__label">staging, 1 GiB for all</div><div class="fig-cells"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
<span class="fig-arrow fig-arrow--down"></span>
<div class="fig-box"><b>Shared hash partitions</b><div class="fig-cells"><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i><i style="--h: 10px"></i></div><span>256, a table and a mutex each, filled during the scan</span></div>
</div>
<ul class="fig-legend"><li>peak, top accounts <b>13.48 GiB</b></li></ul>
</div>
</div>
</div>
<figcaption>Where a hash aggregation's groups go once a goroutine's table is full, before and after commit 8655937b, drawn for the 32 scan goroutines of an m6i.8xlarge. The peaks are the server's VmHWM on the cold try of the previous post's top-accounts query (events per <code>did</code>, top 10), 1B store without a sort key (24 November 2026).</figcaption>
</figure>

The previous post showed the peaks; with the cold times they are:

| Query, no sort key, 1B | Peak before | Peak after | Cold before | Cold after |
| --- | --- | --- | --- | --- |
| Top accounts | 38.71&nbsp;GiB | 13.48&nbsp;GiB | 12.16&nbsp;s | 11.95&nbsp;s |
| Q2 | 25.12&nbsp;GiB | 14.50&nbsp;GiB | 14.38&nbsp;s | 13.48&nbsp;s |
| Distinct accounts | 23.23&nbsp;GiB | 12.90&nbsp;GiB | 9.75&nbsp;s | 9.21&nbsp;s |
| Q5 | 19.54&nbsp;GiB | 15.73&nbsp;GiB | not taken | not taken |

The same commit built with a budget too large to reach went back to 37.38, 25.11, 23.23 and 18.82 GiB and ran 8 to 10% faster hot, so the budget is what cuts the memory, at a small cost in time. I expect most of the 13 to 16 GiB that remain to be the groups and distinct values themselves and the blocks being decoded; I have not split it.

ClickHouse aggregates in hash tables too, with more than 40 specializations chosen by the key's types, and can spill a `GROUP BY` to disk past `max_bytes_before_external_group_by`, which is off by default ([GROUP BY](https://clickhouse.com/docs/sql-reference/statements/select/group-by)). LynxDB has no spill: the budget bounds the staging, and the shared partitions grow with the groups.

## What the design costs

Every block keeps metadata in memory for as long as the server runs: its 52-byte index entry, first key, key runs, filter entries and time records. It grows with the number of blocks whatever the queries are, and on the 1B store it is most of the 151 MiB read at startup. Token filters take 7.88 GB on disk whether anyone searches text or not; ClickHouse writes a skip index only when a table declares one.

With the sort key, text search reads more (a rare word read 1.6 GB with the key and 0.7 GB without), time windows get neither minute records nor block time bounds, and counting from key runs needs one key-ordered stream, which the store has only after its final merge. The previous post measured each of these.

No copy of the original JSON is kept, and events come back flat: `{"a": {"b": 1}}` and `{"a.b": 1}` are the same event to LynxDB, and a field that changes type becomes two columns. The hash path cannot spill to disk and, at 1B without a key, still peaks at 13 to 16 GiB.

ClickHouse has tools that LynxDB lacks: projections and materialized views that do a query's work at write time, skip indexes chosen per column, an inverted text index among them, sort and partition keys that are arbitrary expressions, and a `GROUP BY` that spills to disk. VictoriaLogs' daily partitions and streams make short time windows cheap, which LynxDB's single long partition does not.

I have not measured the footer size of the 1B store beyond the startup read, or Q2 while runs still overlap before the final merge. The code is in [lynxbase/lynxdb](https://github.com/lynxbase/lynxdb), and its [storage](https://github.com/lynxbase/lynxdb/blob/main/docs/site/docs/architecture/storage.md) and [indexing](https://github.com/lynxbase/lynxdb/blob/main/docs/site/docs/architecture/indexing.md) documentation covers the same structures for operators.

[^dict]: An index created with the `part_dictionary` setting, off by default, writes format version 17, which adds per-part string dictionaries before the directories. The benchmark store has none.
