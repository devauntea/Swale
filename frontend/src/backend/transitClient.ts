import { BackendClient, BackendApiError } from "./client";
import { validateBackendBbox, validateBackendId } from "./contracts";
import type { BackendBbox } from "./contracts";
import { isApprovedBackendRequest } from "./routes";
import {
  parseTransitStation,
  parseTransitEntrance,
  parseTransitExposure,
  parseTransitZone,
  parseTransitPage,
  parseTransitLive,
  parseTransitWeather,
  parseTransitHistory,
  parseTransitSensor,
  parseTransitObservation,
  parseTransitFloodMap,
} from "./transitContracts";

export type TransitRequest =
  | { route: "stations" | "entrances" | "flood-maps"; bbox: BackendBbox }
  | { route: "live" | "exposures" }
  | { route: "zones"; weather: boolean }
  | { route: "weather" }
  | { route: "history"; hours?: number }
  | {
      route: "sensors" | "observations";
      bbox: BackendBbox;
      cursor?: string;
      since: string;
      until?: string;
    }
  | { route: "observation"; id: string };
const paths = {
  stations: "subway/stations",
  entrances: "subway/entrances",
  live: "subway/live",
  exposures: "subway/flood-exposure",
  zones: "danger-zones",
  weather: "weather/now",
  history: "subway/history",
  sensors: "sensors",
  observations: "flood-observations",
  "flood-maps": "flood-maps",
  observation: "flood-observations",
} as const;
function invalid(): never {
  throw new BackendApiError(
    "validation",
    "The transit request is outside the approved GET contract.",
  );
}
export function buildTransitUrl(request: TransitRequest): string {
  if (
    !request ||
    typeof request !== "object" ||
    !Object.hasOwn(paths, request.route)
  )
    return invalid();
  const allowed: Record<TransitRequest["route"], string[]> = {
    stations: ["route", "bbox"],
    entrances: ["route", "bbox"],
    "flood-maps": ["route", "bbox"],
    live: ["route"],
    exposures: ["route"],
    zones: ["route", "weather"],
    weather: ["route"],
    history: ["route", "hours"],
    sensors: ["route", "bbox", "cursor", "since"],
    observations: ["route", "bbox", "cursor", "since", "until"],
    observation: ["route", "id"],
  };
  if (Object.keys(request).some((key) => !allowed[request.route].includes(key)))
    return invalid();
  let path = `/api/v1/${paths[request.route]}`;
  const params = new URLSearchParams();
  if ("bbox" in request)
    params.set("bbox", validateBackendBbox(request.bbox).join(","));
  if (
    ["live", "exposures", "zones", "weather", "history"].includes(request.route)
  )
    params.set("area_id", "BK0601");
  if (request.route === "exposures") params.set("live", "false");
  if (request.route === "zones") {
    if (typeof request.weather !== "boolean") return invalid();
    params.set("weather", String(request.weather));
  }
  if (request.route === "weather") params.set("hours", "24");
  if (request.route === "history")
    params.set("hours", String(request.hours ?? 6));
  if (request.route === "flood-maps")
    params.set("scenario", "dep_moderate_current");
  if (request.route === "observation")
    path += `/${encodeURIComponent(validateBackendId(request.id))}`;
  if (request.route === "sensors" || request.route === "observations") {
    params.set("limit", "500");
    params.set("since", request.since);
    if (request.cursor !== undefined)
      params.set("cursor", validateBackendId(request.cursor));
    if (request.route === "observations") {
      if (!request.until) return invalid();
      params.set("until", request.until);
      params.set("include_tidal", "false");
    }
  }
  const url = path + (params.size ? `?${params}` : "");
  if (!isApprovedBackendRequest("GET", url)) return invalid();
  return url;
}
export class TransitClient extends BackendClient {
  constructor(options: { fetcher?: typeof fetch; timeoutMs?: number } = {}) {
    super({ timeoutMs: 30000, ...options });
  }
  stations(bbox: BackendBbox, signal?: AbortSignal) {
    return this.requestUrl(
      buildTransitUrl({ route: "stations", bbox }),
      (x) => parseTransitPage(x, "subway_stations", parseTransitStation),
      signal,
    );
  }
  entrances(bbox: BackendBbox, signal?: AbortSignal) {
    return this.requestUrl(
      buildTransitUrl({ route: "entrances", bbox }),
      (x) => parseTransitPage(x, "subway_entrances", parseTransitEntrance),
      signal,
    );
  }
  live(signal?: AbortSignal) {
    return this.requestUrl(
      buildTransitUrl({ route: "live" }),
      parseTransitLive,
      signal,
    );
  }
  exposures(signal?: AbortSignal) {
    return this.requestUrl(
      buildTransitUrl({ route: "exposures" }),
      (x) =>
        parseTransitPage(x, "station_flood_exposure", parseTransitExposure),
      signal,
    );
  }
  zones(weather = false, signal?: AbortSignal) {
    return this.requestUrl(
      buildTransitUrl({ route: "zones", weather }),
      (x) => parseTransitPage(x, "danger_zones", parseTransitZone),
      signal,
    );
  }
  weather(signal?: AbortSignal) {
    return this.requestUrl(
      buildTransitUrl({ route: "weather" }),
      parseTransitWeather,
      signal,
    );
  }
  history(signal?: AbortSignal) {
    return this.requestUrl(
      buildTransitUrl({ route: "history", hours: 6 }),
      parseTransitHistory,
      signal,
    );
  }
  sensors(
    bbox: BackendBbox,
    since: string,
    cursor?: string,
    signal?: AbortSignal,
  ) {
    return this.requestUrl(
      buildTransitUrl({
        route: "sensors",
        bbox,
        since,
        ...(cursor ? { cursor } : {}),
      }),
      (x) => parseTransitPage(x, "sensors", parseTransitSensor),
      signal,
    );
  }
  observations(
    bbox: BackendBbox,
    since: string,
    until: string,
    cursor?: string,
    signal?: AbortSignal,
  ) {
    return this.requestUrl(
      buildTransitUrl({
        route: "observations",
        bbox,
        since,
        until,
        ...(cursor ? { cursor } : {}),
      }),
      (x) => parseTransitPage(x, "flood_observations", parseTransitObservation),
      signal,
    );
  }
  observation(id: string, signal?: AbortSignal) {
    return this.requestUrl(
      buildTransitUrl({ route: "observation", id }),
      parseTransitObservation,
      signal,
    );
  }
  floodMaps(bbox: BackendBbox, signal?: AbortSignal) {
    return this.requestUrl(
      buildTransitUrl({ route: "flood-maps", bbox }),
      (x) => parseTransitPage(x, "dep_flood_maps", parseTransitFloodMap),
      signal,
    );
  }
}
