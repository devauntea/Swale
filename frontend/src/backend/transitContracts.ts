import type { Feature, Point, Polygon, MultiPolygon } from "geojson";
import type {
  BackendBbox,
  BackendSourceFreshness,
  BackendSourceRef,
  BackendKnowledge,
  BackendIncident,
} from "./contracts";
import {
  backendValidation as v,
  BackendValidationError,
  parseFreshness,
} from "./contracts";

export interface TransitLayerVisibility {
  stations: boolean;
  entrances: boolean;
  exposure: boolean;
  zones: boolean;
}
export type TransitStatus =
  | "normal"
  | "alert"
  | "delayed"
  | "flooding_reported"
  | "no_service";
export interface TransitStationProps {
  layer: "subway_stations";
  knowledge_type: "observed";
  gtfs_stop_id: string;
  name: string;
  routes: string[];
  line: string | null;
  structure: string | null;
  ada: number;
  complex_id: string | null;
  source: BackendSourceRef;
}
export interface TransitEntranceProps {
  layer: "subway_entrances";
  knowledge_type: "observed";
  station_id: string;
  station_name: string;
  routes: string[];
  entrance_type: string | null;
  entry_allowed: boolean;
  exit_allowed: boolean;
  source: BackendSourceRef;
}
export type TransitStation = Feature<Point | null, TransitStationProps> & {
  id: string;
};
export type TransitEntrance = Feature<Point | null, TransitEntranceProps> & {
  id: string;
};
export interface TransitArrival {
  route: string;
  direction: "N" | "S";
  trip_id: string;
  predicted_at: string;
  minutes_away: number;
  scheduled_at: string | null;
  delay_min: number | null;
}
export interface TransitLiveStation {
  station_id: string;
  gtfs_stop_id: string;
  name: string;
  routes: string[];
  lon: number;
  lat: number;
  status: TransitStatus;
  reasons: string[];
  trains_next_30_min: { predicted: number; scheduled: number | null };
  delay_min: {
    median: number | null;
    max: number | null;
    trains_matched: number;
  };
  next: { N: TransitArrival[]; S: TransitArrival[] };
  direction_labels: { N: string | null; S: string | null };
  alert_ids: string[];
}
export interface TransitAlert {
  id: string;
  alert_type: string | null;
  header: string;
  description: string | null;
  routes: string[];
  stops: string[];
  station_specific: boolean;
  mentions_flooding: boolean;
  active_from: string;
  updated_at: string | null;
  knowledge_type: "observed";
  basis: string;
}
export interface TransitTrain {
  route: string;
  trip_id: string;
  stop_id: string;
  direction: "N" | "S";
  status: "incoming_at" | "stopped_at" | "in_transit_to" | "unknown";
  seen_at: string | null;
  knowledge_type: "observed";
}
export interface TransitLive {
  api_version: "1.0";
  area_id: string;
  fetched_at: string;
  feed_times: Record<string, string>;
  stations: TransitLiveStation[];
  trains: TransitTrain[];
  alerts: TransitAlert[];
  errors: string[];
  summary: {
    stations: number;
    delayed: number;
    alert: number;
    flooding_reported: number;
    trains_in_area: number;
    alerts: number;
  };
  knowledge: Record<string, string>;
  source: { publisher: string; url: string | null };
}
export interface TransitFactor {
  id: string;
  label: string;
  knowledge_type: BackendKnowledge;
  value: number;
  weight: number;
  contribution: number;
  evidence_ids: string[];
  explanation: string;
}
export interface TransitExposureProps {
  layer: "station_flood_exposure";
  knowledge_type: "inferred";
  station_id: string;
  name: string;
  routes: string[];
  rank: number;
  score: number;
  tier: "high" | "medium" | "low";
  method_version: string;
  assessed_at: string;
  run_id: string | null;
  entrances: number;
  factors: TransitFactor[];
  missing_factors: { id: string; reason: string }[];
  live: Pick<
    TransitLiveStation,
    "status" | "reasons" | "trains_next_30_min" | "delay_min" | "alert_ids"
  > | null;
  caveats: string[];
}
export type TransitExposure = Feature<Point | null, TransitExposureProps> & {
  id: string;
};
export interface TransitZoneEntrance {
  entrance_id: string;
  station_id: string;
  station_name: string;
  routes: string[];
}
export interface TransitDangerProps {
  layer: "danger_zones";
  zone_type: "dep_mapped" | "swale_simulated" | "measured";
  knowledge_type: "predicted" | "observed";
  level: "high" | "moderate";
  assumes: string;
  explanation: string;
  evidence_ids: string[];
  entrance_count: number;
  entrances: TransitZoneEntrance[];
  last_flood_at?: string | null;
}
export type TransitDangerZone = Feature<
  Polygon | MultiPolygon | null,
  TransitDangerProps
> & { id: string };
export type TransitZone = TransitDangerZone;
export interface TransitRainSummary {
  level: "low" | "watch" | "warning" | "unknown";
  reason?: string;
  forecast_peak_in_hr?: number;
  peak_at?: string | null;
  flood_alerts?: string[];
  sewer_design_in_hr?: number;
  watch_in_hr?: number;
  rule?: string;
  observed_now?: string | null;
}
export interface TransitMeta {
  api_version: "1.0";
  layer: string;
  request_bbox: BackendBbox;
  filters: Record<string, unknown>;
  count: number;
  limit: number;
  truncated: boolean;
  next_cursor: string | null;
  generated_at: string;
  sources: BackendSourceFreshness[];
  rain?: TransitRainSummary;
  errors?: string[];
  note?: string;
  methodology?: Record<
    string,
    {
      label: string;
      weight: number;
      knowledge_type: BackendKnowledge;
      definition: string;
    }
  >;
  summary?: {
    zones: number;
    high: number;
    with_subway_entrances: number;
    stations_with_entrances_in_high_zones: string[];
  };
}
export interface TransitPage<F> {
  type: "FeatureCollection";
  features: F[];
  meta: TransitMeta;
}
export interface TransitCollection<F> {
  features: F[];
  status: "idle" | "loading" | "ready" | "empty" | "error";
  error: string | null;
  partial: boolean;
  stale: boolean;
  generatedAt: string | null;
  sources: BackendSourceFreshness[];
  filters: Record<string, unknown>;
  pages: number;
  meta: TransitMeta | null;
}
export interface TransitResource<T> {
  data: T | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  stale: boolean;
  partial: boolean;
  lastSuccessAt: string | null;
}
export interface TransitHistoryStation {
  gtfs_stop_id: string;
  status: TransitStatus;
  predicted: number;
  scheduled: number | null;
  median_delay_min: number | null;
  max_delay_min: number | null;
}
export interface TransitHistory {
  api_version: "1.0";
  area_id: string;
  hours: number;
  polls: {
    polled_at: string;
    delayed: number;
    flooding_reported: number;
    alerts: number;
    stations: TransitHistoryStation[];
  }[];
  note: string;
}
export interface TransitWeather {
  api_version: "1.0";
  area_id: string;
  fetched_at: string;
  forecast_issued_at: string | null;
  gridpoint: string;
  cached: boolean;
  observation: {
    station: string;
    station_name: string;
    observed_at: string | null;
    description: string | null;
    raining: boolean;
    temperature_f: number | null;
    precip_last_hour_in: number | null;
    knowledge_type: "observed";
  } | null;
  forecast: {
    knowledge_type: "predicted";
    total_rain_in: number;
    peak_rate_in_hr: number;
    peak_at: string | null;
    max_rain_chance_pct: number;
    rain_expected: boolean;
    hours: {
      start: string;
      end: string;
      rain_chance_pct: number;
      rain_in: number;
      short_forecast: string | null;
      temperature_f: number | null;
      wind: string | null;
    }[];
  };
  alerts: {
    event: string | null;
    headline: string | null;
    severity: string | null;
    onset: string | null;
    ends: string | null;
  }[];
  context: {
    smallest_dep_design_storm_in_hr: number;
    peak_vs_smallest_dep_storm_pct: number;
    note: string;
  };
  errors: string[];
  source: { publisher: string; url: string | null };
}
export type TransitFeedState =
  | "idle"
  | "loading"
  | "live"
  | "partial"
  | "stale"
  | "offline"
  | "paused"
  | "hidden";
export interface TransitData {
  stations: TransitCollection<TransitStation>;
  entrances: TransitCollection<TransitEntrance>;
  exposures: TransitCollection<TransitExposure>;
  zones: TransitCollection<TransitDangerZone>;
  live: TransitResource<TransitLive>;
  weather: TransitResource<TransitWeather>;
  history: TransitResource<TransitHistory>;
  feedState: TransitFeedState;
  nextRefreshAt: string | null;
}
export type TransitSensor = Feature<
  Point | null,
  {
    layer: "sensors";
    knowledge_type: "observed";
    sensor_id: string;
    name: string;
    tidally_influenced: boolean | null;
    installed_at: string | null;
    removed_at: string | null;
    lowest_point_height_delta_in: number | null;
    area_ids: string[];
    event_count: number;
    max_depth_in: number | null;
    last_event_at: string | null;
    source: BackendSourceRef;
    ingested_at: string;
  }
> & { id: string };
export type TransitObservation = Feature<
  Point | null,
  {
    layer: "flood_observations";
    knowledge_type: "observed";
    sensor_id: string;
    sensor: string;
    started_at: string;
    ended_at: string | null;
    max_depth_in: number;
    duration_min: number | null;
    onset_min: number | null;
    drain_min: number | null;
    duration_above_4in_min: number | null;
    duration_above_12in_min: number | null;
    tidally_influenced: boolean | null;
    source: BackendSourceRef;
    ingested_at: string;
    profile?: { t_s: number[]; depth_in: number[] };
  }
> & { id: string };
export type TransitFloodMap = Feature<
  Polygon | MultiPolygon | null,
  {
    layer: "dep_flood_maps";
    knowledge_type: "predicted";
    scenario_code: string;
    scenario_label: string;
    intensity_in_hr: number;
    sea_level: string;
    depth_class: "nuisance" | "deep";
    category: number;
    area_ft2: number;
    note: string;
    source: BackendSourceRef;
    ingested_at: string;
  }
> & { id: string };
export interface TransitEvidenceState {
  id: string | null;
  kind:
    | "incident"
    | "sensor"
    | "flood_observation"
    | "dep_model"
    | "unsupported"
    | null;
  status: "idle" | "loading" | "ready" | "error";
  feature:
    | BackendIncident
    | TransitSensor
    | TransitObservation
    | TransitFloodMap
    | null;
  error: string | null;
  note: string | null;
  observations?: TransitObservation[];
}

// Verified committed schedule metadata at backend c65f03b; deliberately separate
// from API fields. It describes a source artifact, never a fabricated API result.
export const TRANSIT_SCHEDULE_SOURCE = {
  backendCommit: "c65f03b569fc941264bb1b6ec80f8e0a079263d0",
  timezone: "America/New_York",
  firstServiceDate: "2026-10-16",
  lastServiceDate: "2026-10-23",
  extractedAt: "2026-10-16T10:06:58.651390+00:00",
} as const;
export const TRANSIT_SOURCE_LIMITATIONS = [
  "Train records are stop associations, not exact vehicle coordinates. Destinations and skipped/cancelled-trip flags are not exposed.",
  "Alert end times, full direction selectors and cause/effect fields are not exposed. A flooding/water mention does not establish a shutdown.",
  "History contains monitoring samples, not deduplicated station flood events; station-specific event history is insufficient.",
  "Weather output maps missing precipitation/chance values to zero; zero cannot certify no rain. Forecast rainfall is distributed uniformly within source intervals.",
] as const;

export function transitScheduleAvailability(
  board: TransitLive | null,
  now = new Date(),
): "unavailable" | "expired" | "matched" | "unmatched" {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TRANSIT_SCHEDULE_SOURCE.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  if (
    day < TRANSIT_SCHEDULE_SOURCE.firstServiceDate ||
    day > TRANSIT_SCHEDULE_SOURCE.lastServiceDate
  )
    return "expired";
  if (
    !board ||
    board.errors.some((e) => e.includes("no static schedule")) ||
    board.stations.every((s) => s.trains_next_30_min.scheduled === null)
  )
    return "unavailable";
  return board.stations.some((s) => s.delay_min.trains_matched > 0)
    ? "matched"
    : "unmatched";
}
export function distinctTransitArrivals(
  arrivals: readonly TransitArrival[],
): TransitArrival[] {
  const map = new Map<string, TransitArrival>();
  for (const arrival of arrivals) {
    const key = JSON.stringify([
      arrival.route,
      arrival.direction,
      arrival.trip_id,
      arrival.predicted_at,
      arrival.scheduled_at,
    ]);
    if (!map.has(key)) map.set(key, arrival);
  }
  return [...map.values()].sort(
    (a, b) => Date.parse(a.predicted_at) - Date.parse(b.predicted_at),
  );
}
export function applicableTransitAlerts(
  board: TransitLive,
  station: TransitLiveStation,
): TransitAlert[] {
  const ids = new Set(station.alert_ids);
  return board.alerts.filter(
    (a) =>
      ids.has(a.id) &&
      (a.station_specific
        ? a.stops.includes(station.gtfs_stop_id)
        : a.routes.some((route) => station.routes.includes(route))),
  );
}

const statusValues = [
  "normal",
  "alert",
  "delayed",
  "flooding_reported",
  "no_service",
] as const;
const knowledgeValues = [
  "observed",
  "reported",
  "predicted",
  "inferred",
] as const;
const count = (x: unknown, f = "count") => v.integer(x, f, 0, 1000000);
const num = (x: unknown, f = "number") => v.finite(x, f);
const ns = (x: unknown, f = "text") => v.nullableString(x, f);
const ni = (x: unknown, f = "time") => v.nullableInstant(x, f);
const nn = (x: unknown, f = "number") => (x === null ? null : num(x, f));
function fail(f: string): never {
  throw new BackendValidationError(f);
}
function base(value: unknown, layer: string, knowledge: BackendKnowledge) {
  const f = v.record(value, "transit feature"),
    p = v.record(f.properties, "transit properties");
  if (
    f.type !== "Feature" ||
    p.layer !== layer ||
    p.knowledge_type !== knowledge
  )
    fail(`${layer} feature`);
  return { f, p };
}
function nullableBool(x: unknown): boolean | null {
  return x === null ? null : v.bool(x, "nullable boolean");
}
function typedFeature<P>(
  f: Record<string, unknown>,
  properties: P,
  polygon = false,
): Feature<Point | Polygon | MultiPolygon | null, P> & { id: string } {
  return {
    type: "Feature",
    id: v.id(f.id),
    geometry: polygon
      ? parseTransitPolygon(f.geometry)
      : v.geometry(f.geometry),
    properties,
  };
}
export function parseTransitPolygon(
  value: unknown,
): Polygon | MultiPolygon | null {
  if (value === null) return null;
  const g = v.record(value, "polygon geometry");
  if (g.type !== "Polygon" && g.type !== "MultiPolygon") fail("polygon type");
  let points = 0;
  const ring = (value: unknown) => {
    const r = v.array(
      value,
      (item) => {
        points++;
        if (points > 200000) fail("polygon point limit");
        const p = v.array(
          item,
          (c) => num(c, "polygon coordinate"),
          "polygon position",
        );
        if (
          p.length < 2 ||
          p.length > 3 ||
          Math.abs(p[0]) > 180 ||
          Math.abs(p[1]) > 90
        )
          fail("polygon coordinate");
        return p;
      },
      "polygon ring",
    );
    if (r.length < 4 || r[0].some((c, i) => c !== r[r.length - 1][i]))
      fail("closed polygon ring");
    return r;
  };
  const poly = (value: unknown) => {
    const p = v.array(value, ring, "polygon rings");
    if (!p.length) fail("polygon exterior");
    return p;
  };
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: poly(g.coordinates) }
    : {
        type: "MultiPolygon",
        coordinates: v.array(g.coordinates, poly, "multipolygon"),
      };
}
export function parseTransitStation(value: unknown): TransitStation {
  const { f, p } = base(value, "subway_stations", "observed");
  return typedFeature(f, {
    layer: "subway_stations",
    knowledge_type: "observed",
    gtfs_stop_id: v.id(p.gtfs_stop_id),
    name: v.string(p.name, "station name"),
    routes: v.strings(p.routes, "routes"),
    line: ns(p.line),
    structure: ns(p.structure),
    ada: count(p.ada, "ADA inventory code"),
    complex_id: ns(p.complex_id),
    source: v.sourceRef(p.source),
  }) as TransitStation;
}
export function parseTransitEntrance(value: unknown): TransitEntrance {
  const { f, p } = base(value, "subway_entrances", "observed");
  return typedFeature(f, {
    layer: "subway_entrances",
    knowledge_type: "observed",
    station_id: v.id(p.station_id),
    station_name: v.string(p.station_name, "station name"),
    routes: v.strings(p.routes, "routes"),
    entrance_type: ns(p.entrance_type),
    entry_allowed: v.bool(p.entry_allowed, "inventory entry flag"),
    exit_allowed: v.bool(p.exit_allowed, "inventory exit flag"),
    source: v.sourceRef(p.source),
  }) as TransitEntrance;
}
function counts(value: unknown) {
  const x = v.record(value, "prediction counts");
  return {
    predicted: count(x.predicted),
    scheduled: x.scheduled === null ? null : count(x.scheduled),
  };
}
function delays(value: unknown) {
  const x = v.record(value, "delay summary");
  return {
    median: nn(x.median),
    max: nn(x.max),
    trains_matched: count(x.trains_matched),
  };
}
function liveSummary(p: Record<string, unknown>) {
  return {
    status: v.literal(p.status, statusValues, "service status"),
    reasons: v.strings(p.reasons, "status reasons"),
    trains_next_30_min: counts(p.trains_next_30_min),
    delay_min: delays(p.delay_min),
    alert_ids: v.strings(p.alert_ids, "alert IDs"),
  };
}
function parseArrival(value: unknown): TransitArrival {
  const a = v.record(value, "arrival");
  return {
    route: v.string(a.route, "route"),
    direction: v.literal(a.direction, ["N", "S"], "direction"),
    trip_id: v.string(a.trip_id, "trip ID"),
    predicted_at: v.instant(a.predicted_at, "prediction time"),
    minutes_away: num(a.minutes_away),
    scheduled_at: ni(a.scheduled_at),
    delay_min: nn(a.delay_min),
  };
}
function parseLiveStation(value: unknown): TransitLiveStation {
  const s = v.record(value, "live station"),
    next = v.record(s.next, "next arrivals"),
    labels = v.record(s.direction_labels, "direction labels"),
    position = v.geometry({ type: "Point", coordinates: [s.lon, s.lat] })!;
  return {
    ...liveSummary(s),
    station_id: v.id(s.station_id),
    gtfs_stop_id: v.id(s.gtfs_stop_id),
    name: v.string(s.name, "station name"),
    routes: v.strings(s.routes, "routes"),
    lon: position.coordinates[0],
    lat: position.coordinates[1],
    next: {
      N: v.array(next.N, parseArrival, "north arrivals"),
      S: v.array(next.S, parseArrival, "south arrivals"),
    },
    direction_labels: { N: ns(labels.N), S: ns(labels.S) },
  };
}
function parseAlert(value: unknown): TransitAlert {
  const a = v.record(value, "MTA alert");
  return {
    id: v.id(a.id, "MTA alert ID"),
    alert_type: ns(a.alert_type),
    header: v.string(a.header, "alert header"),
    description: ns(a.description),
    routes: v.strings(a.routes, "alert routes"),
    stops: v.strings(a.stops, "alert stops"),
    station_specific: v.bool(a.station_specific, "station-specific flag"),
    mentions_flooding: v.bool(a.mentions_flooding, "water mention"),
    active_from: v.instant(a.active_from, "alert active time"),
    updated_at: ni(a.updated_at),
    knowledge_type: v.literal(a.knowledge_type, ["observed"], "alert trust"),
    basis: v.string(a.basis, "alert basis"),
  };
}
export function parseTransitLive(value: unknown): TransitLive {
  const x = versioned(value),
    summary = v.record(x.summary, "board summary"),
    source = v.record(x.source, "MTA source");
  const keys = [
    "stations",
    "delayed",
    "alert",
    "flooding_reported",
    "trains_in_area",
    "alerts",
  ] as const;
  const numbers = Object.fromEntries(
    keys.map((k) => [k, count(summary[k])]),
  ) as TransitLive["summary"];
  const feeds = Object.fromEntries(
    Object.entries(v.record(x.feed_times, "feed times")).map(([k, t]) => [
      k,
      v.instant(t, "MTA feed time"),
    ]),
  );
  const knowledge = Object.fromEntries(
    Object.entries(v.record(x.knowledge, "board knowledge")).map(([k, t]) => [
      k,
      v.string(t, "knowledge description"),
    ]),
  );
  return {
    api_version: "1.0",
    area_id: v.string(x.area_id, "area ID"),
    fetched_at: v.instant(x.fetched_at, "board fetched time"),
    feed_times: feeds,
    stations: v.array(x.stations, parseLiveStation, "live stations"),
    trains: v.array(
      x.trains,
      (value) => {
        const t = v.record(value, "train association");
        return {
          route: v.string(t.route, "route"),
          trip_id: v.string(t.trip_id, "trip ID"),
          stop_id: v.id(t.stop_id),
          direction: v.literal(t.direction, ["N", "S"], "direction"),
          status: v.literal(
            t.status,
            ["incoming_at", "stopped_at", "in_transit_to", "unknown"],
            "vehicle association",
          ),
          seen_at: ni(t.seen_at),
          knowledge_type: v.literal(
            t.knowledge_type,
            ["observed"],
            "vehicle trust",
          ),
        };
      },
      "trains",
    ),
    alerts: v.array(x.alerts, parseAlert, "alerts"),
    errors: v.strings(x.errors, "feed errors"),
    summary: numbers,
    knowledge,
    source: {
      publisher: v.string(source.publisher, "publisher"),
      url: v.safeBackendLink(source.url),
    },
  };
}
function versioned(value: unknown) {
  const x = v.record(value, "transit response");
  if (x.api_version !== "1.0") fail("API version");
  if (x.area_id !== undefined && x.area_id !== "BK0601")
    fail("transit coverage");
  return x;
}
function parseFactor(value: unknown): TransitFactor {
  const f = v.record(value, "exposure factor");
  return {
    id: v.id(f.id),
    label: v.string(f.label, "factor label"),
    knowledge_type: v.literal(
      f.knowledge_type,
      knowledgeValues,
      "factor trust",
    ),
    value: num(f.value),
    weight: num(f.weight),
    contribution: num(f.contribution),
    evidence_ids: v.strings(f.evidence_ids, "evidence IDs"),
    explanation: v.string(f.explanation, "factor explanation"),
  };
}
export function parseTransitExposure(value: unknown): TransitExposure {
  const { f, p } = base(value, "station_flood_exposure", "inferred");
  const score = num(p.score);
  if (score < 0 || score > 100) fail("exposure score");
  return typedFeature(f, {
    layer: "station_flood_exposure",
    knowledge_type: "inferred",
    station_id: v.id(p.station_id),
    name: v.string(p.name, "station name"),
    routes: v.strings(p.routes, "routes"),
    rank: v.integer(p.rank, "rank", 1, 10000),
    score,
    tier: v.literal(p.tier, ["high", "medium", "low"], "exposure tier"),
    method_version: v.string(p.method_version, "method version"),
    assessed_at: v.instant(p.assessed_at, "assessment time"),
    run_id: ns(p.run_id),
    entrances: count(p.entrances),
    factors: v.array(p.factors, parseFactor, "exposure factors"),
    missing_factors: v.array(
      p.missing_factors,
      (value) => {
        const m = v.record(value, "missing factor");
        return { id: v.id(m.id), reason: v.string(m.reason, "missing reason") };
      },
      "missing factors",
    ),
    live:
      p.live === null
        ? null
        : liveSummary(v.record(p.live, "live exposure summary")),
    caveats: v.strings(p.caveats, "exposure caveats"),
  }) as TransitExposure;
}
export function parseTransitZone(value: unknown): TransitDangerZone {
  const f = v.record(value, "zone feature"),
    p = v.record(f.properties, "zone properties");
  const type = v.literal(
    p.zone_type,
    ["dep_mapped", "swale_simulated", "measured"],
    "zone type",
  );
  if (
    f.type !== "Feature" ||
    p.layer !== "danger_zones" ||
    p.knowledge_type !== (type === "measured" ? "observed" : "predicted")
  )
    fail("zone trust");
  const entrances = v.array(
    p.entrances,
    (value) => {
      const e = v.record(value, "zone entrance");
      return {
        entrance_id: v.id(e.entrance_id),
        station_id: v.id(e.station_id),
        station_name: v.string(e.station_name, "station name"),
        routes: v.strings(e.routes, "routes"),
      };
    },
    "zone entrances",
  );
  if (count(p.entrance_count) !== entrances.length) fail("zone entrance count");
  const props: TransitDangerProps = {
    layer: "danger_zones",
    zone_type: type,
    knowledge_type: type === "measured" ? "observed" : "predicted",
    level: v.literal(p.level, ["high", "moderate"], "zone level"),
    assumes: v.string(p.assumes, "zone assumptions"),
    explanation: v.string(p.explanation, "zone explanation"),
    evidence_ids: v.strings(p.evidence_ids, "zone evidence"),
    entrance_count: entrances.length,
    entrances,
  };
  if (p.last_flood_at !== undefined) props.last_flood_at = ni(p.last_flood_at);
  return typedFeature(f, props, true) as TransitDangerZone;
}
export function parseTransitRain(value: unknown): TransitRainSummary {
  const x = v.record(value, "rain summary");
  const r: TransitRainSummary = {
    level: v.literal(
      x.level,
      ["low", "watch", "warning", "unknown"],
      "inferred rain level",
    ),
  };
  for (const key of ["reason", "rule"] as const)
    if (x[key] !== undefined) r[key] = v.string(x[key], key);
  for (const key of [
    "forecast_peak_in_hr",
    "sewer_design_in_hr",
    "watch_in_hr",
  ] as const)
    if (x[key] !== undefined) r[key] = num(x[key]);
  if (x.peak_at !== undefined) r.peak_at = ni(x.peak_at);
  if (x.observed_now !== undefined) r.observed_now = ns(x.observed_now);
  if (x.flood_alerts !== undefined)
    r.flood_alerts = v.strings(x.flood_alerts, "rain alert names");
  return r;
}
export function parseTransitPage<F>(
  value: unknown,
  layer: string,
  parser: (value: unknown) => F,
): TransitPage<F> {
  const c = v.record(value, "transit collection"),
    m = versioned(c.meta);
  if (c.type !== "FeatureCollection" || m.layer !== layer)
    fail("transit collection layer");
  const features = v.array(c.features, parser, "transit features");
  if (count(m.count) !== features.length) fail("transit feature count");
  const meta: TransitMeta = {
    api_version: "1.0",
    layer,
    request_bbox: v.validateBackendBbox(m.request_bbox),
    filters: v.record(m.filters, "effective filters"),
    count: features.length,
    limit: count(m.limit, "endpoint limit"),
    truncated: v.bool(m.truncated, "truncation"),
    next_cursor: m.next_cursor === null ? null : v.id(m.next_cursor),
    generated_at: v.instant(m.generated_at, "generated time"),
    sources: v.array(m.sources, parseFreshness, "transit sources"),
  };
  if (meta.truncated !== (meta.next_cursor !== null))
    fail("transit pagination");
  if (m.rain !== undefined) meta.rain = parseTransitRain(m.rain);
  if (m.errors !== undefined)
    meta.errors = v.strings(m.errors, "context errors");
  if (m.note !== undefined) meta.note = v.string(m.note, "context note");
  if (m.methodology !== undefined)
    meta.methodology = Object.fromEntries(
      Object.entries(v.record(m.methodology, "methodology")).map(
        ([k, value]) => {
          const x = v.record(value, "factor methodology");
          return [
            k,
            {
              label: v.string(x.label, "label"),
              weight: num(x.weight),
              knowledge_type: v.literal(
                x.knowledge_type,
                knowledgeValues,
                "method trust",
              ),
              definition: v.string(x.definition, "definition"),
            },
          ];
        },
      ),
    );
  if (m.summary !== undefined) {
    const s = v.record(m.summary, "zone summary");
    meta.summary = {
      zones: count(s.zones),
      high: count(s.high),
      with_subway_entrances: count(s.with_subway_entrances),
      stations_with_entrances_in_high_zones: v.strings(
        s.stations_with_entrances_in_high_zones,
        "station names",
      ),
    };
  }
  return { type: "FeatureCollection", features, meta };
}
export function parseTransitHistory(value: unknown): TransitHistory {
  const x = versioned(value);
  return {
    api_version: "1.0",
    area_id: v.string(x.area_id, "area ID"),
    hours: v.integer(x.hours, "history hours", 1, 72),
    note: v.string(x.note, "history note"),
    polls: v.array(
      x.polls,
      (value) => {
        const p = v.record(value, "monitoring poll");
        return {
          polled_at: v.instant(p.polled_at, "poll time"),
          delayed: count(p.delayed),
          flooding_reported: count(p.flooding_reported),
          alerts: count(p.alerts),
          stations: v.array(
            p.stations,
            (value) => {
              const s = v.record(value, "station monitoring sample");
              return {
                gtfs_stop_id: v.id(s.gtfs_stop_id),
                status: v.literal(s.status, statusValues, "sample status"),
                predicted: count(s.predicted),
                scheduled: s.scheduled === null ? null : count(s.scheduled),
                median_delay_min: nn(s.median_delay_min),
                max_delay_min: nn(s.max_delay_min),
              };
            },
            "sampled stations",
          ),
        };
      },
      "monitoring polls",
    ),
  };
}
export function parseTransitWeather(value: unknown): TransitWeather {
  const x = versioned(value),
    f = v.record(x.forecast, "weather forecast"),
    context = v.record(x.context, "weather context"),
    source = v.record(x.source, "weather source");
  let observation: TransitWeather["observation"] = null;
  if (x.observation !== null) {
    const o = v.record(x.observation, "weather observation");
    observation = {
      station: v.string(o.station, "weather station"),
      station_name: v.string(o.station_name, "weather station name"),
      observed_at: ni(o.observed_at),
      description: ns(o.description),
      raining: v.bool(o.raining, "raining description"),
      temperature_f: nn(o.temperature_f),
      precip_last_hour_in: nn(o.precip_last_hour_in),
      knowledge_type: v.literal(
        o.knowledge_type,
        ["observed"],
        "observation trust",
      ),
    };
  }
  return {
    api_version: "1.0",
    area_id: v.string(x.area_id, "area ID"),
    fetched_at: v.instant(x.fetched_at, "weather fetch time"),
    forecast_issued_at: ni(x.forecast_issued_at),
    gridpoint: v.string(x.gridpoint, "weather gridpoint"),
    cached: v.bool(x.cached, "weather cache flag"),
    observation,
    forecast: {
      knowledge_type: v.literal(
        f.knowledge_type,
        ["predicted"],
        "forecast trust",
      ),
      total_rain_in: num(f.total_rain_in),
      peak_rate_in_hr: num(f.peak_rate_in_hr),
      peak_at: ni(f.peak_at),
      max_rain_chance_pct: num(f.max_rain_chance_pct),
      rain_expected: v.bool(f.rain_expected, "rain expectation"),
      hours: v.array(
        f.hours,
        (value) => {
          const h = v.record(value, "forecast period");
          const start = v.instant(h.start, "period start"),
            end = v.instant(h.end, "period end");
          if (Date.parse(start) >= Date.parse(end)) fail("forecast period");
          return {
            start,
            end,
            rain_chance_pct: num(h.rain_chance_pct),
            rain_in: num(h.rain_in),
            short_forecast: ns(h.short_forecast),
            temperature_f: nn(h.temperature_f),
            wind: ns(h.wind),
          };
        },
        "forecast hours",
      ),
    },
    alerts: v.array(
      x.alerts,
      (value) => {
        const a = v.record(value, "NWS alert");
        return {
          event: ns(a.event),
          headline: ns(a.headline),
          severity: ns(a.severity),
          onset: ni(a.onset),
          ends: ni(a.ends),
        };
      },
      "NWS alerts",
    ),
    context: {
      smallest_dep_design_storm_in_hr: num(
        context.smallest_dep_design_storm_in_hr,
      ),
      peak_vs_smallest_dep_storm_pct: num(
        context.peak_vs_smallest_dep_storm_pct,
      ),
      note: v.string(context.note, "weather note"),
    },
    errors: v.strings(x.errors, "weather errors"),
    source: {
      publisher: v.string(source.publisher, "publisher"),
      url: v.safeBackendLink(source.url),
    },
  };
}

export function parseTransitSensor(value: unknown): TransitSensor {
  const { f, p } = base(value, "sensors", "observed");
  return typedFeature(f, {
    layer: "sensors",
    knowledge_type: "observed",
    sensor_id: v.id(p.sensor_id),
    name: v.string(p.name, "sensor name"),
    tidally_influenced: nullableBool(p.tidally_influenced),
    installed_at: ni(p.installed_at),
    removed_at: ni(p.removed_at),
    lowest_point_height_delta_in: nn(p.lowest_point_height_delta_in),
    area_ids: v.strings(p.area_ids, "areas"),
    event_count: count(p.event_count),
    max_depth_in: nn(p.max_depth_in),
    last_event_at: ni(p.last_event_at),
    source: v.sourceRef(p.source),
    ingested_at: v.instant(p.ingested_at, "sensor ingested time"),
  }) as TransitSensor;
}
export function parseTransitObservation(value: unknown): TransitObservation {
  const { f, p } = base(value, "flood_observations", "observed");
  const properties: TransitObservation["properties"] = {
    layer: "flood_observations",
    knowledge_type: "observed",
    sensor_id: v.id(p.sensor_id),
    sensor: v.id(p.sensor),
    started_at: v.instant(p.started_at, "event start"),
    ended_at: ni(p.ended_at),
    max_depth_in: num(p.max_depth_in),
    duration_min: nn(p.duration_min),
    onset_min: nn(p.onset_min),
    drain_min: nn(p.drain_min),
    duration_above_4in_min: nn(p.duration_above_4in_min),
    duration_above_12in_min: nn(p.duration_above_12in_min),
    tidally_influenced: nullableBool(p.tidally_influenced),
    source: v.sourceRef(p.source),
    ingested_at: v.instant(p.ingested_at, "event ingested time"),
  };
  if (p.profile !== undefined) {
    const a = v.record(p.profile, "sensor event profile"),
      times = v.array(a.t_s, (x) => num(x), "profile times"),
      depths = v.array(a.depth_in, (x) => num(x), "profile depths");
    if (times.length !== depths.length || times.length > 20000)
      fail("event profile length");
    properties.profile = { t_s: times, depth_in: depths };
  }
  return typedFeature(f, properties) as TransitObservation;
}
export function parseTransitFloodMap(value: unknown): TransitFloodMap {
  const { f, p } = base(value, "dep_flood_maps", "predicted");
  if (
    p.scenario_code !== "dep_moderate_current" ||
    !(p.category === 1 || p.category === 2)
  )
    fail("stormwater model scenario/category");
  return typedFeature(
    f,
    {
      layer: "dep_flood_maps",
      knowledge_type: "predicted",
      scenario_code: p.scenario_code,
      scenario_label: v.string(p.scenario_label, "model label"),
      intensity_in_hr: num(p.intensity_in_hr),
      sea_level: v.string(p.sea_level, "sea level"),
      depth_class: v.literal(
        p.depth_class,
        ["nuisance", "deep"],
        "depth class",
      ),
      category: p.category,
      area_ft2: num(p.area_ft2),
      note: v.string(p.note, "model note"),
      source: v.sourceRef(p.source),
      ingested_at: v.instant(p.ingested_at, "model ingested time"),
    },
    true,
  ) as TransitFloodMap;
}
