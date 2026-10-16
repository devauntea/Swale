import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INFRASTRUCTURE_LIMITS,
  parseInfrastructureChunk,
  parseInfrastructureManifest,
  resolveInfrastructureBinding,
  validateInfrastructurePath,
  type InfrastructureChunk,
  type InfrastructureStation,
} from "../infrastructure/contracts";
import { InfrastructureClient } from "../infrastructure/client";
import type { TransitStation } from "../backend/transitContracts";

const modelStation = (id = "F21"): InfrastructureStation => ({
  id,
  gtfsStopId: id,
  name: "Test station",
  complexId: "321",
  routes: ["F"],
  structure: "Subway",
  position: [-74, 40.68],
  detailUrl: `/infrastructure/stations/${id}.json`,
  sourceIds: [`S3:${id}`],
  assumptions: ["Generated schematic dimensions"],
  backendStationId: null,
  relationship: "unmatched",
});
const modelChunk = (id = "F21"): InfrastructureChunk => ({
  stationId: id,
  primitives: [
    {
      id: `${id}-platform`,
      kind: "platform",
      stationId: id,
      sourceIds: [`S3:${id}`],
      assumption: "Schematic platform, not surveyed",
      polygon: [
        [-74, 40.68, -6],
        [-73.9999, 40.68, -6],
        [-73.9999, 40.6801, -6],
      ],
      height: 1,
      zReference: "base",
    },
  ],
  metadata: {
    modelVintage: "source edition test",
    referencePolicy: "surface-relative, flat reference",
    schematic: true,
  },
});
const station = (gtfsStopId = "F21"): TransitStation => ({
  type: "Feature",
  id: "subway_station:opaque:F21",
  geometry: { type: "Point", coordinates: [-74, 40.68] },
  properties: {
    layer: "subway_stations",
    knowledge_type: "observed",
    gtfs_stop_id: gtfsStopId,
    name: "Test station",
    routes: ["F"],
    line: null,
    structure: "Subway",
    ada: 0,
    complex_id: "321",
    source: {
      id: "S3",
      dataset: "39hk-dx4f",
      record_id: "F21",
      url: null,
      updated_at: null,
    },
  },
});
const manifest = () => ({
  version: 1,
  modelId: "test",
  vintage: "test edition",
  referencePolicy: "surface-relative",
  bounds: [-74.1, 40.5, -73.8, 40.8],
  stations: [modelStation()],
  sources: [{ id: "S3", url: "https://data.ny.gov/39hk-dx4f", vintage: null }],
});
afterEach(() => vi.unstubAllGlobals());

describe("schematic infrastructure contracts and identity", () => {
  it("keeps exact GTFS and opaque backend identity, including explicit geometry-only states", () => {
    expect(resolveInfrastructureBinding(modelStation(), [station()]).kind).toBe(
      "supported",
    );
    expect(
      resolveInfrastructureBinding(modelStation(), [station("F21N")]).kind,
    ).toBe("geometry-only");
    expect(
      resolveInfrastructureBinding(modelStation(), [station("F22")]).kind,
    ).toBe("geometry-only");
    expect(
      resolveInfrastructureBinding(
        { ...modelStation(), backendStationId: "another-opaque-id" },
        [station()],
      ).kind,
    ).toBe("geometry-only");
    expect(
      resolveInfrastructureBinding(modelStation(), [
        station(),
        { ...station(), id: "duplicate-match" },
      ]).kind,
    ).toBe("geometry-only");
    expect(
      resolveInfrastructureBinding(
        { ...modelStation(), complexId: "mismatch" },
        [station()],
      ).kind,
    ).toBe("geometry-only");
  });
  it("rejects external/traversal asset paths and duplicate or inconsistent identities", () => {
    for (const path of [
      "https://example.org/F21.json",
      "//example.org/F21.json",
      "/infrastructure/stations/../F21.json",
      "/infrastructure/stations/F21.json?x=1",
    ])
      expect(() => validateInfrastructurePath(path, "F21")).toThrow();
    expect(parseInfrastructureManifest(manifest()).stations[0].id).toBe("F21");
    expect(() =>
      parseInfrastructureManifest({
        ...manifest(),
        stations: [modelStation(), modelStation()],
      }),
    ).toThrow();
    expect(() =>
      parseInfrastructureManifest({
        ...manifest(),
        stations: [{ ...modelStation(), gtfsStopId: "F22" }],
      }),
    ).toThrow();
  });
  it("rejects wrong-station, unknown-kind and non-finite geometry without replacing it", () => {
    expect(
      parseInfrastructureChunk(modelChunk(), "F21").primitives[0].height,
    ).toBe(1);
    expect(() => parseInfrastructureChunk(modelChunk("F22"), "F21")).toThrow();
    const chunk = modelChunk();
    expect(() =>
      parseInfrastructureChunk(
        { ...chunk, primitives: [{ ...chunk.primitives[0], kind: "vehicle" }] },
        "F21",
      ),
    ).toThrow();
    expect(() =>
      parseInfrastructureChunk(
        {
          ...chunk,
          primitives: [
            {
              ...chunk.primitives[0],
              polygon: [
                [NaN, 40.68, -6],
                [-74, 40.68, -6],
                [-74, 40.69, -6],
              ],
            },
          ],
        },
        "F21",
      ),
    ).toThrow();
    expect(() =>
      parseInfrastructureChunk(
        { ...chunk, metadata: { ...chunk.metadata, schematic: false } },
        "F21",
      ),
    ).toThrow();
  });
});

describe("bounded local infrastructure assets", () => {
  it("loads canonical local assets and evicts the least recently used decoded chunk after four", async () => {
    const fetcher = vi.fn(async (path: string) => {
      const id = path.split("/").at(-1)!.replace(".json", "");
      return new Response(JSON.stringify(modelChunk(id)), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const client = new InfrastructureClient();
    const signal = new AbortController().signal;
    for (const id of ["F21", "F22", "A41", "R32", "R33"])
      await client.chunk(modelStation(id), signal);
    expect(client.diagnostics.chunks).toBe(INFRASTRUCTURE_LIMITS.cacheChunks);
    expect(client.diagnostics.decodedBytes).toBeLessThanOrEqual(
      INFRASTRUCTURE_LIMITS.cacheBytes,
    );
    await client.chunk(modelStation("F22"), signal);
    expect(fetcher).toHaveBeenCalledTimes(5);
    await client.chunk(modelStation("F21"), signal);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(fetcher.mock.calls[0][0]).toBe("/infrastructure/stations/F21.json");
    client.clear();
    expect(client.diagnostics.chunks).toBe(0);
  });
  it("caps concurrent detail requests at two and cancels queued work", async () => {
    const resolvers: (() => void)[] = [];
    let active = 0;
    let maximum = 0;
    const fetcher = vi.fn(
      (path: string) =>
        new Promise<Response>((resolve) => {
          active += 1;
          maximum = Math.max(maximum, active);
          resolvers.push(() => {
            active -= 1;
            resolve(
              new Response(
                JSON.stringify(
                  modelChunk(path.split("/").at(-1)!.replace(".json", "")),
                ),
                { headers: { "content-type": "application/json" } },
              ),
            );
          });
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const client = new InfrastructureClient();
    const signal = new AbortController().signal;
    const one = client.chunk(modelStation("F21"), signal);
    const two = client.chunk(modelStation("F22"), signal);
    const cancel = new AbortController();
    const third = client
      .chunk(modelStation("A41"), cancel.signal)
      .catch((error: unknown) => error);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
    cancel.abort();
    expect(((await third) as Error).name).toBe("AbortError");
    resolvers[0]();
    resolvers[1]();
    await Promise.all([one, two]);
    expect(maximum).toBe(2);
    expect(client.diagnostics.active).toBe(0);
  });
  it("fails closed for response size/content type and cancels before any fetch", async () => {
    const client = new InfrastructureClient();
    const cancel = new AbortController();
    cancel.abort();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      client.chunk(modelStation(), cancel.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(
      new Response("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": String(INFRASTRUCTURE_LIMITS.chunkBytes + 1),
        },
      }),
    );
    await expect(
      client.chunk(modelStation(), new AbortController().signal),
    ).rejects.toThrow("byte budget");
    fetcher.mockResolvedValueOnce(
      new Response("not json", { headers: { "content-type": "text/html" } }),
    );
    await expect(
      client.chunk(modelStation(), new AbortController().signal),
    ).rejects.toThrow("not JSON");
    expect(client.diagnostics.active).toBe(0);
  });
});
