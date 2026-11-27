Source: https://lynxdb.org/

[LynxDB 26.11.1 is out Release notes](https://github.com/lynxbase/lynxdb/releases/tag/v26.11.1.896-stable)

# A log database you can pipe into

Query a file or a pipe with `lynxdb query`, or run `lynxdb server` and point your shippers at it. One binary, no cluster to run, PPL in both.

[Install LynxDB](https://lynxdb.org/#install) [Read the docs](https://docs.lynxdb.org/)

## Search stored logs in the Web UI

`lynxdb server` keeps events in columnar parts on disk and serves a search page on port 3100: a histogram of the matches, a summary of every field, a live tail and each event's fields one click away. No schema to declare first.

[Run the server](https://docs.lynxdb.org/docs/getting-started/server-mode)

## How LynxDB reads and searches logs

Pipe mode and the server run one engine: the same parser, the same columnar format and the same PPL, so a query that works on a file works on the server.

### Queries as PPL pipelines

Each command works on the rows the one before it returns. About 50 OpenSearch PPL commands, and LogsQL for queries written for VictoriaLogs.

A PPL query in six steps: source=web, where status >= 500, eval slow = response\_time > 500, stats count() as errors by host and slow, sort by errors descending, head 10

### Finds fields in plain-text logs

JSON stays as sent; timestamps, key=value pairs, syslog and access-log lines are read at query time. A field may be a number in one service and a string in another.

A plain-text log line and the fields LynxDB extracts from it: \_time 2026-11-17 08:00:00.105, host web-03, level ERROR, status 502, msg GET /api/v1/users completed

### Skips log blocks a search cannot match

Sort keys, time partitions and token filters tell a search which blocks to leave unread, and counts kept with each part answer some queries without reading a row.

A search for one path against 48 storage blocks: three are read, the other 45 are skipped

## Measured on a billion events

JSONBench loads 1 billion Bluesky events as JSON and times five queries over them. Its combined score weighs the hot runs at 60%, the cold run at 20%, the size on disk and the load time at 10% each. Lower is better.

[See the raw results](https://github.com/lynxbase/ClickBench/tree/main/json/lynxdb)

AWS m6i.8xlarge. LynxDB measured on 20 November 2026 at commit ad9d7e3b; the other rows are the results published in ClickBench.

**Combined score**log scale

1.  LynxDB**×1.00**
2.  ClickHouse**×19.03**
3.  VictoriaLogs**×29.55**
4.  Elasticsearch**×65.22**
5.  OpenSearch**×399.68**

**Load time**log scale

1.  LynxDB**824 s**
2.  ClickHouse**6,042 s**
3.  VictoriaLogs**1,078 s**
4.  Elasticsearch**22,255 s**
5.  OpenSearch**64,360 s**

**Size on disk**GB

1.  LynxDB**92.7**
2.  ClickHouse**195.8**
3.  VictoriaLogs**121.4**
4.  Elasticsearch**384.7**
5.  OpenSearch**285.1**

| Hot query time | LynxDB | ClickHouse | VictoriaLogs | Elasticsearch | OpenSearch |
| --- | --- | --- | --- | --- | --- |
| **Q1** count by collection | 0.0012 s | 0.239 s | 0.033 s | 0.618 s | 19.922 s |
| **Q2** creates and users | 0.049 s | 2.767 s | 19.155 s | 4.930 s | 59.570 s |
| **Q3** creates by hour | 0.062 s | 2.302 s | 1.521 s | 14.213 s | 412.161 s |
| **Q4** first posters | 0.0028 s | 0.757 s | 5.914 s | 3.443 s | 6.960 s |
| **Q5** longest activity | 0.063 s | 0.805 s | 8.053 s | 3.887 s | 18.367 s |

## Takes logs from the shippers you run

An existing shipper only needs LynxDB's address. Elasticsearch bulk, OTLP, Splunk HEC, Loki push and syslog arrive on their usual endpoints.

Kubernetes through Fluent Bit, Docker through its syslog driver, the OpenTelemetry Collector, Vector, Fluent Bit, Filebeat, Logstash, Splunk HEC senders, syslog daemons and files send logs to lynxdb server, which stores the 482 GB of JSON in JSONBench in 92.7 GB and answers PPL queries over them

*   Kubernetes Fluent Bit
*   Docker syslog driver
*   OpenTelemetry OTLP
*   Vector \_bulk
*   Fluent Bit \_bulk
*   Filebeat \_bulk
*   Splunk HEC HEC
*   Syslog UDP, TCP

*   NDJSON
*   CSV
*   Elasticsearch \_bulk
*   OTLP/HTTP
*   OTLP/gRPC
*   Splunk HEC
*   RFC 5424 syslog
*   RFC 3164 syslog
*   Combined access logs
*   key=value pairs
*   Plain text lines

## Install LynxDB

One static binary with no runtime dependencies, for Linux, macOS and Windows on amd64, arm64 and armv7. Apache 2.0 licensed.

[Read the installation guide](https://docs.lynxdb.org/docs/getting-started/install)

```shell
curl -fsSL https://lynxdb.org/install.sh | sh
```

Picks the archive for your architecture and checks it against the release's SHA256SUMS.

```shell
brew install lynxbase/tap/lynxdb
```

One formula per release line too, such as lynxdb@26.11.

```shell
docker run -d -p 3100:3100 \
  -v lynxdb-data:/data \
  ghcr.io/lynxbase/lynxdb server \
  --addr 0.0.0.0:3100 --data-dir /data
```

Images for linux/amd64 and linux/arm64. Data stays on the volume.

```shell
go install \
  github.com/lynxbase/lynxdb/cmd/lynxdb@main
```

Needs Go 1.26 or later and builds the tip of main.

Check the binary

```console
$ lynxdb version --short
26.11.1.896
```

Stable 26.11.1.896 · 23 November 2026 [All releases](https://github.com/lynxbase/lynxdb/releases)

### [Query a log file without a server](https://docs.lynxdb.org/docs/getting-started/pipe-mode)

```console
$ lynxdb query --file app.log \
    'stats count() by level'
```

### [Load a log file into the server](https://docs.lynxdb.org/docs/getting-started/server-mode)

```console
$ lynxdb server
$ lynxdb ingest access.log --index web
```

### [Read the PPL guide](https://docs.lynxdb.org/docs/ppl/overview)

```console
$ lynxdb query \
    'source=web | top 10 uri'
```
