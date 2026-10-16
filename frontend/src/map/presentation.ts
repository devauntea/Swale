import type { Map } from "maplibre-gl";
import type { Theme } from "../app/theme";

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Verified Gowanus label point from the permitted OpenFreeMap place layer.
// This is a display focus, not an administrative neighborhood boundary.
export const HOME_CAMERA = {
  center: [-73.98850500583649, 40.6791694136038] as [number, number],
  zoom: 15.5,
  pitch: 59,
  bearing: -25,
};

/** Theme values shared by the basemap and all Swale-owned geographic layers. */
export const MAP_THEMES = {
  light: {
    background: "#edf3fa",
    ground: "#e7eef7",
    park: "#dce8ee",
    water: "#b7d5f4",
    waterLine: "#8fbce8",
    road: "#ffffff",
    roadCasing: "#cbd8e8",
    rail: "#a6b6c9",
    boundary: "#879bb4",
    buildingFootprint: "#e4ebf3",
    building: "#ffffff",
    label: "#415a79",
    waterLabel: "#35618d",
    labelHalo: "#f6f9fd",
    lightIntensity: 0.42,
    flood: [63, 141, 236, 100],
    floodExtreme: [36, 101, 207, 133],
    floodOutline: [34, 96, 180, 215],
    density: [67, 119, 193],
    densityOutline: [52, 100, 169, 165],
    complaint: [38, 93, 172, 255],
    markerOutline: [255, 255, 255, 255],
    selectedOutline: [16, 37, 75, 255],
    highlightOutline: [40, 121, 227, 255],
    emphasisFill: [255, 255, 255, 80],
    priority: {
      low: [151, 193, 239, 255],
      moderate: [91, 157, 230, 255],
      elevated: [42, 111, 208, 255],
      high: [16, 57, 126, 255],
      unavailable: [139, 155, 177, 255],
    },
  },
  dark: {
    background: "#0b1423",
    ground: "#142238",
    park: "#192e42",
    water: "#0c294b",
    waterLine: "#22476e",
    road: "#2d4260",
    roadCasing: "#111f33",
    rail: "#465c78",
    boundary: "#547092",
    buildingFootprint: "#263b58",
    building: "#7f9bbf",
    label: "#d4e5fa",
    waterLabel: "#92bce8",
    labelHalo: "#101e32",
    lightIntensity: 0.56,
    flood: [63, 147, 255, 120],
    floodExtreme: [77, 159, 255, 153],
    floodOutline: [140, 196, 255, 235],
    density: [111, 169, 245],
    densityOutline: [143, 193, 255, 170],
    complaint: [166, 211, 255, 255],
    markerOutline: [10, 27, 49, 255],
    selectedOutline: [245, 250, 255, 255],
    highlightOutline: [133, 195, 255, 255],
    emphasisFill: [96, 169, 255, 55],
    priority: {
      low: [57, 104, 162, 255],
      moderate: [75, 139, 219, 255],
      elevated: [131, 190, 255, 255],
      high: [224, 242, 255, 255],
      unavailable: [118, 137, 163, 255],
    },
  },
} satisfies Record<
  Theme,
  {
    background: string;
    ground: string;
    park: string;
    water: string;
    waterLine: string;
    road: string;
    roadCasing: string;
    rail: string;
    boundary: string;
    buildingFootprint: string;
    building: string;
    label: string;
    waterLabel: string;
    labelHalo: string;
    lightIntensity: number;
    flood: [number, number, number, number];
    floodExtreme: [number, number, number, number];
    floodOutline: [number, number, number, number];
    density: [number, number, number];
    densityOutline: [number, number, number, number];
    complaint: [number, number, number, number];
    markerOutline: [number, number, number, number];
    selectedOutline: [number, number, number, number];
    highlightOutline: [number, number, number, number];
    emphasisFill: [number, number, number, number];
    priority: Record<
      "low" | "moderate" | "elevated" | "high" | "unavailable",
      [number, number, number, number]
    >;
  }
>;

// Relative sizes reinforce the legend's labeled priority bands without color.
export const PRIORITY_RADII = {
  low: 4,
  moderate: 5,
  elevated: 5.5,
  high: 6,
  unavailable: 4.5,
} as const;

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function cameraPadding(width: number) {
  // Equal space on either side keeps the visible city centered between panels.
  const horizontal = width >= 1180 ? 318 : width >= 900 ? 275 : 32;
  return { left: horizontal, right: horizontal, top: 110, bottom: 100 };
}

/**
 * Restyle the inspected Liberty layers in place, retaining sources, attribution,
 * camera, overlay controls and the user's building visibility. No alternate URL.
 */
export function applyArchitecturalStyle(
  map: Map,
  theme: Theme = "light",
): {
  buildingLayerId: string | undefined;
  labelLayerId: string | undefined;
} {
  const colors = MAP_THEMES[theme];
  const styleLayers = map.getStyle().layers;
  const buildingLayer = styleLayers.find(
    (layer) =>
      layer.type === "fill-extrusion" && layer["source-layer"] === "building",
  );
  const labelLayer = styleLayers.find(
    (layer) => layer.type === "symbol" && Boolean(layer.layout?.["text-field"]),
  );

  for (const layer of styleLayers) {
    const sourceLayer =
      "source-layer" in layer ? layer["source-layer"] : undefined;
    if (layer.type === "background") {
      map.setPaintProperty(layer.id, "background-color", colors.background);
    }
    if (layer.type === "fill") {
      const fill =
        sourceLayer === "water"
          ? colors.water
          : sourceLayer === "building"
            ? colors.buildingFootprint
            : sourceLayer === "park" || sourceLayer === "landcover"
              ? colors.park
              : colors.ground;
      map.setPaintProperty(layer.id, "fill-color", fill);
      if (layer.paint?.["fill-outline-color"] !== undefined) {
        map.setPaintProperty(layer.id, "fill-outline-color", colors.roadCasing);
      }
    }
    if (layer.type === "line") {
      const line =
        sourceLayer === "waterway"
          ? colors.waterLine
          : sourceLayer === "boundary"
            ? colors.boundary
            : /rail/.test(layer.id)
              ? colors.rail
              : /casing|outline/.test(layer.id)
                ? colors.roadCasing
                : colors.road;
      map.setPaintProperty(layer.id, "line-color", line);
    }
    if (layer.type === "symbol" && /^(poi_|airport)/.test(layer.id)) {
      // Keep street/neighborhood labels while reducing unrelated POI clutter.
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
    if (layer.type === "symbol" && layer.layout?.["text-field"]) {
      map.setPaintProperty(
        layer.id,
        "text-color",
        /water/.test(layer.id) ? colors.waterLabel : colors.label,
      );
      map.setPaintProperty(layer.id, "text-halo-color", colors.labelHalo);
      map.setPaintProperty(layer.id, "text-halo-width", 1.3);
    }
  }

  if (buildingLayer) {
    // These are the basemap's published approximate heights in meters. The
    // frontend does not infer NYC roof heights or manufacture replacements.
    map.setFilter(buildingLayer.id, [
      "all",
      ["!=", ["get", "hide_3d"], true],
      [">", ["coalesce", ["get", "render_height"], 0], 0],
    ]);
    map.setPaintProperty(
      buildingLayer.id,
      "fill-extrusion-color",
      colors.building,
    );
    map.setPaintProperty(buildingLayer.id, "fill-extrusion-opacity", 1);
    map.setPaintProperty(buildingLayer.id, "fill-extrusion-height", [
      "get",
      "render_height",
    ]);
    map.setPaintProperty(buildingLayer.id, "fill-extrusion-base", [
      "get",
      "render_min_height",
    ]);
    map.setPaintProperty(
      buildingLayer.id,
      "fill-extrusion-vertical-gradient",
      true,
    );
  }
  map.setLight({
    anchor: "map",
    color: "#ffffff",
    intensity: colors.lightIntensity,
    position: [1.35, 205, 35],
  });

  return { buildingLayerId: buildingLayer?.id, labelLayerId: labelLayer?.id };
}
