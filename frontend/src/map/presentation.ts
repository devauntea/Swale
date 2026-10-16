import type { Map } from "maplibre-gl";

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Verified Gowanus label point from the permitted OpenFreeMap place layer.
// This is a display focus, not an administrative neighborhood boundary.
export const HOME_CAMERA = {
  center: [-73.98850500583649, 40.6791694136038] as [number, number],
  zoom: 15.5,
  pitch: 59,
  bearing: -25,
};

export const PRIORITY_COLORS = {
  low: [93, 170, 161, 255],
  moderate: [236, 191, 84, 255],
  elevated: [229, 139, 75, 255],
  high: [219, 91, 83, 255],
  unavailable: [137, 148, 151, 255],
} satisfies Record<string, [number, number, number, number]>;

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function cameraPadding(width: number) {
  // Equal space on either side keeps the visible city centered between panels.
  const horizontal = width >= 1180 ? 318 : width >= 900 ? 275 : 32;
  return { left: horizontal, right: horizontal, top: 110, bottom: 100 };
}

/** Restyle the inspected Liberty layers without substituting other map data. */
export function applyArchitecturalStyle(map: Map): {
  buildingLayerId: string | undefined;
  labelLayerId: string | undefined;
} {
  const styleLayers = map.getStyle().layers;
  const buildingLayer = styleLayers.find(
    (layer) =>
      layer.type === "fill-extrusion" && layer["source-layer"] === "building",
  );
  const labelLayer = styleLayers.find(
    (layer) => layer.type === "symbol" && Boolean(layer.layout?.["text-field"]),
  );

  for (const layer of styleLayers) {
    if (layer.type === "background") {
      map.setPaintProperty(layer.id, "background-color", "#e9ebe5");
    }
    if (layer.type === "fill" && layer["source-layer"] === "water") {
      map.setPaintProperty(layer.id, "fill-color", "#aac8ce");
    }
    if (
      layer.type === "fill" &&
      /^(park|landcover_wood|landcover_grass)$/.test(layer.id)
    ) {
      map.setPaintProperty(layer.id, "fill-color", "#d6dfcc");
    }
    if (layer.type === "fill" && layer["source-layer"] === "building") {
      map.setPaintProperty(layer.id, "fill-color", "#e9e9e1");
    }
    if (layer.type === "symbol" && /^(poi_|airport)/.test(layer.id)) {
      // Keep street/neighborhood labels while reducing unrelated POI clutter.
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
    if (
      layer.type === "symbol" &&
      /^(highway-name|label_other)/.test(layer.id)
    ) {
      map.setPaintProperty(layer.id, "text-color", "#677371");
      map.setPaintProperty(layer.id, "text-halo-color", "#f6f5ef");
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
    map.setPaintProperty(buildingLayer.id, "fill-extrusion-color", "#f7f6ed");
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
    intensity: 0.42,
    position: [1.35, 205, 35],
  });

  return { buildingLayerId: buildingLayer?.id, labelLayerId: labelLayer?.id };
}
