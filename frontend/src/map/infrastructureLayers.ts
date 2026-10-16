import { PathLayer, PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";
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
            detail: primitive.assumption,
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
          primitive.width ??
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
  return layers;
}
