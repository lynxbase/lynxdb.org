# Homepage

Homepage variant A, always dark: a two-line statement about log search, the JSONBench comparison as proof, a tabbed search-to-analytics demo, how block skipping works, the full benchmark table, what the database handles, and an install panel that says what each command does.

- Structure and tone follow the ClickHouse and DuckDB homepages: near-black ground, one loud accent, bordered cards, left-aligned 36px section headings.
- Benchmark figures are the JSONBench results published in the LynxDB README (1 billion events, AWS m6i.8xlarge, measured 2026-11-20). Queries are PPL from the LynxDB docs. Result rows in the first two demo tabs and the chart are sample data.
- The page forces `data-theme="dark"` on its root and uses `stone-1000` as its ground.
