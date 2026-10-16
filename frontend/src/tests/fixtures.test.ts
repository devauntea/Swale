import { describe, expect, it, vi } from "vitest";
import { LocalFixtureProvider } from "../data/providers/LocalFixtureProvider";
import { FORECAST_EXAMPLES } from "../data/fixtures/demo";
import type {
  DataProvenance,
  DemoSnapshot,
  PolygonGeometry,
  ScenarioId,
} from "../types";

const scenarioIds: ScenarioId[] = ["moderate_current", "extreme_2080"];

function checkSyntheticProvenance(provenance: DataProvenance) {
  expect(provenance.demo).toBe(true);
  expect(provenance.source.trim().length).toBeGreaterThan(0);
  expect(provenance.type).toBeTruthy();
  expect(provenance.fixtureCreatedAt).toBeTruthy();
  expect(provenance.sourceUpdatedAt).toBeNull();
}

function checkRing(ring: PolygonGeometry["coordinates"][number]) {
  expect(ring.length).toBeGreaterThanOrEqual(4);
  expect(ring[0]).toEqual(ring.at(-1));
  for (const [longitude, latitude] of ring) {
    expect(Number.isFinite(longitude)).toBe(true);
    expect(Number.isFinite(latitude)).toBe(true);
    // A broad display extent check, not a claim of administrative containment.
    expect(longitude).toBeGreaterThan(-74.05);
    expect(longitude).toBeLessThan(-73.83);
    expect(latitude).toBeGreaterThan(40.56);
    expect(latitude).toBeLessThan(40.75);
  }
}

function sourceDates(snapshot: DemoSnapshot) {
  return [
    snapshot.provenance,
    ...snapshot.basins.map((basin) => basin.provenance),
    ...snapshot.complaints.map((complaint) => complaint.provenance),
    snapshot.forecast.provenance,
  ].map(({ sourceUpdatedAt, retrievedAt, fixtureCreatedAt }) => ({
    sourceUpdatedAt,
    retrievedAt,
    fixtureCreatedAt,
  }));
}

describe("standalone fixture provider and traceable examples", () => {
  it("loads and refreshes locally without fetching infrastructure or backend data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("The fixture provider must not make network requests");
    });
    const provider = new LocalFixtureProvider();
    const loaded = await provider.load();
    const refreshed = await provider.refresh();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loaded.mode).toBe("synthetic-demo");
    expect(refreshed.status).toBe("integration_pending");
    expect(refreshed.message).toMatch(/integration|backend|local/i);
    expect(sourceDates(refreshed.snapshot)).toEqual(sourceDates(loaded));
    expect(refreshed.snapshot.forecast.issuedAt).toBe(loaded.forecast.issuedAt);
    expect(refreshed.snapshot.forecast.validFrom).toBe(
      loaded.forecast.validFrom,
    );
    expect(refreshed.snapshot.forecast.validTo).toBe(loaded.forecast.validTo);
  });

  it("uses unique synthetic IDs and resolves every complaint and ranking reference", async () => {
    const snapshot = await new LocalFixtureProvider().load();
    expect(snapshot.basins.length).toBeGreaterThan(0);
    const basinIds = snapshot.basins.map((basin) => basin.id);
    const complaintIds = new Set(
      snapshot.complaints.map((complaint) => complaint.id),
    );
    expect(new Set(basinIds).size).toBe(basinIds.length);
    expect(complaintIds.size).toBe(snapshot.complaints.length);
    for (const basin of snapshot.basins) {
      expect(basin.id).toMatch(/^(DEMO|SYNTHETIC)-/);
      checkSyntheticProvenance(basin.provenance);
      for (const id of basin.complaintIds)
        expect(complaintIds.has(id)).toBe(true);
    }
    for (const id of complaintIds) expect(id).toMatch(/^(DEMO|SYNTHETIC)-/);
    for (const scenario of scenarioIds) {
      expect([...snapshot.rankedBasinIds[scenario]].sort()).toEqual(
        [...basinIds].sort(),
      );
    }
  });

  it("keeps the two published scenario definitions separate from synthetic geometry", async () => {
    const snapshot = await new LocalFixtureProvider().load();
    expect(Object.keys(snapshot.scenarios).sort()).toEqual(
      [...scenarioIds].sort(),
    );
    expect(
      snapshot.scenarios.moderate_current.rainfallIntensityInchesPerHour,
    ).toBe(2.13);
    expect(snapshot.scenarios.extreme_2080.rainfallIntensityInchesPerHour).toBe(
      3.66,
    );
    expect(snapshot.scenarios.moderate_current.seaLevelAssumption).toMatch(
      /current/i,
    );
    expect(snapshot.scenarios.extreme_2080.seaLevelAssumption).toMatch(/2080/);
    expect(
      snapshot.scenarios.extreme_2080.excludedProductionCategories,
    ).toContain(3);

    for (const scenario of scenarioIds) {
      expect(
        snapshot.floodZones.some(
          (zone) => zone.properties.scenarioId === scenario,
        ),
      ).toBe(true);
    }
    for (const zone of snapshot.floodZones) {
      expect(zone.properties.category).toBe("demo-zone");
      expect(scenarioIds).toContain(zone.properties.scenarioId);
      checkSyntheticProvenance(zone.properties.provenance);
      expect(zone.properties.provenance.type).toBe("SCENARIO");
      const polygons =
        zone.geometry.type === "Polygon"
          ? [zone.geometry.coordinates]
          : zone.geometry.coordinates;
      for (const polygon of polygons)
        for (const ring of polygon) checkRing(ring);
    }
    expect(
      snapshot.floodZones.filter(
        (zone) => zone.properties.scenarioId === scenarioIds[0],
      ),
    ).not.toEqual(
      snapshot.floodZones.filter(
        (zone) => zone.properties.scenarioId === scenarioIds[1],
      ),
    );
  });

  it("contains coherent stored scores and contributions for each scenario", async () => {
    const snapshot = await new LocalFixtureProvider().load();
    let changedStoredScore = false;
    for (const basin of snapshot.basins) {
      for (const scenarioId of scenarioIds) {
        const priority = basin.priorities[scenarioId];
        expect(priority.scenarioId).toBe(scenarioId);
        expect(priority.score).not.toBeNull();
        expect(priority.score).toBeGreaterThanOrEqual(0);
        expect(priority.score).toBeLessThanOrEqual(100);
        expect(priority.version).toBeTruthy();
        checkSyntheticProvenance(priority.provenance);
        expect(priority.provenance.type).toBe("HEURISTIC SCORE");
        expect(
          priority.factors.reduce((sum, factor) => sum + factor.weight, 0),
        ).toBeCloseTo(1);
        expect(
          priority.factors.reduce(
            (sum, factor) => sum + (factor.contributionPoints ?? 0),
            0,
          ),
        ).toBeCloseTo(priority.score ?? Number.NaN);
        for (const factor of priority.factors) {
          expect(factor.normalizedValue).toBeGreaterThanOrEqual(0);
          expect(factor.normalizedValue).toBeLessThanOrEqual(1);
          expect(factor.contributionPoints).toBeGreaterThanOrEqual(0);
          expect(factor.explanation).toBeTruthy();
          checkSyntheticProvenance(factor.provenance);
        }
      }
      changedStoredScore ||=
        basin.priorities.moderate_current.score !==
        basin.priorities.extreme_2080.score;
    }
    expect(changedStoredScore).toBe(true);
  });

  it("retains legacy/current complaint categories and honest historical geometry", async () => {
    const snapshot = await new LocalFixtureProvider().load();
    const pairs = new Set([
      "Sewer|Sewer Backup (Use Comments) (SA)",
      "Sewer|Catch Basin Clogged/Flooding (Use Comments) (SC)",
      "Sewer|Street Flooding (SJ)",
      "Sewer Maintenance|Catch Basin Clogged",
      "Sewer Maintenance|Backup",
      "Sewer Maintenance|Flooding on Street",
    ]);
    expect(
      snapshot.complaints.some(
        (complaint) => complaint.complaintType === "Sewer",
      ),
    ).toBe(true);
    expect(
      snapshot.complaints.some(
        (complaint) => complaint.complaintType === "Sewer Maintenance",
      ),
    ).toBe(true);
    for (const complaint of snapshot.complaints) {
      expect(
        pairs.has(`${complaint.complaintType}|${complaint.descriptor}`),
      ).toBe(true);
      checkSyntheticProvenance(complaint.provenance);
      expect(complaint.provenance.type).toBe("HISTORICAL");
    }
    for (const cell of snapshot.densityCells) {
      expect(cell.count).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(cell.count)).toBe(true);
      expect(cell.windowLabel).toBeTruthy();
      checkSyntheticProvenance(cell.provenance);
      for (const ring of cell.geometry.coordinates) checkRing(ring);
    }
  });

  it("presents accumulated forecast examples with distinct issue, retrieval and validity fields", async () => {
    const { forecast } = await new LocalFixtureProvider().load();
    expect(forecast.unit).toBe("mm");
    expect(forecast.provenance.type).toBe("FORECAST");
    checkSyntheticProvenance(forecast.provenance);
    expect(forecast.issuedAt).toBeTruthy();
    expect(forecast.validFrom).toBeTruthy();
    expect(forecast.validTo).toBeTruthy();
    expect(Date.parse(forecast.validTo ?? "")).toBeGreaterThan(
      Date.parse(forecast.validFrom ?? ""),
    );
    expect(forecast.amount).toBeGreaterThanOrEqual(0);
    expect(forecast.provenance.notes).toMatch(/accumulat|interval|period/i);
  });

  it("distinguishes a valid zero accumulation, stale example, and missing forecast", async () => {
    expect(FORECAST_EXAMPLES.zero.status).toBe("available");
    expect(FORECAST_EXAMPLES.zero.amount).toBe(0);
    expect(FORECAST_EXAMPLES.zero.unit).toBe("mm");
    expect(FORECAST_EXAMPLES.zero.validFrom).toBeTruthy();
    expect(FORECAST_EXAMPLES.zero.validTo).toBeTruthy();
    const stale = await new LocalFixtureProvider({
      forecastState: "stale",
    }).load();
    expect(stale.forecast.status).toBe("stale");
    expect(stale.forecast.freshness.status).toBe("stale");
    expect(stale.forecast.freshness.reason).toBeTruthy();
    expect(stale.forecast.issuedAt).toBe(FORECAST_EXAMPLES.available.issuedAt);
    const missing = await new LocalFixtureProvider({
      forecastState: "unavailable",
    }).load();
    expect(missing.forecast.status).toBe("unavailable");
    expect(missing.forecast.amount).toBeNull();
    expect(missing.forecast.validFrom).toBeNull();
    expect(missing.forecast.freshness.reason).toBeTruthy();
  });

  it("provides honest empty/error states and protects fixture constants from consumer mutation", async () => {
    const empty = await new LocalFixtureProvider({ mode: "empty" }).load();
    expect(empty.basins).toEqual([]);
    expect(empty.complaints).toEqual([]);
    expect(empty.floodZones).toEqual([]);
    expect(empty.rankedBasinIds).toEqual({
      moderate_current: [],
      extreme_2080: [],
    });
    await expect(
      new LocalFixtureProvider({ mode: "error" }).load(),
    ).rejects.toThrow(/demonstration|local/i);
    const provider = new LocalFixtureProvider();
    const first = await provider.load();
    const originalId = first.basins[0].id;
    first.basins[0].id = "MUTATED";
    first.basins[0].priorities.moderate_current.score = -999;
    const fresh = await provider.load();
    expect(fresh.basins[0].id).toBe(originalId);
    expect(
      fresh.basins[0].priorities.moderate_current.score,
    ).toBeGreaterThanOrEqual(0);
  });
});
