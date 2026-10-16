import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Map, AttributionControl, setWorkerUrl } from "maplibre-gl";
import type { ErrorEvent as MapErrorEvent } from "maplibre-gl";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  CameraRequest,
  CatchBasin,
  ComplaintDensityCell,
  Coordinate,
  DemoSnapshot,
  DrainageComplaint,
  FloodZoneFeature,
  LayerVisibility,
  ScenarioId,
} from "../types";
import {
  applyArchitecturalStyle,
  BASEMAP_STYLE,
  cameraPadding,
  HOME_CAMERA,
  prefersReducedMotion,
  MAP_THEMES,
  PRIORITY_RADII,
} from "./presentation";

import type { Theme } from "../app/theme";
import { installLocalBasemapGlyphs } from "./spriteFallbacks";
import type {
  BackendBbox,
  BackendData,
  BackendFeature,
  BackendKind,
} from "../backend/contracts";
import type {
  TransitData,
  TransitLayerVisibility,
} from "../backend/transitContracts";
import {
  transitMapLayers,
  type TransitMapSelection,
  type TransitPickKind,
} from "./transitLayers";

export type TransitCameraRequest = { nonce: number } & (
  | { kind: "focus"; position: Coordinate }
  | { kind: "fit"; positions: Coordinate[] }
  | { kind: "overview" }
);

setWorkerUrl(workerUrl);

export interface SwaleMapProps {
  transit?: TransitData | null;
  transitLayers?: TransitLayerVisibility;
  transitSelection?: TransitMapSelection;
  transitCamera?: TransitCameraRequest | null;
  onSelectTransit?: (kind: TransitPickKind, id: string) => void;
  backend?: BackendData | null;
  backendSelectedId?: string | null;
  backendFocus?: { position: Coordinate; nonce: number } | null;
  onSelectBackend?: (kind: BackendKind, id: string) => void;
  onViewportChange?: (bbox: BackendBbox) => void;
  theme: Theme;
  snapshot: DemoSnapshot;
  scenarioId: ScenarioId;
  layers: LayerVisibility;
  selectedBasinId: string | null;
  highlightedIds: string[];
  cameraRequest: CameraRequest | null;
  onSelectBasin: (id: string) => void;
  onSelectComplaint?: (id: string) => void;
  onReady?: (ready: boolean) => void;
}

interface Tooltip {
  x: number;
  y: number;
  title: string;
  detail: string;
  context: string;
}

interface FloodPolygon {
  zone: FloodZoneFeature;
  polygon: Coordinate[][];
}

// Overlay-specific ordering is an extra prop on the stock deck.gl layers.
interface InterleavedLayerProps {
  beforeId?: string;
}

function floodPolygons(
  zones: FloodZoneFeature[],
  scenarioId: ScenarioId,
): FloodPolygon[] {
  return zones
    .filter((zone) => zone.properties.scenarioId === scenarioId)
    .flatMap((zone) => {
      const polygons =
        zone.geometry.type === "Polygon"
          ? [zone.geometry.coordinates]
          : zone.geometry.coordinates;
      return polygons.map((polygon) => ({ zone, polygon }));
    });
}

function shortDate(instant: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(instant));
}

export function SwaleMap(props: SwaleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const overlayRef = useRef<MapLibreOverlay | null>(null);
  const glyphsRef = useRef<ReturnType<typeof installLocalBasemapGlyphs> | null>(
    null,
  );
  const propsRef = useRef(props);
  const buildingLayerRef = useRef<string | undefined>(undefined);
  const labelLayerRef = useRef<string | undefined>(undefined);
  const lastCameraRequestRef = useRef(0);
  const lastBackendFocusRef = useRef(0);
  const lastTransitCameraRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [pitched, setPitched] = useState(true);
  const [retry, setRetry] = useState(0);
  const {
    snapshot,
    scenarioId,
    layers,
    selectedBasinId,
    highlightedIds,
    theme,
  } = props;
  useLayoutEffect(() => {
    // Map callbacks must observe the latest committed UI, never a pending render.
    propsRef.current = props;
  }, [props]);
  const backendMode = props.transit
    ? "transit"
    : props.backend
      ? "snapshot"
      : "fixture";
  useLayoutEffect(() => {
    // A mode transition cannot finish a navigation started in the other mode.
    // stop() retains the current camera; it neither resets nor reconstructs it.
    mapRef.current?.stop();
    setTooltip(null);
  }, [backendMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let currentMap: Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let onContextLost: ((event: Event) => void) | null = null;
    // Nonce zero is the initial overview placeholder. Keep the architectural
    // home view on first load; replay a genuine pending command after retry.
    lastCameraRequestRef.current = 0;
    setReady(false);
    setPitched(HOME_CAMERA.pitch > 10);
    setTooltip(null);
    setError(null);
    setWarning(null);
    propsRef.current.onReady?.(false);
    const loadingTimeout = window.setTimeout(() => {
      if (!disposed && !currentMap?.loaded()) {
        setError(
          "The basemap could not finish loading. Check the connection and retry.",
        );
      }
    }, 25_000);

    try {
      const map = new Map({
        container,
        style: BASEMAP_STYLE,
        ...HOME_CAMERA,
        minZoom: 11,
        maxZoom: 18.5,
        maxPitch: 70,
        maxBounds: [
          [-74.075, 40.53],
          [-73.79, 40.79],
        ],
        canvasContextAttributes: { antialias: true },
        attributionControl: false,
        refreshExpiredTiles: false,
      });
      currentMap = map;
      mapRef.current = map;
      // Resolve only the seven audited Liberty class gaps before first tile layout.
      glyphsRef.current = installLocalBasemapGlyphs(
        map,
        () => propsRef.current.theme,
      );
      map.on("styleimagemissing", ({ id }) => {
        if (!disposed)
          setWarning(
            `A basemap symbol is unavailable (${id}). Other map layers remain usable.`,
          );
      });
      map.addControl(
        new AttributionControl({ compact: false }),
        "bottom-right",
      );
      map
        .getCanvas()
        .setAttribute(
          "aria-label",
          "Interactive Brooklyn map. Drag to pan; use the map controls to zoom and change perspective.",
        );
      map.getCanvas().setAttribute("data-testid", "brooklyn-map-canvas");

      const onError = (event: MapErrorEvent) => {
        if (disposed) return;
        const message =
          event.error?.message ?? "A map resource could not load.";
        if (!map.isStyleLoaded() && !overlayRef.current) {
          setError(`Basemap unavailable. ${message}`);
        } else {
          setWarning(
            "A basemap resource could not load. Some map detail may be unavailable.",
          );
        }
      };
      map.on("error", onError);
      onContextLost = (event: Event) => {
        event.preventDefault();
        if (disposed) return;
        setReady(false);
        setError(
          "The browser lost its WebGL map context. Retry to restore the map.",
        );
        propsRef.current.onReady?.(false);
      };
      map.getCanvas().addEventListener("webglcontextlost", onContextLost);

      map.once("load", () => {
        if (disposed) return;
        try {
          const style = applyArchitecturalStyle(map, propsRef.current.theme);
          buildingLayerRef.current = style.buildingLayerId;
          labelLayerRef.current = style.labelLayerId;
          if (!style.buildingLayerId) {
            setWarning(
              "The current basemap does not provide compatible 3D buildings.",
            );
          }
          const overlay = new MapLibreOverlay({
            interleaved: true,
            layers: [],
            onError: () => {
              if (!disposed) {
                setReady(false);
                setError(
                  "The geographic demonstration layers could not render. Retry the map.",
                );
                propsRef.current.onReady?.(false);
              }
            },
          });
          map.addControl(overlay);
          overlayRef.current = overlay;
          map.setPadding(cameraPadding(container.clientWidth));
          window.clearTimeout(loadingTimeout);
          setError(null);
          setReady(true);
          propsRef.current.onReady?.(true);
          const bounds = map.getBounds();
          propsRef.current.onViewportChange?.([
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth(),
          ]);
          if (import.meta.env.DEV) performance.mark("swale-map-ready");
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The map rendering layers could not initialize.",
          );
        }
      });

      map.on("moveend", () => {
        if (!disposed) {
          setPitched(map.getPitch() > 10);
          const bounds = map.getBounds();
          propsRef.current.onViewportChange?.([
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth(),
          ]);
        }
      });
      map.on("mouseout", () => setTooltip(null));
      resizeObserver = new ResizeObserver(() => {
        if (!disposed) {
          map.resize();
          if (map.isStyleLoaded())
            map.setPadding(cameraPadding(container.clientWidth));
        }
      });
      resizeObserver.observe(container);
    } catch (cause) {
      window.clearTimeout(loadingTimeout);
      setError(
        cause instanceof Error
          ? `The 3D map could not start. ${cause.message}`
          : "The 3D map requires a browser with WebGL2 enabled.",
      );
    }

    return () => {
      disposed = true;
      window.clearTimeout(loadingTimeout);
      resizeObserver?.disconnect();
      if (onContextLost && currentMap) {
        currentMap
          .getCanvas()
          .removeEventListener("webglcontextlost", onContextLost);
      }
      overlayRef.current?.finalize();
      overlayRef.current = null;
      glyphsRef.current?.dispose();
      glyphsRef.current = null;
      currentMap?.remove();
      mapRef.current = null;
      buildingLayerRef.current = undefined;
      labelLayerRef.current = undefined;
      propsRef.current.onReady?.(false);
    };
  }, [retry]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!ready || !map || !overlay) return;

    const colors = MAP_THEMES[theme];
    if (props.transit && props.transitLayers && props.transitSelection) {
      overlay.setProps({
        layers: transitMapLayers(
          props.transit,
          props.transitLayers,
          props.transitSelection,
          theme,
          labelLayerRef.current,
          (kind, id) => {
            if (propsRef.current.transit)
              propsRef.current.onSelectTransit?.(kind, id);
          },
          setTooltip,
        ),
      });
      if (buildingLayerRef.current)
        map.setLayoutProperty(
          buildingLayerRef.current,
          "visibility",
          layers.buildings ? "visible" : "none",
        );
      setTooltip(null);
      return;
    }
    if (props.backend) {
      const data = props.backend;
      const selectedId = props.backendSelectedId;
      const backendLayers: Layer[] = [];
      for (const [kind, collection, visible] of [
        ["basin", data.basins, layers.basins],
        ["incident", data.incidents, layers.complaints],
      ] as const) {
        const features: BackendFeature[] = collection.features.filter(
          (feature) => feature.geometry !== null,
        );
        backendLayers.push(
          new ScatterplotLayer<BackendFeature, InterleavedLayerProps>({
            id: `swale-backend-${kind}`,
            data: features,
            beforeId: labelLayerRef.current,
            visible,
            pickable: true,
            getPosition: (feature) =>
              feature.geometry!.coordinates as Coordinate,
            radiusUnits: "pixels",
            getRadius: (feature) =>
              feature.id === selectedId ? 7 : kind === "basin" ? 3.8 : 5.2,
            filled: kind === "basin",
            stroked: true,
            opacity: collection.stale ? 0.55 : 1,
            getFillColor: collection.stale
              ? colors.priority.unavailable
              : colors.highlightOutline,
            getLineColor: (feature) =>
              feature.id === selectedId
                ? colors.selectedOutline
                : kind === "basin"
                  ? colors.markerOutline
                  : collection.stale
                    ? colors.priority.unavailable
                    : colors.complaint,
            getLineWidth: (feature) =>
              feature.id === selectedId ? 2.8 : kind === "basin" ? 1 : 2,
            lineWidthUnits: "pixels",
            parameters: { depthCompare: "always", depthWriteEnabled: false },
            updateTriggers: {
              getLineColor: [theme, selectedId, collection.stale],
              getLineWidth: [selectedId],
              getRadius: [selectedId],
            },
            onHover: (info) => {
              if (!propsRef.current.backend) return;
              const feature = info.object;
              const fetched = collection.sources.find(
                (source) => source.id === feature?.properties.source.id,
              )?.fetched_at;
              setTooltip(
                feature
                  ? {
                      x: info.x,
                      y: info.y,
                      title: feature.id,
                      detail:
                        feature.properties.layer === "catch_basins"
                          ? "Observed inventory · condition unavailable"
                          : `${feature.properties.category_label} · reported ${feature.properties.reported_at}`,
                      context: `${collection.stale ? "STALE / " : ""}LOCAL SNAPSHOT · ${feature.properties.source.id} · fetched ${fetched ?? "unknown"}`,
                    }
                  : null,
              );
            },
            onClick: (info) => {
              if (!propsRef.current.backend || !info.object) return false;
              propsRef.current.onSelectBackend?.(kind, info.object.id);
              return true;
            },
          }),
        );
      }
      if (buildingLayerRef.current)
        map.setLayoutProperty(
          buildingLayerRef.current,
          "visibility",
          layers.buildings ? "visible" : "none",
        );
      overlay.setProps({ layers: backendLayers });
      setTooltip(null);
      return;
    }
    const knownIds = new Set(snapshot.basins.map((basin) => basin.id));
    const highlighted = new Set(
      highlightedIds.filter((id) => knownIds.has(id)),
    );
    const labelBeforeId = labelLayerRef.current;
    const surfaceBeforeId = buildingLayerRef.current ?? labelBeforeId;
    const pickTooltip = <T,>(
      info: PickingInfo<T>,
      text: (item: T) => Omit<Tooltip, "x" | "y">,
    ) => {
      setTooltip(
        info.object ? { x: info.x, y: info.y, ...text(info.object) } : null,
      );
    };
    const nextLayers: Layer[] = [];

    nextLayers.push(
      new PolygonLayer<FloodPolygon, InterleavedLayerProps>({
        id: "swale-demo-flood-zones",
        data: floodPolygons(snapshot.floodZones, scenarioId),
        visible: layers.floodZones,
        beforeId: surfaceBeforeId,
        pickable: true,
        getPolygon: (item) => item.polygon,
        filled: true,
        stroked: true,
        getFillColor:
          scenarioId === "extreme_2080" ? colors.floodExtreme : colors.flood,
        getLineColor: colors.floodOutline,
        getLineWidth: 1.1,
        lineWidthUnits: "pixels",
        parameters: { depthWriteEnabled: false },
        onHover: (info) =>
          pickTooltip(info, (item) => ({
            title: item.zone.properties.label,
            detail: "Illustrative scenario geometry",
            context: "DEMO / SCENARIO · not official DEP polygons",
          })),
      }),
    );

    nextLayers.push(
      new PolygonLayer<ComplaintDensityCell, InterleavedLayerProps>({
        id: "swale-demo-complaint-density",
        data: snapshot.densityCells,
        visible: layers.complaints,
        beforeId: surfaceBeforeId,
        pickable: true,
        getPolygon: (cell) => cell.geometry.coordinates,
        filled: true,
        stroked: true,
        getFillColor: (cell) => [
          ...colors.density,
          Math.min(theme === "dark" ? 125 : 105, 30 + cell.count * 3),
        ],
        getLineColor: colors.densityOutline,
        updateTriggers: { getFillColor: [theme, snapshot.version] },
        getLineWidth: 0.8,
        lineWidthUnits: "pixels",
        parameters: { depthWriteEnabled: false },
        onHover: (info) =>
          pickTooltip(info, (cell) => ({
            title: `${cell.count} example reports`,
            detail: cell.windowLabel,
            context: "DEMO / HISTORICAL · local fixture density",
          })),
      }),
    );

    nextLayers.push(
      new ScatterplotLayer<DrainageComplaint, InterleavedLayerProps>({
        id: "swale-demo-recent-complaints",
        data: snapshot.complaints.filter((complaint) => complaint.recent),
        visible: layers.complaints,
        beforeId: labelBeforeId,
        pickable: true,
        getPosition: (complaint) => complaint.position,
        radiusUnits: "pixels",
        getRadius: 3.5,
        stroked: true,
        getFillColor: colors.complaint,
        getLineColor: colors.markerOutline,
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        parameters: { depthCompare: "always", depthWriteEnabled: false },
        onHover: (info) =>
          pickTooltip(info, (complaint) => ({
            title: complaint.descriptor,
            detail: `${complaint.focusArea} · ${shortDate(complaint.createdAt)}`,
            context: "DEMO / HISTORICAL · local complaint example",
          })),
        onClick: (info) => {
          if (
            !propsRef.current.backend &&
            info.object &&
            snapshot.complaints.some(
              (complaint) => complaint.id === info.object?.id,
            )
          ) {
            propsRef.current.onSelectComplaint?.(info.object.id);
            return true;
          }
          return false;
        },
      }),
    );

    nextLayers.push(
      new ScatterplotLayer<CatchBasin, InterleavedLayerProps>({
        id: "swale-demo-basin-emphasis",
        data: snapshot.basins.filter(
          (basin) => basin.id === selectedBasinId || highlighted.has(basin.id),
        ),
        visible: layers.basins,
        beforeId: labelBeforeId,
        pickable: false,
        getPosition: (basin) => basin.position,
        radiusUnits: "pixels",
        getRadius: (basin) => (basin.id === selectedBasinId ? 13 : 11),
        filled: true,
        stroked: true,
        getFillColor: colors.emphasisFill,
        getLineColor: (basin) =>
          basin.id === selectedBasinId
            ? colors.selectedOutline
            : colors.highlightOutline,
        getLineWidth: 1.8,
        lineWidthUnits: "pixels",
        parameters: { depthCompare: "always", depthWriteEnabled: false },
      }),
    );

    nextLayers.push(
      new ScatterplotLayer<CatchBasin, InterleavedLayerProps>({
        id: "swale-demo-catch-basins",
        data: snapshot.basins,
        visible: layers.basins,
        beforeId: labelBeforeId,
        pickable: true,
        getPosition: (basin) => basin.position,
        radiusUnits: "pixels",
        getRadius: (basin) =>
          basin.id === selectedBasinId
            ? 7.5
            : highlighted.has(basin.id)
              ? 6.5
              : PRIORITY_RADII[basin.priorities[scenarioId].band],
        stroked: true,
        getFillColor: (basin) =>
          colors.priority[basin.priorities[scenarioId].band],
        getLineColor: colors.markerOutline,
        getLineWidth: 1.6,
        lineWidthUnits: "pixels",
        parameters: { depthCompare: "always", depthWriteEnabled: false },
        updateTriggers: {
          getFillColor: [scenarioId, snapshot.version, theme],
          getRadius: [
            selectedBasinId,
            highlightedIds,
            scenarioId,
            snapshot.version,
          ],
        },
        onHover: (info) =>
          pickTooltip(info, (basin) => {
            const priority = basin.priorities[scenarioId];
            return {
              title: basin.id,
              detail:
                priority.score === null
                  ? "Example priority unavailable"
                  : `${priority.score} / 100 · ${priority.band} example priority`,
              context: "DEMO · Inspection priority (heuristic, not validated)",
            };
          }),
        onClick: (info) => {
          if (
            !propsRef.current.backend &&
            info.object &&
            knownIds.has(info.object.id)
          ) {
            propsRef.current.onSelectBasin(info.object.id);
            return true;
          }
          return false;
        },
      }),
    );

    if (buildingLayerRef.current) {
      map.setLayoutProperty(
        buildingLayerRef.current,
        "visibility",
        layers.buildings ? "visible" : "none",
      );
    }
    // Neither this update nor any panel render reconstructs the map or camera.
    overlay.setProps({ layers: nextLayers });
    setTooltip(null);
    if (import.meta.env.DEV)
      performance.mark(`swale-scenario-${scenarioId}-submitted`);
  }, [
    ready,
    snapshot,
    scenarioId,
    layers,
    selectedBasinId,
    highlightedIds,
    theme,
    props.backend,
    props.backendSelectedId,
    props.transit,
    props.transitLayers,
    props.transitSelection,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    // Only paint/light changes: no map reconstruction, camera move or setStyle.
    applyArchitecturalStyle(map, props.theme);
    glyphsRef.current?.updateTheme(props.theme);
  }, [ready, props.theme]);

  useEffect(() => {
    const map = mapRef.current;
    const request = props.cameraRequest;
    if (
      !ready ||
      !map ||
      !request ||
      request.nonce === lastCameraRequestRef.current
    )
      return;
    const target = props.snapshot.targets.find(
      (item) => item.id === request.targetId,
    );
    const basin = props.snapshot.basins.find(
      (item) => item.id === request.targetId,
    );
    if (!target && !basin) return;
    lastCameraRequestRef.current = request.nonce;
    map.flyTo({
      center: target?.position ?? basin!.position,
      zoom: target?.zoom ?? 16.2,
      pitch: target?.pitch ?? 59,
      bearing: target?.bearing ?? map.getBearing(),
      duration: prefersReducedMotion() ? 0 : 1350,
      essential: false,
    });
    setTooltip(null);
  }, [ready, props.cameraRequest, props.snapshot]);

  useEffect(() => {
    const request = props.backendFocus;
    const map = mapRef.current;
    if (
      !ready ||
      !map ||
      !props.backend ||
      !request ||
      request.nonce === lastBackendFocusRef.current
    )
      return;
    lastBackendFocusRef.current = request.nonce;
    map.flyTo({
      center: request.position,
      zoom: 16.2,
      duration: prefersReducedMotion() ? 0 : 900,
      essential: false,
    });
    setTooltip(null);
  }, [ready, props.backend, props.backendFocus]);

  useEffect(() => {
    const map = mapRef.current;
    const request = props.transitCamera;
    if (
      !ready ||
      !map ||
      !props.transit ||
      !request ||
      request.nonce === lastTransitCameraRef.current
    )
      return;
    lastTransitCameraRef.current = request.nonce;
    const duration = prefersReducedMotion() ? 0 : 900;
    if (request.kind === "overview") {
      map.flyTo({
        ...HOME_CAMERA,
        padding: cameraPadding(map.getContainer().clientWidth),
        duration,
        essential: false,
      });
    } else if (request.kind === "focus") {
      map.flyTo({
        center: request.position,
        zoom: 16.6,
        padding: cameraPadding(map.getContainer().clientWidth),
        duration,
        essential: false,
      });
    } else if (request.positions.length) {
      const lons = request.positions.map((p) => p[0]);
      const lats = request.positions.map((p) => p[1]);
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        {
          padding: cameraPadding(map.getContainer().clientWidth),
          maxZoom: 17.5,
          bearing: map.getBearing(),
          pitch: map.getPitch(),
          duration,
          essential: false,
        },
      );
    }
    setTooltip(null);
  }, [ready, props.transit, props.transitCamera]);

  const animate = (operation: (map: Map, duration: number) => void) => {
    if (mapRef.current && ready)
      operation(mapRef.current, prefersReducedMotion() ? 0 : 650);
  };

  return (
    <section
      className="map-stage"
      aria-label="Brooklyn planning map"
      data-map-ready={ready}
    >
      <div ref={containerRef} className="map-canvas" />
      {!ready && !error && (
        <div className="map-status" role="status">
          <span className="loading-orbit" aria-hidden="true" />
          <strong>Preparing the city model</strong>
          <span>Loading the approved OpenFreeMap basemap</span>
        </div>
      )}
      {error && (
        <div className="map-status map-status-error" role="alert">
          <strong>Map rendering unavailable</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Retry map
          </button>
        </div>
      )}
      {warning && !error && (
        <div className="map-resource-warning" role="status">
          {warning}
        </div>
      )}
      <div className="map-controls" aria-label="Map controls">
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={!ready}
          onClick={() => animate((map, duration) => map.zoomIn({ duration }))}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={!ready}
          onClick={() => animate((map, duration) => map.zoomOut({ duration }))}
        >
          −
        </button>
        <span className="map-control-divider" />
        <button
          type="button"
          className="map-compass"
          aria-label="Reset bearing to north"
          title="Reset north"
          disabled={!ready}
          onClick={() =>
            animate((map, duration) => map.easeTo({ bearing: 0, duration }))
          }
        >
          <span aria-hidden="true">↑</span>
          <small>N</small>
        </button>
        <button
          type="button"
          aria-label={pitched ? "Switch to 2D map" : "Switch to 3D map"}
          title={pitched ? "Switch to 2D" : "Switch to 3D"}
          aria-pressed={pitched}
          disabled={!ready}
          onClick={() =>
            animate((map, duration) =>
              map.easeTo({ pitch: pitched ? 0 : 59, duration }),
            )
          }
        >
          {pitched ? "2D" : "3D"}
        </button>
        <button
          type="button"
          aria-label="Return to Brooklyn overview"
          title="Brooklyn overview"
          disabled={!ready}
          onClick={() =>
            animate((map, duration) =>
              map.flyTo({
                ...HOME_CAMERA,
                duration: duration === 0 ? 0 : 1200,
              }),
            )
          }
        >
          <span aria-hidden="true">⌖</span>
        </button>
      </div>
      {tooltip && ready && !error && (
        <div
          className="map-tooltip"
          role="tooltip"
          style={{
            left: `clamp(0px, ${tooltip.x + 16}px, calc(100% - 265px))`,
            top: Math.max(80, tooltip.y - 88),
          }}
        >
          <strong>{tooltip.title}</strong>
          <span>{tooltip.detail}</span>
          <small>{tooltip.context}</small>
        </div>
      )}
      <div className="map-building-note">
        STATIC · OpenFreeMap / OSM · approximate building heights · source time
        unknown
      </div>
    </section>
  );
}

export default SwaleMap;
