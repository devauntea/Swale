// Semantic/geometry contracts only. Actual visibility and pointer picking need WebGL QA.
import { describe, expect, it, vi } from "vitest";
import type {
  InfrastructureMapState,
  InfrastructurePrimitive,
} from "../infrastructure/contracts";
import {
  infrastructureDisplayPosition,
  infrastructureFocusPositions,
  infrastructureMapLayers,
} from "../map/infrastructureLayers";

const platform: InfrastructurePrimitive = {
  id: "platform:F21:1",
  kind: "platform",
  stationId: "F21",
  sourceIds: ["S3:F21"],
  assumption:
    "Generated platform, assumed vertical position; not a surveyed interior.",
  polygon: [
    [-73.995, 40.68, -12.6],
    [-73.9949, 40.68, -12.6],
    [-73.9949, 40.6801, -12.6],
    [-73.995, 40.68, -12.6],
  ],
  height: 0.6,
  zReference: "base",
};
const route: InfrastructurePrimitive = {
  id: "route:F21:branch",
  kind: "route",
  stationId: "F21",
  sourceIds: ["S2:shape"],
  assumption: "Representative route, not a surveyed individual rail.",
  path: [
    [-73.995, 40.68, -12],
    [-73.995, 40.681, -10],
  ],
  sourceColor: "#FFCC00",
};
const entrance: InfrastructurePrimitive = {
  id: "entrance:F21:opaque",
  kind: "entrance",
  stationId: "F21",
  sourceIds: ["S4:opaque"],
  assumption: "Source entrance point on the flat reference surface.",
  position: [-73.995, 40.68, 0],
};
function state(): InfrastructureMapState {
  return {
    stationId: "F21",
    mode: "xray",
    verticalExaggeration: 2,
    visible: {
      structure: true,
      routes: true,
      platforms: true,
      entrances: true,
    },
    selectedPrimitiveId: null,
    chunk: {
      stationId: "F21",
      primitives: [platform, route, entrance],
      metadata: {
        modelVintage: "Source fixture vintage",
        referencePolicy:
          "Surface-relative display; canonical elevations separate",
        schematic: true,
      },
    },
  };
}
function layers(current = state(), valid = () => true) {
  const pick = vi.fn(),
    tooltip = vi.fn();
  const result = infrastructureMapLayers(
    current,
    "light",
    pick,
    tooltip,
    valid,
  );
  const props = (id: string) =>
    result.find((layer) => layer.id === id)!.props as unknown as Record<
      string,
      unknown
    >;
  const call = (id: string, key: string, value: unknown) =>
    (props(id)[key] as (value: unknown) => unknown)(value);
  return { result, pick, tooltip, props, call };
}

describe("station infrastructure geometry and selection contracts", () => {
  it("keeps negative canonical heights and applies display exaggeration around surface zero without altering inputs", () => {
    const current = state(),
      before = JSON.stringify(current);
    const { call } = layers(current);
    expect(
      call("swale-infrastructure-platform-polygons", "getPolygon", platform),
    ).toEqual(platform.polygon!.map(([x, y, z]) => [x, y, z * 2]));
    expect(
      call("swale-infrastructure-platform-polygons", "getElevation", platform),
    ).toBe(1.2);
    expect(call("swale-infrastructure-route-paths", "getPath", route)).toEqual([
      [-73.995, 40.68, -24],
      [-73.995, 40.681, -20],
    ]);
    expect(infrastructureDisplayPosition(entrance.position!, 5)).toEqual(
      entrance.position,
    );
    expect(JSON.stringify(current)).toBe(before);
  });
  it("renders X-ray above basemap labels with depth bypass while Surface retains shared-context occlusion", () => {
    const current = state();
    for (const layer of layers(current).result) {
      expect(layer.props).not.toHaveProperty("beforeId");
      expect(layer.props.parameters).toEqual({
        depthCompare: "always",
        depthWriteEnabled: false,
      });
    }
    current.mode = "surface";
    for (const layer of layers(current).result)
      expect(layer.props.parameters).toEqual({
        depthCompare: "less-equal",
        depthWriteEnabled: false,
      });
  });
  it("returns exact per-primitive semantic IDs and provenance, never a whole-model surrogate", () => {
    const { call, pick, tooltip } = layers();
    expect(
      call("swale-infrastructure-platform-polygons", "onClick", {
        object: platform,
      }),
    ).toBe(true);
    expect(pick).toHaveBeenLastCalledWith(platform.id);
    expect(
      call("swale-infrastructure-entrance-points", "onClick", {
        object: entrance,
      }),
    ).toBe(true);
    expect(pick).toHaveBeenLastCalledWith(entrance.id);
    call("swale-infrastructure-platform-polygons", "onHover", {
      object: platform,
      x: 1,
      y: 2,
    });
    expect(tooltip).toHaveBeenLastCalledWith(
      expect.objectContaining({
        detail: platform.assumption,
        context: expect.stringContaining("S3:F21"),
      }),
    );
    expect(
      call("swale-infrastructure-platform-polygons", "onClick", {
        object: { ...platform, id: "unknown" },
      }),
    ).toBe(false);
  });
  it("fails stale callbacks closed and hides each primitive group independently", () => {
    const stale = layers(state(), () => false);
    expect(
      stale.call("swale-infrastructure-platform-polygons", "onClick", {
        object: platform,
      }),
    ).toBe(false);
    stale.call("swale-infrastructure-platform-polygons", "onHover", {
      object: platform,
      x: 1,
      y: 2,
    });
    expect(stale.pick).not.toHaveBeenCalled();
    expect(stale.tooltip).toHaveBeenLastCalledWith(null);
    const current = state();
    current.visible.platforms = false;
    current.visible.entrances = false;
    const hidden = layers(current);
    expect(hidden.props("swale-infrastructure-platform-polygons").data).toEqual(
      [],
    );
    expect(hidden.props("swale-infrastructure-entrance-paths").data).toEqual(
      [],
    );
    expect(
      hidden.call("swale-infrastructure-platform-polygons", "onClick", {
        object: platform,
      }),
    ).toBe(false);
  });
  it("rejects mismatched chunks, foreign station records and nonfinite geometry before rendering", () => {
    const current = state();
    current.chunk!.stationId = "F22";
    expect(layers(current).result).toEqual([]);
    current.chunk!.stationId = "F21";
    current.chunk!.primitives = [
      { ...platform, stationId: "F22" },
      {
        ...route,
        path: [
          [-73.99, 40.68, NaN],
          [-73.99, 40.69, 0],
        ],
      },
    ];
    const result = layers(current);
    expect(result.props("swale-infrastructure-platform-polygons").data).toEqual(
      [],
    );
    expect(result.props("swale-infrastructure-route-paths").data).toEqual([]);
  });
  it("fits station platforms/entrances independently of transit state or distant route geometry", () => {
    expect(infrastructureFocusPositions(state())).toEqual(
      [...platform.polygon!, entrance.position!].map(([x, y]) => [x, y]),
    );
    const current = state();
    current.chunk!.stationId = "F22";
    expect(infrastructureFocusPositions(current)).toEqual([]);
  });
  it("retains GTFS source colors in canonical input while using Swale's owned blue palette", () => {
    const { call } = layers();
    const color = call(
      "swale-infrastructure-route-paths",
      "getColor",
      route,
    ) as number[];
    expect(color[2]).toBeGreaterThan(color[0]);
    expect(route.sourceColor).toBe("#FFCC00");
  });
});
