import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseInfrastructureChunk,
  parseInfrastructureManifest,
} from "../infrastructure/contracts";
import { parseEntranceCatalog } from "../infrastructure/entranceCatalog";
import { buildEntranceDetail } from "../infrastructure/entranceGeometry";
import { modelTourCamera } from "../infrastructure/tourCamera";
const asset = (path: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../public/infrastructure/${path}`, import.meta.url),
      "utf8",
    ),
  ) as unknown;
const manifest = parseInfrastructureManifest(asset("index.json"));
const catalog = parseEntranceCatalog(asset("entrance-details.json"));
function detail(stationId: string) {
  const station = manifest.stations.find(
    (station) => station.id === stationId,
  )!;
  const source = catalog.entrances.find(
    (entry) =>
      entry.gtfsStopId === stationId &&
      entry.matched &&
      (entry.type === "Stair" || entry.type === "Station House"),
  )!;
  return buildEntranceDetail(
    station,
    parseInfrastructureChunk(asset(`stations/${stationId}.json`), stationId),
    source,
  )!;
}
describe("constrained source-linked station tour camera", () => {
  it.each(["F21", "F22"])(
    "faces into the real first flight at %s rather than back toward the street",
    (stationId) => {
      const geometry = detail(stationId);
      for (const part of ["entrance", "stairwell", "landing"] as const) {
        const view = modelTourCamera(geometry, part)!;
        expect(view).not.toBeNull();
        const facing =
          ((view.bearing - geometry.orientationDeg) * Math.PI) / 180;
        expect(Math.cos(facing)).toBeGreaterThan(0.8); // forward local-Y component
        expect(view.zoom).toBeLessThanOrEqual(22);
        expect(view.pitch).toBeLessThanOrEqual(68);
        expect(view.pitch).toBeGreaterThanOrEqual(62);
        expect(
          [
            view.elevation,
            view.bearing,
            view.zoom,
            view.pitch,
            ...view.position,
          ].every(Number.isFinite),
        ).toBe(true);
      }
    },
  );
  it("uses exact modeled flight/landing positions, applies display exaggeration only to height and never mutates source geometry", () => {
    const geometry = detail("F21"),
      before = JSON.stringify(geometry);
    const flight = geometry.components.find(
      (component) => component.kind === "flight",
    )!;
    const first = modelTourCamera(geometry, "stairwell", 1)!;
    const exaggerated = modelTourCamera(geometry, "stairwell", 2)!;
    expect(first.position).toEqual(flight.position.slice(0, 2));
    expect(first.elevation).toBe(flight.position[2]);
    expect(exaggerated.position).toEqual(first.position);
    expect(exaggerated.elevation).toBe(first.elevation * 2);
    expect(JSON.stringify(geometry)).toBe(before);
  });
  it("fails closed for missing modeled rooms, invalid display scale or malformed component geometry", () => {
    const geometry = detail("F22");
    expect(modelTourCamera(geometry, "platform")).toBeNull();
    expect(modelTourCamera(geometry, "entrance", Number.NaN)).toBeNull();
    expect(
      modelTourCamera({ ...geometry, components: [] }, "stairwell"),
    ).toBeNull();
  });
});
