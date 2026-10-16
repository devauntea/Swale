# SurrealDB bbox benchmark: M1 gate results

- **Result: PASS.** The production strategy (`lat_index_paged`) stays well under the 200 ms p95 budget at demo, Brooklyn and city scale. Every query returned exactly the reference IDs.
- **Decision:** continue M1 with design option A: SurrealDB as the only store, with bbox queries using an indexed `lat` range plus a `lon` filter. Tile keys are the documented upgrade path if we expand citywide.

## Setup

| | |
|---|---|
| Run | 2026-10-16T04:47:41Z. Command: `uv run python -m swale.bench.bbox --mode kv` (seed 20261016, 30 viewports per size) |
| Machine | Apple M4, 16 GB, macOS 26.2 |
| Software | Python 3.12.13. `surrealdb` Python SDK 2.0.0, embedded; engine `surrealdb-core` 2.3.10, read from the SDK's extension binary |
| Storage | `surrealkv://` file mode, the configuration the demo runs in |
| Data | All 154,212 rows of NYCDEP Citywide Catch Basins (`2w2g-fk3i`), fetched 2026-10-16T04:44:03Z. No rows lacked coordinates and no `unitid` was duplicated. Real data only. |

**Scales.** Each scale's points were filtered from the cache using the dataset's `longitude`/`latitude` columns.

| Scale | Points | Area |
|---|---|---|
| `bk0601` | 2,092 | BK0601 bounding box |
| `brooklyn` | 55,980 | A Brooklyn bounding box that also takes in edges of Queens and Staten Island |
| `citywide` | 154,212 | All rows |

Socrata's own `within_box` count for the BK0601 box was 2,093. The likely cause of the one-point gap is that Socrata tests the full-precision `the_geom` while this filter uses the rounded `latitude`/`longitude` columns. One basin on the edge can then fall either side.

**Viewports.**
- Squares of 0.5, 1 and 2 km, centered on 30 randomly sampled real basins at each scale. At New York's latitude, a 1 km square is roughly a zoom-17 map view.
- At demo scale only, the whole BK0601 bbox as a fifth viewport.
- One untimed warm-up query per strategy and viewport size.
- p50 and p95 are nearest-rank values.

**Correctness.** Every query's IDs were compared with a plain Python filter. For the paged strategy, the comparison was with the first 1,000 IDs in sorted order. A difference counts as a mismatch (the `bad` column).

**Strategies**

| Strategy | Query shape |
|---|---|
| `scan` | Numeric lat/lon range, no index |
| `geom_inside` | `geom INSIDE $polygon`. SurrealDB has no spatial index, so this always scans. |
| `lat_index` | Range scan on the `lat` index, then a `lon` filter |
| `lat_index_paged` | The same, plus `ORDER BY id LIMIT 1000`. **This is what the API runs.** |
| `tile_in` | z15 Web-Mercator tile key index with `tile IN $tiles`, plus the exact range filter |

## Results (verbatim from the run)

```
mode scale      points strategy         viewport       p50 ms   p95 ms   max ms    rows  bad
--------------------------------------------------------------------------------------------
kv   bk0601       2092 scan             0.5km             9.4     10.2     10.4      74    0
kv   bk0601       2092 scan             1km              10.8     11.7     11.7     249    0
kv   bk0601       2092 scan             2km              14.5     15.6     26.1     835    0
kv   bk0601       2092 scan             bk0601_full      21.3     21.8     21.8    2092    0
kv   bk0601       2092 geom_inside      0.5km             7.5      7.7      7.8      74    0
kv   bk0601       2092 geom_inside      1km               7.9      8.3      8.4     249    0
kv   bk0601       2092 geom_inside      2km              10.1     11.3     11.4     835    0
kv   bk0601       2092 geom_inside      bk0601_full      15.0     15.2     25.6    2092    0
kv   bk0601       2092 lat_index        0.5km             2.9      3.8      3.8      74    0
kv   bk0601       2092 lat_index        1km               6.0      7.6      7.7     249    0
kv   bk0601       2092 lat_index        2km              13.4     15.6     15.9     835    0
kv   bk0601       2092 lat_index        bk0601_full      24.0     24.4     24.5    2092    0
kv   bk0601       2092 lat_index_paged  0.5km             2.9      3.8      3.9      74    0
kv   bk0601       2092 lat_index_paged  1km               6.2      7.8      8.0     249    0
kv   bk0601       2092 lat_index_paged  2km              13.9     16.1     19.7     819    0
kv   bk0601       2092 lat_index_paged  bk0601_full      22.2     22.8     23.0    1000    0
kv   bk0601       2092 tile_in          0.5km             4.4      7.0      8.1      74    0
kv   bk0601       2092 tile_in          1km               7.9      9.7      9.7     249    0
kv   bk0601       2092 tile_in          2km              17.6     21.0     21.7     835    0
kv   bk0601       2092 tile_in          bk0601_full      31.6     31.8     31.9    2092    0
kv   brooklyn    55980 scan             0.5km           249.8    267.3    268.2      75    0
kv   brooklyn    55980 scan             1km             256.6    272.7    275.0     267    0
kv   brooklyn    55980 scan             2km             267.1    279.3    281.0     924    0
kv   brooklyn    55980 geom_inside      0.5km           197.0    198.3    198.9      75    0
kv   brooklyn    55980 geom_inside      1km             197.9    199.5    200.2     267    0
kv   brooklyn    55980 geom_inside      2km             200.8    202.3    215.1     924    0
kv   brooklyn    55980 lat_index        0.5km            11.9     18.1     19.7      75    0
kv   brooklyn    55980 lat_index        1km              24.2     36.3     39.4     267    0
kv   brooklyn    55980 lat_index        2km              48.9     72.3     75.1     924    0
kv   brooklyn    55980 lat_index_paged  0.5km            12.3     18.1     19.8      75    0
kv   brooklyn    55980 lat_index_paged  1km              24.1     36.4     39.4     267    0
kv   brooklyn    55980 lat_index_paged  2km              49.8     72.8     75.0     856    0
kv   brooklyn    55980 tile_in          0.5km             4.4      9.6     14.7      75    0
kv   brooklyn    55980 tile_in          1km               8.9     12.9     17.0     267    0
kv   brooklyn    55980 tile_in          2km              21.9     32.1     41.3     924    0
kv   citywide   154212 scan             0.5km           670.8    733.6    735.1      65    0
kv   citywide   154212 scan             1km             685.4    748.8    756.4     243    0
kv   citywide   154212 scan             2km             682.3    753.2    755.6     895    0
kv   citywide   154212 geom_inside      0.5km           553.2    567.2    573.3      65    0
kv   citywide   154212 geom_inside      1km             548.5    561.2    562.9     243    0
kv   citywide   154212 geom_inside      2km             557.3    566.9    568.1     895    0
kv   citywide   154212 lat_index        0.5km            17.6     29.4     30.6      65    0
kv   citywide   154212 lat_index        1km              35.2     57.9     62.3     243    0
kv   citywide   154212 lat_index        2km              71.0    121.2    126.8     895    0
kv   citywide   154212 lat_index_paged  0.5km            17.4     29.0     30.5      65    0
kv   citywide   154212 lat_index_paged  1km              35.1     58.1     62.7     243    0
kv   citywide   154212 lat_index_paged  2km              71.2    121.5    126.5     816    0
kv   citywide   154212 tile_in          0.5km             4.2     11.3     13.4      65    0
kv   citywide   154212 tile_in          1km               9.2     13.8     15.6     243    0
kv   citywide   154212 tile_in          2km              24.6     40.9     43.6     895    0
```

## Gate

```json
{
  "strategy": "lat_index_paged",
  "budget_ms": 200.0,
  "demo_scale": { "measured": true, "worst_p95_ms": 22.83, "mismatches": 0, "pass": true },
  "brooklyn_scale": { "measured": true, "worst_p95_ms": 72.84, "mismatches": 0, "pass": true }
}
```

## What this means

- **Demo scale.** Every strategy is fast enough, at 32 ms p95 or less. The API strategy's worst case is 22.8 ms, for the whole demo area returning a 1,000-row page.
- **Brooklyn and beyond.** The `lat` index is essential.
  - Without it, a numeric scan takes 267–279 ms p95 in Brooklyn and 734–753 ms citywide.
  - `geom INSIDE` can't use an index. It takes about 200 ms in Brooklyn and about 565 ms citywide, so geometry predicates are never used for viewport queries.
- **How cost grows.** Cost follows the number of points in the viewport's *latitude band*, not in the viewport itself. That's why `lat_index_paged` reaches 121.5 ms for a 2 km view citywide.
- **Upgrade path.** `tile_in` stays flat at 40.9 ms citywide for the same view, 3× faster. It's the change to make if Swale expands beyond Brooklyn. This engine version uses an index for `IN`.

**Not covered here:**
- API and serialization overhead, which Task 7 measures end to end.
- Concurrent requests: the API serializes database access behind a lock.
- The incident table, which is a similar size to the basin table in the demo area.
- SurrealDB server mode (`ws://`).

## Reproduce

```bash
cd backend
uv run python -m swale.bench.bbox --fetch      # ~5 minutes; Socrata served each page in about 10 s
uv run python -m swale.bench.bbox --mode kv    # ~3.5 minutes; writes var/bench/results-kv-*.json
```
