/** Shared by the browser transport and the loopback Vite proxy. */
export function isApprovedBackendRequest(
  method: string,
  path: string,
): boolean {
  if (!path.startsWith("/api/v1/") || path.includes("#")) return false;
  try {
    const url = new URL(path, "http://swale.local");
    if (url.origin !== "http://swale.local") return false;
    const decoded = decodeURIComponent(url.pathname);
    if (
      Array.from(decoded).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return false;
    const route = decoded.slice("/api/v1/".length);
    // Contextual writes are explicit user requests with server-side provider and
    // budget gates. No other legacy/admin mutation is exposed by this proxy.
    const contextual =
      method === "POST"
        ? /^(?:context\/(?:agent|briefings)|context\/briefings\/[a-f0-9]{32}\/(?:translations|audio))$/
        : method === "GET"
          ? /^context\/(?:capabilities|briefings\/[a-f0-9]{32}(?:\/audio)?)$/
          : null;
    if (contextual?.test(route)) return url.search === "";
    if (method !== "GET") return false;
    const keys: Record<string, readonly string[]> = {
      health: [],
      layers: [],
      sources: [],
      "catch-basins": ["bbox", "limit", "cursor"],
      incidents: [
        "bbox",
        "limit",
        "cursor",
        "since",
        "until",
        "category",
        "verification",
        "basin",
      ],
      "subway/stations": ["bbox"],
      "subway/entrances": ["bbox"],
      "subway/live": ["area_id"],
      "subway/history": ["area_id", "hours"],
      "subway/flood-exposure": ["area_id", "live"],
      "danger-zones": ["area_id", "weather"],
      "weather/now": ["area_id", "hours"],
      sensors: ["bbox", "since", "limit", "cursor"],
      "flood-maps": ["bbox", "scenario"],
      "flood-observations": [
        "bbox",
        "since",
        "until",
        "include_tidal",
        "limit",
        "cursor",
        "min_depth_in",
      ],
    };
    const allowed = Object.hasOwn(keys, route)
      ? keys[route]
      : /^(catch-basins|incidents|flood-observations)\/[^/\\]+$/.test(route)
        ? []
        : null;
    if (!allowed) return false;
    for (const [key, value] of url.searchParams) {
      if (
        !allowed.includes(key) ||
        url.searchParams.getAll(key).length !== 1 ||
        !value ||
        value.length > 2048
      )
        return false;
      if (key === "area_id" && value !== "BK0601") return false;
      if (key === "live" && value !== "false") return false;
      if (key === "weather" && value !== "true" && value !== "false")
        return false;
      if (key === "scenario" && value !== "dep_moderate_current") return false;
      if (key === "include_tidal" && value !== "false") return false;
      if (
        key === "hours" &&
        (!/^\d+$/.test(value) ||
          Number(value) < 1 ||
          Number(value) > (route === "weather/now" ? 24 : 72))
      )
        return false;
      if (route === "weather/now" && key === "hours" && value !== "24")
        return false;
      if (
        key === "limit" &&
        (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 5000)
      )
        return false;
      if (
        (key === "since" || key === "until") &&
        (!/(Z|[+-]\d\d:\d\d)$/.test(value) ||
          !Number.isFinite(Date.parse(value)))
      )
        return false;
      if (
        key === "min_depth_in" &&
        (!Number.isFinite(Number(value)) || Number(value) < 0)
      )
        return false;
      if (key === "bbox") {
        const n = value.split(",").map(Number);
        if (
          n.length !== 4 ||
          !n.every(Number.isFinite) ||
          n[0] >= n[2] ||
          n[1] >= n[3] ||
          n[0] < -180 ||
          n[2] > 180 ||
          n[1] < -90 ||
          n[3] > 90
        )
          return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
