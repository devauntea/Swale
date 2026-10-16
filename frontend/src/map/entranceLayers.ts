import {
  PathLayer,
  PolygonLayer,
  ScatterplotLayer,
  TextLayer,
} from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import type { Theme } from "../app/theme";
import type { InfrastructurePosition } from "../infrastructure/contracts";
import type {
  EntranceDetailGeometry,
  EntranceMaterial,
  EntrancePath,
  EntranceSurface,
} from "../infrastructure/entranceGeometry";
import { entranceLocalPosition } from "../infrastructure/entranceGeometry";
import type { FloodFrame, FloodInputs } from "../infrastructure/floodModel";
import type { TransitMapTooltip } from "./transitLayers";

type Color = [number, number, number, number];
export interface EntranceWaterSurface {
  id: string;
  componentId: string;
  kind: "boundary" | "overtopping" | "accumulation" | "wet-step";
  polygon: InfrastructurePosition[];
  depthM: number;
}
export interface EntranceScenarioPresentation {
  frame: FloodFrame | null;
  inputs: FloodInputs;
  compareBaseline?: boolean;
}
export function entranceDisplayPosition(
  position: InfrastructurePosition,
  exaggeration: number,
): InfrastructurePosition {
  return [
    position[0],
    position[1],
    position[2] * Math.max(1, Math.min(5, exaggeration)),
  ];
}

/** Every surface is clipped to a declared local patch/tread/room; no global plane. */
export function entranceWaterSurfaces(
  detail: EntranceDetailGeometry,
  scenario?: EntranceScenarioPresentation,
): EntranceWaterSurface[] {
  if (!scenario?.frame || scenario.compareBaseline) return [];
  const { frame, inputs } = scenario;
  const records: EntranceWaterSurface[] = [];
  const entranceComponentId = detail.components.find(
    (component) => component.kind === "entrance",
  )!.id;
  const surface = (
    id: string,
    componentId: string,
    kind: EntranceWaterSurface["kind"],
    polygon: InfrastructurePosition[],
    heightM: number,
    floorM: number,
  ) => {
    if (heightM - floorM <= 0.00001) return;
    records.push({
      id,
      componentId,
      kind,
      polygon: polygon.map(([lng, lat]) => [lng, lat, heightM + 0.012]),
      depthM: heightM - floorM,
    });
  };
  if (inputs.streetDepthM > 0)
    surface(
      "street-boundary",
      entranceComponentId,
      "boundary",
      detail.pondingPolygon,
      inputs.streetDepthM,
      0,
    );
  if (
    frame.boundaryInflowLps > 0 &&
    inputs.streetDepthM > inputs.barrierHeightM
  ) {
    const [a, b] = detail.thresholdPath;
    records.push({
      id: "threshold-overtopping",
      componentId: entranceComponentId,
      kind: "overtopping",
      polygon: [
        [a[0], a[1], inputs.barrierHeightM],
        [b[0], b[1], inputs.barrierHeightM],
        [b[0], b[1], inputs.streetDepthM],
        [a[0], a[1], inputs.streetDepthM],
      ],
      depthM: inputs.streetDepthM - inputs.barrierHeightM,
    });
  }
  for (const step of detail.steps) {
    const state = frame.compartments.find(
      (compartment) => compartment.id === step.compartmentId,
    );
    if (state && state.volumeM3 > 0)
      surface(
        step.id,
        step.componentId,
        "wet-step",
        step.polygon,
        state.stageM,
        step.floorM,
      );
  }
  for (const space of detail.compartments) {
    const state = frame.compartments.find(
      (compartment) => compartment.id === space.id,
    );
    if (state && state.volumeM3 > 0)
      surface(
        `water-${space.id}`,
        space.componentId,
        "accumulation",
        space.polygon,
        state.stageM,
        space.floorM,
      );
  }
  return records;
}

function materialColor(material: EntranceMaterial, theme: Theme): Color {
  const dark = theme === "dark";
  switch (material) {
    case "stone":
      return dark ? [143, 158, 176, 255] : [205, 213, 221, 255];
    case "tread":
      return dark ? [207, 220, 232, 255] : [232, 237, 242, 255];
    case "riser":
      return dark ? [114, 135, 158, 255] : [160, 176, 194, 255];
    case "wall":
      return dark ? [97, 117, 142, 235] : [183, 197, 211, 235];
    case "metal":
      return dark ? [130, 169, 202, 255] : [37, 62, 85, 255];
    case "sign":
      return [11, 27, 45, 255];
    case "tile":
      return dark ? [67, 91, 114, 255] : [112, 137, 160, 255];
    case "light":
      return [243, 249, 255, 255];
  }
}

/** One selected structure, added to the existing interleaved MapLibreOverlay. */
export function buildEntranceLayers(
  detail: EntranceDetailGeometry,
  theme: Theme,
  mode: "surface" | "xray",
  exaggeration: number,
  onPick: (id: string) => void,
  onTooltip: (tip: TransitMapTooltip | null) => void,
  selectedComponentId?: string | null,
  scenario?: EntranceScenarioPresentation,
): Layer[] {
  const display = (position: InfrastructurePosition) =>
    entranceDisplayPosition(position, exaggeration);
  const known = new Map(
    detail.components.map((component) => [component.id, component]),
  );
  const componentTooltip = (info: PickingInfo<{ componentId: string }>) => {
    const component = info.object
      ? known.get(info.object.componentId)
      : undefined;
    onTooltip(
      component
        ? {
            x: info.x,
            y: info.y,
            title: `${component.label} · ${detail.stationName}`,
            detail: component.assumption,
            context: `STATIC / SCHEMATIC · S4:${detail.entranceId} · 2024 entrance edition · ${exaggeration}× display`,
          }
        : null,
    );
  };
  const pick = (info: PickingInfo<{ componentId: string }>) => {
    if (!info.object || !known.has(info.object.componentId)) return false;
    onPick(info.object.componentId);
    return true;
  };
  const parameters = {
    depthCompare:
      mode === "xray" ? ("always" as const) : ("less-equal" as const),
    depthWriteEnabled: false,
    cullMode: "none" as const,
  };
  const shared = {
    pickable: true,
    onHover: componentTooltip,
    onClick: pick,
    parameters,
  };
  const surfaces = (suffix: string, data: EntranceSurface[]) =>
    new PolygonLayer<EntranceSurface>({
      id: `swale-entrance-detail-${suffix}`,
      data,
      ...shared,
      filled: true,
      stroked: true,
      extruded: false,
      _subLayerProps: { fill: { _full3d: true } },
      getPolygon: (face) => face.polygon.map(display),
      getFillColor: (face) => materialColor(face.material, theme),
      getLineColor: [72, 146, 217, 255],
      getLineWidth: (face) =>
        face.componentId === selectedComponentId ? 1.8 : 0,
      lineWidthUnits: "pixels",
      updateTriggers: {
        getPolygon: [exaggeration],
        getFillColor: [theme],
        getLineWidth: [selectedComponentId],
      },
    });
  const layers: Layer[] = [
    // Background enclosure precedes the individually modeled stair faces in X-ray.
    surfaces(
      "enclosure",
      detail.polygons.filter((face) => face.material === "wall"),
    ),
    surfaces(
      "stone",
      detail.polygons.filter(
        (face) => !["wall", "tread", "riser", "sign"].includes(face.material),
      ),
    ),
    surfaces(
      "risers",
      detail.polygons.filter((face) => face.material === "riser"),
    ),
    surfaces(
      "treads",
      detail.polygons.filter((face) => face.material === "tread"),
    ),
    surfaces(
      "signs",
      detail.polygons.filter((face) => face.material === "sign"),
    ),
    new PathLayer<EntrancePath>({
      id: "swale-entrance-detail-rails",
      data: detail.paths,
      ...shared,
      getPath: (path) => path.path.map(display),
      getColor: (path) =>
        path.componentId === selectedComponentId
          ? [72, 146, 217, 255]
          : materialColor(path.material, theme),
      getWidth: (path) => path.widthM,
      widthUnits: "meters",
      widthMinPixels: 0.7,
      widthMaxPixels: 12,
      billboard: false,
      capRounded: true,
      jointRounded: true,
      updateTriggers: {
        getPath: [exaggeration],
        getColor: [theme, selectedComponentId],
      },
    }),
    new ScatterplotLayer({
      id: "swale-entrance-detail-globes",
      data: detail.fixtures,
      ...shared,
      getPosition: (fixture) => display(fixture.position),
      getRadius: (fixture) => fixture.radiusM,
      radiusUnits: "meters",
      getFillColor: [236, 246, 255, 255],
      stroked: true,
      getLineColor: [49, 91, 128, 255],
      getLineWidth: 0.04,
      lineWidthUnits: "meters",
      billboard: true,
      updateTriggers: { getPosition: [exaggeration] },
    }),
    new TextLayer({
      id: "swale-entrance-detail-sign-text",
      data: [
        {
          position: detail.signPosition,
          text: `Subway · ${detail.stationName}`,
          componentId: detail.components[0].id,
        },
      ],
      ...shared,
      getPosition: (label) => display(label.position),
      getText: (label) => label.text,
      getColor: [244, 249, 255, 255],
      getSize: 12,
      sizeUnits: "pixels",
      sizeMinPixels: 9,
      sizeMaxPixels: 16,
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      outlineWidth: 2,
      outlineColor: [9, 23, 39, 255],
      fontSettings: { sdf: true },
      characterSet: "auto",
      background: true,
      getBackgroundColor: [9, 23, 39, 255],
      backgroundPadding: [5, 3],
      fontFamily: "Arial, sans-serif",
      fontWeight: 700,
      billboard: true,
      updateTriggers: { getPosition: [exaggeration] },
    }),
  ];
  const water = entranceWaterSurfaces(detail, scenario);
  if (!water.length || !scenario?.frame) return layers;
  layers.push(
    new PolygonLayer<EntranceWaterSurface>({
      id: "swale-entrance-scenario-water",
      data: water,
      ...shared,
      filled: true,
      stroked: true,
      extruded: false,
      _subLayerProps: { fill: { _full3d: true } },
      getPolygon: (patch) => patch.polygon.map(display),
      getFillColor: (patch) =>
        patch.kind === "overtopping"
          ? [139, 223, 255, 210]
          : patch.kind === "boundary"
            ? [43, 132, 220, 130]
            : [36, 153, 235, 190],
      getLineColor: [158, 224, 255, 235],
      getLineWidth: 0.7,
      lineWidthUnits: "pixels",
      onHover: (info) => {
        const patch = info.object;
        onTooltip(
          patch
            ? {
                x: info.x,
                y: info.y,
                title: `HYPOTHETICAL · ${patch.kind}`,
                detail: `${patch.depthM.toFixed(3)} m local assumed/computed depth. Illustrative what-if model — not calibrated station flooding.`,
                context: `SCENARIO · ${detail.version} · hypothetical elapsed ${scenario.frame!.timeS} s`,
              }
            : null,
        );
      },
      updateTriggers: { getPolygon: [exaggeration] },
    }),
  );
  if (detail.accessDirection === "down" && scenario.frame.boundaryInflowLps > 0)
    layers.push(
      new PathLayer<{ path: InfrastructurePosition[]; componentId: string }>({
        id: "swale-entrance-scenario-flow",
        data: detail.flowPaths.map((path, index) => ({
          path,
          componentId: detail.components.find((component) =>
            component.id.endsWith(`flight-${index + 1}`),
          )!.id,
        })),
        ...shared,
        getPath: (path) =>
          path.path.map(([lng, lat, z]) => display([lng, lat, z + 0.04])),
        getColor: [172, 232, 255, 240],
        getWidth: 0.28,
        widthUnits: "meters",
        widthMinPixels: 1.5,
        widthMaxPixels: 12,
        billboard: false,
        capRounded: true,
        jointRounded: true,
        updateTriggers: { getPath: [exaggeration] },
      }),
    );
  const reference = entranceLocalPosition(
    detail.sourcePosition,
    detail.orientationDeg,
    -2.1,
    0,
    scenario.inputs.streetDepthM,
  );
  const referencePoint = (acrossM: number, zM: number) =>
    entranceLocalPosition(
      detail.sourcePosition,
      detail.orientationDeg,
      acrossM,
      0,
      zM,
    );
  layers.push(
    // A real narrow XYZ face remains visible where vertical PathLayer width
    // degenerates. Both endpoint ticks have a nonzero horizontal span.
    new PolygonLayer<{ polygon: InfrastructurePosition[] }>({
      id: "swale-entrance-scenario-depth-reference",
      data: [
        {
          polygon: [
            referencePoint(-2.15, 0),
            referencePoint(-2.05, 0),
            referencePoint(-2.05, scenario.inputs.streetDepthM),
            referencePoint(-2.15, scenario.inputs.streetDepthM),
          ],
        },
      ],
      parameters,
      pickable: false,
      filled: true,
      stroked: false,
      extruded: false,
      _subLayerProps: { fill: { _full3d: true } },
      getPolygon: (line) => line.polygon.map(display),
      getFillColor: [225, 246, 255, 255],
      updateTriggers: { getPolygon: [exaggeration] },
    }),
    new PathLayer<{ path: InfrastructurePosition[] }>({
      id: "swale-entrance-scenario-depth-ticks",
      data: [0, scenario.inputs.streetDepthM].map((zM) => ({
        path: [referencePoint(-2.35, zM), referencePoint(-1.85, zM)],
      })),
      parameters,
      pickable: false,
      getPath: (line) => line.path.map(display),
      getColor: [225, 246, 255, 255],
      getWidth: 2,
      widthUnits: "pixels",
      updateTriggers: { getPath: [exaggeration] },
    }),
  );
  layers.push(
    new TextLayer({
      id: "swale-entrance-scenario-depth-label",
      data: [
        {
          position: reference,
          text: `WHAT-IF ${scenario.inputs.streetDepthM.toFixed(2)} m street`,
        },
      ],
      parameters,
      pickable: false,
      getPosition: (label) => display(label.position),
      getText: (label) => label.text,
      getColor: [237, 249, 255, 255],
      getSize: 12,
      sizeUnits: "pixels",
      getTextAnchor: "end",
      getAlignmentBaseline: "bottom",
      background: true,
      getBackgroundColor: [10, 35, 61, 235],
      backgroundPadding: [5, 3],
      fontFamily: "Arial, sans-serif",
      billboard: true,
      updateTriggers: { getPosition: [exaggeration] },
    }),
  );
  return layers;
}
