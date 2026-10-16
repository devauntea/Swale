import {
  IconLayer,
  PathLayer,
  PolygonLayer,
  ScatterplotLayer,
} from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import type { Coordinate } from "../types";
import type { Theme } from "../app/theme";
import type {
  TransitData,
  TransitDangerZone,
  TransitEntrance,
  TransitExposure,
  TransitLayerVisibility,
  TransitStation,
} from "../backend/transitContracts";
import { MAP_THEMES } from "./presentation";
import {
  serviceColor,
  serviceTextColor,
  uniqueServices,
} from "./servicePalette";

export type TransitPickKind = "station" | "entrance" | "zone";
export interface TransitMapTooltip {
  x: number;
  y: number;
  title: string;
  detail: string;
  context: string;
}
export interface TransitMapSelection {
  stationId: string | null;
  entranceId: string | null;
  zoneId: string | null;
}
type Ordered = { beforeId?: string };
type ZonePolygon = { zone: TransitDangerZone; polygon: Coordinate[][] };

export function stationServiceIcon(station: TransitStation, theme: Theme) {
  const routes = uniqueServices(station.properties.routes);
  const columns = Math.max(1, Math.min(5, routes.length));
  const rows = Math.max(1, Math.ceil(routes.length / columns));
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  const symbols = routes
    .map((route, index) => {
      const x = (index % columns) * 24 + 12;
      const y = Math.floor(index / columns) * 24 + 12;
      const fill =
        serviceColor(route) ?? (theme === "dark" ? "#102039" : "#FFFFFF");
      const text = serviceColor(route)
        ? serviceTextColor(route)
        : theme === "dark"
          ? "#FFFFFF"
          : "#10254B";
      return `<circle cx="${x}" cy="${y}" r="10" fill="${fill}" stroke="${theme === "dark" ? "#D9E7F7" : "#10254B"}" stroke-width="1"/><text x="${x}" y="${y + 4}" text-anchor="middle" fill="${text}" font-family="system-ui,sans-serif" font-size="10" font-weight="700">${escape(route)}</text>`;
    })
    .join("");
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${columns * 24}" height="${rows * 24}" viewBox="0 0 ${columns * 24} ${rows * 24}">${symbols}</svg>`)}`,
    width: columns * 24,
    height: rows * 24,
    mask: false as const,
  };
}

function hasFinitePoint(
  feature: TransitStation | TransitEntrance | TransitExposure,
): boolean {
  const coordinates = feature.geometry?.coordinates;
  return (
    !!coordinates &&
    coordinates.length >= 2 &&
    coordinates.every(Number.isFinite) &&
    Math.abs(coordinates[0]) <= 180 &&
    Math.abs(coordinates[1]) <= 90
  );
}

function zonePolygons(features: TransitDangerZone[]): ZonePolygon[] {
  return features.flatMap((zone) =>
    !zone.geometry
      ? []
      : (zone.geometry.type === "Polygon"
          ? [zone.geometry.coordinates]
          : zone.geometry.coordinates
        ).map((polygon) => ({ zone, polygon: polygon as Coordinate[][] })),
  );
}

/** Actual validated geometry only. Dashed segments change stroke presentation, not extent. */
export function transitMapLayers(
  data: TransitData,
  visibility: TransitLayerVisibility,
  selection: TransitMapSelection,
  theme: Theme,
  beforeId: string | undefined,
  onPick: (kind: TransitPickKind, id: string) => void,
  onTooltip: (tip: TransitMapTooltip | null) => void,
): Layer[] {
  const colors = MAP_THEMES[theme];
  const layers: Layer[] = [];
  const hover = <T>(
    info: PickingInfo<T>,
    text: (item: T) => Omit<TransitMapTooltip, "x" | "y">,
  ) =>
    onTooltip(
      info.object ? { x: info.x, y: info.y, ...text(info.object) } : null,
    );
  const zones = zonePolygons(data.zones.features);
  layers.push(
    new PolygonLayer<ZonePolygon, Ordered>({
      id: "swale-transit-danger-zones",
      beforeId,
      data: zones,
      visible: visibility.zones,
      opacity: data.zones.stale ? 0.55 : 1,
      pickable: true,
      getPolygon: (item) => item.polygon,
      filled: true,
      stroked: true,
      getFillColor: (item) =>
        [
          ...colors.flood.slice(0, 3),
          item.zone.properties.level === "high" ? 90 : 48,
        ] as [number, number, number, number],
      getLineColor: colors.floodOutline,
      getLineWidth: (item) =>
        item.zone.id === selection.zoneId
          ? 4
          : item.zone.properties.level === "high"
            ? 2
            : 1,
      lineWidthUnits: "pixels",
      updateTriggers: { getLineWidth: [selection.zoneId] },
      parameters: { depthWriteEnabled: false },
      onHover: (info) =>
        hover(info, (item) => ({
          title: item.zone.id,
          detail: `${item.zone.properties.level} · ${item.zone.properties.zone_type}`,
          context:
            item.zone.properties.zone_type === "measured"
              ? "Derived 250 ft sensor buffer · not measured flood extent"
              : "MODELED / DEP · scenario footprint, not present water",
        })),
      onClick: (info) => {
        if (!info.object) return false;
        onPick("zone", info.object.zone.id);
        return true;
      },
    }),
  );
  const sensorSegments = zones
    .filter((z) => z.zone.properties.zone_type === "measured")
    .flatMap((z) =>
      z.polygon.flatMap((ring) =>
        ring.flatMap((point, index) =>
          index % 2 === 0 && ring[index + 1]
            ? [{ zone: z.zone, path: [point, ring[index + 1]] }]
            : [],
        ),
      ),
    );
  layers.push(
    new PathLayer<{ zone: TransitDangerZone; path: Coordinate[] }, Ordered>({
      id: "swale-transit-derived-buffer-outline",
      beforeId,
      data: sensorSegments,
      visible: visibility.zones,
      opacity: data.zones.stale ? 0.55 : 1,
      getPath: (item) => item.path,
      getColor: colors.selectedOutline,
      getWidth: 2,
      widthUnits: "pixels",
      pickable: false,
      parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
  );
  const knownStationIds = new Set(
    data.stations.features.map((station) => station.id),
  );
  const pushExposureLayer = (pickable: boolean) =>
    layers.push(
      new IconLayer<TransitExposure, Ordered>({
        id: pickable
          ? "swale-transit-inferred-exposure"
          : "swale-transit-inferred-exposure-context",
        beforeId,
        data: data.exposures.features.filter(
          (f) =>
            hasFinitePoint(f) &&
            knownStationIds.has(f.properties.station_id) === pickable,
        ),
        visible: visibility.exposure,
        opacity: data.exposures.stale ? 0.55 : 1,
        pickable,
        getPosition: (f) => f.geometry!.coordinates as Coordinate,
        getIcon: () => ({
          url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="rgb(${colors.highlightOutline.slice(0, 3).join(",")})" stroke-width="3" stroke-dasharray="5 4"/></svg>`)}`,
          width: 48,
          height: 48,
          mask: false,
        }),
        getSize: (f) =>
          f.properties.tier === "high"
            ? 38
            : f.properties.tier === "medium"
              ? 32
              : 28,
        updateTriggers: { getIcon: [theme] },
        parameters: { depthCompare: "always", depthWriteEnabled: false },
        onHover: (info) =>
          hover(info, (f) => ({
            title: f.properties.name,
            detail: `Inferred exposure ${f.properties.score} · ${f.properties.tier}`,
            context: `${f.properties.method_version} · assessed ${f.properties.assessed_at} · not calibrated flood probability`,
          })),
        onClick: (info) => {
          if (!pickable || !info.object) return false;
          onPick("station", info.object.properties.station_id);
          return true;
        },
      }),
    );
  pushExposureLayer(true);
  pushExposureLayer(false);
  layers.push(
    new ScatterplotLayer<TransitEntrance, Ordered>({
      id: "swale-transit-entrances",
      beforeId,
      data: data.entrances.features.filter(hasFinitePoint),
      visible: visibility.entrances,
      opacity: data.entrances.stale ? 0.55 : 1,
      pickable: true,
      getPosition: (f) => f.geometry!.coordinates as Coordinate,
      radiusUnits: "pixels",
      getRadius: (f) =>
        f.id === selection.entranceId
          ? 7
          : f.properties.station_id === selection.stationId
            ? 5
            : 3,
      filled: true,
      stroked: true,
      getFillColor: colors.markerOutline,
      getLineColor: colors.highlightOutline,
      getLineWidth: 2,
      lineWidthUnits: "pixels",
      updateTriggers: {
        getRadius: [selection.entranceId, selection.stationId],
      },
      parameters: { depthCompare: "always", depthWriteEnabled: false },
      onHover: (info) =>
        hover(info, (f) => ({
          title: f.id,
          detail: `${f.properties.station_name} · ${f.properties.entrance_type ?? "Entrance type unavailable"}`,
          context:
            "OBSERVED / MTA 2024 entrance inventory · no flood barrier/elevation data",
        })),
      onClick: (info) => {
        if (!info.object) return false;
        onPick("entrance", info.object.id);
        return true;
      },
    }),
  );
  layers.push(
    new ScatterplotLayer<TransitStation, Ordered>({
      id: "swale-transit-stations",
      beforeId,
      data: data.stations.features.filter(hasFinitePoint),
      visible: visibility.stations,
      opacity: data.stations.stale ? 0.55 : 1,
      pickable: true,
      getPosition: (f) => f.geometry!.coordinates as Coordinate,
      radiusUnits: "pixels",
      getRadius: (f) => (f.id === selection.stationId ? 11 : 8),
      filled: true,
      stroked: true,
      getFillColor: colors.highlightOutline,
      getLineColor: (f) =>
        f.id === selection.stationId
          ? colors.selectedOutline
          : colors.markerOutline,
      getLineWidth: 2,
      lineWidthUnits: "pixels",
      updateTriggers: {
        getRadius: [selection.stationId],
        getLineColor: [selection.stationId, theme],
      },
      parameters: { depthCompare: "always", depthWriteEnabled: false },
      onHover: (info) =>
        hover(info, (f) => ({
          title: f.properties.name,
          detail: `${f.properties.routes.join(" / ")} · ${f.properties.structure ?? "Structure unknown"}`,
          context:
            "OBSERVED / MTA inventory · service status and inferred exposure shown separately",
        })),
      onClick: (info) => {
        if (!info.object) return false;
        onPick("station", info.object.id);
        return true;
      },
    }),
  );
  layers.push(
    new IconLayer<TransitStation, Ordered>({
      id: "swale-transit-service-badges",
      beforeId,
      data: data.stations.features.filter(hasFinitePoint),
      visible: visibility.stations,
      pickable: false,
      getPosition: (station) => station.geometry!.coordinates as Coordinate,
      getIcon: (station) => stationServiceIcon(station, theme),
      getSize: (station) =>
        Math.max(
          1,
          Math.ceil(uniqueServices(station.properties.routes).length / 5),
        ) * 22,
      getPixelOffset: [0, 24],
      sizeUnits: "pixels",
      updateTriggers: { getIcon: [theme] },
      parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
  );
  return layers;
}
