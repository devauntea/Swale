import { describe, expect, it, vi } from "vitest";
import type { Map, StyleSpecification } from "maplibre-gl";
import {
  applyArchitecturalStyle,
  BASEMAP_STYLE,
  MAP_THEMES,
  PRIORITY_RADII,
} from "../map/presentation";
import {
  createLocalBasemapGlyph,
  installLocalBasemapGlyphs,
  LOCAL_BASEMAP_GLYPH_IDS,
} from "../map/spriteFallbacks";
import type { Theme } from "../app/theme";

const style: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [
    { id: "background", type: "background" },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
    },
    {
      id: "road_primary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
    },
    {
      id: "building-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      layout: { visibility: "none" },
    },
    {
      id: "poi_r1",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "poi",
      layout: { "text-field": ["get", "name"] },
    },
    {
      id: "highway-name",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      layout: { "text-field": ["get", "name"] },
    },
  ],
};

function styleMap() {
  return {
    getStyle: vi.fn(() => structuredClone(style)),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    setFilter: vi.fn(),
    setLight: vi.fn(),
    setStyle: vi.fn(),
    flyTo: vi.fn(),
  };
}

describe("architectural map theme without map replacement", () => {
  it("uses only the existing approved Liberty style URL", () => {
    expect(BASEMAP_STYLE).toBe("https://tiles.openfreemap.org/styles/liberty");
  });

  it("restyles both themes while leaving camera, sources and hidden buildings alone", () => {
    const map = styleMap();
    for (const theme of ["dark", "light"] as const) {
      const result = applyArchitecturalStyle(map as unknown as Map, theme);
      expect(result.buildingLayerId).toBe("building-3d");
      expect(result.labelLayerId).toBe("poi_r1");
      expect(map.setPaintProperty).toHaveBeenCalledWith(
        "building-3d",
        "fill-extrusion-color",
        MAP_THEMES[theme].building,
      );
      expect(map.setPaintProperty).toHaveBeenCalledWith(
        "water",
        "fill-color",
        MAP_THEMES[theme].water,
      );
      expect(map.setPaintProperty).toHaveBeenCalledWith(
        "highway-name",
        "text-halo-color",
        MAP_THEMES[theme].labelHalo,
      );
    }
    expect(map.setStyle).not.toHaveBeenCalled();
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(
      map.setLayoutProperty.mock.calls.every(([id]) => id !== "building-3d"),
    ).toBe(true);
    expect(style.layers[3].layout).toEqual({ visibility: "none" });
    expect(style.sources).toEqual({
      openmaptiles: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
      },
    });
  });

  it("keeps real basemap height fields instead of manufacturing building measurements", () => {
    const map = styleMap();
    applyArchitecturalStyle(map as unknown as Map, "light");
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      "building-3d",
      "fill-extrusion-height",
      ["get", "render_height"],
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      "building-3d",
      "fill-extrusion-base",
      ["get", "render_min_height"],
    );
    expect(map.setFilter).toHaveBeenCalledWith("building-3d", [
      "all",
      ["!=", ["get", "hide_3d"], true],
      [">", ["coalesce", ["get", "render_height"], 0], 0],
    ]);
  });

  it("handles a style without compatible extrusions honestly", () => {
    const map = styleMap();
    map.getStyle.mockReturnValue({ ...style, layers: [] });
    expect(applyArchitecturalStyle(map as unknown as Map, "dark")).toEqual({
      buildingLayerId: undefined,
      labelLayerId: undefined,
    });
    expect(map.setFilter).not.toHaveBeenCalled();
  });

  it("reinforces the legend's four priority bands with increasing marker sizes", () => {
    expect(PRIORITY_RADII.low).toBeLessThan(PRIORITY_RADII.moderate);
    expect(PRIORITY_RADII.moderate).toBeLessThan(PRIORITY_RADII.elevated);
    expect(PRIORITY_RADII.elevated).toBeLessThan(PRIORITY_RADII.high);
  });

  it("uses blue or neutral geographic colors in both themes", () => {
    for (const theme of Object.values(MAP_THEMES)) {
      for (const color of [
        theme.flood,
        theme.floodExtreme,
        theme.floodOutline,
        theme.density,
        theme.densityOutline,
        theme.complaint,
        ...Object.values(theme.priority),
      ]) {
        expect(color[2]).toBeGreaterThanOrEqual(color[0]);
        expect(color[2]).toBeGreaterThanOrEqual(color[1]);
      }
    }
  });
});

describe("audited local Liberty sprite remediation", () => {
  it("covers precisely the seven observed missing IDs with distinct nonempty artwork", () => {
    expect([...LOCAL_BASEMAP_GLYPH_IDS].sort()).toEqual(
      [
        "sailing",
        "running",
        "gate",
        "ferry_terminal",
        "bicycle_parking",
        "brownfield",
        "office",
      ].sort(),
    );
    const masks = new Set<string>();
    for (const id of LOCAL_BASEMAP_GLYPH_IDS) {
      const image = createLocalBasemapGlyph(id, "light");
      expect(image).not.toBeNull();
      expect(image!.width).toBe(48);
      expect(image!.height).toBe(48);
      expect(image!.data.length).toBe(48 * 48 * 4);
      const mask = [...image!.data].filter((_, i) => i % 4 === 3);
      expect(mask.some((alpha) => alpha > 0)).toBe(true);
      expect(mask.some((alpha) => alpha === 0)).toBe(true);
      masks.add(mask.join(","));
    }
    expect(masks.size).toBe(7);
    expect(
      createLocalBasemapGlyph("new-unrecognized-class", "light"),
    ).toBeNull();
    expect(createLocalBasemapGlyph("__proto__", "light")).toBeNull();
  });

  it("changes glyph contrast by theme without changing shape", () => {
    const light = createLocalBasemapGlyph("office", "light")!;
    const dark = createLocalBasemapGlyph("office", "dark")!;
    for (let i = 0; i < light.data.length; i += 4) {
      expect(light.data[i + 3]).toBe(dark.data[i + 3]);
      if (light.data[i + 3])
        expect(dark.data[i + 2]).toBeGreaterThan(light.data[i + 2]);
    }
  });

  it("resolves known IDs before the v6 warning, preserves upstream images and exposes unknown IDs", () => {
    const images = new Set<string>(["running"]);
    const map = {
      setMissingStyleImageResolver: vi.fn(),
      hasImage: vi.fn((id: string) => images.has(id)),
      addImage: vi.fn((id: string) => images.add(id)),
      updateImage: vi.fn(),
    };
    let theme: Theme = "light";
    const glyphs = installLocalBasemapGlyphs(
      map as unknown as Map,
      () => theme,
    );
    const resolve = map.setMissingStyleImageResolver.mock.calls[0][0] as (
      id: string,
    ) => void;
    resolve("office");
    resolve("office");
    resolve("running");
    resolve("unexpected-new-symbol");
    expect(map.addImage).toHaveBeenCalledTimes(1);
    expect(map.addImage).toHaveBeenCalledWith(
      "office",
      expect.objectContaining({ width: 48, height: 48 }),
      { pixelRatio: 2 },
    );
    theme = "dark";
    glyphs.updateTheme(theme);
    expect(map.updateImage).toHaveBeenCalledTimes(1);
    expect(map.updateImage).toHaveBeenCalledWith(
      "office",
      expect.objectContaining({ width: 48, height: 48 }),
    );
    expect(map.updateImage).not.toHaveBeenCalledWith(
      "running",
      expect.anything(),
    );
    glyphs.dispose();
    expect(map.setMissingStyleImageResolver).toHaveBeenLastCalledWith(null);
  });
});
