# Swale backend

FastAPI and embedded SurrealDB. It serves Brooklyn catch basins and 311 reports as GeoJSON for the Swale map.
Design: `../docs/design/2026-10-15-swale-backend-design.md` · API contract: `../docs/api/v1.md` · Sources: `../docs/data-sources.md`

## Setup (macOS or Linux, no Docker)

```bash
cd backend
uv sync                      # installs Python 3.12 and the dependencies from uv.lock
uv run pytest                # offline test suite (uses in-memory SurrealDB)
```

## Load data and run

```bash
uv run swale ingest --from-snapshot sample_data/bk0601   # offline: the committed real snapshot
uv run swale ingest --area BK0601                       # live: re-fetch from NYC Open Data
uv run swale serve                                      # http://127.0.0.1:8000
```

- API docs: http://127.0.0.1:8000/docs
- OpenAPI: http://127.0.0.1:8000/api/v1/openapi.json
- Dev map: http://127.0.0.1:8000/dev/map

Stop `swale serve` before running `swale ingest`. Swale treats the embedded database file as single-writer.

## Other commands

```bash
uv run swale snapshot --area BK0601     # refresh sample_data/bk0601 from the live sources
uv run pytest -m live                   # check that the live sources still have the columns we need
uv run swale bench-bbox --fetch && uv run swale bench-bbox   # re-run the bbox benchmark (docs/benchmarks/)
```

## Simulations (EPA SWMM)

```bash
./scripts/fix_swmm_macos.sh     # macOS on Apple Silicon only, once after `uv sync` (see the script for why)
```

The API seeds DEP's three design storms (1.77, 2.13 and 3.66 in/hr) for each loaded area. `POST /api/v1/simulation-runs` with a `scenario_id` and `runner` set to `local` (or `daytona` when `DAYTONA_API_KEY` is set) runs the Swale SWMM demonstrator. Then poll `GET /api/v1/simulation-runs/{id}`. Results are **predicted**: the model is schematic and uncalibrated, and every assumption is listed in the run's `model.assumptions`.

## Settings

See `.env.example`. Every setting has a working default.

## What the data means

Every feature has a `knowledge_type`:
- `observed`: inventory, sensors, or DEP field findings.
- `reported`: 311 complaints.
- `predicted`: model output.
- `inferred`: Swale's own rules.

A 311 complaint is never shown as a confirmed problem unless DEP's own resolution text says so. The rules are in `swale/ingest/resolutions_311.py`.
