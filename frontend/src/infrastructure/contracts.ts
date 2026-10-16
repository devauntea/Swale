import type { TransitStation } from "../backend/transitContracts";

export type InfrastructurePosition = [number, number, number];
export type InfrastructureKind =
  | "structure"
  | "route"
  | "platform"
  | "entrance"
  | "connector";
export interface InfrastructurePrimitive {
  id: string;
  kind: InfrastructureKind;
  stationId: string;
  sourceIds: string[];
  assumption: string;
  polygon?: InfrastructurePosition[];
  path?: InfrastructurePosition[];
  position?: InfrastructurePosition;
  sourceColor?: string;
  height?: number;
  width?: number;
  radius?: number;
  zReference?: "base";
}
export interface InfrastructureStation {
  id: string;
  gtfsStopId: string;
  name: string;
  complexId: string | null;
  routes: string[];
  structure: string;
  position: [number, number];
  sourcePosition?: [number, number];
  renderAnchor?: [number, number];
  backendPosition?: [number, number];
  detailUrl: string;
  sourceIds: string[];
  assumptions: string[];
  backendStationId: string | null;
  relationship: "exact_gtfs_stop_id" | "unmatched";
}
export interface InfrastructureManifest {
  version: 1;
  modelId: string;
  vintage: string;
  referencePolicy: string;
  bounds: [number, number, number, number];
  stations: InfrastructureStation[];
  sources: { id: string; url: string; vintage: string | null }[];
}
export interface InfrastructureChunk {
  stationId: string;
  primitives: InfrastructurePrimitive[];
  metadata: {
    modelVintage: string;
    referencePolicy: string;
    schematic: true;
  };
}
export interface InfrastructureVisibility {
  structure: boolean;
  routes: boolean;
  platforms: boolean;
  entrances: boolean;
}
export interface InfrastructureMapState {
  stationId: string;
  chunk: InfrastructureChunk | null;
  mode: "surface" | "xray";
  verticalExaggeration: number;
  visible: InfrastructureVisibility;
  selectedPrimitiveId: string | null;
}
export type InfrastructureCameraRequest =
  | {
      kind: "explore";
      stationId: string;
      position: [number, number];
      nonce: number;
    }
  | { kind: "fit_entrances"; positions: [number, number][]; nonce: number }
  | { kind: "return"; nonce: number };

export type InfrastructureBinding =
  | {
      kind: "supported";
      station: TransitStation;
      match: "exact GTFS stop ID and backend identity";
    }
  | { kind: "geometry-only"; reason: string };

/** Identity is never derived from a name, coordinate proximity or direction suffix. */
export function resolveInfrastructureBinding(
  model: InfrastructureStation,
  inventory: TransitStation[],
): InfrastructureBinding {
  const matches = inventory.filter(
    (station) =>
      station.properties.gtfs_stop_id === model.gtfsStopId &&
      (model.backendStationId === null ||
        station.id === model.backendStationId) &&
      (model.complexId === null ||
        station.properties.complex_id === null ||
        station.properties.complex_id === model.complexId),
  );
  if (matches.length !== 1)
    return {
      kind: "geometry-only",
      reason:
        matches.length > 1
          ? "Ambiguous backend identity. No live station board is attached."
          : "No validated match in the backend's supported station inventory. No live coverage is attached.",
    };
  return {
    kind: "supported",
    station: matches[0],
    match: "exact GTFS stop ID and backend identity",
  };
}

export const INFRASTRUCTURE_LIMITS = {
  manifestBytes: 1024 * 1024,
  chunkBytes: 2_000_000,
  cacheBytes: 8_000_000,
  cacheChunks: 4,
  concurrency: 2,
  stations: 1000,
  primitives: 5000,
  coordinates: 50000,
} as const;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Infrastructure asset must contain an object.");
  return value as Record<string, unknown>;
}
function string(value: unknown, maximum = 1000): string {
  if (typeof value !== "string" || !value.length || value.length > maximum)
    throw new Error("Invalid infrastructure text or ID.");
  return value;
}
function id(value: unknown): string {
  const result = string(value, 80);
  if (!/^[A-Za-z0-9_-]+$/.test(result))
    throw new Error("Invalid infrastructure station ID.");
  return result;
}
function strings(value: unknown, maximum = 100): string[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error("Invalid infrastructure list.");
  return value.map((item) => string(item));
}
function nullable(value: unknown): string | null {
  return value === null ? null : string(value);
}
function finite(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error("Infrastructure coordinates must be finite and in range.");
  return value;
}
function position(value: unknown): InfrastructurePosition {
  if (!Array.isArray(value) || value.length !== 3)
    throw new Error("Invalid infrastructure position.");
  return [
    finite(value[0], -74.3, -73.6),
    finite(value[1], 40.4, 41),
    finite(value[2], -1000, 1000),
  ];
}
export function validateInfrastructurePath(
  path: unknown,
  stationId: string,
): string {
  const expected = `/infrastructure/stations/${id(stationId)}.json`;
  if (path !== expected)
    throw new Error(
      "Infrastructure detail paths must be local, canonical station assets.",
    );
  return expected;
}
export function parseInfrastructureManifest(
  value: unknown,
): InfrastructureManifest {
  const data = record(value);
  if (
    data.version !== 1 ||
    !Array.isArray(data.stations) ||
    data.stations.length > INFRASTRUCTURE_LIMITS.stations
  )
    throw new Error("Unsupported or oversized infrastructure manifest.");
  const seen = new Set<string>();
  const stations = data.stations.map((raw): InfrastructureStation => {
    const item = record(raw);
    const stationId = id(item.id);
    if (seen.has(stationId) || item.gtfsStopId !== stationId)
      throw new Error(
        "Duplicate or inconsistent infrastructure station identity.",
      );
    seen.add(stationId);
    if (!Array.isArray(item.position) || item.position.length !== 2)
      throw new Error("Invalid station position.");
    if (
      item.relationship !== "exact_gtfs_stop_id" &&
      item.relationship !== "unmatched"
    )
      throw new Error("Invalid identity relationship.");
    const station: InfrastructureStation = {
      id: stationId,
      gtfsStopId: stationId,
      name: string(item.name),
      complexId: nullable(item.complexId),
      routes: strings(item.routes, 30),
      structure: string(item.structure),
      position: [
        finite(item.position[0], -74.3, -73.6),
        finite(item.position[1], 40.4, 41),
      ],
      detailUrl: validateInfrastructurePath(item.detailUrl, stationId),
      sourceIds: strings(item.sourceIds),
      assumptions: strings(item.assumptions),
      backendStationId: nullable(item.backendStationId),
      relationship: item.relationship,
    };
    for (const field of [
      "sourcePosition",
      "renderAnchor",
      "backendPosition",
    ] as const) {
      if (item[field] === undefined || item[field] === null) continue;
      const coordinate = item[field];
      if (!Array.isArray(coordinate) || coordinate.length !== 2)
        throw new Error("Invalid source/model/backend station coordinate.");
      station[field] = [
        finite(coordinate[0], -74.3, -73.6),
        finite(coordinate[1], 40.4, 41),
      ];
    }
    return station;
  });
  if (!Array.isArray(data.bounds) || data.bounds.length !== 4)
    throw new Error("Invalid infrastructure bounds.");
  const bounds: [number, number, number, number] = [
    finite(data.bounds[0], -74.3, -73.6),
    finite(data.bounds[1], 40.4, 41),
    finite(data.bounds[2], -74.3, -73.6),
    finite(data.bounds[3], 40.4, 41),
  ];
  if (bounds[0] >= bounds[2] || bounds[1] >= bounds[3])
    throw new Error("Invalid infrastructure bounds order.");
  if (!Array.isArray(data.sources) || data.sources.length > 30)
    throw new Error("Invalid infrastructure sources.");
  const sources = data.sources.map((raw) => {
    const source = record(raw);
    const url = string(source.url);
    if (!url.startsWith("https://"))
      throw new Error("Invalid infrastructure provenance URL.");
    return { id: string(source.id), url, vintage: nullable(source.vintage) };
  });
  return {
    version: 1,
    modelId: string(data.modelId),
    vintage: string(data.vintage),
    referencePolicy: string(data.referencePolicy),
    bounds,
    stations,
    sources,
  };
}
export function parseInfrastructureChunk(
  value: unknown,
  stationId: string,
): InfrastructureChunk {
  const data = record(value);
  if (
    data.stationId !== stationId ||
    !Array.isArray(data.primitives) ||
    data.primitives.length > INFRASTRUCTURE_LIMITS.primitives
  )
    throw new Error(
      "Infrastructure detail belongs to another station or exceeds its budget.",
    );
  const metadata = record(data.metadata);
  if (metadata.schematic !== true)
    throw new Error("Infrastructure detail must declare schematic geometry.");
  const seen = new Set<string>();
  let coordinates = 0;
  const primitives = data.primitives.map((raw): InfrastructurePrimitive => {
    const item = record(raw);
    const primitiveId = string(item.id, 200);
    if (seen.has(primitiveId) || item.stationId !== stationId)
      throw new Error("Duplicate or inconsistent primitive identity.");
    seen.add(primitiveId);
    if (
      !["structure", "route", "platform", "entrance", "connector"].includes(
        String(item.kind),
      )
    )
      throw new Error("Unknown infrastructure primitive kind.");
    const primitive: InfrastructurePrimitive = {
      id: primitiveId,
      stationId,
      kind: item.kind as InfrastructureKind,
      sourceIds: strings(item.sourceIds),
      assumption: string(item.assumption, 4000),
    };
    for (const key of ["polygon", "path"] as const) {
      if (item[key] === undefined) continue;
      const points = item[key];
      if (!Array.isArray(points) || points.length < (key === "polygon" ? 3 : 2))
        throw new Error("Invalid infrastructure primitive geometry.");
      coordinates += points.length;
      if (coordinates > INFRASTRUCTURE_LIMITS.coordinates)
        throw new Error("Infrastructure coordinate budget exceeded.");
      primitive[key] = points.map(position);
    }
    if (item.position !== undefined) {
      primitive.position = position(item.position);
      coordinates += 1;
    }
    if (!primitive.polygon && !primitive.path && !primitive.position)
      throw new Error("Infrastructure primitive has no geometry.");
    if (item.sourceColor !== undefined) {
      const color = string(item.sourceColor, 7);
      if (!/^#[0-9a-f]{6}$/i.test(color))
        throw new Error("Invalid source color.");
      primitive.sourceColor = color;
    }
    for (const dimension of ["height", "width", "radius"] as const) {
      if (item[dimension] !== undefined)
        primitive[dimension] = finite(item[dimension], 0, 100);
    }
    if (item.zReference !== undefined) {
      if (item.zReference !== "base")
        throw new Error("Invalid infrastructure vertical reference.");
      primitive.zReference = "base";
    }
    return primitive;
  });
  if (coordinates > INFRASTRUCTURE_LIMITS.coordinates)
    throw new Error("Infrastructure coordinate budget exceeded.");
  return {
    stationId,
    primitives,
    metadata: {
      modelVintage: string(metadata.modelVintage),
      referencePolicy: string(metadata.referencePolicy),
      schematic: true,
    },
  };
}
