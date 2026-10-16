import type { Feature, Point } from "geojson";

// The snapshot API has its own model. It is never a synthetic DemoSnapshot.
export type BackendBbox = readonly [number, number, number, number];
export type BackendKind = "basin" | "incident";
export type BackendKnowledge =
  | "observed"
  | "reported"
  | "predicted"
  | "inferred";
export interface BackendSourceRef {
  id: string;
  dataset: string | null;
  record_id: string;
  url: string | null;
  updated_at: string | null;
}
export interface BackendSourceFreshness {
  id: string;
  dataset_updated_at: string | null;
  last_ingested_at: string | null;
  fetched_at: string | null;
  stale: boolean;
}
export interface BackendSourceInfo extends BackendSourceFreshness {
  name: string;
  publisher: string;
  dataset: string;
  url: string | null;
  cadence: string;
  time_semantics: string;
  known_limitations: string[];
}
export interface BackendHealth {
  api_version: "1.0";
  status: "ok" | "degraded";
  build: string;
  db: Record<string, string>;
  sources: BackendSourceFreshness[];
  integrations?: Record<string, boolean>;
}
export interface BackendLayerInfo {
  id: string;
  title: string;
  knowledge_type: BackendKnowledge;
  geometry_type: string;
  endpoint: string;
  available: boolean;
  milestone: string;
  filters: string[];
  categories: { id: string; label: string }[] | null;
  attribution: string;
}
interface BackendCommonProps {
  source: BackendSourceRef;
  ingested_at: string;
}
export interface BackendBasinProps extends BackendCommonProps {
  layer: "catch_basins";
  knowledge_type: "observed";
  unitid: string;
  area_ids: string[];
  state_plane: { x_ft: number; y_ft: number; crs: "EPSG:2263" } | null;
}
export interface BackendIncidentProps extends BackendCommonProps {
  layer: "incidents";
  knowledge_type: "reported";
  category: string;
  category_label: string;
  reported_at: string;
  closed_at: string | null;
  source_status: string | null;
  address: string | null;
  verification: {
    status: string;
    knowledge_type: "observed" | "reported";
    basis: string | null;
    rule: string | null;
    text: string | null;
    at: string | null;
  };
  linked_basin: {
    id: string;
    distance_ft: number;
    method: string;
    knowledge_type: "inferred";
  } | null;
  source_fields?: Record<string, unknown>;
}
export type BackendBasin = Feature<Point | null, BackendBasinProps> & {
  id: string;
};
export type BackendIncident = Feature<Point | null, BackendIncidentProps> & {
  id: string;
};
export type BackendFeature = BackendBasin | BackendIncident;
export interface BackendMeta {
  api_version: "1.0";
  layer: "catch_basins" | "incidents";
  request_bbox: BackendBbox;
  filters: Record<string, unknown>;
  count: number;
  limit: number;
  truncated: boolean;
  next_cursor: string | null;
  generated_at: string;
  sources: BackendSourceFreshness[];
}
export interface BackendPage<F extends BackendFeature> {
  type: "FeatureCollection";
  features: F[];
  meta: BackendMeta;
}
export type BackendLoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error";
export interface BackendCollectionState<F extends BackendFeature> {
  features: F[];
  status: BackendLoadStatus;
  error: string | null;
  partial: boolean;
  stale: boolean;
  generatedAt: string | null;
  sources: BackendSourceFreshness[];
  filters: Record<string, unknown>;
  pages: number;
}
export interface BackendData {
  health: BackendHealth | null;
  layers: BackendLayerInfo[];
  sources: BackendSourceInfo[];
  metadataStatus: "idle" | "loading" | "ready" | "error";
  metadataError: string | null;
  basins: BackendCollectionState<BackendBasin>;
  incidents: BackendCollectionState<BackendIncident>;
}
export interface BackendDetailState {
  kind: BackendKind | null;
  id: string | null;
  status: "idle" | "loading" | "ready" | "error";
  feature: BackendFeature | null;
  error: string | null;
}

export class BackendValidationError extends Error {
  constructor(field: string) {
    super(`The local backend returned an invalid ${field}.`);
    this.name = "BackendValidationError";
  }
}
function invalid(field: string): never {
  throw new BackendValidationError(field);
}
function record(value: unknown, field: string): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid(field);
}
function string(value: unknown, field: string): string {
  return typeof value === "string" && value.length <= 32768
    ? value
    : invalid(field);
}
function id(value: unknown, field = "record ID"): string {
  const result = string(value, field);
  return result.length > 0 &&
    result.length <= 1024 &&
    !Array.from(result).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
    ? result
    : invalid(field);
}
function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : string(value, field);
}
function bool(value: unknown, field: string): boolean {
  return typeof value === "boolean" ? value : invalid(field);
}
function finite(value: unknown, field: string): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : invalid(field);
}
function integer(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const result = finite(value, field);
  return Number.isInteger(result) && result >= min && result <= max
    ? result
    : invalid(field);
}
function literal<T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
): T {
  return typeof value === "string" && values.includes(value as T)
    ? (value as T)
    : invalid(field);
}
function array<T>(
  value: unknown,
  parser: (item: unknown) => T,
  field: string,
): T[] {
  return Array.isArray(value) ? value.map(parser) : invalid(field);
}
function strings(value: unknown, field: string): string[] {
  return array(value, (item) => string(item, field), field);
}
function instant(value: unknown, field: string): string {
  const result = string(value, field);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
    result,
  ) && Number.isFinite(Date.parse(result))
    ? result
    : invalid(field);
}
function nullableInstant(value: unknown, field: string): string | null {
  return value === null ? null : instant(value, field);
}
export function safeBackendLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}
export function validateBackendId(value: unknown): string {
  return id(value);
}
export function validateBackendBbox(value: unknown): BackendBbox {
  if (!Array.isArray(value) || value.length !== 4)
    return invalid("viewport bounds");
  const n = value.map((item) => finite(item, "viewport bounds"));
  if (
    n[0] < -180 ||
    n[2] > 180 ||
    n[1] < -90 ||
    n[3] > 90 ||
    n[0] >= n[2] ||
    n[1] >= n[3]
  )
    return invalid("viewport bounds");
  return [n[0], n[1], n[2], n[3]];
}
function geometry(value: unknown): Point | null {
  if (value === null) return null;
  const g = record(value, "point geometry");
  if (
    g.type !== "Point" ||
    !Array.isArray(g.coordinates) ||
    g.coordinates.length < 2 ||
    g.coordinates.length > 3
  )
    return invalid("point geometry");
  const coords = g.coordinates.map((item) => finite(item, "point coordinate"));
  if (Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90)
    return invalid("point coordinate");
  return { type: "Point", coordinates: coords };
}
function sourceRef(value: unknown): BackendSourceRef {
  const s = record(value, "source reference");
  return {
    id: id(s.id, "source ID"),
    dataset: nullableString(s.dataset ?? null, "source dataset"),
    record_id: id(s.record_id),
    url: safeBackendLink(s.url),
    updated_at: nullableInstant(s.updated_at ?? null, "source update time"),
  };
}
export function parseFreshness(value: unknown): BackendSourceFreshness {
  const s = record(value, "source freshness");
  return {
    id: id(s.id, "source ID"),
    dataset_updated_at: nullableInstant(
      s.dataset_updated_at,
      "dataset update time",
    ),
    last_ingested_at: nullableInstant(s.last_ingested_at, "source ingest time"),
    fetched_at: nullableInstant(s.fetched_at ?? null, "source fetch time"),
    stale: bool(s.stale, "source stale flag"),
  };
}
export function parseBasin(value: unknown): BackendBasin {
  const f = record(value, "basin feature"),
    p = record(f.properties, "basin properties");
  if (
    f.type !== "Feature" ||
    p.layer !== "catch_basins" ||
    p.knowledge_type !== "observed"
  )
    return invalid("observed basin feature");
  let statePlane: BackendBasinProps["state_plane"] = null;
  if (p.state_plane !== null) {
    const state = record(p.state_plane, "state-plane location");
    statePlane = {
      x_ft: finite(state.x_ft, "state-plane x"),
      y_ft: finite(state.y_ft, "state-plane y"),
      crs: literal(state.crs, ["EPSG:2263"], "state-plane CRS"),
    };
  }
  return {
    type: "Feature",
    id: id(f.id),
    geometry: geometry(f.geometry),
    properties: {
      layer: "catch_basins",
      knowledge_type: "observed",
      unitid: id(p.unitid, "inventory unit ID"),
      area_ids: strings(p.area_ids, "area IDs"),
      state_plane: statePlane,
      source: sourceRef(p.source),
      ingested_at: instant(p.ingested_at, "basin ingest time"),
    },
  };
}
export function parseIncident(value: unknown): BackendIncident {
  const f = record(value, "incident feature"),
    p = record(f.properties, "incident properties");
  if (
    f.type !== "Feature" ||
    p.layer !== "incidents" ||
    p.knowledge_type !== "reported"
  )
    return invalid("reported incident feature");
  const v = record(p.verification, "agency verification");
  let link: BackendIncidentProps["linked_basin"] = null;
  if (p.linked_basin !== null) {
    const l = record(p.linked_basin, "inferred basin association"),
      distance = finite(l.distance_ft, "association distance");
    if (distance < 0) return invalid("association distance");
    link = {
      id: id(l.id),
      distance_ft: distance,
      method: string(l.method, "association method"),
      knowledge_type: literal(
        l.knowledge_type,
        ["inferred"],
        "association trust",
      ),
    };
  }
  const properties: BackendIncidentProps = {
    layer: "incidents",
    knowledge_type: "reported",
    category: string(p.category, "incident category"),
    category_label: string(p.category_label, "incident label"),
    reported_at: instant(p.reported_at, "reported time"),
    closed_at: nullableInstant(p.closed_at, "closed time"),
    source_status: nullableString(p.source_status, "source status"),
    address: nullableString(p.address, "incident address"),
    verification: {
      status: string(v.status, "verification status"),
      knowledge_type: literal(
        v.knowledge_type,
        ["observed", "reported"],
        "verification trust",
      ),
      basis: nullableString(v.basis, "verification basis"),
      rule: nullableString(v.rule, "verification rule"),
      text: nullableString(v.text, "agency text"),
      at: nullableInstant(v.at, "agency finding time"),
    },
    linked_basin: link,
    source: sourceRef(p.source),
    ingested_at: instant(p.ingested_at, "incident ingest time"),
  };
  if (p.source_fields !== undefined)
    properties.source_fields = record(
      p.source_fields,
      "original source fields",
    );
  return {
    type: "Feature",
    id: id(f.id),
    geometry: geometry(f.geometry),
    properties,
  };
}
export function parseBackendPage<F extends BackendFeature>(
  value: unknown,
  layer: "catch_basins" | "incidents",
  parser: (value: unknown) => F,
): BackendPage<F> {
  const c = record(value, "collection"),
    m = record(c.meta, "collection metadata");
  if (
    c.type !== "FeatureCollection" ||
    m.api_version !== "1.0" ||
    m.layer !== layer
  )
    return invalid("version 1.0 collection");
  const features = array(c.features, parser, "features");
  const count = integer(m.count, "page count", 0, 5000);
  if (count !== features.length) return invalid("page count");
  const meta: BackendMeta = {
    api_version: "1.0",
    layer,
    request_bbox: validateBackendBbox(m.request_bbox),
    filters: record(m.filters, "effective filters"),
    count,
    limit: integer(m.limit, "page limit", 1, 5000),
    truncated: bool(m.truncated, "truncation flag"),
    next_cursor:
      m.next_cursor === null ? null : id(m.next_cursor, "page cursor"),
    generated_at: instant(m.generated_at, "response generation time"),
    sources: array(m.sources, parseFreshness, "page sources"),
  };
  if (meta.truncated !== (meta.next_cursor !== null))
    return invalid("pagination metadata");
  return { type: "FeatureCollection", features, meta };
}
export function parseHealth(value: unknown): BackendHealth {
  const h = record(value, "health"),
    db = record(h.db, "database health");
  if (h.api_version !== "1.0") return invalid("API version");
  const database = Object.fromEntries(
    Object.entries(db).map(([key, v]) => [key, string(v, "database health")]),
  );
  const result: BackendHealth = {
    api_version: "1.0",
    status: literal(h.status, ["ok", "degraded"], "health status"),
    build: string(h.build, "backend build"),
    db: database,
    sources: array(h.sources, parseFreshness, "health sources"),
  };
  if (h.integrations !== undefined)
    result.integrations = Object.fromEntries(
      Object.entries(record(h.integrations, "integration flags")).map(
        ([key, v]) => [key, bool(v, "integration flag")],
      ),
    );
  return result;
}
export function parseLayers(value: unknown): BackendLayerInfo[] {
  const response = record(value, "layer catalog");
  if (response.api_version !== "1.0") return invalid("API version");
  return array(
    response.layers,
    (value) => {
      const l = record(value, "layer catalog item");
      return {
        id: id(l.id, "layer ID"),
        title: string(l.title, "layer title"),
        knowledge_type: literal(
          l.knowledge_type,
          ["observed", "reported", "predicted", "inferred"],
          "layer trust",
        ),
        geometry_type: string(l.geometry_type, "layer geometry type"),
        endpoint: string(l.endpoint, "layer endpoint"),
        available: bool(l.available, "layer availability"),
        milestone: string(l.milestone, "layer milestone"),
        filters: strings(l.filters, "layer filters"),
        categories:
          l.categories == null
            ? null
            : array(
                l.categories,
                (value) => {
                  const c = record(value, "category");
                  return {
                    id: id(c.id, "category ID"),
                    label: string(c.label, "category label"),
                  };
                },
                "categories",
              ),
        attribution: string(l.attribution, "layer attribution"),
      };
    },
    "layer catalog",
  );
}
export function parseSources(value: unknown): BackendSourceInfo[] {
  const response = record(value, "source register");
  if (response.api_version !== "1.0") return invalid("API version");
  return array(
    response.sources,
    (value) => {
      const s = record(value, "source register item");
      return {
        ...parseFreshness(s),
        name: string(s.name, "source name"),
        publisher: string(s.publisher, "source publisher"),
        dataset: string(s.dataset, "source dataset"),
        url: safeBackendLink(s.url),
        cadence: string(s.cadence, "source cadence"),
        time_semantics: string(s.time_semantics, "source time semantics"),
        known_limitations: strings(s.known_limitations, "source limitations"),
      };
    },
    "source register",
  );
}

// Shared strict primitives for the separately typed transit API contract.
export const backendValidation = {
  record,
  string,
  id,
  nullableString,
  bool,
  finite,
  integer,
  literal,
  array,
  strings,
  instant,
  nullableInstant,
  geometry,
  sourceRef,
  safeBackendLink,
  validateBackendBbox,
};
