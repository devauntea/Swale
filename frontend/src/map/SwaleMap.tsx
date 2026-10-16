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
import type {
  InfrastructureCameraRequest,
  InfrastructureMapState,
} from "../infrastructure/contracts";
import { backendMapLayers } from "./backendHazardLayers";
import { useHazardPulse } from "./useHazardPulse";
import { boundedPulsingIds } from "./hazards";
import type { ProjectedMascotTarget } from "../contextual/MascotCarry";
import { visibleMascotAnchor } from "../contextual/screenAnchor";

const MASCOT_OCCLUSIONS = [
  ".control-sidebar",
  ".viewing-modes",
  ".assistant-panel",
  ".basin-inspector",
  ".map-controls",
  ".map-legend",
  ".workspace-topbar",
  ".workspace-footer > *",
  ".entrance-map-badge",
  ".map-building-note",
  ".workspace-banner",
  ".map-resource-warning",
  ".sources-panel",
  ".complaint-detail",
  ".assistant-launcher",
].join(",");

type InfrastructureRenderer = typeof import("./infrastructureLayers");
interface SavedInfrastructureCamera {
  center: Coordinate;
  zoom: number;
  pitch: number;
  bearing: number;
  padding: ReturnType<Map["getPadding"]>;
  elevation: number;
  centerClampedToGround: boolean;
}

function captureMapCamera(map: Map): SavedInfrastructureCamera {
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    padding: { ...map.getPadding() },
    elevation:
      typeof map.getCenterElevation === "function"
        ? map.getCenterElevation()
        : 0,
    centerClampedToGround:
      typeof map.getCenterClampedToGround === "function"
        ? map.getCenterClampedToGround()
        : true,
  };
}

export type TransitCameraRequest = { nonce: number } & (
  | { kind: "focus"; position: Coordinate }
  | { kind: "fit"; positions: Coordinate[] }
  | { kind: "overview" }
);

setWorkerUrl(workerUrl);

export interface SwaleMapProps {
  tutorialActive?: boolean;
  tutorialRestoreCamera?: boolean;
  hazardPaused?: boolean;
  mascotTarget?: { key: string; position: Coordinate; label: string } | null;
  onMascotProjection?: (target: ProjectedMascotTarget | null) => void;
  onManualCamera?: () => void;
  infrastructure?: InfrastructureMapState | null;
  infrastructureCamera?: InfrastructureCameraRequest | null;
  onSelectInfrastructure?: (id: string) => void;
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
  const trackMascot = !!props.onMascotProjection || !!props.onManualCamera;
  const hazardPulse = useHazardPulse(
    !props.hazardPaused &&
      !!props.backend &&
      props.layers.complaints &&
      boundedPulsingIds(
        props.backend.incidents.features,
        props.backend.incidents,
        props.backendSelectedId,
      ).size > 0,
  );
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
  const lastInfrastructureCameraRef = useRef(0);
  const previousInfrastructureCameraRef =
    useRef<SavedInfrastructureCamera | null>(null);
  const recoveryCameraRef = useRef<SavedInfrastructureCamera | null>(null);
  const activeInfrastructureStationRef = useRef<string | null>(null);
  const fittedInfrastructureChunkRef =
    useRef<InfrastructureMapState["chunk"]>(null);
  const [infrastructureRenderer, setInfrastructureRenderer] =
    useState<InfrastructureRenderer | null>(null);
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

  const infrastructureEnabled = !!props.infrastructure;
  useEffect(() => {
    if (!infrastructureEnabled || infrastructureRenderer) return;
    let cancelled = false;
    // Download detail renderer code only after explicit exploration. The module
    // uses the same installed deck primitives and existing overlay owner.
    void import("./infrastructureLayers").then(
      (renderer) => {
        if (!cancelled) setInfrastructureRenderer(renderer);
      },
      () => {
        if (!cancelled)
          setWarning(
            "Subway geometry rendering is unavailable. Station controls remain usable.",
          );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [infrastructureEnabled, infrastructureRenderer]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let currentMap: Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let onContextLost: ((event: Event) => void) | null = null;
    // Nonce zero is the initial overview placeholder. Keep the architectural
    // home view on first load; replay a genuine pending command after retry.
    if (!recoveryCameraRef.current) lastCameraRequestRef.current = 0;
    setReady(false);
    setPitched((recoveryCameraRef.current?.pitch ?? HOME_CAMERA.pitch) > 10);
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
        ...(recoveryCameraRef.current ?? {}),
        minZoom: 11,
        maxZoom: 22,
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
        recoveryCameraRef.current = captureMapCamera(map);
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
    const infrastructureLayers =
      props.infrastructure && infrastructureRenderer
        ? infrastructureRenderer.infrastructureMapLayers(
            props.infrastructure,
            theme,
            (id) => {
              const current = propsRef.current.infrastructure;
              const primitive = current?.chunk?.primitives.find(
                (item) => item.id === id,
              );
              const detailComponent = current?.entranceDetail?.components.some(
                (component) => component.id === id,
              );
              if (
                current &&
                detailComponent &&
                current.visible.entrances &&
                current.entranceDetail?.entranceId ===
                  props.infrastructure?.entranceDetail?.entranceId
              ) {
                propsRef.current.onSelectInfrastructure?.(id);
                return;
              }
              if (
                current &&
                primitive &&
                current.stationId === props.infrastructure?.stationId &&
                current.chunk?.stationId === current.stationId &&
                infrastructureRenderer.infrastructurePrimitiveVisible(
                  current,
                  primitive,
                )
              )
                propsRef.current.onSelectInfrastructure?.(id);
            },
            (tip) => {
              const current = propsRef.current.infrastructure;
              const captured = props.infrastructure;
              if (!current || current.stationId !== captured?.stationId) return;
              if (
                tip &&
                captured.entranceDetail &&
                (!current.visible.entrances ||
                  current.entranceDetail?.entranceId !==
                    captured.entranceDetail.entranceId ||
                  (tip.context.startsWith("SCENARIO") &&
                    (!current.entranceScenario ||
                      current.entranceScenario.compareBaseline ||
                      current.entranceScenario.frame !==
                        captured.entranceScenario?.frame)))
              )
                return;
              setTooltip(tip);
            },
            (primitive) => {
              const current = propsRef.current.infrastructure;
              return (
                !!current &&
                current.stationId === props.infrastructure?.stationId &&
                current.chunk?.primitives.some(
                  (item) => item.id === primitive.id,
                ) === true &&
                infrastructureRenderer.infrastructurePrimitiveVisible(
                  current,
                  primitive,
                )
              );
            },
            map.getZoom(),
          )
        : [];
    if (props.transit && props.transitLayers && props.transitSelection) {
      overlay.setProps({
        layers: [
          ...transitMapLayers(
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
          ...infrastructureLayers,
        ],
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
      const backendLayers = backendMapLayers(
        data,
        layers,
        selectedId,
        theme,
        labelLayerRef.current,
        (kind, id) => propsRef.current.onSelectBackend?.(kind, id),
        setTooltip,
        hazardPulse,
        map.getZoom(),
      );
      if (buildingLayerRef.current)
        map.setLayoutProperty(
          buildingLayerRef.current,
          "visibility",
          layers.buildings ? "visible" : "none",
        );
      overlay.setProps({ layers: [...backendLayers, ...infrastructureLayers] });
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
    overlay.setProps({ layers: [...nextLayers, ...infrastructureLayers] });
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
    hazardPulse,
    props.backendSelectedId,
    props.transit,
    props.transitLayers,
    props.transitSelection,
    props.infrastructure,
    infrastructureRenderer,
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
        minZoom: Math.max(14, Math.min(16.1, map.getZoom() - 0.6)),
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

  useEffect(() => {
    const map = mapRef.current;
    const request = props.infrastructureCamera;
    if (
      !ready ||
      !map ||
      !request ||
      request.nonce === lastInfrastructureCameraRef.current
    )
      return;
    lastInfrastructureCameraRef.current = request.nonce;
    const duration = prefersReducedMotion() ? 0 : 850;
    if (request.kind === "return") {
      const previous = previousInfrastructureCameraRef.current;
      activeInfrastructureStationRef.current = null;
      fittedInfrastructureChunkRef.current = null;
      previousInfrastructureCameraRef.current = null;
      if (previous) {
        const { centerClampedToGround, ...camera } = previous;
        map.setCenterClampedToGround?.(centerClampedToGround);
        map.setCenterElevation?.(camera.elevation);
        map.easeTo({ ...camera, duration, essential: false });
      }
    } else if (request.kind === "explore") {
      if (!previousInfrastructureCameraRef.current) {
        previousInfrastructureCameraRef.current = captureMapCamera(map);
      }
      activeInfrastructureStationRef.current = request.stationId;
      fittedInfrastructureChunkRef.current = null;
      map.setCenterClampedToGround?.(true);
      map.setCenterElevation?.(0);
      map.flyTo({
        center: request.position,
        elevation: 0,
        zoom: 20.5,
        pitch: 59,
        padding: cameraPadding(map.getContainer().clientWidth),
        duration,
        essential: false,
      });
    } else if (request.kind === "entrance_detail") {
      if (!previousInfrastructureCameraRef.current) {
        previousInfrastructureCameraRef.current = captureMapCamera(map);
      }
      activeInfrastructureStationRef.current =
        propsRef.current.infrastructure?.stationId ?? null;
      map.setCenterClampedToGround?.(false);
      // MapLibre 6.14's animated camera path does not apply options.elevation.
      // Its public setter updates the shared map/deck camera before the planar move.
      map.setCenterElevation?.(request.elevation);
      map.easeTo({
        center: request.position,
        elevation: request.elevation,
        zoom: request.zoom,
        bearing: request.bearing,
        pitch: request.pitch,
        padding: cameraPadding(map.getContainer().clientWidth),
        duration: prefersReducedMotion() ? 0 : 650,
        essential: false,
      });
    } else if (request.positions.length) {
      const lons = request.positions.map((position) => position[0]);
      const lats = request.positions.map((position) => position[1]);
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        {
          padding: cameraPadding(map.getContainer().clientWidth),
          absolutePadding: true,
          maxZoom: 21.5,
          pitch: map.getPitch(),
          bearing: map.getBearing(),
          duration,
          essential: false,
        },
      );
    }
    setTooltip(null);
  }, [ready, props.infrastructureCamera]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !trackMascot) return;
    const workspace = map.getContainer().closest(".workspace") ?? document.body;
    let frame = 0;
    let disposed = false;
    const watched = new Set<Element>();
    const scheduleProjection = () => {
      if (disposed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!disposed) project();
      });
    };
    const panelResize = new ResizeObserver(scheduleProjection);
    const project = () => {
      const target = propsRef.current.mascotTarget;
      if (!target) {
        propsRef.current.onMascotProjection?.(null);
        return;
      }
      const point = map.project(target.position);
      const rect = map.getContainer().getBoundingClientRect();
      const x = point.x + rect.left;
      const y = point.y + rect.top - 65;
      const occlusions = [];
      for (const element of workspace.querySelectorAll(MASCOT_OCCLUSIONS)) {
        if (!watched.has(element)) {
          panelResize.observe(element);
          watched.add(element);
        }
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const panel = element.getBoundingClientRect();
        if (panel.width && panel.height) occlusions.push(panel);
      }
      for (const element of watched)
        if (!workspace.contains(element)) {
          panelResize.unobserve(element);
          watched.delete(element);
        }
      const anchor = visibleMascotAnchor(
        { x, y },
        {
          left: Math.max(0, rect.left),
          top: Math.max(0, rect.top),
          right: Math.min(window.innerWidth, rect.right),
          bottom: Math.min(window.innerHeight, rect.bottom),
        },
        occlusions,
      );
      propsRef.current.onMascotProjection?.({
        key: target.key,
        x: anchor?.x ?? x,
        y: anchor?.y ?? y,
        label: target.label,
        visible: anchor !== null,
        moving: map.isMoving(),
      });
    };
    const interrupt = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) propsRef.current.onManualCamera?.();
    };
    const visibilityChanges = new MutationObserver(scheduleProjection);
    visibilityChanges.observe(workspace, {
      attributes: true,
      attributeFilter: ["class", "hidden"],
      childList: true,
      subtree: true,
    });
    project();
    map.on("move", project);
    map.on("moveend", project);
    map.on("resize", project);
    map.on("dragstart", interrupt);
    map.on("zoomstart", interrupt);
    map.on("rotatestart", interrupt);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      panelResize.disconnect();
      visibilityChanges.disconnect();
      map.off("move", project);
      map.off("moveend", project);
      map.off("resize", project);
      map.off("dragstart", interrupt);
      map.off("zoomstart", interrupt);
      map.off("rotatestart", interrupt);
    };
  }, [ready, props.mascotTarget, trackMascot]);

  useEffect(() => {
    const map = mapRef.current;
    const state = props.infrastructure;
    if (
      !ready ||
      !map ||
      !state?.chunk ||
      !infrastructureRenderer ||
      state.stationId !== activeInfrastructureStationRef.current ||
      state.chunk === fittedInfrastructureChunkRef.current ||
      !!state.entranceDetail
    )
      return;
    const positions =
      infrastructureRenderer.infrastructureFocusPositions(state);
    fittedInfrastructureChunkRef.current = state.chunk;
    if (!positions.length) return;
    const lons = positions.map((position) => position[0]);
    const lats = positions.map((position) => position[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      {
        padding: cameraPadding(map.getContainer().clientWidth),
        absolutePadding: true,
        maxZoom: 20.5,
        pitch: 59,
        bearing: map.getBearing(),
        duration: prefersReducedMotion() ? 0 : 650,
        essential: false,
      },
    );
  }, [
    ready,
    props.infrastructure,
    props.infrastructureCamera,
    infrastructureRenderer,
  ]);

  const tutorialCamera = useRef<SavedInfrastructureCamera | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (props.tutorialActive) {
      if (!tutorialCamera.current)
        tutorialCamera.current = captureMapCamera(map);
    } else if (tutorialCamera.current) {
      if (props.tutorialRestoreCamera) {
        const { centerClampedToGround, ...camera } = tutorialCamera.current;
        map.stop();
        map.setCenterClampedToGround?.(centerClampedToGround);
        map.setCenterElevation?.(camera.elevation);
        map.jumpTo(camera);
      }
      tutorialCamera.current = null;
    }
  }, [ready, props.tutorialActive, props.tutorialRestoreCamera]);

  const animate = (operation: (map: Map, duration: number) => void) => {
    if (mapRef.current && ready)
      operation(mapRef.current, prefersReducedMotion() ? 0 : 650);
  };

  return (
    <section
      className="map-stage"
      data-tutorial="map"
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
          <button
            type="button"
            onClick={() => {
              if (mapRef.current)
                recoveryCameraRef.current = captureMapCamera(mapRef.current);
              setRetry((value) => value + 1);
            }}
          >
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
      {props.infrastructure?.entranceDetail && (
        <div className="entrance-map-badge" role="status">
          <strong>
            {props.infrastructure.entranceScenario
              ? "HYPOTHETICAL WHAT-IF"
              : "STATIC / SCHEMATIC ENTRANCE"}{" "}
            · {props.infrastructure.mode === "xray" ? "X-RAY" : "SURFACE"} ·{" "}
            {props.infrastructure.verticalExaggeration}×
          </strong>
          <span>
            {props.infrastructure.entranceScenario
              ? `Illustrative what-if model — not calibrated station flooding. ${Math.floor(props.infrastructure.entranceScenario.frame?.timeS ?? 0)} s · ${props.infrastructure.entranceScenario.playing ? "PLAYING" : "PAUSED"} · ${props.infrastructure.entranceScenario.compareBaseline ? "BASELINE GEOMETRY" : "SCENARIO WATER"}`
              : "Interior water level unknown · assumed dimensions and orientation"}
          </span>
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
