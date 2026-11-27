---
layout: post
title: "Fourteen blocks of 61,246: how LynxDB answers JSONBench in 0.18 s"
authors:
  - Evgenii Orlov
thumb: thumb.png
image: thumb.png
excerpt: "LynxDB answers JSONBench's five queries over 1 billion Bluesky events in 0.18 s on a warm cache; ClickHouse's published result is 6.9 s. Most of the answer comes from metadata kept per block: the exact distinct count in Q2 opens 14 of 61,246 blocks. Without its sort key LynxDB takes 10.2 s, and ClickHouse is faster."
tags: ["Benchmarks"]
---

On 20 November 2026 I ran LynxDB through JSONBench at 1 billion documents on an AWS m6i.8xlarge and posted the totals on LinkedIn: 14 minutes to load, 93 GB on disk, 0.18 s for the five queries. The replies asked for cold times, for what the load time includes, whether the answers match ClickHouse's, and above all what a query reads to come back that fast. The counters the server reports for every query answer most of that, and they also show where the result does not carry over.

> Note Two sets of runs appear below. The published run is commit ad9d7e3b on 20 November: its result files are what the JSONBench page and the LinkedIn post show. The per-query counters (blocks opened, bytes read, memory) come from measurement runs on main 657aa79f on 24 and 25 November, on the same machine type with the same physical design. Their query times agree with the published ones within a few milliseconds. Each number says which run it is from.

Sizes on disk and bytes read are in decimal units (MB, GB); memory is in GiB.

## How JSONBench measures a database

JSONBench is ClickHouse's benchmark for JSON documents, kept in the `json/` directory of the ClickBench repository. Its data is the Bluesky Jetstream feed: 1,000 gzipped files of 1 million JSON lines each, and a dataset of size N is the first N files. At 1 billion the files take 134.1 GB gzipped and 482.1 GB as JSON.

Every system runs on a fresh m6i.8xlarge (32 vCPUs, 128 GB of memory, Ubuntu 24.04, a gp3 volume)[^volume], and the same driver measures it:

1. Install and start the system, then time its `load` script followed by `sync`. That is the load time.
2. Count the documents it holds.
3. For each query: stop the server, drop the page cache, start it again and run the query three times. Run 1 is the cold time; the faster of runs 2 and 3 is the hot time.
4. Read the size on disk after all queries, so merges that finish during the queries count.

The five queries, in PPL as the LynxDB entry runs them:

```ppl
source=bluesky | stats count() as count by commit.collection | sort - count
source=bluesky | where kind = 'commit' and commit.operation = 'create' | stats count() as count, distinct_count(did) as users by commit.collection | sort - count
source=bluesky | where kind = 'commit' and commit.operation = 'create' and commit.collection in ('app.bsky.feed.post', 'app.bsky.feed.repost', 'app.bsky.feed.like') | eval hour_of_day = hour(_time) | stats count() as count by commit.collection, hour_of_day | sort hour_of_day, commit.collection
source=bluesky | where kind = 'commit' and commit.operation = 'create' and commit.collection = 'app.bsky.feed.post' | stats min(_time) as first_post_ts by did | sort first_post_ts | head 3
source=bluesky | where kind = 'commit' and commit.operation = 'create' and commit.collection = 'app.bsky.feed.post' | stats min(_time) as tmin, max(_time) as tmax by did | eval activity_span = timestampdiff(MILLISECOND, from_unixtime(0), tmax) - timestampdiff(MILLISECOND, from_unixtime(0), tmin) | fields did, activity_span | sort - activity_span | head 3
```

| Query | What it asks |
| --- | --- |
| Q1 | Events per collection |
| Q2 | Create events per collection, with the exact number of distinct users |
| Q3 | Post, repost and like creates per collection and UTC hour of day |
| Q4 | The 3 users with the earliest first post |
| Q5 | The 3 users with the longest span between their first and last post |

Each system writes them in its own language. Q2 in ClickHouse SQL and in VictoriaLogs' LogsQL:

```sql
SELECT data.commit.collection AS event, count() AS count, uniqExact(data.did) AS users
FROM bluesky WHERE data.kind = 'commit' AND data.commit.operation = 'create'
GROUP BY event ORDER BY count DESC;
```

```text
{kind=commit,commit.operation=create} | by (commit.collection) count() count, count_uniq(did) users | sort (count desc)
```

The semantics match across LynxDB, ClickHouse and VictoriaLogs: `distinct_count` is exact like `uniqExact`, and `hour(_time)` is the hour in UTC. Elasticsearch and OpenSearch count distinct users approximately, with HyperLogLog++.

### How the LynxDB entry loads and queries

The entry declares its physical design when `load` creates the index, as ClickHouse's script creates its table with `ORDER BY`:

```json
{
  "sort_key": ["kind", "commit.operation", "commit.collection", "did"],
  "time_fields": ["time_us"],
  "partition": "366d"
}
```

Rows are ordered by those four fields and then by time, the same five columns as ClickHouse's `ORDER BY`. One 366-day partition holds every event, as ClickHouse's table has no `PARTITION BY`. LynxDB's own default, daily partitions and no sort key, gets its own section below.

`load` sends 16 files at once, each decompressed with `gzip -dc` and posted with `curl` to `/api/v1/ingest`. It ends with `POST /api/v1/indexes/bluesky/compact`, which returns when the final merge is done, so the load time includes the merges and the queries run with none in flight. In the published run the files took 394 s and the merge 430 s of the 824 s.

`query` is one HTTP request per query, timed by `curl` as the VictoriaLogs entry is:

```shell
curl -sS -G 'http://127.0.0.1:3100/api/v1/query' --data-urlencode "q=${query}"
```

Every response carries what the executor did in `meta.stats`. This is the `meta` of the cold Q2 try in the 25 November measurement run, with the counters that are zero left out:

```json
{
  "took_ms": 54.395,
  "rows": 43,
  "stats": {
    "blocks": 14,
    "skipped_by_key": 3265,
    "counted_by_index": 57967,
    "blocks_matched": 57981,
    "rows_matched": 947048380,
    "held_bytes": 2831000,
    "ordered": true
  }
}
```

Q2 from the command line, with `head 5`, against a server on my laptop (an Apple M4 Pro) that holds the first file of the dataset, 1 million events:

```console
$ lynxdb query --server http://127.0.0.1:3311 \
    'source=bluesky | where kind = "commit" and commit.operation = "create" | stats count() as count, distinct_count(did) as users by commit.collection | sort - count | head 5'
┌───────────────────────┬─────────┬─────────┐
│ commit.collection     │ count   │ users   │
├───────────────────────┼─────────┼─────────┤
│ app.bsky.feed.like    │ 444,523 │ 117,617 │
│ app.bsky.graph.follow │ 337,978 │  63,957 │
│ app.bsky.feed.post    │  86,812 │  50,464 │
│ app.bsky.feed.repost  │  56,993 │  26,581 │
│ app.bsky.graph.block  │  13,838 │   5,785 │
└───────────────────────┴─────────┴─────────┘
(5 rows)
───
  Rows  5
  Took  5ms
```

### How the page scores

Per query, the page divides each system's time plus 10 ms by the best time plus 10 ms, and takes the geometric mean of those ratios over the five queries. The combined score weighs that mean for the hot runs at 60%, for the cold runs at 20%, and the load time and the size, each against the best, at 10% each. Lower is better.

The LynxDB entry is not in ClickHouse's repository. It lives in the fork [lynxbase/ClickBench](https://github.com/lynxbase/ClickBench/tree/main/json/lynxdb), and I ran it on my own AWS account in eu-north-1, not in ClickBench's CI. The other systems' rows are the results published in ClickBench.

## One billion events, five systems

<figure class="fig">
<div class="fig-panel">
<div class="fig-group">
<div class="fig-head"><b>Hot sum of the five queries</b><span>seconds, log scale</span></div>
<ol class="fig-bars">
<li class="fig-bar is-lx"><span>LynxDB</span><span class="fig-track"><i style="--w: 6.2%"></i></span><b>0.18 s</b></li>
<li class="fig-bar"><span>ClickHouse</span><span class="fig-track"><i style="--w: 45.9%"></i></span><b>6.87 s</b></li>
<li class="fig-bar"><span>VictoriaLogs</span><span class="fig-track"><i style="--w: 63.5%"></i></span><b>34.68 s</b></li>
<li class="fig-bar"><span>Elasticsearch</span><span class="fig-track"><i style="--w: 60.8%"></i></span><b>27.09 s</b></li>
<li class="fig-bar"><span>OpenSearch</span><span class="fig-track"><i style="--w: 92.8%"></i></span><b>516.98 s</b></li>
<li class="fig-sub">later runs, not on the JSONBench page</li>
<li class="fig-bar is-alt"><span>LynxDB, no key</span><span class="fig-track"><i style="--w: 50.2%"></i></span><b>10.19 s</b></li>
<li class="fig-bar is-alt"><span>ClickHouse 26.12</span><span class="fig-track"><i style="--w: 39.8%"></i></span><b>3.91 s</b></li>
</ol>
<div class="fig-axis" aria-hidden="true"><span><i style="--x: 0%">0.1</i><i style="--x: 25%">1</i><i style="--x: 50%">10</i><i class="fig-wide" style="--x: 75%">100</i><i style="--x: 100%">1,000</i></span></div>
</div>
<div class="fig-cols">
<div class="fig-group">
<div class="fig-head"><b>Load time</b><span>s, log scale</span></div>
<ol class="fig-bars" style="--ticks: 3">
<li class="fig-bar is-lx"><span>LynxDB</span><span class="fig-track"><i style="--w: 30.5%"></i></span><b>824 s</b></li>
<li class="fig-bar"><span>ClickHouse</span><span class="fig-track"><i style="--w: 59.4%"></i></span><b>6,042 s</b></li>
<li class="fig-bar"><span>VictoriaLogs</span><span class="fig-track"><i style="--w: 34.4%"></i></span><b>1,078 s</b></li>
<li class="fig-bar"><span>Elasticsearch</span><span class="fig-track"><i style="--w: 78.2%"></i></span><b>22,255 s</b></li>
<li class="fig-bar"><span>OpenSearch</span><span class="fig-track"><i style="--w: 93.6%"></i></span><b>64,360 s</b></li>
</ol>
<div class="fig-axis" aria-hidden="true"><span><i style="--x: 0%">100</i><i style="--x: 33.33%">1k</i><i style="--x: 66.67%; --t: -50%">10k</i></span></div>
</div>
<div class="fig-group">
<div class="fig-head"><b>Size on disk</b><span>GB</span></div>
<ol class="fig-bars" style="--ticks: 2">
<li class="fig-bar is-lx"><span>LynxDB</span><span class="fig-track"><i style="--w: 23.2%"></i></span><b>92.7 GB</b></li>
<li class="fig-bar"><span>ClickHouse</span><span class="fig-track"><i style="--w: 48.9%"></i></span><b>195.8 GB</b></li>
<li class="fig-bar"><span>VictoriaLogs</span><span class="fig-track"><i style="--w: 30.3%"></i></span><b>121.4 GB</b></li>
<li class="fig-bar"><span>Elasticsearch</span><span class="fig-track"><i style="--w: 96.2%"></i></span><b>384.7 GB</b></li>
<li class="fig-bar"><span>OpenSearch</span><span class="fig-track"><i style="--w: 71.3%"></i></span><b>285.1 GB</b></li>
</ol>
<div class="fig-axis" aria-hidden="true"><span><i style="--x: 0%">0</i><i style="--x: 50%">200</i><i style="--x: 100%">400</i></span></div>
</div>
</div>
</div>
<figcaption>JSONBench at 1 billion documents on an AWS m6i.8xlarge. LynxDB is the published run (commit ad9d7e3b, 20 November 2026); the other solid rows are the results published in ClickBench. The outlined rows are later runs on the same machine type: LynxDB at main 657aa79f with its default design and no sort key (25 November), and ClickHouse 26.12.1 rerun by me (24 November).</figcaption>
</figure>

| System, version, date | Load | Size | Hot sum | Cold sum | Documents |
| --- | --- | --- | --- | --- | --- |
| LynxDB ad9d7e3b, 2026-11-20 | 824&nbsp;s | 92.7&nbsp;GB | 0.18&nbsp;s | 0.48&nbsp;s | 1,000,000,000 |
| ClickHouse 26.11.1, 2026-11-16 | 6,042&nbsp;s | 195.8&nbsp;GB | 6.87&nbsp;s | 9.24&nbsp;s | 999,999,258 |
| VictoriaLogs v1.53.0, 2026-11-02 | 1,078&nbsp;s | 121.4&nbsp;GB | 34.68&nbsp;s | 40.22&nbsp;s | 999,999,241 |
| Elasticsearch 9.5.6, 2026-11-02 | 22,255&nbsp;s | 384.7&nbsp;GB | 27.09&nbsp;s | 27.35&nbsp;s | 999,999,034 |
| OpenSearch 3.9.0, 2026-11-04 | 64,360&nbsp;s | 285.1&nbsp;GB | 516.98&nbsp;s | 202.13&nbsp;s | 999,999,241 |

The hot times per query, in seconds:

| Query | LynxDB | ClickHouse | VictoriaLogs | Elasticsearch | OpenSearch |
| --- | --- | --- | --- | --- | --- |
| Q1 | 0.0012 | 0.239 | 0.033 | 0.618 | 19.922 |
| Q2 | 0.049 | 2.767 | 19.155 | 4.930 | 59.570 |
| Q3 | 0.062 | 2.302 | 1.521 | 14.213 | 412.161 |
| Q4 | 0.0028 | 0.757 | 5.914 | 3.443 | 6.960 |
| Q5 | 0.063 | 0.805 | 8.053 | 3.887 | 18.367 |

Cold, the published run took 1.8, 49.7, 103.3, 8.0 and 319.8 ms for Q1 to Q5. Q5 makes up 257 of the 305 ms between the cold and hot sums, because it is the only query that reads much column data.

The page's combined score puts ClickHouse at 19.03 times LynxDB's, VictoriaLogs at 29.55, Elasticsearch at 65.2 and OpenSearch at 399.7 (my replication of the page's code). The ratio grows with the data: ClickHouse's is 1.89 at 1 million documents and 7.25 at 100 million.

OpenSearch's Q3 is slower hot than cold (412 s against 91 s), which inflates its hot sum; Elasticsearch's Q3 does the same (14.2 s against 5.9 s).

## The sort key decides what each query reads

In the measurement run the 1B store holds 92 parts with 61,246 blocks of up to 16,384 rows. Besides the column data, each part ends in a footer that describes its blocks:

- the first sort key of every block, its row count and its time range;
- for every block, how many distinct key prefixes it holds at each depth of the sort key (`KeyRuns`), and how many leading key columns its first row shares with the last row of the block before (`KeyShared`);
- exact value counts for string fields with at most 256 values;
- row counts per UTC minute, hour and day for every block.

Next to the column data, each block also has token filters for its string columns. When the server starts it reads 151 MiB (158 MB) in 1.39 s. About 34 MB of that is its own executable, which it loads into the page cache before it listens; the rest is the part footers, which opening the index reads. The benchmark's `check` passes only after that, so no query pays for the read. The ClickHouse entry also loads its primary keys at startup. How the footer is laid out and built is the subject of the next post, [Inside the LynxDB engine](../inside-the-lynxdb-engine/).

With the benchmark's sort key, four of the five queries find most of their answer in that metadata.

<figure class="fig">
<div class="fig-panel">
<div class="fig-head"><b>Where each answer comes from</b><span>sort key: kind, operation, collection, did</span></div>
<div class="fig-flow">
<div class="fig-flow__head"><span>blocks read</span></div>
<div class="fig-frame">
<div class="fig-frame__label"><span>Part footers, in memory<br>read when the server starts</span></div>
<div class="fig-flow__row"><span><code>Q1</code><span>events per collection</span></span><span class="fig-arrow"></span><div class="fig-box"><b>Value counts</b><span>commit.collection, per part</span></div><em>0</em></div>
<div class="fig-flow__row"><span><code>Q2</code><span>creates and users</span></span><span class="fig-arrow"></span><div class="fig-box"><b>Key runs</b><span>KeyRuns, KeyShared per block</span></div><em>14</em></div>
<div class="fig-flow__row"><span><code>Q3</code><span>creates by hour</span></span><span class="fig-arrow"></span><div class="fig-box"><b>Hour buckets</b><span>rows per UTC hour, per block</span></div><em>5</em></div>
</div>
<div class="fig-frame">
<div class="fig-frame__label"><span>Column data, on disk</span></div>
<div class="fig-flow__row"><span><code>Q4</code><span>first posters</span></span><span class="fig-arrow"></span><div class="fig-box"><b>Time-ordered scan with a bound</b><span>stops past the 3rd first post</span></div><em>32</em></div>
<div class="fig-flow__row"><span><code>Q5</code><span>longest activity</span></span><span class="fig-arrow"></span><div class="fig-box"><b>Run ends from _time</b><span>first and last row per did</span></div><em>5,513</em></div>
</div>
<hr>
<div class="fig-flow__row"><span><code>Q2 Q3 Q5</code><span>no sort key</span></span><span class="fig-arrow"></span><div class="fig-box"><b>Hash aggregation over every block</b><span>Q1 and Q4 keep their paths</span></div><em>61,041</em></div>
</div>
</div>
<figcaption>The path each query takes on the 1B store, and the number of blocks whose rows were read on the cold try. Counts from the measurement run on main 657aa79f (25 November 2026): 61,246 blocks with the sort key, 61,043 without it.</figcaption>
</figure>

### Q1 sums value counts from 92 footers

Q1 has no filter and groups by `commit.collection`, a field with a few dozen values. Every part's footer already holds the exact count of each value, so the executor adds up 92 small tables and opens no block. The cold try read 0.07 MB and took 1.9 ms, with or without the sort key.

### Q2 counts distinct users from key runs

Q2 filters on the first two key columns, groups by the third and counts distinct values of the fourth. In key order, the rows of one user sit next to each other inside a collection, so the number of distinct users in a collection is the number of `did` runs in it.

The footer stores those runs per block. If a block holds one collection (`KeyRuns` at depth 3 is 1), the executor adds the block's row count to the collection's count and its `KeyRuns` at depth 4 to the users, less one when the block's first row continues the previous block's last user (`KeyShared` of 4). Only blocks in which the collection changes have to be opened.

<figure class="fig">
<div class="fig-panel">
<div class="fig-head"><b>Q2 on 61,246 blocks in sort-key order</b><span>schematic</span></div>
<div class="fig-strip" style="--cols: 36">
<div class="fig-ranges is-over" aria-hidden="true"><span style="--c: 3; --n: 29">kind = commit, operation = create</span></div>
<div class="fig-blocks" aria-hidden="true"><i class="is-skip"></i><i class="is-skip"></i><i class="is-read"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-read"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-read"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-read"></i><i class="is-meta"></i><i class="is-read"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-meta"></i><i class="is-read"></i><i class="is-meta"></i><i class="is-read"></i><i class="is-skip"></i><i class="is-skip"></i><i class="is-skip"></i><i class="is-skip"></i><i class="is-skip"></i></div>
<div class="fig-ranges is-under" aria-hidden="true"><span style="--c: 4; --n: 8">like</span><span class="fig-wide" style="--c: 13; --n: 3">post</span><span class="fig-wide" style="--c: 17; --n: 3">repost</span><span style="--c: 23; --n: 6">follow</span></div>
</div>
<div class="fig-group">
<div class="fig-head"><span>the 61,246 blocks to scale</span></div>
<div class="fig-share" aria-hidden="true"><i class="is-skip" style="--g: 3265"></i><i class="is-meta" style="--g: 57967"></i><i class="is-read" style="--g: 14"></i></div>
<ul class="fig-legend"><li><i class="is-skip"></i>skipped by key <b>3,265</b></li><li><i class="is-meta"></i>counted from key runs <b>57,967</b></li><li><i class="is-read"></i>opened <b>14</b></li></ul>
</div>
<div class="fig-cols">
<div class="fig-box"><b><i class="is-meta"></i>A block inside one collection</b><span>KeyRuns(3) = 1</span><span>count += rows</span><span>users += KeyRuns(4)</span><span>users -= 1 if KeyShared ≥ 4</span></div>
<div class="fig-box"><b><i class="is-read"></i>A block where the collection changes</b><span>KeyRuns(3) &gt; 1</span><span>opened, and its rows grouped as they are read</span></div>
</div>
</div>
<figcaption>Q2's path through the 1B store. Blocks outside <code>kind = commit</code>, <code>operation = create</code> are skipped by their first keys; blocks that hold one collection are counted from the footer; blocks where a collection changes are opened. The strip is a schematic, one square for many blocks; the share bar and the counts are from the cold Q2 try of the measurement run (main 657aa79f, 25 November 2026).</figcaption>
</figure>

Most of the 43 collections with create events are tiny and share blocks, so 14 blocks hold every collection boundary. The cold try read 1.9 MB (1.4 MB in two repeats), used 0.20 CPU-seconds and peaked at 190 MiB, for 0.056 s cold and 0.053 s hot (0.050 and 0.049 s in the published run).

The count is exact as long as the parts follow one another in key order, so that a user's runs never sit in two places; after the final merge they do. With daily partitions and the same key the store has 488 parts in several key-ordered streams, and Q2 counts 63,003 blocks from another per-block record (`counted_by_entries`), opens 1,090, reads 1.5 GB and takes 2.77 s cold and 1.05 s hot.

### Q3 counts from hour buckets

The hour of day is not in the sort key, so Q3 uses the time buckets: a block that holds a single collection, all of it `commit` and `create`, contributes its row counts per UTC hour straight from the footer.

Key ranges from the `in` list skip 21,796 blocks and the token filters 1,922. Of the remaining 37,528, the executor counts 37,523 from their hour records and reads rows from 5, so the `blocks` counter says 37,528 while the device read 0.5 MB. Walking those records still costs 1.34 CPU-seconds; the cold try took 0.099 s (0.103 s in the published run).

### Q4 scans in time order and stops early

Q4 asks for the three smallest `min(_time)` per user among post creates. The planner turns `sort | head 3` into a top-3, and the executor visits blocks in order of their earliest row. Once it has three users, it skips every block whose earliest row is later than the third of them: such a block cannot hold a smaller first post.

It opened 32 blocks, read 3.2 MB and took 7.1 ms cold. The rest were skipped: 3,686 by key, 5,481 by time, and 52,047 under the token counter, which I read as whole parts with no `app.bsky.feed.post` in their footer value counts. Q4 does not need the key either: on the store without one it opens a single block.

### Q5 is the query that reads data

Q5 needs the first and last post of each of 3.9 million users, 89.9 million rows. In key order a user's posts are one run sorted by time, so the executor reads the `_time` column of the 5,513 blocks of post creates and takes the ends of each run, with no hash table.

That is 518 MB from the device, 1.5 CPU-seconds and 734 MiB of peak memory, for 0.317 s cold and 0.063 s hot[^q5].

## Without the sort key, ClickHouse is faster

LynxDB's default design, daily partitions and no sort key, loads the 1B dataset in 1,008 s into 107.8 GB and runs the five queries in 10.19 s hot and 34.95 s cold (main 657aa79f, 25 November). ClickHouse 26.11's published sums are 6.87 s and 9.24 s.

<figure class="fig">
<div class="fig-panel" style="--fig-label: 76px">
<div class="fig-head"><b>The cold try with and without the sort key</b><span>MB read (log scale), blocks read, time</span></div>
<ol class="fig-bars has-notes" style="--ticks: 7">
<li class="fig-sub"><b>Q1</b> events per collection</li>
<li class="fig-bar is-lx"><span>sort key</span><span class="fig-track"><i style="--w: 12.1%"></i></span><b>0.07 MB</b><small>0 blocks · 0.0019 s</small></li>
<li class="fig-bar"><span>no key</span><span class="fig-track"><i style="--w: 12.1%"></i></span><b>0.07 MB</b><small>0 blocks · 0.0019 s</small></li>
<li class="fig-sub"><b>Q2</b> creates and users</li>
<li class="fig-bar is-lx"><span>sort key</span><span class="fig-track"><i style="--w: 32.5%"></i></span><b>1.9 MB</b><small>14 blocks · 0.056 s</small></li>
<li class="fig-bar"><span>no key</span><span class="fig-track"><i style="--w: 86.7%"></i></span><b>11,792 MB</b><small>61,041 blocks · 13.43 s</small></li>
<li class="fig-sub"><b>Q3</b> creates by hour</li>
<li class="fig-bar is-lx"><span>sort key</span><span class="fig-track"><i style="--w: 24.3%"></i></span><b>0.5 MB</b><small>5 blocks · 0.099 s</small></li>
<li class="fig-bar"><span>no key</span><span class="fig-track"><i style="--w: 79.3%"></i></span><b>3,530 MB</b><small>61,041 blocks · 9.31 s</small></li>
<li class="fig-sub"><b>Q4</b> first posters</li>
<li class="fig-bar is-lx"><span>sort key</span><span class="fig-track"><i style="--w: 35.7%"></i></span><b>3.2 MB</b><small>32 blocks · 0.0071 s</small></li>
<li class="fig-bar"><span>no key</span><span class="fig-track"><i style="--w: 17.6%"></i></span><b>0.17 MB</b><small>1 block · 0.0109 s</small></li>
<li class="fig-sub"><b>Q5</b> longest activity</li>
<li class="fig-bar is-lx"><span>sort key</span><span class="fig-track"><i style="--w: 67.3%"></i></span><b>518 MB</b><small>5,513 blocks · 0.317 s</small></li>
<li class="fig-bar"><span>no key</span><span class="fig-track"><i style="--w: 87.7%"></i></span><b>13,755 MB</b><small>61,041 blocks · 12.13 s</small></li>
</ol>
<div class="fig-axis" aria-hidden="true"><span><i style="--x: 0%">0.01</i><i style="--x: 28.57%">1</i><i style="--x: 57.14%">100</i><i style="--x: 85.71%; --t: -50%">10,000</i></span></div>
</div>
<figcaption>Bytes read from the device on the cold try of each query, the blocks whose rows were read (with the key, Q3 also counts 37,523 blocks from their hour buckets) and the cold time. 1B store on an m6i.8xlarge, main 657aa79f, 25 November 2026: with the sort key in one partition (61,246 blocks), and in LynxDB's default design of daily partitions without a key (61,043 blocks).</figcaption>
</figure>

Q1 and Q4 keep their paths. Q2, Q3 and Q5 read every block and group rows in hash tables: Q2 reads 11.8 GB, uses 137 CPU-seconds and peaks at 14.5 GiB, for 13.43 s cold and 5.17 s hot, and Q5 takes 12.13 s cold and 3.91 s hot.

Daily partitions with the sort key sit between the two at 1.35 s hot, most of it Q2, which loses the key-run count across partitions.

### Memory on the hash path

The hash aggregation behind the no-key numbers changed after the published run. Until 24 November each scan goroutine kept a private log of its groups and distinct values until the scan ended, so memory grew with the number of rows. Commit 8655937b, merged that day, stages them under one shared budget of 1 GiB (and as much again for distinct values) and drains them into hash partitions that all goroutines share.

<figure class="fig">
<div class="fig-panel" style="--fig-label: 76px">
<div class="fig-head"><b>Peak memory of the server on the cold try</b><span>GiB, no sort key</span></div>
<ol class="fig-bars">
<li class="fig-sub"><b>top accounts</b> stats count() by did | sort - n | head 10</li>
<li class="fig-bar"><span>before</span><span class="fig-track"><i style="--w: 96.8%"></i></span><b>38.71</b></li>
<li class="fig-bar is-lx"><span>after</span><span class="fig-track"><i style="--w: 33.7%"></i></span><b>13.48</b></li>
<li class="fig-sub"><b>Q2</b> creates and users</li>
<li class="fig-bar"><span>before</span><span class="fig-track"><i style="--w: 62.8%"></i></span><b>25.12</b></li>
<li class="fig-bar is-lx"><span>after</span><span class="fig-track"><i style="--w: 36.3%"></i></span><b>14.50</b></li>
<li class="fig-sub"><b>distinct accounts</b> stats distinct_count(did)</li>
<li class="fig-bar"><span>before</span><span class="fig-track"><i style="--w: 58.1%"></i></span><b>23.23</b></li>
<li class="fig-bar is-lx"><span>after</span><span class="fig-track"><i style="--w: 32.3%"></i></span><b>12.90</b></li>
<li class="fig-sub"><b>Q5</b> longest activity</li>
<li class="fig-bar"><span>before</span><span class="fig-track"><i style="--w: 48.9%"></i></span><b>19.54</b></li>
<li class="fig-bar is-lx"><span>after</span><span class="fig-track"><i style="--w: 39.3%"></i></span><b>15.73</b></li>
</ol>
<div class="fig-axis" aria-hidden="true"><span><i style="--x: 0%">0</i><i style="--x: 25%">10</i><i style="--x: 50%">20</i><i style="--x: 75%">30</i><i style="--x: 100%">40</i></span></div>
</div>
<figcaption>Peak memory of the server (VmHWM) on the cold try, 1B store without a sort key (daily partitions, 107.8 GB), m6i.8xlarge, 24 November 2026: main 400bddbb before the change, 8655937b after.</figcaption>
</figure>

Times moved little: Q2 went from 14.38 s to 13.48 s cold. Built with a very large budget, the same commit went back to 37.38 GiB for top accounts, so the budget is what cuts the memory. The sort-key design builds no such tables for Q2 to Q5.

## Where the sort key helps and where it works against it

Five queries are a narrow test, so I also wrote 25 log-style queries and ran all 30 cold and hot at 1B on the same machine type: LynxDB on the benchmark's design (main 657aa79f, 25 November), ClickHouse 26.12.1 and VictoriaLogs v1.54.0 (24 November). LynxDB is faster than both on 21 of the 30 cold and 19 of the 30 hot, and it does so from the smallest store of the five systems: 92.7 GB against 121.4 to 384.7 GB.

<figure class="fig" data-fig-ratio>
<div class="fig-panel fig-ratio">
<div class="fig-head"><b>LynxDB against the faster of ClickHouse and VictoriaLogs</b><span>cold time ratio, log scale</span></div>
<div class="fig-controls" hidden><div class="fig-seg" role="group" aria-label="Compare LynxDB with"><button type="button" data-vs="best" aria-pressed="true">Faster of the two</button><button type="button" data-vs="ch" aria-pressed="false">ClickHouse</button><button type="button" data-vs="vl" aria-pressed="false">VictoriaLogs</button></div><div class="fig-seg" role="group" aria-label="Run"><button type="button" data-run="cold" aria-pressed="true">Cold</button><button type="button" data-run="hot" aria-pressed="false">Hot</button></div></div>
<p class="fig-count" aria-live="polite">LynxDB is faster on <b>21</b> of <span>30</span> queries. Open a query for its PPL and times.</p>
<div class="fig-axis" aria-hidden="true"><span><i style="--x: 50%; --t: calc(-100% - 8px)">LynxDB faster</i><i style="--x: 50%; --t: 8px">LynxDB slower</i></span></div>
<ol class="fig-bars" style="--ticks: 8">
<li class="fig-sub" data-group="fast"><b>Clearly faster, <span>15</span></b> under 0.85×</li>
<li class="fig-qrow" data-q="anyfield_word_count"><details><summary class="fig-bar"><span>a word in any field</span><span class="fig-track"><i style="--x0: min(24.4%, calc(50% - 3px)); --w: 25.6%"></i></span><b>0.009×</b></summary><div class="fig-qrow__body"><p>Counts events with the word &#x27;earthquake&#x27; in any field. LynxDB read rows from 2,855 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky earthquake | stats count() as n</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.884 s</td><td>0.516 s</td></tr><tr><td>ClickHouse</td><td>591 s</td><td>no run</td></tr><tr><td>VictoriaLogs</td><td>98.4 s</td><td>43.3 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="Q4"><details><summary class="fig-bar"><span>Q4 first posters</span><span class="fig-track"><i style="--x0: min(25.5%, calc(50% - 3px)); --w: 24.5%"></i></span><b>0.011×</b></summary><div class="fig-qrow__body"><p>The three accounts whose first post is the earliest. LynxDB read rows from 32 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where kind = &#x27;commit&#x27; and commit.operation = &#x27;create&#x27; and commit.collection = &#x27;app.bsky.feed.post&#x27; | stats min(_time) as first_post_ts by did | sort first_post_ts | head 3</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.0071 s</td><td>0.0017 s</td></tr><tr><td>ClickHouse</td><td>0.644 s</td><td>0.486 s</td></tr><tr><td>VictoriaLogs</td><td>6.91 s</td><td>5.56 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="Q1"><details><summary class="fig-bar"><span>Q1 events per collection</span><span class="fig-track"><i style="--x0: min(28.1%, calc(50% - 3px)); --w: 21.9%"></i></span><b>0.018×</b></summary><div class="fig-qrow__body"><p>Counts all events by collection. LynxDB read rows from 0 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | stats count() as count by commit.collection | sort - count</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.0019 s</td><td>0.0016 s</td></tr><tr><td>ClickHouse</td><td>0.132 s</td><td>0.0990 s</td></tr><tr><td>VictoriaLogs</td><td>0.106 s</td><td>0.0471 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="Q2"><details><summary class="fig-bar"><span>Q2 creates and users</span><span class="fig-track"><i style="--x0: min(30.8%, calc(50% - 3px)); --w: 19.2%"></i></span><b>0.029×</b></summary><div class="fig-qrow__body"><p>Counts create events per collection, with the exact number of distinct accounts. LynxDB read rows from 14 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where kind = &#x27;commit&#x27; and commit.operation = &#x27;create&#x27; | stats count() as count, distinct_count(did) as users by commit.collection | sort - count</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.0558 s</td><td>0.0533 s</td></tr><tr><td>ClickHouse</td><td>1.93 s</td><td>1.70 s</td></tr><tr><td>VictoriaLogs</td><td>20.6 s</td><td>18.5 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="word_absent_count"><details><summary class="fig-bar"><span>count an absent word</span><span class="fig-track"><i style="--x0: min(31.1%, calc(50% - 3px)); --w: 18.9%"></i></span><b>0.031×</b></summary><div class="fig-qrow__body"><p>Counts events whose post text holds a word that appears nowhere; the answer is 0. LynxDB read rows from 0 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where match(commit.record.text, &#x27;zqxjkvwpyhh&#x27;) | stats count() as n</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.0948 s</td><td>0.0010 s</td></tr><tr><td>ClickHouse</td><td>3.06 s</td><td>0.0030 s</td></tr><tr><td>VictoriaLogs</td><td>3.81 s</td><td>3.04 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="Q3"><details><summary class="fig-bar"><span>Q3 creates by hour</span><span class="fig-track"><i style="--x0: min(34.6%, calc(50% - 3px)); --w: 15.4%"></i></span><b>0.059×</b></summary><div class="fig-qrow__body"><p>Counts post, repost and like creates per collection and UTC hour of day. LynxDB read rows from 5 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where kind = &#x27;commit&#x27; and commit.operation = &#x27;create&#x27; and commit.collection in (&#x27;app.bsky.feed.post&#x27;, &#x27;app.bsky.feed.repost&#x27;, &#x27;app.bsky.feed.like&#x27;) | eval hour_of_day = hour(_time) | stats count() as count by commit.collection, hour_of_day | sort hour_of_day, commit.collection</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.0988 s</td><td>0.0607 s</td></tr><tr><td>ClickHouse</td><td>1.89 s</td><td>1.11 s</td></tr><tr><td>VictoriaLogs</td><td>1.67 s</td><td>1.52 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="rkey_lookup"><details><summary class="fig-bar"><span>one record by its key</span><span class="fig-track"><i style="--x0: min(39.6%, calc(50% - 3px)); --w: 10.4%"></i></span><b>0.15×</b></summary><div class="fig-qrow__body"><p>The event with one given record key; one row matches. LynxDB read rows from 71 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky commit.rkey=&quot;3lbhuei4dic2u&quot;</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.165 s</td><td>0.0117 s</td></tr><tr><td>ClickHouse</td><td>5.47 s</td><td>0.0100 s</td></tr><tr><td>VictoriaLogs</td><td>1.12 s</td><td>0.0674 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="word_rare_count"><details><summary class="fig-bar"><span>count a rare word</span><span class="fig-track"><i style="--x0: min(40.8%, calc(50% - 3px)); --w: 9.2%"></i></span><b>0.18×</b></summary><div class="fig-qrow__body"><p>Counts events whose post text holds the rare word &#x27;earthquake&#x27;. LynxDB read rows from 2,243 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where match(commit.record.text, &#x27;earthquake&#x27;) | stats count() as n</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.559 s</td><td>0.419 s</td></tr><tr><td>ClickHouse</td><td>3.06 s</td><td>0.447 s</td></tr><tr><td>VictoriaLogs</td><td>3.86 s</td><td>3.32 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="tail100"><details><summary class="fig-bar"><span>latest 100 events</span><span class="fig-track"><i style="--x0: min(42.8%, calc(50% - 3px)); --w: 7.2%"></i></span><b>0.27×</b></summary><div class="fig-qrow__body"><p>The 100 most recent events of any kind. LynxDB read rows from 128 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | sort - _time | head 100</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.0981 s</td><td>0.0522 s</td></tr><tr><td>ClickHouse</td><td>3.58 s</td><td>0.0820 s</td></tr><tr><td>VictoriaLogs</td><td>0.368 s</td><td>0.124 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="tail100_posts"><details><summary class="fig-bar"><span>latest 100 posts</span><span class="fig-track"><i style="--x0: min(43.3%, calc(50% - 3px)); --w: 6.7%"></i></span><b>0.29×</b></summary><div class="fig-qrow__body"><p>The 100 most recent events in the post collection. LynxDB read rows from 254 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where commit.collection = &#x27;app.bsky.feed.post&#x27; | sort - _time | head 100</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.138 s</td><td>0.0651 s</td></tr><tr><td>ClickHouse</td><td>0.483 s</td><td>0.197 s</td></tr><tr><td>VictoriaLogs</td><td>0.470 s</td><td>0.211 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="langs"><details><summary class="fig-bar"><span>top post languages</span><span class="fig-track"><i style="--x0: min(44.3%, calc(50% - 3px)); --w: 5.7%"></i></span><b>0.35×</b></summary><div class="fig-qrow__body"><p>The 10 most common language lists of posts. LynxDB read rows from 10,918 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where commit.collection = &#x27;app.bsky.feed.post&#x27; | stats count() as n by commit.record.langs | sort - n | head 10</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.117 s</td><td>0.0031 s</td></tr><tr><td>ClickHouse</td><td>0.351 s</td><td>0.308 s</td></tr><tr><td>VictoriaLogs</td><td>0.338 s</td><td>0.264 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="user_heavy_tail"><details><summary class="fig-bar"><span>latest 100 of a busy account</span><span class="fig-track"><i style="--x0: min(45.1%, calc(50% - 3px)); --w: 4.9%"></i></span><b>0.41×</b></summary><div class="fig-qrow__body"><p>The 100 most recent events of one busy account. LynxDB read rows from 57 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky did=&quot;did:plc:74p5m4owldmqdvaday77brpt&quot; | sort - _time | head 100</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.0668 s</td><td>0.0148 s</td></tr><tr><td>ClickHouse</td><td>0.164 s</td><td>0.0160 s</td></tr><tr><td>VictoriaLogs</td><td>0.407 s</td><td>0.164 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="user_light_tail"><details><summary class="fig-bar"><span>latest 100 of a quiet account</span><span class="fig-track"><i style="--x0: min(45.3%, calc(50% - 3px)); --w: 4.7%"></i></span><b>0.42×</b></summary><div class="fig-qrow__body"><p>The 100 most recent events of one quiet account. LynxDB read rows from 50 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky did=&quot;did:plc:yj3sjq3blzpynh27cumnp5ks&quot; | sort - _time | head 100</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.0927 s</td><td>0.0197 s</td></tr><tr><td>ClickHouse</td><td>0.219 s</td><td>0.0260 s</td></tr><tr><td>VictoriaLogs</td><td>1.51 s</td><td>0.428 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="word_rare_tail"><details><summary class="fig-bar"><span>latest 100 with a rare word</span><span class="fig-track"><i style="--x0: min(46.0%, calc(50% - 3px)); --w: 4.0%"></i></span><b>0.48×</b></summary><div class="fig-qrow__body"><p>The 100 most recent events whose post text holds &#x27;earthquake&#x27;. LynxDB read rows from 2,228 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where match(commit.record.text, &#x27;earthquake&#x27;) | sort - _time | head 100</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.836 s</td><td>0.483 s</td></tr><tr><td>ClickHouse</td><td>3.91 s</td><td>0.182 s</td></tr><tr><td>VictoriaLogs</td><td>1.74 s</td><td>1.14 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="Q5"><details><summary class="fig-bar"><span>Q5 longest activity</span><span class="fig-track"><i style="--x0: min(46.0%, calc(50% - 3px)); --w: 4.0%"></i></span><b>0.48×</b></summary><div class="fig-qrow__body"><p>The three accounts with the longest span between their first and last post. LynxDB read rows from 5,513 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where kind = &#x27;commit&#x27; and commit.operation = &#x27;create&#x27; and commit.collection = &#x27;app.bsky.feed.post&#x27; | stats min(_time) as tmin, max(_time) as tmax by did | eval activity_span = timestampdiff(MILLISECOND, from_unixtime(0), tmax) - timestampdiff(MILLISECOND, from_unixtime(0), tmin) | fields did, activity_span | sort - activity_span | head 3</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.317 s</td><td>0.0634 s</td></tr><tr><td>ClickHouse</td><td>0.658 s</td><td>0.504 s</td></tr><tr><td>VictoriaLogs</td><td>9.53 s</td><td>7.94 s</td></tr></tbody></table></div></details></li>
<li class="fig-sub" data-group="even"><b>About even, <span>6</span></b> 0.85× to 1.18×</li>
<li class="fig-qrow" data-q="word_common_count"><details><summary class="fig-bar"><span>count a common word</span><span class="fig-track"><i style="--x0: min(49.4%, calc(50% - 3px)); --w: 0.6%"></i></span><b>0.89×</b></summary><div class="fig-qrow__body"><p>Counts events whose post text holds the common word &#x27;love&#x27;. LynxDB read rows from 5,503 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where match(commit.record.text, &#x27;love&#x27;) | stats count() as n</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>2.76 s</td><td>1.00 s</td></tr><tr><td>ClickHouse</td><td>3.10 s</td><td>1.06 s</td></tr><tr><td>VictoriaLogs</td><td>3.81 s</td><td>3.21 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="regex_count"><details><summary class="fig-bar"><span>count a regex match</span><span class="fig-track"><i style="--x0: min(49.4%, calc(50% - 3px)); --w: 0.6%"></i></span><b>0.89×</b></summary><div class="fig-qrow__body"><p>Counts events whose post text matches a phone-number pattern. LynxDB read rows from 5,775 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where regexp_match(commit.record.text, &#x27;[0-9]{3}-[0-9]{3}-[0-9]{4}&#x27;) | stats count() as n</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>2.76 s</td><td>0.358 s</td></tr><tr><td>ClickHouse</td><td>3.09 s</td><td>0.685 s</td></tr><tr><td>VictoriaLogs</td><td>10.7 s</td><td>10.3 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="substring_count"><details><summary class="fig-bar"><span>count a substring</span><span class="fig-track"><i style="--x0: min(49.4%, calc(50% - 3px)); --w: 0.6%"></i></span><b>0.9×</b></summary><div class="fig-qrow__body"><p>Counts events whose post text contains &#x27;bitcoin&#x27; anywhere, inside words too. LynxDB read rows from 5,775 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where like(commit.record.text, &#x27;%bitcoin%&#x27;) | stats count() as n</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>2.75 s</td><td>0.828 s</td></tr><tr><td>ClickHouse</td><td>3.07 s</td><td>0.801 s</td></tr><tr><td>VictoriaLogs</td><td>12.1 s</td><td>11.8 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="phrase_count"><details><summary class="fig-bar"><span>count a phrase</span><span class="fig-track"><i style="--x0: min(49.5%, calc(50% - 3px)); --w: 0.5%"></i></span><b>0.9×</b></summary><div class="fig-qrow__body"><p>Counts events whose post text holds the phrase &#x27;good morning&#x27;. LynxDB read rows from 5,493 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where match_phrase(commit.record.text, &#x27;good morning&#x27;) | stats count() as n</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>2.76 s</td><td>0.986 s</td></tr><tr><td>ClickHouse</td><td>3.05 s</td><td>1.02 s</td></tr><tr><td>VictoriaLogs</td><td>3.81 s</td><td>3.14 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="text_length"><details><summary class="fig-bar"><span>length of post text</span><span class="fig-track"><i style="--x0: min(49.5%, calc(50% - 3px)); --w: 0.5%"></i></span><b>0.9×</b></summary><div class="fig-qrow__body"><p>The average and the longest length of post text. LynxDB read rows from 10,918 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where commit.collection = &#x27;app.bsky.feed.post&#x27; | stats avg(length(commit.record.text)) as avg_len, max(length(commit.record.text)) as max_len</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>2.76 s</td><td>1.58 s</td></tr><tr><td>ClickHouse</td><td>3.05 s</td><td>1.08 s</td></tr><tr><td>VictoriaLogs</td><td>3.80 s</td><td>1.14 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="head100"><details><summary class="fig-bar"><span>first 100 events</span><span class="fig-track"><i style="--x0: min(49.8%, calc(50% - 3px)); --w: 0.2%"></i></span><b>0.96×</b></summary><div class="fig-qrow__body"><p>The first 100 events the index returns, with no order asked for. LynxDB read rows from 1 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | head 100</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.0391 s</td><td>0.0109 s</td></tr><tr><td>ClickHouse</td><td>0.126 s</td><td>0.0040 s</td></tr><tr><td>VictoriaLogs</td><td>0.0406 s</td><td>0.0285 s</td></tr></tbody></table></div></details></li>
<li class="fig-sub" data-group="slow"><b>Slower, <span>9</span></b> over 1.18×</li>
<li class="fig-qrow" data-q="word_common_tail"><details><summary class="fig-bar"><span>latest 100 with a common word</span><span class="fig-track"><i style="--x0: 50%; --w: 2.1%"></i></span><b>1.5×</b></summary><div class="fig-qrow__body"><p>The 100 most recent events whose post text holds &#x27;love&#x27;. LynxDB read rows from 2,792 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where match(commit.record.text, &#x27;love&#x27;) | sort - _time | head 100</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>1.33 s</td><td>0.592 s</td></tr><tr><td>ClickHouse</td><td>3.88 s</td><td>0.217 s</td></tr><tr><td>VictoriaLogs</td><td>0.897 s</td><td>0.304 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="user_heavy_count"><details><summary class="fig-bar"><span>a busy account by collection</span><span class="fig-track"><i style="--x0: 50%; --w: 3.4%"></i></span><b>1.9×</b></summary><div class="fig-qrow__body"><p>One busy account&#x27;s events, counted per collection. LynxDB read rows from 84 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky did=&quot;did:plc:74p5m4owldmqdvaday77brpt&quot; | stats count() as n by commit.collection</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>0.137 s</td><td>0.0022 s</td></tr><tr><td>ClickHouse</td><td>0.0730 s</td><td>0.0090 s</td></tr><tr><td>VictoriaLogs</td><td>2.25 s</td><td>0.328 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="top_users"><details><summary class="fig-bar"><span>top 10 accounts</span><span class="fig-track"><i style="--x0: 50%; --w: 3.4%"></i></span><b>1.9×</b></summary><div class="fig-qrow__body"><p>The 10 accounts with the most events. LynxDB read rows from 61,246 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | stats count() as n by did | sort - n | head 10</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>2.74 s</td><td>0.784 s</td></tr><tr><td>ClickHouse</td><td>1.46 s</td><td>1.22 s</td></tr><tr><td>VictoriaLogs</td><td>35.4 s</td><td>32.1 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="distinct_users"><details><summary class="fig-bar"><span>distinct accounts</span><span class="fig-track"><i style="--x0: 50%; --w: 4.8%"></i></span><b>2.4×</b></summary><div class="fig-qrow__body"><p>Counts the distinct accounts over all events. LynxDB read rows from 61,246 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | stats distinct_count(did) as users</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>2.72 s</td><td>0.430 s</td></tr><tr><td>ClickHouse</td><td>1.12 s</td><td>0.880 s</td></tr><tr><td>VictoriaLogs</td><td>22.0 s</td><td>19.7 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="top_reply_roots"><details><summary class="fig-bar"><span>top 10 reply roots</span><span class="fig-track"><i style="--x0: 50%; --w: 10.8%"></i></span><b>7.4×</b></summary><div class="fig-qrow__body"><p>The 10 threads with the most replies. LynxDB read rows from 61,246 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where isnotnull(commit.record.reply.root.uri) | stats count() as n by commit.record.reply.root.uri | sort - n | head 10</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>7.24 s</td><td>1.12 s</td></tr><tr><td>ClickHouse</td><td>0.985 s</td><td>0.564 s</td></tr><tr><td>VictoriaLogs</td><td>3.00 s</td><td>2.38 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="replies_by_hour"><details><summary class="fig-bar"><span>replies per hour</span><span class="fig-track"><i style="--x0: 50%; --w: 14.3%"></i></span><b>14×</b></summary><div class="fig-qrow__body"><p>Events that reply to another post, counted per UTC hour of day. LynxDB read rows from 61,246 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky | where isnotnull(commit.record.reply.parent.uri) | eval hour_of_day = hour(_time) | stats count() as n by hour_of_day | sort hour_of_day</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>6.79 s</td><td>0.629 s</td></tr><tr><td>ClickHouse</td><td>1.02 s</td><td>0.443 s</td></tr><tr><td>VictoriaLogs</td><td>0.488 s</td><td>0.356 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="window5m_tail"><details><summary class="fig-bar"><span>latest 100 in 5 minutes</span><span class="fig-track"><i style="--x0: 50%; --w: 14.4%"></i></span><b>14×</b></summary><div class="fig-qrow__body"><p>The 100 most recent events in that 5-minute window. LynxDB read rows from 58,553 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky earliest=&#x27;2024-11-28 12:00:00&#x27; latest=&#x27;2024-11-28 12:05:00&#x27; | sort - _time | head 100</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>3.62 s</td><td>0.223 s</td></tr><tr><td>ClickHouse</td><td>3.52 s</td><td>0.0390 s</td></tr><tr><td>VictoriaLogs</td><td>0.257 s</td><td>0.0741 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="window1h_word"><details><summary class="fig-bar"><span>a word within 1 hour</span><span class="fig-track"><i style="--x0: 50%; --w: 16.9%"></i></span><b>22×</b></summary><div class="fig-qrow__body"><p>Counts events with &#x27;love&#x27; in the post text from 12:00 to 13:00 on 28 November 2024. LynxDB read rows from 5,478 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky earliest=&#x27;2024-11-28 12:00:00&#x27; latest=&#x27;2024-11-28 13:00:00&#x27; | where match(commit.record.text, &#x27;love&#x27;) | stats count() as n</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>3.17 s</td><td>0.507 s</td></tr><tr><td>ClickHouse</td><td>3.54 s</td><td>0.0710 s</td></tr><tr><td>VictoriaLogs</td><td>0.142 s</td><td>0.0686 s</td></tr></tbody></table></div></details></li>
<li class="fig-qrow" data-q="window5m_count"><details><summary class="fig-bar"><span>count in a 5-minute window</span><span class="fig-track"><i style="--x0: 50%; --w: 23.3%"></i></span><b>73×</b></summary><div class="fig-qrow__body"><p>Counts events per collection from 12:00 to 12:05 on 28 November 2024. LynxDB read rows from 30 of 61,246 blocks on the cold try.</p><pre><code>source=bluesky earliest=&#x27;2024-11-28 12:00:00&#x27; latest=&#x27;2024-11-28 12:05:00&#x27; | stats count() as n by commit.collection</code></pre><table class="fig-times"><thead><tr><th scope="col">Time</th><th scope="col">cold</th><th scope="col">hot</th></tr></thead><tbody><tr><td>LynxDB</td><td>3.48 s</td><td>0.151 s</td></tr><tr><td>ClickHouse</td><td>3.39 s</td><td>0.0360 s</td></tr><tr><td>VictoriaLogs</td><td>0.0479 s</td><td>0.0060 s</td></tr></tbody></table></div></details></li>
<li class="fig-sub" data-group="none" hidden><b>No time to compare, <span>0</span></b> no hot run on ClickHouse</li>
</ol>
<div class="fig-axis" aria-hidden="true"><span><i style="--x: 12.5%; --t: -50%">0.001×</i><i style="--x: 50%">1×</i><i style="--x: 87.5%; --t: -50%">1000×</i></span></div>
</div>
<figcaption>LynxDB's time divided by the time of the faster of ClickHouse and VictoriaLogs (or of the one chosen), for the five JSONBench queries and 25 log queries at 1B on an m6i.8xlarge. Cold is the first run after a restart with the page cache dropped, hot the faster of runs 2 and 3. LynxDB: main 657aa79f with the benchmark's sort key in one partition (25 November 2026). ClickHouse 26.12.1 and VictoriaLogs v1.54.0: 24 November 2026. ClickHouse has no hot time for the query over any field: its one cold run took 591 s.</figcaption>
</figure>
<script type="module" src="fig-ratio.js"></script>

The 15 clear wins are the queries where the sort key, the footer or a token filter rules out most blocks before a row is read. Besides the five JSONBench queries:

- A word in any field (`source=bluesky earthquake | stats count()`) takes 0.88 s cold, against 98.4 s for VictoriaLogs and 591 s for ClickHouse. The token filters skip 58,391 of the 61,246 blocks.
- The latest 100 events take 0.098 s, against 0.37 s and 3.58 s. The block time ranges in the footer leave 128 blocks to read.
- One record by its key (`commit.rkey="3lbhuei4dic2u"`) takes 0.17 s, against 1.12 s and 5.47 s, from 71 blocks.

Six more come out within 11% of the faster rival: the five that read all post text (a common word, a phrase, a substring, a regular expression and the length of the text, about 2.75 s against ClickHouse's 3.05 s) and the first 100 events.

The nine losses come from the same sort key. Rows are ordered by kind, operation, collection and user before time, so a time window is spread over almost every block of the one long partition: counting events per collection in a 5-minute window skips only 2,691 blocks by time, reads 4.7 GB and takes 3.48 s cold, against VictoriaLogs' 0.048 s. LynxDB's default design, daily partitions without a key, counts the same window in 0.0064 s, and loses JSONBench instead.

A field outside the key and present in few events is the other weak spot: replies per hour (a field in 4.5% of events) reads all 61,246 blocks, 6.79 s against VictoriaLogs' 0.49 s. Top and distinct accounts (2.74 and 2.72 s against ClickHouse's 1.46 and 1.12 s) group by `did` across every collection, and the latest 100 posts containing a common word need the time order that the key does not give (1.33 s against 0.90 s). Some ClickHouse hot times may also benefit from its query condition cache; I have not checked.

Text search shows the same trade-off between the two LynxDB designs. The key packs the post text into about 5,500 blocks of 16,384 posts each, while without it posts are under one row in ten of every block. A rare word (`match(commit.record.text, 'earthquake')`) opens 2,273 blocks with the key and 7,744 without, but reads 1.6 GB against 0.7 GB and takes 0.56 s cold against 0.36 s. A regular expression gets no help from token filters: 2.76 s cold and 0.36 s hot with the key, 4.08 s and 0.14 s without.

On the five JSONBench queries alone, ClickHouse 26.12.1, which the ClickHouse entry's scripts installed when I reran it on 24 November, sums 3.91 s hot and 5.32 s cold, against 6.87 s and 9.24 s for the published 26.11: faster than LynxDB without a sort key, slower than LynxDB with one.

The load scripts differ as well. LynxDB's loads 16 files at once, VictoriaLogs' 8, and ClickHouse's one file per `INSERT`, one after another; LynxDB also waits for its final merge inside the load time. The load-time ratio says as much about the scripts as about the engines.

## What the JSONBench page shows and hides

LynxDB stores nested objects as columns named by their dotted paths and returns events flat: `{"a": {"b": 1}}` and `{"a.b": 1}` come back the same, while arrays, empty objects and nulls are kept. Its `retains_structure` is therefore `no`, and the JSONBench page's Flattening filter leaves such systems out by default. In that default view ClickHouse leads at 1B.

The page also scores the size of each entry's scripts after `zstd -19`. LynxDB's is 1,954 bytes, against ClickHouse 746, VictoriaLogs 1,331, OpenSearch 3,023 and Elasticsearch 3,538, which ranks it 20th of 29. At the smaller sizes Opteryx loads faster (1M to 100M), and CLP is smaller at 1M and 10M.

The dataset has 759 lines that LynxDB does not load as documents: 755 are not JSON objects (documents longer than 64 KiB split over two lines), and 4 are objects in file_0178 whose `commit.record.langs` is nested 2,163 levels deep, beyond LynxDB's limit of 256. The published run kept all 759 as text events, so it counts 1,000,000,000 lines and scores 100% data quality, where ClickHouse loads 999,999,258 and VictoriaLogs 999,999,241. Since 23 November `/api/v1/ingest` refuses such lines, and main holds 999,999,241 events, as many as VictoriaLogs.

The entry's README states that the answers match ClickHouse's at 10M and 100M, apart from the row of the non-JSON lines. At 1B I compared the stored answers of main 657aa79f (25 November) with those of ClickHouse 26.12. Q3, Q4 and Q5 are identical. Q2 differs in one row: `app.bsky.labeler.service` has 188 events and 117 users against 189 and 118. Q1 differs in two: `app.bsky.graph.list` 276,933 against 276,948 and `app.bsky.labeler.service` 1,757 against 1,759. The 17 events are exactly the difference between the documents the two systems loaded; I have not traced which documents they are.

## Why ClickHouse's table is twice the size

LynxDB stores each field once, as its own column, and keeps no copy of the raw JSON: 92.7 GB for a billion documents is 92.7 bytes each, against 482 bytes of JSON. In the measurement run's store, token filters take 7.9 GB of 91.9 GB.

ClickHouse's table is about LynxDB's size at 1M and 10M documents (1.01 and 1.03 times) and twice it from 100M (2.05) to 1B (2.11). Its schema uses the JSON type with the `advanced` serialization for shared data, and ClickHouse's blog says that since 25.8 this format stores "a copy of the data in the original format alongside the advanced one", which "effectively doubles the storage requirement"[^ch]. My sampling of the 26.11 table agrees with that: fresh parts take 94 to 102 bytes per row and merged parts 191 to 199, both with ZSTD(3). The blog does not say the copy is tied to merged parts; that link is my reading of the sample.

## What I have not measured

- Queries while ingest and merges run. Before the final merge the parts overlap in key range, so Q2 would most likely take the multi-stream path shown above for daily partitions; I have no numbers for it.
- A ClickHouse projection or materialized view. One would likely do Q2's work at write time; neither side uses them in this benchmark.
- ClickHouse loaded in parallel, as LynxDB is.
- The answers of the published build ad9d7e3b at 1B.

The result files, the scripts and the README are in [lynxbase/ClickBench](https://github.com/lynxbase/ClickBench/tree/main/json/lynxdb); `./benchmark.sh` in `json/lynxdb` runs the entry through the shared JSONBench driver. If the method has a flaw, tell me and I will rerun it. The next post, [Inside the LynxDB engine](../inside-the-lynxdb-engine/), opens the part file: the footer, the key runs, the time buckets and the hash path.

[^volume]: JSONBench's standard volume is 2,000 GB of gp3 at 16,000 IOPS and 1,000 MB/s. The volume of LynxDB's published run was not recorded; the measurement runs used 1,000 GB at 16,000 IOPS and 1,000 MiB/s.
[^q5]: Q5's counters account for 61,218 of the 61,246 blocks: 5,513 opened and 55,705 skipped by key. The other 28 are not reported by any counter.
[^ch]: [JSON data type gets even better](https://clickhouse.com/blog/json-data-type-gets-even-better), ClickHouse blog.
