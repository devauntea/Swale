# Swale frontend data contract

**PROPOSED — NOT YET AGREED WITH BACKEND TEAM**

This is a frontend-facing proposal, not a deployed API specification. No endpoint
paths, framework, database, authentication, transport or operational backend adapter
are assumed. The co-founder owns backend implementation. Integration requires
separate agreement and owner approval.

## Provider boundary

The UI consumes `FrontendDataProvider` snapshots via asynchronous load and refresh
operations. Only LocalFixtureProvider exists. A future BackendDataProvider must be
implemented only in an approved integration phase. Current requests never reach a
partner backend. Local refresh reuses fixtures and reports integration pending,
without fabricating source freshness. Cancellation/errors must not corrupt the
last valid UI snapshot or reset camera/selection unexpectedly.

## Proposed shared models

| Model | Required responsibility |
| --- | --- |
| CatchBasin | Stable source ID, WGS84 position, display label/location context, provenance, predefined priority per scenario |
| BasinInspectionPriority | Scenario ID, nullable 0–100 score, backend-supplied band/label, ordered factors and configuration/version provenance |
| ScoreFactor | Factor key/label, normalized value in [0,1] or null, weight, weighted score-point contribution or null, source/units/period and explanation |
| FloodScenario | Exact ID, title, rainfall intensity in inches/hour, sea-level assumption, geometry/source metadata, exclusions |
| FloodZoneFeature | GeoJSON Polygon/MultiPolygon, scenario ID, supported class/category, provenance and demo indicator |
| DrainageComplaint | Stable ID, raw category pair, valid WGS84 position or explicit missing-location exclusion, created time with known offset semantics, recent/historical window, provenance |
| ComplaintDensityCell | Precomputed hexagonal GeoJSON Polygon, count/category/window, source and geometry semantics; not measured physical blockage |
| BuildingFeature | Polygon/MultiPolygon with finite positive height/base in meters, provenance, coverage and excluded-value explanation |
| RainfallForecast | Nullable accumulated amount/unit, explicit start/end, issue/retrieval times, availability and freshness; never substitute probability for depth |
| DataProvenance | Source ID/name/link if applicable, approved data type, demo flag, source update/issue and retrieval times kept separately, coverage/uncertainty |
| DataFreshness | Availability/status, applicable period, nullable timestamps, staleness/error reason; absent source time is unknown |
| AssistantMessage | Role, message text, DEMO/production status, fixture/tool evidence, structured cards/actions, pending/error state |
| AssistantUIAction | One of four validated UI commands below |
| LayerVisibility | Explicit booleans for basins, floodZones, complaints and buildings |

Exact TypeScript names/field spelling are proposed in frontend/src/types. They are
not a final partner schema. Backend should supply scores, bands, factors and ranked
results; frontend only formats and presents them. No production scoring here.

## Coordinates, units and geometry

- Geographic positions: WGS84 [longitude, latitude] degrees, GeoJSON order. Never
  treat degrees as meters. No invented administrative neighborhood boundaries.
- Heights/base heights: meters above local ground after partner verification and
  conversion. NYC height_roof already means relative above-ground height; do not
  subtract ground_elevation. Invalid/missing/implausible heights are excluded or
  flagged, never replaced silently. Current frontend uses basemap building data.
- Flood geometries: separate per scenario, Polygon/MultiPolygon; no exact depth
  interpolation. Production category 3 high-tide reference is excluded from both
  stormwater scoring and the stormwater hazard overlay. Local shapes are synthetic.
- Forecast: accumulated millimeters over an explicit interval. Six-hour samples
  are accumulations, not inches/hour intensities. Forecast and scenario quantities
  have distinct meanings. Null means unavailable; zero is valid. No UI rain math.
- Score: 0–100, factors normalized [0,1], weighted contributions explicitly in
  score points (sum to score), nullable missing values. Backend-supplied categories
  and thresholds are not validated scientific categories. Frontend has stored
  examples only. Exact label: Inspection priority (heuristic, not validated).

## Scenario identifiers

`moderate_current`: Moderate Flood — 2.13 inches/hour, Current Sea Levels.

`extreme_2080`: Extreme Flood — 3.66 inches/hour, 2080 Sea Level Rise.

Both rainfall and sea-level assumptions differ. Definitions can be official metadata;
local demonstration geometry and scores are not official modeled results.

## Provenance, time and coverage

Types: STATIC INVENTORY, STATIC, HISTORICAL, OBSERVED, FORECAST, MODELED, SCENARIO,
HEURISTIC SCORE. Synthetic fixtures always retain DEMO even when illustrating one
of these types. Every displayed layer/number has associated source and time.
Use ISO8601 with explicit offset for known instants. Preserve unknown/floating
source timestamps with an explicit timezone status; never append Z without evidence.
Store source issue/update, validity, local retrieval and last-success separately.
Do not label local fixture reload as fresh NWS/311 data. Future sources may be stale,
partial or inconsistent across caches, as recorded in DATA_NOTES.md. No UI fixture
claims official boroughwide coverage or actual catch-basin locations.

## UI commands and validation

- `set_scenario(name)`: allowlisted exact scenario IDs only.
- `set_layers(visibility)`: only known layer keys and boolean values.
- `highlight(ids)`: all IDs must exist in the active loaded fixture/data snapshot;
  enforce bounded size, reject unknown IDs atomically, allow empty list to clear.
- `fly_to(target)`: only a loaded basin ID or a known verified Brooklyn target;
  never accept arbitrary coordinates supplied by a chat response.

Unknown commands, extra fields, invalid types/IDs/targets fail closed. Frontend
validates future backend commands again. `search_basins` and `explain_basin` remain
backend-owned and are not implemented. No arbitrary code/SQL/external tool bridge.
Current assistant is deterministic scripted DEMO only, not a model or live query.

## Loading, errors, missing data and refresh

Provider loading -> visible status; failure -> specific retryable UI error; empty
snapshot -> honest no-example state. Forecast unavailable -> no numeric amount;
stale -> visible stale status with original times. No invented fallback values.
Keep a last valid snapshot where appropriate and explicitly mark stale/error.
Scenario switches atomically choose the corresponding stored dataset/score values,
retain valid selection/layer/camera state, and reject missing scenario data honestly.
Refresh success does not override source times with browser time. Unknown selected
IDs clear safely on genuine dataset replacement. Assistant errors leave map usable.

## Integration acceptance, deferred

Agree schema/versioning, timezones, units/CRS, null/error meanings, cancellation,
refresh semantics, source coverage, scenario identity and authenticated transport
if required. Then validate actual partner outputs with contract tests, verify
source metadata/IDs and repeat visual/security/performance checks. Do not assume
that a working local frontend establishes the future system's scientific validity.
