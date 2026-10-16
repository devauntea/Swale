import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseInfrastructureChunk,
  parseInfrastructureManifest,
} from "../infrastructure/contracts";
import {
  parseEntranceCatalog,
  sourceEntranceForPrimitive,
} from "../infrastructure/entranceCatalog";
import {
  buildEntranceDetail,
  entranceDetailUnavailableReason,
  entranceLocalPosition,
} from "../infrastructure/entranceGeometry";
import {
  DEFAULT_FLOOD_INPUTS,
  simulateFloodScenario,
} from "../infrastructure/floodModel";

const readAsset = (path: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../public/infrastructure/${path}`, import.meta.url),
      "utf8",
    ),
  ) as unknown;
const catalog = parseEntranceCatalog(readAsset("entrance-details.json"));
const manifest = parseInfrastructureManifest(readAsset("index.json"));
const example = (stationId = "F21", entranceId = "row-y4aj-tepy-nbif") => {
  const station = manifest.stations.find((item) => item.id === stationId)!;
  const chunk = parseInfrastructureChunk(
    readAsset(`stations/${stationId}.json`),
    stationId,
  );
  const source = catalog.entrances.find((item) => item.id === entranceId)!;
  return {
    station,
    chunk,
    source,
    detail: buildEntranceDetail(station, chunk, source)!,
  };
};

describe("source-linked selected entrance templates", () => {
  it("retains every cached source identity and the three unmatched records without invented connections", () => {
    expect(catalog.entrances).toHaveLength(580);
    expect(catalog.entrances.filter((item) => item.matched)).toHaveLength(577);
    for (const record of catalog.entrances.filter((item) => !item.matched)) {
      expect(record.reason).toBeTruthy();
      expect(entranceDetailUnavailableReason(record)).toMatch(/unmatched/);
    }
    expect(catalog.sourceEdition).toContain("2024");
    expect(catalog.sourceTimestamp).toContain("not survey time");
  });
  it("fails closed on type, exact station join, source ID and coordinate mismatches", () => {
    const { station, chunk, source } = example();
    const marker = chunk.primitives.find(
      (item) => item.id === `entrance_${source.id}`,
    )!;
    expect(sourceEntranceForPrimitive(catalog, station.id, marker)).toEqual(
      source,
    );
    expect(sourceEntranceForPrimitive(catalog, "F22", marker)).toBeNull();
    expect(
      sourceEntranceForPrimitive(catalog, station.id, {
        ...marker,
        sourceIds: ["S4:other"],
      }),
    ).toBeNull();
    expect(
      sourceEntranceForPrimitive(catalog, station.id, {
        ...marker,
        position: [-73.99, 40.68, 0],
      }),
    ).toBeNull();
    expect(
      buildEntranceDetail({ ...station, id: "F22" }, chunk, source),
    ).toBeNull();
    for (const type of [
      "Elevator",
      "Escalator",
      "Easement - Street",
      "Unknown",
    ]) {
      expect(
        buildEntranceDetail(station, chunk, { ...source, type }),
      ).toBeNull();
      expect(entranceDetailUnavailableReason({ ...source, type })).toBeTruthy();
    }
    expect(() =>
      parseEntranceCatalog({ ...catalog, entrances: [source, source] }),
    ).toThrow();
  });
  it("creates deterministic original tread/riser faces, continuous rails, opening and bounded switchback landings without mutating assets", () => {
    const { station, chunk, source, detail } = example();
    const original = JSON.stringify({ station, chunk, source });
    expect(detail).toEqual(buildEntranceDetail(station, chunk, source));
    expect(detail.sourcePosition).toEqual(source.position);
    expect(
      entranceLocalPosition(source.position, detail.orientationDeg, 0, 0, 0),
    ).toEqual([...source.position, 0]);
    expect(detail.sourceType).toBe("Stair");
    expect(detail.accessDirection).toBe("down");
    expect(detail.steps).toHaveLength(detail.dimensions.stepCount);
    expect(detail.steps).toHaveLength(34);
    expect(
      detail.polygons.filter((face) => face.material === "riser"),
    ).toHaveLength(34);
    expect(
      detail.polygons.filter((face) => face.material === "tread"),
    ).toHaveLength(34);
    expect(detail.fixtures).toHaveLength(2);
    expect(detail.polygons.some((face) => face.material === "sign")).toBe(true);
    for (let index = 0; index < detail.steps.length; index++) {
      const step = detail.steps[index];
      expect(step.floorM).toBeCloseTo(
        -(index + 1) * detail.dimensions.riserM,
        10,
      );
      expect(step.areaM2).toBeCloseTo(
        detail.dimensions.widthM * detail.dimensions.treadRunM,
        10,
      );
    }
    expect(detail.steps.at(-1)!.floorM).toBeCloseTo(-6, 10);
    expect(
      detail.paths.filter(
        (path) => path.material === "metal" && path.path.length === 4,
      ),
    ).toHaveLength(5);
    expect(detail.polygons.length).toBeLessThan(600);
    expect(detail.paths.length).toBeLessThan(200);
    for (const [lng, lat] of detail.focusPositions) {
      const metres = Math.hypot(
        (lng - source.position[0]) * 84_000,
        (lat - source.position[1]) * 111_320,
      );
      expect(metres).toBeLessThan(20);
    }
    expect(JSON.stringify({ station, chunk, source })).toBe(original);
  });
  it("derives compartment storage patches from the same tread/floor geometry used for rendering", () => {
    const { detail } = example();
    expect(detail.floodGeometry.compartments[0].floorPatches).toEqual([
      ...detail.steps.map((step) => ({
        floorM: step.floorM,
        areaM2: step.areaM2,
      })),
      { floorM: -3, areaM2: 8.64 },
    ]);
    for (const surface of detail.compartments) {
      const compartment = detail.floodGeometry.compartments.find(
        (item) => item.id === surface.id,
      )!;
      expect(
        compartment.floorPatches.some(
          (patch) => patch.floorM === surface.floorM,
        ),
      ).toBe(true);
    }
    expect(
      detail.floodGeometry.connections.every(
        (connection) => connection.enabled,
      ),
    ).toBe(true);
    expect(detail.assumptions.join(" ")).toMatch(/not surveyed/);
  });
  it("keeps F22 Station House distinct and ascending with no invented elevated platform flood connection", () => {
    const { detail, source } = example("F22", "row-9vic.hxit~q3uv");
    expect(source.type).toBe("Station House");
    expect(detail.accessDirection).toBe("up");
    expect(detail.steps.every((step) => step.floorM > 0)).toBe(true);
    expect(detail.assumptions.join(" ")).toMatch(/not Stair/);
    expect(detail.assumptions.join(" ")).toMatch(/48 m/);
    expect(detail.compartments.some((space) => space.id === "platform")).toBe(
      false,
    );
    expect(detail.floodGeometry.connections[0].enabled).toBe(false);
    const trajectory = simulateFloodScenario(detail.floodGeometry, {
      ...DEFAULT_FLOOD_INPUTS,
      streetDepthM: 0.35,
      durationS: 1800,
    });
    for (const frame of trajectory.frames) {
      expect(
        frame.compartments.find((compartment) => compartment.id === "landing")!
          .volumeM3,
      ).toBe(0);
      expect(
        frame.compartments.find(
          (compartment) => compartment.id === "stairwell",
        )!.stageM,
      ).toBeLessThanOrEqual(0.35 + 1e-9);
    }
  });
});
