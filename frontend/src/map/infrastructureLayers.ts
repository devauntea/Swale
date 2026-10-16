import {
  PathLayer,
  PolygonLayer,
  ScatterplotLayer,
  TextLayer,
} from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import type { Theme } from "../app/theme";
import type { Coordinate } from "../types";
import type {
  InfrastructureMapState,
  InfrastructurePrimitive,
} from "../infrastructure/contracts";
import type { TransitMapTooltip } from "./transitLayers";
import { MAP_THEMES } from "./presentation";
import { buildEntranceLayers } from "./entranceLayers";
import { primitiveService, serviceRgba } from "./servicePalette";
import type { EntranceComponent } from "../infrastructure/entranceGeometry";

type Position = [number, number, number];
type Color = [number, number, number, number];

export function infrastructurePrimitiveVisible(
  state: InfrastructureMapState,
  primitive: InfrastructurePrimitive,
): boolean {
  return (
    primitive.stationId === state.stationId &&
    (primitive.kind === "connector" || primitive.kind === "entrance"
      ? state.visible.entrances
      : primitive.kind === "route"
        ? state.visible.routes
        : primitive.kind === "platform"
          ? state.visible.platforms
          : state.visible.structure)
  );
}

function finitePosition(value: Position): boolean {
  return (
    value.length === 3 &&
    value.every(Number.isFinite) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

/** Apply exaggeration only to the canonical surface-relative Z, never NAVD88. */
export function infrastructureDisplayPosition(
  position: Position,
  exaggeration: number,
): Position {
  return [position[0], position[1], position[2] * exaggeration];
}

/** Fit local station assets, not the whole neighboring alignment/route corridor. */
export function infrastructureFocusPositions(
  state: InfrastructureMapState,
): Coordinate[] {
  if (state.chunk?.stationId !== state.stationId) return [];
  const stationParts = state.chunk.primitives.filter(
    (primitive) =>
      primitive.stationId === state.stationId &&
      (primitive.kind === "platform" || primitive.kind === "entrance"),
  );
  return stationParts.flatMap((primitive) =>
    (
      primitive.polygon ??
      primitive.path ??
      (primitive.position ? [primitive.position] : [])
    )
      .filter(finitePosition)
      .map((point) => [point[0], point[1]] as Coordinate),
  );
}

/**
 * Bounded station detail in the existing interleaved overlay. No beforeId means
 * after basemap symbols. X-ray keeps actual negative heights while bypassing
 * ground/building depth; surface mode uses ordinary shared-context depth.
 * Separate semantic records remain pickable, including polygon side faces.
 */
export function infrastructureMapLayers(
  state: InfrastructureMapState,
  theme: Theme,
  onPick: (id: string) => void,
  onTooltip: (tip: TransitMapTooltip | null) => void,
  isCurrent: (primitive: InfrastructurePrimitive) => boolean = () => true,
  mapZoom = 22,
): Layer[] {
  if (!state.chunk || state.chunk.stationId !== state.stationId) return [];
  const colors = MAP_THEMES[theme];
  const exaggeration = Math.max(1, Math.min(5, state.verticalExaggeration));
  const display = (position: Position) =>
    infrastructureDisplayPosition(position, exaggeration);
  const primitives = state.chunk.primitives.filter(
    (primitive) =>
      infrastructurePrimitiveVisible(state, primitive) &&
      !(
        state.entranceDetail &&
        (primitive.id === `entrance_${state.entranceDetail.entranceId}` ||
          primitive.id ===
            `entrance_${state.entranceDetail.entranceId}_connector`)
      ) &&
      (primitive.polygon
        ? primitive.polygon.length >= 3 &&
          primitive.polygon.every(finitePosition)
        : primitive.path
          ? primitive.path.length >= 2 && primitive.path.every(finitePosition)
          : primitive.position && finitePosition(primitive.position)),
  );
  const knownIds = new Set(primitives.map((primitive) => primitive.id));
  const color = (primitive: InfrastructurePrimitive): Color => {
    if (primitive.kind === "route") {
      const route = primitiveService(primitive.sourceIds);
      const fill = route ? serviceRgba(route) : null;
      if (fill) return fill;
    }
    if (primitive.id === state.selectedPrimitiveId)
      return colors.selectedOutline;
    if (primitive.kind === "platform")
      return theme === "dark" ? [198, 228, 255, 245] : [222, 240, 255, 255];
    if (primitive.kind === "entrance") return colors.selectedOutline;
    if (primitive.kind === "structure")
      return [...colors.highlightOutline.slice(0, 3), 80] as Color;
    if (primitive.kind === "connector")
      return [...colors.highlightOutline.slice(0, 3), 205] as Color;
    return colors.highlightOutline;
  };
  const hover = (info: PickingInfo<InfrastructurePrimitive>) => {
    const primitive = info.object;
    onTooltip(
      primitive && knownIds.has(primitive.id) && isCurrent(primitive)
        ? {
            x: info.x,
            y: info.y,
            title: `${primitive.kind[0].toUpperCase()}${primitive.kind.slice(1)} · ${state.stationId}`,
            detail: `${primitive.kind === "route" && primitiveService(primitive.sourceIds) ? `MTA service ${primitiveService(primitive.sourceIds)} · ` : ""}${primitive.assumption}`,
            context: `STATIC / SCHEMATIC · ${primitive.sourceIds.join(" + ")} · ${state.chunk!.metadata.modelVintage} · ${exaggeration}× display`,
          }
        : null,
    );
  };
  const click = (info: PickingInfo<InfrastructurePrimitive>) => {
    if (
      !info.object ||
      !knownIds.has(info.object.id) ||
      !isCurrent(info.object)
    )
      return false;
    onPick(info.object.id);
    return true;
  };
  const parameters = {
    depthCompare:
      state.mode === "xray" ? ("always" as const) : ("less-equal" as const),
    depthWriteEnabled: false,
  };
  const shared = {
    pickable: true,
    parameters,
    onHover: hover,
    onClick: click,
  };
  const layers: Layer[] = [];
  // Shells precede the contents, so transparent envelopes cannot hide platforms.
  for (const kind of [
    "structure",
    "route",
    "platform",
    "connector",
    "entrance",
  ] as const) {
    const records = primitives.filter((primitive) => primitive.kind === kind);
    const routeServices = [
      ...new Set(
        records
          .map((record) => primitiveService(record.sourceIds))
          .filter((route) => route !== null),
      ),
    ];
    layers.push(
      new PolygonLayer<InfrastructurePrimitive>({
        id: `swale-infrastructure-${kind}-polygons`,
        ...shared,
        data: records.filter((primitive) => primitive.polygon),
        getPolygon: (primitive) => primitive.polygon!.map(display),
        filled: true,
        stroked: true,
        extruded: true,
        wireframe: true,
        material: false,
        getElevation: (primitive) => (primitive.height ?? 0) * exaggeration,
        getFillColor: color,
        getLineColor: (primitive) =>
          primitive.id === state.selectedPrimitiveId
            ? colors.selectedOutline
            : colors.highlightOutline,
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        updateTriggers: {
          getPolygon: [exaggeration],
          getElevation: [exaggeration],
          getFillColor: [theme, state.selectedPrimitiveId],
          getLineColor: [theme, state.selectedPrimitiveId],
        },
      }),
      new PathLayer<InfrastructurePrimitive>({
        id: `swale-infrastructure-${kind}-paths`,
        ...shared,
        data: records.filter((primitive) => primitive.path),
        getPath: (primitive) => primitive.path!.map(display),
        getColor: color,
        getWidth: (primitive) =>
          (kind === "route" && primitiveService(primitive.sourceIds)
            ? (primitive.width ?? 2) +
              2 *
                Math.max(
                  0,
                  routeServices.length -
                    1 -
                    routeServices.indexOf(
                      primitiveService(primitive.sourceIds)!,
                    ),
                )
            : primitive.width) ??
          (kind === "structure" ? 9 : kind === "connector" ? 1.2 : 1.5),
        widthUnits: "meters",
        widthMinPixels: kind === "structure" ? 4 : 2,
        widthMaxPixels: kind === "structure" ? 70 : 20,
        billboard: false,
        capRounded: true,
        jointRounded: true,
        updateTriggers: {
          getPath: [exaggeration],
          getColor: [theme, state.selectedPrimitiveId],
        },
      }),
    );
    if (records.some((primitive) => primitive.position))
      layers.push(
        new ScatterplotLayer<InfrastructurePrimitive>({
          id: `swale-infrastructure-${kind}-points`,
          ...shared,
          data: records.filter((primitive) => primitive.position),
          getPosition: (primitive) => display(primitive.position!),
          getFillColor: color,
          getLineColor: colors.highlightOutline,
          getRadius: (primitive) => primitive.radius ?? 0.85,
          radiusUnits: "meters",
          radiusMinPixels: 5,
          radiusMaxPixels: 14,
          stroked: true,
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          updateTriggers: {
            getPosition: [exaggeration],
            getFillColor: [theme, state.selectedPrimitiveId],
          },
        }),
      );
  }
  if (
    state.entranceDetail &&
    state.entranceDetail.stationId === state.stationId &&
    state.visible.entrances
  )
    layers.push(
      ...buildEntranceLayers(
        state.entranceDetail,
        theme,
        state.mode,
        exaggeration,
        onPick,
        onTooltip,
        state.selectedDetailComponentId ?? undefined,
        state.entranceScenario,
      ),
    );
  if (
    state.entranceDetail &&
    state.entranceDetail.stationId === state.stationId &&
    state.visible.entrances &&
    mapZoom >= 20.5
  ) {
    const components = state.entranceDetail.components.filter(
      (component) =>
        finitePosition(component.position) &&
        (state.mode === "xray" || component.position[2] >= 0),
    );
    layers.push(
      new TextLayer<EntranceComponent>({
        id: "swale-infrastructure-component-labels",
        data: components,
        getPosition: (component) => display(component.position),
        getText: (component) => component.label,
        getSize: 11,
        sizeUnits: "pixels",
        fontWeight: 650,
        getPixelOffset: [0, -22],
        getColor: theme === "dark" ? [240, 247, 255, 255] : [16, 37, 75, 255],
        background: true,
        getBackgroundColor:
          theme === "dark" ? [16, 32, 57, 235] : [255, 255, 255, 240],
        backgroundPadding: [5, 3],
        billboard: true,
        pickable: true,
        parameters,
        onClick: (info) => {
          if (!info.object) return false;
          onPick(info.object.id);
          return true;
        },
        onHover: (info) =>
          onTooltip(
            info.object
              ? {
                  x: info.x,
                  y: info.y,
                  title: info.object.label,
                  detail: info.object.assumption,
                  context: `STATIC / SCHEMATIC · ${state.entranceDetail!.entranceId} · virtual model component`,
                }
              : null,
          ),
        updateTriggers: {
          getPosition: [exaggeration],
          getColor: [theme],
          getBackgroundColor: [theme],
        },
      }),
    );
  }
  return layers;
}
