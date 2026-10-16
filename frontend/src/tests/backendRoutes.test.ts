// Non-executing transport/proxy guard checks. No prohibited request is submitted.
import { describe, expect, it } from "vitest";
import { isApprovedBackendRequest } from "../backend/routes";

describe("shared browser and Vite request guard", () => {
  it("preserves the original GET routes and permits scoped transit weather/evidence routes", () => {
    for (const path of [
      "/api/v1/health",
      "/api/v1/layers",
      "/api/v1/sources",
      "/api/v1/catch-basins?bbox=-74,40.6,-73.9,40.7&limit=500",
      "/api/v1/catch-basins/catch_basin%3ACB305000",
      "/api/v1/incidents?bbox=-74,40.6,-73.9,40.7&since=2025-10-16T00%3A00%3A00Z&until=2026-10-16T00%3A00%3A00Z",
      "/api/v1/incidents/incident%3Anyc311_69804630",
      "/api/v1/weather/now?area_id=BK0601&hours=24",
      "/api/v1/sensors?bbox=-74,40.6,-73.9,40.7&limit=500",
      "/api/v1/flood-maps?bbox=-74,40.6,-73.9,40.7&scenario=dep_moderate_current",
    ])
      expect(isApprovedBackendRequest("GET", path), path).toBe(true);
  });
  it("rejects deferred capabilities, methods, arbitrary URLs and path escapes without execution", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
      expect(
        isApprovedBackendRequest(method, "/api/v1/incidents"),
        method,
      ).toBe(false);
    for (const path of [
      "/api/v1/weather/now?area_id=BK0601&hours=48",
      "/api/v1/sensors?include_tidal=true",
      "/api/v1/flood-maps?scenario=dep_extreme_2080",
      "/api/v1/risk-rankings",
      "/api/v1/simulation-runs",
      "/api/v1/briefings",
      "/api/v1/toString",
      "/api/v1/constructor",
      "/api/v1/__proto__",
      "https://example.com/api/v1/health",
      "//example.com/api/v1/health",
      "/api/v1/incidents/..%2f..%2fweather/now",
      "/api/v1/incidents/%5cweather",
      "/api/v1/incidents/%0A",
      "/api/v1/incidents/%ZZ",
      "/api/v1/health#fragment",
    ])
      expect(isApprovedBackendRequest("GET", path), path).toBe(false);
  });
});
