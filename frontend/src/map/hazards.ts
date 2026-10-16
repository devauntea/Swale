import type {
  BackendCollectionState,
  BackendFeature,
} from "../backend/contracts";

export const HAZARD_PULSE_PERIOD_MS = 1800;
export const MAX_PULSING_HAZARDS = 12;
export const HAZARD_RECENCY_MS = 24 * 60 * 60 * 1000;
export const HAZARD_ANIMATION_STORAGE_KEY = "swale.hazardAnimationPaused";
export type HazardKind = "inventory" | "drain" | "pothole" | "report";
export interface HazardPresentation {
  kind: HazardKind;
  state:
    | "inventory"
    | "active_report"
    | "dated_finding"
    | "historical"
    | "unknown";
  label: string;
  pulseEligible: boolean;
}

/**
 * Presentation emphasis only: the 24 h report/fetch window is not an assertion
 * of present condition. Administrative closure never establishes cleaning.
 */
export function hazardPresentation(
  feature: BackendFeature,
  collection: Pick<BackendCollectionState<BackendFeature>, "stale" | "sources">,
  nowMs: number = Date.now(),
): HazardPresentation {
  const p = feature.properties;
  if (p.layer === "catch_basins")
    return {
      kind: "inventory",
      state: "inventory",
      label: "Observed inventory · condition unknown",
      pulseEligible: false,
    };
  const kind: HazardKind =
    p.category === "catch_basin_clogged"
      ? "drain"
      : p.category === "pothole"
        ? "pothole"
        : "report";
  const status = p.source_status?.trim().toLowerCase();
  const closed =
    p.closed_at !== null ||
    status === "closed" ||
    status === "resolved" ||
    status === "cancelled";
  const source = collection.sources.find((item) => item.id === p.source.id);
  const recent = (value: string | null) => {
    const age = value ? nowMs - Date.parse(value) : NaN;
    return Number.isFinite(age) && age >= 0 && age <= HAZARD_RECENCY_MS;
  };
  const verifiedFinding =
    p.verification.knowledge_type === "observed" &&
    p.verification.status.startsWith("agency_");
  if (closed)
    return {
      kind,
      state: "historical",
      label:
        "Historical / closed record · closure does not establish cleaning or current condition",
      pulseEligible: false,
    };
  if (verifiedFinding)
    return {
      kind,
      state: "dated_finding",
      label: `Dated agency finding · ${p.verification.status.replaceAll("_", " ")} · ${p.verification.at ?? "finding time unknown"} · current condition unknown`,
      pulseEligible: false,
    };
  const knownOpen =
    status === "open" ||
    status === "pending" ||
    status === "in progress" ||
    status === "assigned" ||
    status === "started";
  const contradictory = [
    "agency_cleaned",
    "agency_functioning",
    "agency_not_found",
    "duplicate",
    "referred",
    "unknown",
  ].includes(p.verification.status);
  const eligible =
    (kind === "drain" || kind === "pothole") &&
    knownOpen &&
    !contradictory &&
    !collection.stale &&
    source !== undefined &&
    !source.stale &&
    recent(source.fetched_at) &&
    recent(p.reported_at);
  if (eligible)
    return {
      kind,
      state: "active_report",
      label:
        "Recent unresolved report · unverified present condition · 24 h report/fetch emphasis window",
      pulseEligible: true,
    };
  const historical = !recent(p.reported_at);
  return {
    kind,
    state: historical ? "historical" : "unknown",
    label: historical
      ? "Historical report · current condition unknown"
      : "Report / status or freshness uncertain · current condition unknown",
    pulseEligible: false,
  };
}

export function hasValidHazardPoint(feature: BackendFeature): boolean {
  const point = feature.geometry?.coordinates;
  return (
    !!point &&
    point.length >= 2 &&
    point.every(Number.isFinite) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 90
  );
}

export function boundedPulsingIds(
  features: BackendFeature[],
  collection: Pick<BackendCollectionState<BackendFeature>, "stale" | "sources">,
  selectedId: string | null | undefined,
  nowMs = Date.now(),
): Set<string> {
  const occupied = new Set<string>();
  return new Set(
    features
      .filter(
        (feature) =>
          hasValidHazardPoint(feature) &&
          hazardPresentation(feature, collection, nowMs).pulseEligible,
      )
      .sort(
        (a, b) =>
          Number(b.id === selectedId) - Number(a.id === selectedId) ||
          a.id.localeCompare(b.id),
      )
      .filter((feature) => {
        // About 100 m cells, used only to limit overlapping screen emphasis.
        // The icon always stays at its original validated source point.
        const [lng, lat] = feature.geometry!.coordinates;
        const cell = `${Math.floor(lng * 1000)}:${Math.floor(lat * 1000)}`;
        if (occupied.has(cell)) return false;
        occupied.add(cell);
        return true;
      })
      .slice(0, MAX_PULSING_HAZARDS)
      .map((feature) => feature.id),
  );
}
