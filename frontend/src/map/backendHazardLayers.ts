import { basinIcon, complaintIcon } from "./markerAssets";
import { IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import type {
  BackendData,
  BackendFeature,
  BackendKind,
  BackendCollectionState,
} from "../backend/contracts";
import type { Theme } from "../app/theme";
import type { Coordinate } from "../types";
import type { TransitMapTooltip } from "./transitLayers";
import { MAP_THEMES } from "./presentation";
import {
  boundedPulsingIds,
  hasValidHazardPoint,
  hazardPresentation,
  type HazardPresentation,
} from "./hazards";

type Ordered = { beforeId?: string };
export interface HazardMarker {
  feature: BackendFeature;
  count: number;
  presentation: HazardPresentation;
}

/** Screen-density grouping uses a real member location; source geometry is never moved. */
export function hazardMarkers(
  features: BackendFeature[],
  collection: Pick<BackendCollectionState<BackendFeature>, "stale" | "sources">,
  selectedId: string | null | undefined,
  zoom = 16,
  nowMs = Date.now(),
): HazardMarker[] {
  const groups = new Map<string, HazardMarker>();
  const scale = (2 ** Math.max(0, Math.min(22, zoom)) * 512) / 90;
  for (const feature of features) {
    if (!hasValidHazardPoint(feature)) continue;
    const presentation = hazardPresentation(feature, collection, nowMs);
    const [lng, lat] = feature.geometry!.coordinates;
    const radians = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
    const cell =
      zoom >= 18 || selectedId === feature.id
        ? feature.id
        : `${presentation.kind}:${Math.floor(((lng + 180) / 360) * scale)}:${Math.floor(((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * scale)}`;
    const prior = groups.get(cell);
    if (prior) prior.count += 1;
    else groups.set(cell, { feature, count: 1, presentation });
  }
  return [...groups.values()];
}

const iconCache = new Map<
  string,
  { url: string; width: number; height: number; mask: false }
>();
export function hazardIcon(
  marker: HazardMarker,
  theme: Theme,
  selected: boolean,
) {
  if (marker.count === 1)
    return marker.presentation.kind === "inventory" ? basinIcon : complaintIcon;
  const { kind, state } = marker.presentation;
  const clustered = marker.count > 1;
  const key = `${theme}:${kind}:${state}:${selected}:${clustered}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const background = theme === "dark" ? "#102039" : "#FFFFFF";
  const ink = selected
    ? theme === "dark"
      ? "#FFFFFF"
      : "#10254B"
    : !clustered && state === "active_report"
      ? theme === "dark"
        ? "#FF9DA7"
        : "#A32D3B"
      : theme === "dark"
        ? "#B8CDE5"
        : "#536B89";
  const glyph = clustered
    ? ""
    : kind === "inventory" || kind === "drain"
      ? '<rect x="9" y="10" width="18" height="16" rx="2" fill="none" stroke-width="2"/><path d="M13 11v14m5-14v14m5-14v14M10 18h16" fill="none" stroke-width="1.6"/>'
      : kind === "pothole"
        ? '<path d="m8 20 4-6 7-2 8 4 1 6-7 4-8-1Z" fill="none" stroke-width="2"/><path d="m18 11-2 6 5 2-4 7M10 10l3 5m14-5-4 5M7 27l6-4m12 7-3-5" fill="none" stroke-width="1.8"/>'
        : '<path d="M18 9 28 26H8Z" fill="none" stroke-width="2"/><path d="M18 15v5m0 3v1" stroke-width="2"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><rect x="3" y="3" width="30" height="30" rx="${kind === "pothole" || clustered ? 15 : 8}" fill="${background}" stroke="${ink}" stroke-width="${selected ? 3 : 1.7}" ${state === "historical" && !clustered ? 'stroke-dasharray="3 2"' : ""}/><g stroke="${ink}">${glyph}</g></svg>`;
  const icon = {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width: 36,
    height: 36,
    mask: false as const,
  };
  iconCache.set(key, icon);
  return icon;
}

/** The single existing overlay owns these bounded layers and their picking. */
export function backendMapLayers(
  data: BackendData,
  visibility: { basins: boolean; complaints: boolean },
  selectedId: string | null | undefined,
  theme: Theme,
  beforeId: string | undefined,
  onPick: (kind: BackendKind, id: string) => void,
  onTooltip: (tip: TransitMapTooltip | null) => void,
  pulse = 0,
  zoom = 16,
): Layer[] {
  const result: Layer[] = [];
  const now = Date.now();
  const colors = MAP_THEMES[theme];
  for (const [kind, collection, visible] of [
    ["basin", data.basins, visibility.basins],
    ["incident", data.incidents, visibility.complaints],
  ] as const) {
    const markers = hazardMarkers(
      collection.features,
      collection,
      selectedId,
      zoom,
      now,
    );
    const pulsingIds = boundedPulsingIds(
      markers
        .filter((marker) => marker.count === 1)
        .map((marker) => marker.feature),
      collection,
      selectedId,
      now,
    );
    const halo = markers.filter((marker) => pulsingIds.has(marker.feature.id));
    const position = (marker: HazardMarker) =>
      marker.feature.geometry!.coordinates as Coordinate;
    const wave =
      (1 - Math.cos(Math.max(0, Math.min(1, pulse)) * Math.PI * 2)) / 2;
    const hover = (info: PickingInfo<HazardMarker>) => {
      const item = info.object;
      const feature = item?.feature;
      const source = collection.sources.find(
        (item) => item.id === feature?.properties.source.id,
      );
      onTooltip(
        item && feature
          ? {
              x: info.x,
              y: info.y,
              title:
                item.count > 1
                  ? `${item.count} source records · zoom in to inspect`
                  : feature.id,
              detail:
                item.count > 1
                  ? "Grouped nearby records · no combined condition claim"
                  : item.presentation.label,
              context: `${collection.stale ? "STALE / " : ""}LOCAL SNAPSHOT · ${feature.properties.source.id} · fetched ${source?.fetched_at ?? "unknown"}${feature.properties.layer === "incidents" ? ` · reported ${feature.properties.reported_at}${feature.properties.linked_basin ? " · nearby basin association is inferred" : ""}` : ""}`,
            }
          : null,
      );
    };
    const click = (info: PickingInfo<HazardMarker>) => {
      if (!info.object) return false;
      onPick(kind, info.object.feature.id);
      return true;
    };
    result.push(
      new ScatterplotLayer<HazardMarker, Ordered>({
        id: `swale-backend-${kind}-report-halos`,
        beforeId,
        data: halo,
        visible,
        pickable: false,
        getPosition: position,
        radiusUnits: "pixels",
        getRadius: 13 + 2 * wave,
        filled: true,
        stroked: true,
        getFillColor: [185, 60, 74, 18 + 12 * wave],
        getLineColor:
          theme === "dark" ? [255, 157, 167, 100] : [163, 45, 59, 100],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        parameters: { depthCompare: "always", depthWriteEnabled: false },
      }),
      new IconLayer<HazardMarker, Ordered>({
        id: `swale-backend-${kind}`,
        beforeId,
        data: markers,
        visible,
        pickable: true,
        opacity: collection.stale ? 0.65 : 1,
        getPosition: position,
        getIcon: (marker) =>
          hazardIcon(marker, theme, marker.feature.id === selectedId),
        getSize: (marker) =>
          marker.feature.id === selectedId
            ? 38
            : marker.count > 1
              ? 24
              : kind === "basin"
                ? 24
                : 30,
        sizeUnits: "pixels",
        updateTriggers: { getIcon: [theme, selectedId], getSize: [selectedId] },
        parameters: { depthCompare: "always", depthWriteEnabled: false },
        onHover: hover,
        onClick: click,
      }),
      new TextLayer<HazardMarker, Ordered>({
        id: `swale-backend-${kind}-cluster-counts`,
        beforeId,
        data: markers.filter((marker) => marker.count > 1),
        visible,
        pickable: false,
        getPosition: position,
        getText: (marker) => (marker.count > 99 ? "99+" : String(marker.count)),
        getColor: colors.selectedOutline,
        getSize: 10,
        sizeUnits: "pixels",
        fontWeight: 700,
        parameters: { depthCompare: "always", depthWriteEnabled: false },
      }),
    );
  }
  return result;
}
