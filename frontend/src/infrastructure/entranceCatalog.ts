import type { InfrastructurePrimitive } from "./contracts";

/** Exact cached S4 records. Source types/positions are not template assumptions. */
export interface EntranceSourceRecord {
  id: string;
  gtfsStopId: string;
  stationId: string;
  complexId: string;
  position: [number, number];
  type: string;
  matched: boolean;
  reason: string | null;
  sourceIds: string[];
}
export interface EntranceCatalog {
  version: 1;
  sourceEdition: string;
  sourceTimestamp: string;
  inputSha256: string;
  entrances: EntranceSourceRecord[];
}
const CATALOG_LIMIT_BYTES = 400_000;
function text(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 500)
    throw new Error("Invalid entrance catalog text.");
  return value;
}
export function parseEntranceCatalog(value: unknown): EntranceCatalog {
  if (!value || typeof value !== "object")
    throw new Error("Invalid entrance catalog.");
  const data = value as Record<string, unknown>;
  if (
    data.version !== 1 ||
    !Array.isArray(data.entrances) ||
    data.entrances.length > 1000
  )
    throw new Error("Unsupported or oversized entrance catalog.");
  const seen = new Set<string>();
  const entrances = data.entrances.map((raw): EntranceSourceRecord => {
    if (!raw || typeof raw !== "object")
      throw new Error("Invalid entrance source record.");
    const row = raw as Record<string, unknown>;
    const id = text(row.id);
    if (
      seen.has(id) ||
      typeof row.matched !== "boolean" ||
      !Array.isArray(row.position) ||
      row.position.length !== 2 ||
      !row.position.every((n) => typeof n === "number" && Number.isFinite(n)) ||
      row.position[0] < -74.3 ||
      row.position[0] > -73.6 ||
      row.position[1] < 40.4 ||
      row.position[1] > 41 ||
      !Array.isArray(row.sourceIds) ||
      row.sourceIds.length !== 1 ||
      row.sourceIds[0] !== `S4:${id}`
    )
      throw new Error("Duplicate or inconsistent entrance identity/position.");
    seen.add(id);
    const reason = row.reason === null ? null : text(row.reason);
    if (row.matched && reason !== null)
      throw new Error("Matched entrance has an unresolved relationship.");
    return {
      id,
      gtfsStopId: text(row.gtfsStopId),
      stationId: text(row.stationId),
      complexId: text(row.complexId),
      position: [...row.position] as [number, number],
      type: text(row.type),
      matched: row.matched,
      reason,
      sourceIds: row.sourceIds.map(text),
    };
  });
  const inputSha256 = text(data.inputSha256);
  if (!/^[a-f0-9]{64}$/.test(inputSha256))
    throw new Error("Missing entrance inventory checksum.");
  return {
    version: 1,
    sourceEdition: text(data.sourceEdition),
    sourceTimestamp: text(data.sourceTimestamp),
    inputSha256,
    entrances,
  };
}

/** On-demand local static asset only, independent of the operational GET client. */
export async function loadEntranceCatalog(
  signal?: AbortSignal,
): Promise<EntranceCatalog> {
  const response = await fetch("/infrastructure/entrance-details.json", {
    signal,
    credentials: "omit",
  });
  if (!response.ok)
    throw new Error(`Entrance source catalog HTTP ${response.status}.`);
  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > CATALOG_LIMIT_BYTES)
    throw new Error("Entrance source catalog exceeds its transfer budget.");
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > CATALOG_LIMIT_BYTES)
    throw new Error("Entrance source catalog exceeds its decoded budget.");
  return parseEntranceCatalog(JSON.parse(body));
}

/** Fail closed on any source ID, station relationship, or source XY mismatch. */
export function sourceEntranceForPrimitive(
  catalog: EntranceCatalog,
  stationId: string,
  primitive: InfrastructurePrimitive,
): EntranceSourceRecord | null {
  if (
    primitive.kind !== "entrance" ||
    primitive.stationId !== stationId ||
    !primitive.position
  )
    return null;
  const record = catalog.entrances.find(
    (entry) => primitive.id === `entrance_${entry.id}`,
  );
  return record &&
    record.matched &&
    record.gtfsStopId === stationId &&
    primitive.sourceIds.includes(`S4:${record.id}`) &&
    record.position.every(
      (value, index) => value === primitive.position![index],
    )
    ? record
    : null;
}
