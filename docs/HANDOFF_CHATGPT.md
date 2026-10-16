# Swale: frontend ↔ backend integration hand-off

> **How to use this file:** paste all of it into ChatGPT, then ask, for example: "Wire my 3D map to the Swale backend using this hand-off." Everything below is true of the backend as of 2026-10-16. The full contract is `docs/api/v1.md`.

## 1. What exists

- **Backend:** Python 3.12, FastAPI and **SurrealDB (embedded, no server or Docker)**, in `backend/`.
  - It loads real NYC data for the demo area **BK0601** (Carroll Gardens, Cobble Hill, Gowanus, Red Hook): 2,093 DEP catch basins, 7,472 311 reports, and 17 FloodNet sensors with 83 measured floods.
  - It runs **EPA SWMM** rainfall simulations, locally or in a **Daytona** sandbox.
  - It ranks basins for inspection with evidence, and writes crew briefings: Claude on AWS Bedrock with Arize tracing, read aloud by ElevenLabs.
- **Branch:** all backend work is on `claude/m1-data-foundation`. The frontend lives on `main`, pushed by the frontend dev.
- **Reference UI:** `http://127.0.0.1:8000/dev/map` is a working 2D console that calls every endpoint. **Copy its fetch logic** (`backend/devtools/map.html`).

## 2. Merge the branches (do this once)

Keep the frontend in its own folder (e.g. `frontend/`) so nothing collides with `backend/` or `docs/`.

```bash
git fetch origin
git checkout main && git pull
git merge origin/claude/m1-data-foundation   # or: git merge claude/m1-data-foundation if it is local
```

- Likely conflicts are only in `README.md` and `.gitignore`. Keep both sides' lines.
- **Never commit `backend/.env`.** It holds API keys and is gitignored. `backend/.env.example` is the blank template.

## 3. Run the backend (each laptop that runs the demo)

```bash
cd backend
uv sync                                                  # installs Python 3.12 and every dependency
./scripts/fix_swmm_macos.sh                              # Apple Silicon Macs only, once: re-signs the SWMM library
uv run swale ingest --from-snapshot sample_data/bk0601   # loads the committed real data (~5 s, no network)
uv run swale serve                                       # http://127.0.0.1:8000  (API docs: /docs)
```

- **Keys are optional.** Without them everything works except Daytona runs, Claude-written briefings (the template briefing is used instead) and audio. To enable them, copy `backend/.env.example` to `backend/.env` and fill in the values.
- **CORS:** the API allows `http://localhost:5173` and `http://localhost:3000`. If the frontend runs elsewhere, set `SWALE_CORS_ORIGINS=http://localhost:XXXX` in `backend/.env`, or use a dev proxy (below).
- **Stop `swale serve` before running `swale ingest`.** The database file is single-writer.

**Vite dev proxy** (avoids CORS entirely). Add to `vite.config.js`:

```js
export default { server: { proxy: { "/api": "http://127.0.0.1:8000" } } };
```

## 4. Rules the frontend must follow (they are judged on these)

- **Coordinates:** every map layer is GeoJSON in `[longitude, latitude]` order.
- **IDs:** feature IDs are strings like `catch_basin:CB305116`. Treat them as opaque, and `encodeURIComponent` them in URLs.
- **Every feature has `properties.knowledge_type`. Style each type differently:**

  | Knowledge type | What it is | Style |
  |---|---|---|
  | `observed` | DEP inventory, FloodNet sensors, DEP field findings | Solid |
  | `reported` | 311 complaints, which are **not proof** | Hollow or outlined |
  | `predicted` | SWMM simulation | Translucent. **Always label it with the scenario name and "uncalibrated demonstrator".** |
  | `inferred` | Rankings and briefings | Dashed, labeled "inferred" |

- **311 findings:** a 311 report shows a confirmed problem **only** when `properties.verification.knowledge_type === "observed"`, meaning DEP's own resolution recorded a finding. Draw those differently, e.g. a red ring.
- **Viewport loading:** always send the **visible map bounds** as `bbox=minLon,minLat,maxLon,maxLat`, never the whole city. Re-fetch on map `moveend`, debounced by about 250 ms.
- **Errors** come back as `application/problem+json` with a `detail` field. Show it to the user.

## 5. Endpoints the 3D map needs

Base: `/api/v1`. All `GET`s take `bbox` and `limit` (max 5000) unless noted.

| Purpose | Request | Notes |
|---|---|---|
| Catch basins | `GET /catch-basins?bbox=…&limit=5000` | Points, `observed` |
| 311 reports | `GET /incidents?bbox=…&since=2024-10-16T00:00:00Z&limit=5000` | `since` needs an offset (`Z`). Add `&verification=agency_found_obstruction` for DEP findings only. |
| FloodNet sensors | `GET /sensors?bbox=…` | Properties include `event_count`, `max_depth_in` and `tidally_influenced` |
| Measured floods | `GET /flood-observations?bbox=…&include_tidal=false` | One point per flood event |
| Storm scenarios | `GET /scenarios?area_id=BK0601` | DEP's three storms: 1.77, 2.13 and 3.66 in/hr |
| Live forecast | `POST /scenarios` with `{"kind":"nws_forecast","area_id":"BK0601","hours":48}` | Returns a scenario |
| Run a storm | `POST /simulation-runs` with `{"scenario_id":"…","runner":"local"\|"daytona","params":{"blockage_factor":0.5}}` | Returns `202 {id, status:"queued"}` |
| Run status | `GET /simulation-runs/{id}` | Poll every ~1.5 s until `status` is `succeeded`, `failed` or `timed_out`. Then show `summary`: `basins_flooded`, `deep`, `total_flood_volume_ft3`, `engine`. |
| Flood result layer | `GET /simulation-runs/{id}/results?bbox=…` | `predicted`. Size by `flood_volume_ft3`; color by `risk_class` (`minor`, `nuisance`, `deep`). |
| Inspection priorities | `GET /risk-rankings?bbox=-74.01995,40.66457,-73.97962,40.69255&limit=10&run_id={id}` | `inferred`, method `risk-v2`. `rank`, `score`, `tier`, `factors[]` with `explanation` and `evidence_ids`, and `adjustments[]` |
| Crew briefing | `POST /briefings` with `{"bbox":"…","run_id":"…","top_n":5,"audio":true}` | `briefing.headline`, `briefing.stops[]`, `briefing.caveat`, `links.audio` (mp3 URL or null), `source` (`llm` or `template`) |
| Evidence drill-down | `GET /incidents/{id}`, `GET /flood-observations/{id}` | For any `evidence_id` |
| Live weather | `GET /weather/now?area_id=BK0601&hours=24` | `observation` (observed), `forecast.hours[]` (predicted), `alerts[]`. Cached 10 min. |
| DEP flood map | `GET /flood-maps?bbox=…&scenario=dep_moderate_current` | `predicted` Polygons from NYC DEP. Color by `depth_class` (`nuisance`, `deep`); label "NYC DEP model". |
| Swale vs DEP | `GET /simulation-runs/{id}/compare-dep` | Only for the 2.13 in/hr run. `agreement_pct` and `counts` |
| Log an inspection | `POST /inspections` with `{"basin_id":"catch_basin:…","result":"debris_found"\|"cleaned"\|"clear"\|"damaged"\|"not_found","notes":"…"}` | `observed`. Re-fetch `/risk-rankings` afterwards: debris raises the basin, a recent clean halves its score. |
| Ranking validation | `GET /risk-rankings/validation?cutoff=2025-10-01` | Precision and lift of the ranking on the following year's real outcomes |
| Status bar | `GET /health` | `sources[].stale`, `sources[].fetched_at`, and `integrations` (which keys are configured) |

**The demo moment, "What if DEP clears the basins it found clogged?"** Run the same storm twice, with `params.blockage_factor` set to `0.5` and then `0`. Compare `summary.deep` and `summary.total_flood_volume_ft3`. On the 2.13 in/hr storm, clearing the 38 flagged basins gives **11 fewer deep-flooding basins and 57,216 ft³ less street flooding** (model prediction). Both runs take about 9 s together.

## 6. Minimal fetch helper (works in any framework)

```js
const API = "/api/v1"; // with the Vite proxy; otherwise "http://127.0.0.1:8000/api/v1"
export async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { "content-type": "application/json" }, ...opts });
  const body = await res.json();
  if (!res.ok) throw new Error(`${body.title}: ${body.detail}`);
  return body;
}
export const bboxOf = (b) => [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v) => v.toFixed(6)).join(",");

export async function runStorm(scenarioId, blockage = 0.5, runner = "local") {
  let run = await api("/simulation-runs", { method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId, runner, params: { blockage_factor: blockage } }) });
  while (run.status === "queued" || run.status === "running") {
    await new Promise((r) => setTimeout(r, 1500));
    run = await api(`/simulation-runs/${encodeURIComponent(run.id)}`);
  }
  if (run.status !== "succeeded") throw new Error(run.error?.message || run.status);
  return run;
}
```

**deck.gl (3D):** feed each FeatureCollection straight into a `GeoJsonLayer`, or into a `ColumnLayer` for extruded results using `getElevation: f => f.properties.max_ponded_depth_in * 10`.

**MapLibre or Mapbox:** use `map.getSource(id).setData(featureCollection)`. Nested properties get flattened, so stringify what a popup needs (see `devtools/map.html`).

## 7. What not to change

- Don't rename or remove API fields. The backend contract is versioned (`/api/v1`), and changes must be additive.
- Don't show `predicted` or `reported` data as confirmed or current. Don't drop the caveats returned by `/risk-rankings` and `/briefings`.
- Don't put keys in frontend code. Every key stays in `backend/.env` on the machine running the backend.

## 8. Known limits (say these in the demo if asked)

- **SWMM model:** schematic and uncalibrated. NYC's sewer pipe network isn't public, so each basin drains through an assumed inlet. Every assumption is in each run's `model.assumptions`.
- **311 data:** about 1% of complaints lack coordinates and can't be mapped. A complaint is a report, not a confirmed condition.
- **FloodNet:** updated every two weeks, so it isn't real time.
- **Bedrock:** briefings fall back to a deterministic template until the AWS account has Claude model access enabled. Audio falls back to the premade Matilda voice if the configured ElevenLabs voice needs a paid plan.
