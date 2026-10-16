// Generated local JSON integration, not scientific/model or browser acceptance.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INFRASTRUCTURE_LIMITS,
  parseInfrastructureChunk,
  parseInfrastructureManifest,
  validateInfrastructurePath,
} from "../infrastructure/contracts";

const publicRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../public",
);
const indexText = readFileSync(
  resolve(publicRoot, "infrastructure/index.json"),
  "utf8",
);
const raw = JSON.parse(indexText) as Record<string, unknown>;
const manifest = parseInfrastructureManifest(raw);

describe("generated infrastructure publication contract", () => {
  it("explicitly declares whether this is a checkpoint or complete borough build", () => {
    expect(typeof raw.partialBuild).toBe("boolean");
    expect(Buffer.byteLength(indexText, "utf8")).toBeLessThanOrEqual(
      INFRASTRUCTURE_LIMITS.manifestBytes,
    );
    expect(manifest.stations.length).toBeGreaterThan(0);
    expect(manifest.sources.map((source) => source.id)).toEqual(
      expect.arrayContaining(["S1", "S3", "S5"]),
    );
  });
});

// The source-verified F21/F22 checkpoint intentionally does not publish every
// canonical station chunk. Full-build acceptance cannot be inferred from it.
describe.skipIf(raw.partialBuild === true)(
  "all generated Brooklyn station assets",
  () => {
    it("resolves every canonical station detail locally within parser, coordinate and resource budgets", () => {
      expect(raw.partialBuild).toBe(false);
      const sourceIds = new Set(manifest.sources.map((source) => source.id));
      let primitives = 0;
      for (const station of manifest.stations) {
        const path = validateInfrastructurePath(station.detailUrl, station.id);
        const localPath = realpathSync(resolve(publicRoot, `.${path}`));
        const relativePath = relative(realpathSync(publicRoot), localPath);
        expect(
          relativePath.startsWith(`..${sep}`) || relativePath === "..",
        ).toBe(false);
        expect(statSync(localPath).isFile()).toBe(true);
        const text = readFileSync(localPath, "utf8");
        expect(Buffer.byteLength(text, "utf8"), station.id).toBeLessThanOrEqual(
          INFRASTRUCTURE_LIMITS.chunkBytes,
        );
        const chunk = parseInfrastructureChunk(
          JSON.parse(text) as unknown,
          station.id,
        );
        expect(chunk.stationId).toBe(station.id);
        expect(chunk.metadata.schematic).toBe(true);
        expect(chunk.metadata.modelVintage.trim().length).toBeGreaterThan(0);
        expect(chunk.metadata.referencePolicy.trim().length).toBeGreaterThan(0);
        const coordinateCount = chunk.primitives.reduce(
          (count, primitive) =>
            count +
            (primitive.path?.length ?? 0) +
            (primitive.polygon?.length ?? 0) +
            (primitive.position ? 1 : 0),
          0,
        );
        expect(coordinateCount, station.id).toBeLessThanOrEqual(
          INFRASTRUCTURE_LIMITS.coordinates,
        );
        expect(chunk.primitives.length, station.id).toBeLessThanOrEqual(
          INFRASTRUCTURE_LIMITS.primitives,
        );
        for (const item of [station, ...chunk.primitives]) {
          expect(item.sourceIds.length, item.id).toBeGreaterThan(0);
          for (const sourceId of item.sourceIds) {
            expect(
              sourceIds.has(sourceId.split(":")[0]),
              `${item.id}: ${sourceId}`,
            ).toBe(true);
            expect(
              sourceId.split(":").slice(1).join(":").length,
              item.id,
            ).toBeGreaterThan(0);
          }
        }
        for (const primitive of chunk.primitives) {
          expect(primitive.stationId).toBe(station.id);
          expect(
            primitive.assumption.trim().length,
            primitive.id,
          ).toBeGreaterThan(0);
          if (primitive.polygon) {
            expect(primitive.zReference, primitive.id).toBe("base");
            expect(primitive.height, primitive.id).toBeGreaterThan(0);
            expect(primitive.polygon[0], primitive.id).toEqual(
              primitive.polygon.at(-1),
            );
          }
          if (primitive.kind === "entrance" && primitive.position)
            expect(primitive.position[2], primitive.id).toBe(0);
        }
        primitives += chunk.primitives.length;
      }
      expect(primitives).toBeGreaterThan(0);
    });
  },
);
