// Rendering contracts only; visual geometry/occlusion needs the actual WebGL browser.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  parseInfrastructureChunk,
  parseInfrastructureManifest,
} from "../infrastructure/contracts";
import { parseEntranceCatalog } from "../infrastructure/entranceCatalog";
import { buildEntranceDetail } from "../infrastructure/entranceGeometry";
import {
  DEFAULT_FLOOD_INPUTS,
  simulateFloodScenario,
} from "../infrastructure/floodModel";
import {
  buildEntranceLayers,
  entranceDisplayPosition,
  entranceWaterSurfaces,
} from "../map/entranceLayers";
import { infrastructureMapLayers } from "../map/infrastructureLayers";

const asset = (path: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../public/infrastructure/${path}`, import.meta.url),
      "utf8",
    ),
  ) as unknown;
const manifest = parseInfrastructureManifest(asset("index.json"));
const catalog = parseEntranceCatalog(asset("entrance-details.json"));
const makeDetail = (stationId = "F21", sourceId = "row-y4aj-tepy-nbif") =>
  buildEntranceDetail(
    manifest.stations.find((station) => station.id === stationId)!,
    parseInfrastructureChunk(asset(`stations/${stationId}.json`), stationId),
    catalog.entrances.find((source) => source.id === sourceId)!,
  )!;

describe("selected entrance structural/water rendering contracts", () => {
  it("binds spatial labels to actual modeled components, preserving surface visibility and exact selection IDs", () => {
    const detail = makeDetail();
    const chunk = parseInfrastructureChunk(asset("stations/F21.json"), "F21");
    const pick = vi.fn();
    const current = {
      stationId: "F21",
      chunk,
      mode: "xray" as const,
      verticalExaggeration: 1,
      visible: {
        structure: true,
        routes: true,
        platforms: true,
        entrances: true,
      },
      selectedPrimitiveId: null,
      entranceDetail: detail,
    };
    const layers = infrastructureMapLayers(current, "light", pick, vi.fn());
    const labels = layers.find(
      (layer) => layer.id === "swale-infrastructure-component-labels",
    )!;
    expect(labels.props.data).toEqual(detail.components);
    const component = detail.components[1];
    expect(
      (
        (labels.props as unknown as Record<string, unknown>)
          .getPosition as Function
      )(component),
    ).toEqual(component.position);
    (labels.props.onClick as Function)({ object: component });
    expect(pick).toHaveBeenCalledWith(component.id);
    const surface = infrastructureMapLayers(
      { ...current, mode: "surface" },
      "dark",
      vi.fn(),
      vi.fn(),
    ).find((layer) => layer.id === labels.id)!;
    expect(
      [...(surface.props.data as Iterable<{ position: number[] }>)].every(
        (item) => item.position[2] >= 0,
      ),
    ).toBe(true);
    const stale = infrastructureMapLayers(
      { ...current, entranceDetail: { ...detail, stationId: "F22" } },
      "dark",
      vi.fn(),
      vi.fn(),
    );
    expect(stale.some((layer) => layer.id === labels.id)).toBe(false);
  });
  it("reuses static geometry arrays across scenario frames and display changes while dynamic water remains frame-specific", () => {
    const detail = makeDetail();
    const trajectory = simulateFloodScenario(detail.floodGeometry, {
      ...DEFAULT_FLOOD_INPUTS,
    });
    for (const mode of ["surface", "xray"] as const) {
      const first = buildEntranceLayers(
        detail,
        "light",
        mode,
        1,
        vi.fn(),
        vi.fn(),
        null,
        { frame: trajectory.frames[10], inputs: trajectory.inputs },
      );
      const second = buildEntranceLayers(
        detail,
        "dark",
        mode,
        5,
        vi.fn(),
        vi.fn(),
        detail.components[1].id,
        { frame: trajectory.frames[200], inputs: trajectory.inputs },
      );
      for (const layer of first.filter((item) =>
        item.id.startsWith("swale-entrance-detail-"),
      )) {
        const later = second.find((item) => item.id === layer.id)!;
        expect(later.props.data).toBe(layer.props.data);
      }
      const water = (layers: ReturnType<typeof buildEntranceLayers>) =>
        layers.find((layer) => layer.id === "swale-entrance-scenario-water")!;
      expect(water(first).props.data).not.toBe(water(second).props.data);
      if (mode === "xray")
        expect(water(first).props.data).not.toEqual(water(second).props.data);
      const treads = second.find(
        (layer) => layer.id === "swale-entrance-detail-treads",
      )!;
      expect(treads.props.updateTriggers).toEqual(
        expect.objectContaining({
          getPolygon: [5],
          getFillColor: ["dark"],
          getLineWidth: [detail.components[1].id],
        }),
      );
    }
    const copy = structuredClone(detail);
    const original = buildEntranceLayers(
      detail,
      "light",
      "xray",
      1,
      vi.fn(),
      vi.fn(),
    );
    const separate = buildEntranceLayers(
      copy,
      "light",
      "xray",
      1,
      vi.fn(),
      vi.fn(),
    );
    expect(original[0].props.data).not.toBe(separate[0].props.data);
  });
  it("shows only above-reference elements in Surface while X-ray keeps original negative geometry and water without altering physical state", () => {
    const detail = makeDetail();
    const trajectory = simulateFloodScenario(detail.floodGeometry, {
      ...DEFAULT_FLOOD_INPUTS,
    });
    const scenario = {
      frame: trajectory.frames.at(-1)!,
      inputs: trajectory.inputs,
    };
    const before = JSON.stringify({ detail, scenario });
    const positions = (layers: ReturnType<typeof buildEntranceLayers>) =>
      layers.flatMap((layer) => {
        const data = layer.props.data as {
          polygon?: [number, number, number][];
          path?: [number, number, number][];
          position?: [number, number, number];
        }[];
        return data.flatMap(
          (record) =>
            record.polygon ??
            record.path ??
            (record.position ? [record.position] : []),
        );
      });
    for (const current of [undefined, scenario]) {
      const surface = positions(
        buildEntranceLayers(
          detail,
          "light",
          "surface",
          5,
          vi.fn(),
          vi.fn(),
          null,
          current,
        ),
      );
      expect(surface.length).toBeGreaterThan(0);
      expect(surface.every((point) => point[2] >= 0)).toBe(true);
      expect(
        positions(
          buildEntranceLayers(
            detail,
            "light",
            "xray",
            5,
            vi.fn(),
            vi.fn(),
            null,
            current,
          ),
        ).some((point) => point[2] < 0),
      ).toBe(true);
    }
    expect(JSON.stringify({ detail, scenario })).toBe(before);
  });
  it("keeps selected current-evidence surfaces neutral and distinguishes selection with outlines/rails rather than water-like fills", () => {
    const detail = makeDetail();
    const landing = detail.components.find(
      (component) => component.kind === "landing",
    )!;
    for (const theme of ["light", "dark"] as const) {
      const baseline = buildEntranceLayers(
        detail,
        theme,
        "xray",
        1,
        vi.fn(),
        vi.fn(),
      );
      const selected = buildEntranceLayers(
        detail,
        theme,
        "xray",
        1,
        vi.fn(),
        vi.fn(),
        landing.id,
      );
      const neutral = baseline.find(
        (layer) => layer.id === "swale-entrance-detail-stone",
      )!.props as unknown as Record<string, unknown>;
      const highlighted = selected.find(
        (layer) => layer.id === "swale-entrance-detail-stone",
      )!.props as unknown as Record<string, unknown>;
      const floor = detail.polygons.find(
        (surface) =>
          surface.componentId === landing.id && surface.material === "stone",
      )!;
      expect(
        (highlighted.getFillColor as (face: unknown) => unknown)(floor),
      ).toEqual((neutral.getFillColor as (face: unknown) => unknown)(floor));
      expect(
        (highlighted.getFillColor as (face: unknown) => unknown)(floor),
      ).not.toEqual([72, 146, 217, 245]);
      expect(
        (highlighted.getLineWidth as (face: unknown) => unknown)(floor),
      ).toBe(1.8);
      expect((neutral.getLineWidth as (face: unknown) => unknown)(floor)).toBe(
        0,
      );
      expect(highlighted.getLineColor).toEqual([72, 146, 217, 255]);
      expect(selected.some((layer) => layer.id.includes("scenario"))).toBe(
        false,
      );
    }
  });
  it("retains negative structural coordinates with coherent display-only exaggeration and 3D tessellation", () => {
    const detail = makeDetail();
    const original = JSON.stringify(detail);
    for (const scale of [1, 5]) {
      const layers = buildEntranceLayers(
        detail,
        "light",
        "xray",
        scale,
        vi.fn(),
        vi.fn(),
      );
      const treads = layers.find(
        (layer) => layer.id === "swale-entrance-detail-treads",
      )!.props as unknown as Record<string, unknown>;
      expect(treads._subLayerProps).toEqual({ fill: { _full3d: true } });
      const face = detail.polygons.find(
        (polygon) => polygon.material === "tread",
      )!;
      expect((treads.getPolygon as (face: unknown) => unknown)(face)).toEqual(
        face.polygon.map((p) => entranceDisplayPosition(p, scale)),
      );
      expect(
        layers.every(
          (layer) => layer.props.parameters?.depthCompare === "always",
        ),
      ).toBe(true);
      expect(layers.every((layer) => !("beforeId" in layer.props))).toBe(true);
    }
    expect(
      buildEntranceLayers(detail, "dark", "surface", 1, vi.fn(), vi.fn()).every(
        (layer) => layer.props.parameters?.depthCompare === "less-equal",
      ),
    ).toBe(true);
    expect(JSON.stringify(detail)).toBe(original);
  });
  it("picks declared entrance/flight/landing IDs with source-linked provenance and rejects foreign components", () => {
    const detail = makeDetail();
    const pick = vi.fn(),
      tooltip = vi.fn();
    const layer = buildEntranceLayers(
      detail,
      "dark",
      "xray",
      1,
      pick,
      tooltip,
    ).find((item) => item.id === "swale-entrance-detail-treads")!;
    const props = layer.props as unknown as Record<string, unknown>;
    const click = props.onClick as (info: unknown) => boolean;
    const hover = props.onHover as (info: unknown) => void;
    const object = detail.polygons.find(
      (polygon) => polygon.material === "tread",
    )!;
    expect(click({ object })).toBe(true);
    expect(pick).toHaveBeenLastCalledWith(object.componentId);
    expect(click({ object: { componentId: "other:station:flight" } })).toBe(
      false,
    );
    hover({ object, x: 4, y: 5 });
    expect(tooltip).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: expect.stringContaining("S4:row-y4aj-tepy-nbif"),
      }),
    );
    hover({ object: { componentId: "unknown" } });
    expect(tooltip).toHaveBeenLastCalledWith(null);
  });
  it("current/baseline/reset views show neutral structure; no evidence value can supply a water frame", () => {
    const detail = makeDetail();
    expect(entranceWaterSurfaces(detail)).toEqual([]);
    expect(
      entranceWaterSurfaces(detail, {
        frame: null,
        inputs: { ...DEFAULT_FLOOD_INPUTS },
      }),
    ).toEqual([]);
    const trajectory = simulateFloodScenario(detail.floodGeometry, {
      ...DEFAULT_FLOOD_INPUTS,
    });
    expect(
      entranceWaterSurfaces(detail, {
        frame: trajectory.frames.at(-1)!,
        inputs: trajectory.inputs,
        compareBaseline: true,
      }),
    ).toEqual([]);
    expect(
      buildEntranceLayers(detail, "light", "xray", 1, vi.fn(), vi.fn()).some(
        (layer) => layer.id.includes("scenario"),
      ),
    ).toBe(false);
  });
  it("water uses exact model stages on declared tread/room footprints and bounded explicit boundary/overtopping patches", () => {
    const detail = makeDetail();
    const trajectory = simulateFloodScenario(detail.floodGeometry, {
      ...DEFAULT_FLOOD_INPUTS,
    });
    const frame = trajectory.frames.at(-1)!;
    const scenario = { frame, inputs: trajectory.inputs };
    const water = entranceWaterSurfaces(detail, scenario);
    expect(water.some((patch) => patch.kind === "boundary")).toBe(true);
    expect(water.some((patch) => patch.kind === "wet-step")).toBe(true);
    expect(water.some((patch) => patch.kind === "accumulation")).toBe(true);
    for (const patch of water.filter((patch) => patch.kind === "wet-step")) {
      const step = detail.steps.find((step) => step.id === patch.id)!;
      const state = frame.compartments.find(
        (space) => space.id === step.compartmentId,
      )!;
      expect(patch.depthM).toBeCloseTo(state.stageM - step.floorM, 10);
      expect(patch.polygon.map(([lng, lat]) => [lng, lat])).toEqual(
        step.polygon.map(([lng, lat]) => [lng, lat]),
      );
      expect(
        patch.polygon.every(
          (p) => Math.abs(p[2] - state.stageM - 0.012) < 1e-9,
        ),
      ).toBe(true);
    }
    const sealed = simulateFloodScenario(detail.floodGeometry, {
      ...DEFAULT_FLOOD_INPUTS,
      barrierHeightM: 0.8,
    });
    expect(
      entranceWaterSurfaces(detail, {
        frame: sealed.frames.at(-1)!,
        inputs: sealed.inputs,
      }).every((patch) => patch.kind === "boundary"),
    ).toBe(true);
    const flow = buildEntranceLayers(
      detail,
      "dark",
      "xray",
      5,
      vi.fn(),
      vi.fn(),
      null,
      scenario,
    );
    expect(
      flow.some((layer) => layer.id === "swale-entrance-scenario-water"),
    ).toBe(true);
    const waterLayer = flow.find(
      (layer) => layer.id === "swale-entrance-scenario-water",
    )!.props as unknown as Record<string, unknown>;
    expect(
      (waterLayer.getPolygon as (patch: unknown) => unknown)(water[0]),
    ).toEqual(water[0].polygon.map((p) => entranceDisplayPosition(p, 5)));
  });
  it("street ponding never wets unreachable elevated landing/platform patches", () => {
    const detail = makeDetail("F22", "row-9vic.hxit~q3uv");
    const trajectory = simulateFloodScenario(detail.floodGeometry, {
      ...DEFAULT_FLOOD_INPUTS,
    });
    const scenario = {
      frame: trajectory.frames.at(-1)!,
      inputs: trajectory.inputs,
    };
    expect(
      entranceWaterSurfaces(detail, scenario).some(
        (surface) => surface.kind === "accumulation",
      ),
    ).toBe(false);
    expect(
      entranceWaterSurfaces(detail, scenario)
        .filter((surface) => surface.kind === "wet-step")
        .every((surface) => surface.polygon[0][2] <= 0.35 + 0.012 + 1e-8),
    ).toBe(true);
    expect(
      buildEntranceLayers(
        detail,
        "light",
        "xray",
        1,
        vi.fn(),
        vi.fn(),
        null,
        scenario,
      ).some((layer) => layer.id === "swale-entrance-scenario-flow"),
    ).toBe(false);
  });
  it("uses an actual XYZ depth reference connected to horizontal endpoint ticks and only downward stair-flow paths", () => {
    const detail = makeDetail();
    const trajectory = simulateFloodScenario(detail.floodGeometry, {
      ...DEFAULT_FLOOD_INPUTS,
    });
    const layers = buildEntranceLayers(
      detail,
      "light",
      "xray",
      5,
      vi.fn(),
      vi.fn(),
      null,
      { frame: trajectory.frames.at(-1)!, inputs: trajectory.inputs },
    );
    const reference = layers.find(
      (layer) => layer.id === "swale-entrance-scenario-depth-reference",
    )!.props as unknown as Record<string, unknown>;
    const face = (
      reference.data as { polygon: [number, number, number][] }[]
    )[0];
    const polygon = face.polygon;
    expect(reference._subLayerProps).toEqual({ fill: { _full3d: true } });
    expect(polygon).toHaveLength(4);
    expect(polygon[0].slice(0, 2)).not.toEqual(polygon[1].slice(0, 2));
    expect(polygon.map((p) => p[2])).toEqual([0, 0, 0.35, 0.35]);
    expect((reference.getPolygon as (line: unknown) => unknown)(face)).toEqual(
      polygon.map((p) => entranceDisplayPosition(p, 5)),
    );
    const ticks = layers.find(
      (layer) => layer.id === "swale-entrance-scenario-depth-ticks",
    )!.props.data as { path: [number, number, number][] }[];
    expect(ticks).toHaveLength(2);
    for (const tick of ticks) {
      expect(tick.path[0].slice(0, 2)).not.toEqual(tick.path[1].slice(0, 2));
      expect(tick.path[0][2]).toEqual(tick.path[1][2]);
    }
    expect(ticks.map((tick) => tick.path[0][2])).toEqual([0, 0.35]);
    expect(detail.flowPaths).toHaveLength(2);
    for (const path of detail.flowPaths)
      for (let index = 1; index < path.length; index++)
        expect(path[index][2]).toBeLessThan(path[index - 1][2]);
  });
});
