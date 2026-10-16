> **Final integrated-release scope note — October 16, 2026.**
> [FINAL_RELEASE.md](FINAL_RELEASE.md) is the authority for current acceptance,
> runtime and publication. The same local scenario snapshot, including Carroll
> Street's 600-second case, carries between overview and station Normal/Flood views;
> Normal hides water without erasing it. The constrained virtual tour and guarded
> contextual assistant retain hypothetical labels and separate source clocks.
> Backend integration does not turn this calculation into a backend SWMM run, a
> coupled regional model or an observation. The equations, assumptions, numerical
> checks and historical evidence below remain unchanged.

# Station entrance what-if calculation

**Illustrative what-if model — not calibrated station flooding.**

This local frontend calculation is a compartment-storage demonstrator. Its street
water boundary, barrier height, inflow capacity, removal capacity and duration are
explicit hypothetical inputs. It neither reconstructs current interior water nor
runs the backend SWMM engine. Source/event time and hypothetical elapsed time are
separate. An unknown interior measurement is never interpreted as zero water.

## Equations and numerical contract (written before implementation)

All computation uses SI: elevation and depth in metres, area in m², storage in m³,
flow in m³/s, time in seconds. Display conversions use 1 m³ = 1000 L,
1 ft = 0.3048 m and 1 in = 0.0254 m exactly.

A compartment contains declared horizontal floor patches `i`, each with floor
elevation `z_i` and area `A_i`. Its stage-storage function is

`V(h) = Σ A_i × max(0, h − z_i)`.

For a staircase, every tread contributes its own area and floor elevation. This
is a stepped storage function, not the storage of an enclosing generic box. A
landing/platform uses its declared horizontal floor area. The inverse is solved
piecewise using the sorted floor elevations. Empty storage has the lowest floor
as its reference stage; it is not an observation of station conditions. Maximum
represented storage is `V(maxStageM)`; excess is counted as explicit overflow.

The prescribed street stage is `streetReferenceM + streetDepthM`. The entrance
crest is `streetReferenceM + barrierHeightM`. Inflow is allowed only when the
street stage exceeds both the entrance crest and the receiving water stage:

`Q_boundary = inflowCapacity × clamp((h_street − max(h_crest, h_receiving)) / 0.10 m, 0, 1)`.

The 0.10 m head ramp is an illustrative bounded transfer assumption, not a
calibrated weir law. Boundary supply in each step is additionally limited to the
volume needed to reach the prescribed street stage. The street patch is an
external boundary visualization, not a computed regional water surface.

A defined directional connection uses the same 0.10 m head ramp:

`Q_transfer = capacity × clamp((h_from − max(h_crest, h_to)) / 0.10 m, 0, 1)`.

A closed connection transfers zero. Available donor water above the crest bounds
each transfer. A deterministic bisection also bounds transfer at the volume where
donor and receiver stages equalize, preventing numerical overshoot into uphill
flow. Each internal transfer subtracts and adds precisely the same volume. No
connection is inferred from map proximity, a source line crossing, an exposure
score, an alert or an unsupported station-network gap. A platform is represented
only when a declared local schematic connection exists; an elevated platform is
not filled by street ponding through an unsupported uphill connection.

For each fixed step, apply boundary supply (and capacity overflow), declared
connections in stable array order (and capacity overflow), then drainage. Drainage
is `min(removalCapacity × dt, availableWater)` from the declared removal
compartment. Thus every compartment obeys

`V_next = V_current + externalSupply + internalIn − internalOut − drainage − overflow`.

The scenario ledger satisfies

`initialStorage + cumulativeSupply = currentStorage + cumulativeDrainage + cumulativeOverflow`.

The production timestep is 1 s; the numerical test interface also permits 0.5 s
for refinement checks. The final step is shortened to end at the exact bounded
duration. Playback, pause, scrubbing and vertical display exaggeration read the
precomputed trajectory and cannot alter its calculations. Scrubbing chooses the
last computed frame at or before the requested time; it does not integrate on
render frames or invent an intermediate state.

Numerical conservation tolerance is 1e−8 m³ plus 1e−10 of total supplied/initial
volume. Refinement acceptance is a 2% or 0.02 m³ maximum absolute final-compartment
difference (whichever is larger) in the representative test. These are software
checks, not physical calibration or validation.

## Bounded hypothetical parameters

All defaults are illustrative assumptions: street depth 0.35 m, entrance barrier
0.10 m, inflow capacity 20 L/s, removal capacity 2 L/s, duration 600 s. Accepted
bounds are street depth 0–2 m, barrier 0–2 m, inflow 0–100 L/s, removal 0–100 L/s,
and duration 1–1800 s. At most three local compartments, 256 floor patches per
compartment and three declared connections are accepted. Computation is bounded to
3600 steps at the test refinement timestep.

These inputs do not come from rainfall intensity, DEP categories, nearby sensors,
complaints, station exposure or official operational status. The model identity,
geometry version, station/entrance identity, input units, supplied/removed/overflow
ledger, elapsed time, per-compartment stage/storage and unresolved connections
travel with the result. Changing an input or station requires a fresh trajectory.

## Measurement and future integration boundary

Dimensions, orientation, connections, thresholds, capacities and storage spaces are
schematic assumptions unless explicitly source-supported. A future validated
station model would require surveyed entrance thresholds and connected interior
geometry/storage; time-varying surface boundary conditions; measured drainage,
pumping and connections; and independent calibration/validation evidence. No such
future work is implemented or invoked by this demonstrator.

## Reproducible numerical example and checks

A mathematical test compartment (not an actual station) has one 2 m² floor at
−1 m, maximum storage stage 0.8 m, no internal connections and zero initial
water. At a prescribed 0.35 m street depth, 0.10 m barrier, 20 L/s inflow,
2 L/s removal and 60 s duration, the computed ledger is: supply 1.20 m³,
removal 0.12 m³, stored 1.08 m³, overflow 0 m³. Its hypothetical water stage
is −0.46 m and floor-relative depth is 0.54 m. These are the declared toy
compartment's results, not station filling predictions.

Run focused numerical checks from the feature worktree:

```sh
cd /Users/kerwynjean/Swale-subway-3d/frontend
npm test -- --run src/tests/floodModel.test.ts
```

The focused suite covers stepped storage/inversion, zero-input storage, exact
barrier thresholds, positive supply, balanced internal transfers, removal limited
by available water, closed/disconnected spaces, connection crests, equalization
overshoot, elevated/upward head controls, explicit overflow, deterministic state
and scrubbing, timestep refinement, parameter/identity validation, bounded work,
independent station/input results and SI/display-unit conversions. UI reset,
station lifecycle and actual rendering are separately verified; numerical tests
alone cannot establish visual or physical accuracy.

## Source-linked entrance geometry and image references

`schematic-entrance-v1` is generated only for the selected, exact-joined source
entrance. Its original S4 ID, type and WGS84 point remain separate from the local
template's pivot, bounds and surfaces. An additive 116,978-byte source catalog
copies the existing cached 580 entrance records, including the three unmatched
relationships and their reasons. It does not replace canonical index/chunks/GLB.
The source remains MTA's **2024 static entrance edition**; December 5, 2025 is its
publisher upload time, not a new entrance survey or the browser retrieval time.

Carroll St/F21 `row-y4aj-tepy-nbif` is source type **Stair**, at the unchanged
`[-73.9952827, 40.6793588]` point. Smith–9 Sts/F22
`row-9vic.hxit~q3uv` is source type **Station House**, at unchanged
`[-73.9972884, 40.6746146]`; it is not relabelled Stair. That station-house example
shows explicitly assumed upward access and an unresolved continuation to the
canonical +48 m schematic platform reference. Elevator, Escalator, easement and
unknown source types receive a clear unavailable reason instead of silently
acquiring stair geometry. Unmatched relationships generate no station connection.

The supplied images were inspected as architectural references. Reference A maps
to separate tread/riser faces, continuous handrails, the switchback landing,
structural columns and light strips. Reference B maps to the defined sidewalk
collar/opening, posts, railing bars, dark plain-text signboard and globe fixtures.
Reference C contributes only tile rhythm and modest local landing/platform context.
No reference station names, logos, people, photographs, advertisements or reference
colors were transplanted. Owned materials use blue-gray metal, neutral stone/tile,
white lights and blue water. Globe discs are a simple local schematic treatment.
These mappings describe implementation intent; actual visual acceptance is recorded
separately in the E-series browser report.

Orientation follows the source-point-to-station vector for a deterministic display;
it is **assumed**, not authoritative doorway orientation. The local tangent-frame
conversion uses 111,320 m per latitude degree and cosine-adjusted longitude at the
source point over a scene smaller than 20 m. This visualization transform is not a
survey-accuracy claim, and source coordinates are never replaced by its vertices.

The template has two bounded switchback flights, each 2.4 m wide, 0.30 m treads,
1.6 m landings, 0.98 m handrails and a nominal 0.18 m stone thickness. Total rise
follows the canonical relative platform reference but is bounded to 3–8 m for
underground examples and 3–6 m for upward access. The riser count is
`2 × ceil(totalRise / 2 / 0.18 m)`; actual assumed riser height is total rise divided
by that count. F21 has 34 individually modelled steps over 6 m, with 0.17647 m
risers. These choices do not imply building-code compliance or measured dimensions.

The mid-switchback floor is 5.4 × 1.6 m (8.64 m²), the bottom/upper landing is
2.4 × 1.6 m (3.84 m²), and the underground local platform-context room is
6 × 4.8 m (28.8 m²). Stage storage uses the exact 0.72 m² tread patches plus the
8.64 m² mid-landing patch. The room is a declared local demonstration space; its
connection is not a surveyed corridor to the distant canonical platform and does
not route water through the Brooklyn network. The upward example has no platform
compartment or enabled transfer to the upper landing. Street head can wet only
the low access steps it reaches, without filling the elevated station.

Structural surfaces, source assets and dynamic water are separate. Water patches
are clipped to the assumed street boundary, exact tread rectangles and declared
landing/room footprints. Threshold overtopping and the down-stair flow strip appear
only with computed positive boundary inflow; the flow strip depicts localized
transfer without claiming measured velocity. Accumulation height follows the model
stage. Display exaggeration transforms every structural/water/reference Z together
and never enters the SI calculation. X-ray bypasses map occlusion while preserving
negative heights; it is not a physical excavation. For selected entrance detail,
Surface explicitly omits entire faces/paths below the zero-metre map reference.
It shows the above-reference collar, enclosure, sign, fixtures and street water.
This bounded visibility rule is necessary because flat basemap road artwork does
not provide a complete ground depth mask. Canonical infrastructure depth testing
is unchanged; no source geometry or water values move above ground.

Pure vertical railing/globe-post segments are real XYZ box faces because the
ground-plane width of a vertical PathLayer segment degenerates. Vertical sign and
riser faces use the PolygonLayer fill sublayer's `_full3d` tessellation. All detail
is composed into the existing overlay; no second map, canvas or scene engine exists.

Reproduce or verify only the additive metadata from the retained cached inventory:

```sh
cd /Users/kerwynjean/Swale-subway-3d
python3 tools/mta-model/publish_entrance_details.py --check
cd frontend
npm test -- --run src/tests/entranceGeometry.test.ts src/tests/entranceLayers.test.ts
```

The publisher makes no network or database calls. The frontend catalog loader is
bounded to 400,000 bytes and runs on demand; detailed stairs for all entrances are
not generated or downloaded at startup. Canonical model hashes and inherited
I1–I14 results remain separate from this additive feature's acceptance.


## Playback and render ownership

Only an explicit Run starts the local calculation. Editing inputs invalidates the
trajectory. Changing station, entrance or geometry version cancels the old scenario;
source selection retains keyboard focus and returns to Current evidence. Playback
uses a monotonic wall clock to sample the immutable one-second trajectory at 1×,
30× or 60× time. Pause, scrubbing, source changes, hidden-document state, exit and
unmount stop its owned interval. Comparison hides water without changing values.
The default flood-detail display scale is 1×; 1×–5× is presentation only.

The existing transit hook remains the sole operational polling owner. No what-if
result is submitted to an endpoint, stored in a database, inserted into history,
or used to change official status or exposure. Current evidence explicitly leaves
interior water unknown. The existing live board remains separate below the local
scenario panel.

Detail assets and the renderer remain on demand; the small geometry/model/control
modules are included in initial application code. The canonical GLB is never an
initial download. Static entrance layer data is weakly cached per immutable detail
and Surface/X-ray mode so playback does not re-upload/tessellate unchanged faces.
Only water presentation is rebuilt for a new sampled frame. Fixed locale/timezone
formatting reuses one Intl formatter; source times and formatting meanings do not
change. This is bounded JavaScript ownership, not a GPU-memory measurement.
