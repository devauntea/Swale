import type {
  InfrastructureChunk,
  InfrastructurePosition,
  InfrastructureStation,
} from "./contracts";
import type { EntranceSourceRecord } from "./entranceCatalog";
import type { FloodGeometry } from "./floodModel";

export const ENTRANCE_GEOMETRY_VERSION = "schematic-entrance-v1";
export type EntranceComponentKind =
  | "entrance"
  | "flight"
  | "landing"
  | "platform";
export interface EntranceComponent {
  id: string;
  kind: EntranceComponentKind;
  label: string;
  assumption: string;
  position: InfrastructurePosition;
}
export type EntranceMaterial =
  | "stone"
  | "tread"
  | "riser"
  | "wall"
  | "metal"
  | "sign"
  | "tile"
  | "light";
export interface EntranceSurface {
  id: string;
  componentId: string;
  material: EntranceMaterial;
  polygon: InfrastructurePosition[];
}
export interface EntrancePath {
  id: string;
  componentId: string;
  material: EntranceMaterial;
  path: InfrastructurePosition[];
  widthM: number;
}
export interface EntranceFixture {
  id: string;
  componentId: string;
  position: InfrastructurePosition;
  radiusM: number;
}
export interface EntranceStep {
  id: string;
  componentId: string;
  compartmentId: string;
  floorM: number;
  polygon: InfrastructurePosition[];
  center: InfrastructurePosition;
  areaM2: number;
}
export interface EntranceCompartmentSurface {
  id: string;
  componentId: string;
  floorM: number;
  polygon: InfrastructurePosition[];
}
export interface EntranceDetailGeometry {
  version: string;
  stationId: string;
  stationName: string;
  entranceId: string;
  sourceType: string;
  sourcePosition: [number, number];
  orientationDeg: number;
  accessDirection: "down" | "up";
  focusPositions: [number, number][];
  components: EntranceComponent[];
  polygons: EntranceSurface[];
  paths: EntrancePath[];
  fixtures: EntranceFixture[];
  steps: EntranceStep[];
  compartments: EntranceCompartmentSurface[];
  pondingPolygon: InfrastructurePosition[];
  thresholdPath: InfrastructurePosition[];
  flowPaths: InfrastructurePosition[][];
  referencePath: InfrastructurePosition[];
  signPosition: InfrastructurePosition;
  floodGeometry: FloodGeometry;
  assumptions: string[];
  dimensions: {
    widthM: number;
    treadRunM: number;
    riserM: number;
    stepCount: number;
    flightCount: number;
    totalRiseM: number;
    landingLengthM: number;
    railHeightM: number;
    wallThicknessM: number;
  };
}

/** Small local tangent frame, visualization only; original source XY is untouched. */
export function entranceLocalPosition(
  origin: [number, number],
  orientationDeg: number,
  acrossM: number,
  alongM: number,
  zM: number,
): InfrastructurePosition {
  const angle = (orientationDeg * Math.PI) / 180;
  const east = acrossM * Math.cos(angle) + alongM * Math.sin(angle);
  const north = -acrossM * Math.sin(angle) + alongM * Math.cos(angle);
  return [
    origin[0] + east / (111_320 * Math.cos((origin[1] * Math.PI) / 180)),
    origin[1] + north / 111_320,
    zM,
  ];
}

/** Only verified source Stairs and explicitly disclosed station-house access qualify. */
export function entranceDetailUnavailableReason(
  source: EntranceSourceRecord,
): string | null {
  if (!source.matched)
    return "Source entrance relationship is unmatched; no station connection is generated.";
  if (source.type === "Stair" || source.type === "Station House") return null;
  if (/elevator/i.test(source.type))
    return "Source type Elevator. No staircase or hydraulic shaft connection is invented.";
  if (/escalator/i.test(source.type))
    return "Source type Escalator. A distinct escalator template is not implemented; no staircase substitution.";
  return `Source type ${source.type}. Interior access geometry is unknown; no staircase is invented.`;
}

/**
 * Reusable selected-entrance template; no canonical model/source asset is changed.
 * A bounded two-flight switchback terminates in an explicitly local schematic
 * context, never a purported surveyed corridor to the station centroid.
 */
export function buildEntranceDetail(
  station: InfrastructureStation,
  chunk: InfrastructureChunk,
  source: EntranceSourceRecord,
): EntranceDetailGeometry | null {
  if (
    station.id !== chunk.stationId ||
    source.gtfsStopId !== station.id ||
    (station.complexId !== null && source.complexId !== station.complexId) ||
    entranceDetailUnavailableReason(source)
  )
    return null;
  const marker = chunk.primitives.find(
    (primitive) =>
      primitive.id === `entrance_${source.id}` &&
      primitive.kind === "entrance" &&
      primitive.sourceIds.includes(`S4:${source.id}`),
  );
  if (
    !marker?.position ||
    !source.position.every((value, index) => value === marker.position![index])
  )
    return null;
  const platform = chunk.primitives.find(
    (primitive) => primitive.kind === "platform" && primitive.polygon?.length,
  );
  const platformM = platform?.polygon?.[0][2];
  if (platformM === undefined) return null;
  const platformTopM = platformM + (platform?.height ?? 0);
  if (Math.abs(platformTopM) < 0.5) return null;
  const up = platformTopM > 0;
  const direction = up ? 1 : -1;
  const riseM = Math.max(3, Math.min(up ? 6 : 8, Math.abs(platformTopM)));
  const halfSteps = Math.ceil(riseM / 2 / 0.18);
  const stepCount = halfSteps * 2;
  const riserM = riseM / stepCount;
  const runM = 0.3;
  const widthM = 2.4;
  const landingM = 1.6;
  const topY = 0.8;
  const flightLengthM = halfSteps * runM;
  const farY = topY + flightLengthM;
  const bottomM = direction * riseM;
  const east =
    (station.position[0] - source.position[0]) *
    Math.cos((source.position[1] * Math.PI) / 180);
  const north = station.position[1] - source.position[1];
  const orientationDeg =
    Math.abs(east) + Math.abs(north) < 1e-10
      ? 0
      : (Math.atan2(east, north) * 180) / Math.PI;
  const p = (x: number, y: number, z: number) =>
    entranceLocalPosition(source.position, orientationDeg, x, y, z);
  const rect = (x0: number, y0: number, x1: number, y1: number, z: number) => [
    p(x0, y0, z),
    p(x1, y0, z),
    p(x1, y1, z),
    p(x0, y1, z),
  ];
  const id = (suffix: string) => `${source.id}:${suffix}`;
  const entranceId = id("entrance");
  const flight1Id = id("flight-1");
  const flight2Id = id("flight-2");
  const landingId = id("landing");
  const platformId = id("platform");
  const assumption =
    "Illustrative geometry: source point/type retained; orientation, dimensions and interior layout assumed, not surveyed or a navigable route.";
  const components: EntranceComponent[] = [
    {
      id: entranceId,
      kind: "entrance",
      label: "Street entrance",
      assumption,
      position: p(0, 0, 0),
    },
    {
      id: flight1Id,
      kind: "flight",
      label: `First ${up ? "ascending" : "descending"} flight`,
      assumption,
      position: p(0, topY + flightLengthM / 2, bottomM / 4),
    },
    {
      id: flight2Id,
      kind: "flight",
      label: "Return flight · schematic switchback",
      assumption,
      position: p(3, topY + flightLengthM / 2, bottomM * 0.75),
    },
    {
      id: landingId,
      kind: "landing",
      label: `${up ? "Upper access" : "Bottom"} landing`,
      assumption,
      position: p(3, 0, bottomM),
    },
  ];
  if (!up)
    components.push({
      id: platformId,
      kind: "platform",
      label: "Local schematic platform context",
      assumption:
        "Defined demonstration room connected to the landing. Not the surveyed station platform, corridor or station-wide storage.",
      position: p(4.6, -3.4, bottomM),
    });
  const polygons: EntranceSurface[] = [];
  const paths: EntrancePath[] = [];
  const fixtures: EntranceFixture[] = [];
  const steps: EntranceStep[] = [];
  let serial = 0;
  const surface = (
    componentId: string,
    material: EntranceMaterial,
    polygon: InfrastructurePosition[],
  ) =>
    polygons.push({
      id: id(`surface-${serial++}`),
      componentId,
      material,
      polygon,
    });
  const line = (
    componentId: string,
    material: EntranceMaterial,
    path: InfrastructurePosition[],
    widthM: number,
  ) => {
    // PathLayer's ground-plane width degenerates on pure vertical segments.
    // Give bars/posts actual XYZ faces so they remain connected in the map.
    if (
      path.length === 2 &&
      path[0][0] === path[1][0] &&
      path[0][1] === path[1][1]
    ) {
      const [lng, lat] = path[0];
      const dx = widthM / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
      const dy = widthM / 2 / 111_320;
      const z0 = Math.min(path[0][2], path[1][2]);
      const z1 = Math.max(path[0][2], path[1][2]);
      const corners: [number, number][] = [
        [lng - dx, lat - dy],
        [lng + dx, lat - dy],
        [lng + dx, lat + dy],
        [lng - dx, lat + dy],
      ];
      for (let index = 0; index < 4; index++) {
        const a = corners[index],
          b = corners[(index + 1) % 4];
        surface(componentId, material, [
          [...a, z0],
          [...b, z0],
          [...b, z1],
          [...a, z1],
        ]);
      }
      surface(
        componentId,
        material,
        corners.map(([x, y]) => [x, y, z1]),
      );
      return;
    }
    paths.push({
      id: id(`line-${serial++}`),
      componentId,
      material,
      path,
      widthM,
    });
  };
  const box = (
    componentId: string,
    material: EntranceMaterial,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z0: number,
    z1: number,
  ) => {
    surface(componentId, material, rect(x0, y0, x1, y1, z1));
    surface(componentId, material, [
      p(x0, y0, z0),
      p(x1, y0, z0),
      p(x1, y0, z1),
      p(x0, y0, z1),
    ]);
    surface(componentId, material, [
      p(x1, y0, z0),
      p(x1, y1, z0),
      p(x1, y1, z1),
      p(x1, y0, z1),
    ]);
    surface(componentId, material, [
      p(x1, y1, z0),
      p(x0, y1, z0),
      p(x0, y1, z1),
      p(x1, y1, z1),
    ]);
    surface(componentId, material, [
      p(x0, y1, z0),
      p(x0, y0, z0),
      p(x0, y0, z1),
      p(x0, y1, z1),
    ]);
  };
  // Three stone collar sides leave the approach open; no physical map excavation.
  box(entranceId, "stone", -1.55, -0.65, -1.2, farY + 0.2, -0.2, 0.12);
  box(entranceId, "stone", 1.2, -0.65, 1.55, farY + 0.2, -0.2, 0.12);
  box(entranceId, "stone", -1.55, farY - 0.15, 1.55, farY + 0.2, -0.2, 0.12);
  box(entranceId, "stone", -1.2, -0.65, 1.2, topY, -0.18, 0);
  // Every tread and riser is its own real 3D face, never stripes on a ramp.
  for (let flight = 0; flight < 2; flight++) {
    const componentId = flight ? flight2Id : flight1Id;
    const x0 = flight ? 1.8 : -1.2;
    for (let index = 0; index < halfSteps; index++) {
      const count = flight * halfSteps + index + 1;
      const floorM = direction * count * riserM;
      const previousM = direction * (count - 1) * riserM;
      const y0 = flight ? farY - (index + 1) * runM : topY + index * runM;
      const y1 = y0 + runM;
      const polygon = rect(x0, y0, x0 + widthM, y1, floorM);
      surface(componentId, "tread", polygon);
      const riserY = flight ? y1 : y0;
      surface(componentId, "riser", [
        p(x0, riserY, previousM),
        p(x0 + widthM, riserY, previousM),
        p(x0 + widthM, riserY, floorM),
        p(x0, riserY, floorM),
      ]);
      line(
        componentId,
        "tile",
        [p(x0, y0, floorM + 0.008), p(x0 + widthM, y0, floorM + 0.008)],
        0.025,
      );
      steps.push({
        id: id(`step-${count}`),
        componentId,
        compartmentId: "stairwell",
        floorM,
        polygon,
        center: p(x0 + widthM / 2, (y0 + y1) / 2, floorM),
        areaM2: widthM * runM,
      });
    }
    const z0 = flight ? bottomM / 2 : 0;
    const z1 = flight ? bottomM : bottomM / 2;
    const yStart = flight ? farY : topY;
    const yEnd = flight ? topY : farY;
    for (const x of [x0 - 0.03, x0 + widthM + 0.03]) {
      // Low sidewalls preserve staircase visibility while giving a real enclosure.
      surface(componentId, "wall", [
        p(x, yStart, z0 - 0.2),
        p(x, yEnd, z1 - 0.2),
        p(x, yEnd, z1 + 0.7),
        p(x, yStart, z0 + 0.7),
      ]);
      line(
        componentId,
        "metal",
        [
          p(x, yStart - 0.15, z0 + 0.98),
          p(x, yStart, z0 + 0.98),
          p(x, yEnd, z1 + 0.98),
          p(x, yEnd + (flight ? -0.35 : 0.35), z1 + 0.98),
        ],
        0.065,
      );
      for (let post = 0; post <= 4; post++) {
        const t = post / 4;
        const y = yStart + (yEnd - yStart) * t;
        const z = z0 + (z1 - z0) * t;
        line(componentId, "metal", [p(x, y, z), p(x, y, z + 0.98)], 0.045);
      }
    }
  }
  // Switchback landing, bottom landing and explicitly bounded local room.
  box(
    landingId,
    "stone",
    -1.2,
    farY,
    4.2,
    farY + landingM,
    bottomM / 2 - 0.18,
    bottomM / 2,
  );
  box(landingId, "stone", 1.8, -0.8, 4.2, topY, bottomM - 0.18, bottomM);
  line(
    landingId,
    "metal",
    [
      p(-1.23, farY, bottomM / 2 + 0.98),
      p(-1.23, farY + landingM, bottomM / 2 + 0.98),
      p(4.23, farY + landingM, bottomM / 2 + 0.98),
      p(4.23, farY, bottomM / 2 + 0.98),
    ],
    0.065,
  );
  const compartments: EntranceCompartmentSurface[] = [
    {
      id: "stairwell",
      componentId: landingId,
      floorM: bottomM / 2,
      polygon: rect(-1.2, farY, 4.2, farY + landingM, bottomM / 2),
    },
    {
      id: "landing",
      componentId: landingId,
      floorM: bottomM,
      polygon: rect(1.8, -0.8, 4.2, topY, bottomM),
    },
  ];
  if (!up) {
    box(platformId, "stone", 1.8, -5.6, 7.8, -0.8, bottomM - 0.2, bottomM);
    compartments.push({
      id: "platform",
      componentId: platformId,
      floorM: bottomM,
      polygon: rect(1.8, -5.6, 7.8, -0.8, bottomM),
    });
    // Back tiled wall only; the camera-facing side remains inspectable.
    surface(platformId, "wall", [
      p(7.8, -5.6, bottomM),
      p(7.8, -0.8, bottomM),
      p(7.8, -0.8, bottomM + 2.6),
      p(7.8, -5.6, bottomM + 2.6),
    ]);
    for (let y = -5.6; y <= -0.8; y += 0.6)
      line(
        platformId,
        "tile",
        [p(7.79, y, bottomM), p(7.79, y, bottomM + 2.6)],
        0.015,
      );
    for (let z = bottomM + 0.4; z < bottomM + 2.6; z += 0.4)
      line(platformId, "tile", [p(7.79, -5.6, z), p(7.79, -0.8, z)], 0.015);
    for (const y of [-4.8, -1.4]) {
      box(platformId, "metal", 6.8, y, 7.05, y + 0.25, bottomM, bottomM + 2.6);
      line(
        platformId,
        "light",
        [p(2.5, y, bottomM + 2.55), p(6.5, y, bottomM + 2.55)],
        0.085,
      );
    }
    for (let x = 2.4; x < 7.8; x += 0.6)
      line(
        platformId,
        "tile",
        [p(x, -5.6, bottomM + 0.01), p(x, -0.8, bottomM + 0.01)],
        0.012,
      );
    for (let y = -5.6; y < -0.8; y += 0.6)
      line(
        platformId,
        "tile",
        [p(1.8, y, bottomM + 0.01), p(7.8, y, bottomM + 0.01)],
        0.012,
      );
  }
  // Street enclosure with close-spaced bars, substantial posts and plain sign.
  for (const x of [-1.4, 1.4]) {
    line(entranceId, "metal", [p(x, -0.5, 1.14), p(x, farY + 0.1, 1.14)], 0.09);
    line(entranceId, "metal", [p(x, -0.5, 0.22), p(x, farY + 0.1, 0.22)], 0.07);
    for (let y = -0.5; y <= farY + 0.1; y += 0.3)
      line(entranceId, "metal", [p(x, y, 0.14), p(x, y, 1.14)], 0.033);
    for (const y of [-0.5, farY + 0.1])
      box(
        entranceId,
        "metal",
        x - 0.09,
        y - 0.09,
        x + 0.09,
        y + 0.09,
        0.1,
        1.27,
      );
    line(entranceId, "metal", [p(x, -0.5, 0.1), p(x, -0.5, 2.4)], 0.11);
    fixtures.push({
      id: id(`globe-${x}`),
      componentId: entranceId,
      position: p(x, -0.5, 2.5),
      radiusM: 0.23,
    });
  }
  line(
    entranceId,
    "metal",
    [p(-1.4, farY + 0.1, 1.14), p(1.4, farY + 0.1, 1.14)],
    0.09,
  );
  surface(entranceId, "sign", [
    p(-1.35, farY + 0.1, 0.6),
    p(1.35, farY + 0.1, 0.6),
    p(1.35, farY + 0.1, 1.1),
    p(-1.35, farY + 0.1, 1.1),
  ]);
  const stepPatches = [
    ...steps.map((step) => ({
      floorM: step.floorM,
      areaM2: step.areaM2,
    })),
    { floorM: bottomM / 2, areaM2: 5.4 * landingM },
  ];
  const floodGeometry: FloodGeometry = {
    stationId: station.id,
    entranceId: source.id,
    version: ENTRANCE_GEOMETRY_VERSION,
    streetReferenceM: 0,
    entranceCompartmentId: "stairwell",
    drainageCompartmentId: up ? "stairwell" : "landing",
    compartments: [
      {
        id: "stairwell",
        kind: "stairwell",
        floorPatches: stepPatches,
        maxStageM: 0.8,
      },
      {
        id: "landing",
        kind: "landing",
        floorPatches: [{ floorM: bottomM, areaM2: widthM * landingM }],
        maxStageM: bottomM + 2.5,
      },
      ...(!up
        ? [
            {
              id: "platform",
              kind: "platform" as const,
              floorPatches: [{ floorM: bottomM, areaM2: 6 * 4.8 }],
              maxStageM: bottomM + 2.5,
            },
          ]
        : []),
    ],
    connections: [
      {
        id: "stair-to-landing",
        from: "stairwell",
        to: "landing",
        crestM: bottomM,
        capacityLps: 20,
        enabled: !up,
      },
      ...(!up
        ? [
            {
              id: "landing-to-platform",
              from: "landing",
              to: "platform",
              crestM: bottomM + 0.3,
              capacityLps: 12,
              enabled: true,
            },
          ]
        : []),
    ],
    warnings: [
      "All storage dimensions, thresholds and transfer capacities are illustrative assumptions, not station measurements.",
    ],
    unsupportedConnections: up
      ? [
          "Upper station-house landing to actual elevated platform remains unresolved. No uphill street-water connection is simulated.",
        ]
      : [
          "Local schematic platform room is not the complete surveyed station or a connection to the distant canonical platform.",
        ],
  };
  const focusPositions = polygons.flatMap((polygon) =>
    polygon.polygon.map(([lng, lat]) => [lng, lat] as [number, number]),
  );
  return {
    version: ENTRANCE_GEOMETRY_VERSION,
    stationId: station.id,
    stationName: station.name,
    entranceId: source.id,
    sourceType: source.type,
    sourcePosition: [...source.position],
    orientationDeg,
    accessDirection: up ? "up" : "down",
    focusPositions,
    components,
    polygons,
    paths,
    fixtures,
    steps,
    compartments,
    pondingPolygon: rect(-2.4, -2.2, 2.4, 0.78, 0),
    thresholdPath: [p(-1.15, topY, 0), p(1.15, topY, 0)],
    flowPaths: [
      steps
        .filter((step) => step.componentId === flight1Id)
        .map((step) => step.center),
      steps
        .filter((step) => step.componentId === flight2Id)
        .map((step) => step.center),
    ],
    referencePath: [p(-2, 0, 0), p(-2, 0, 1)],
    signPosition: p(0, farY + 0.08, 0.85),
    floodGeometry,
    assumptions: [
      assumption,
      "Orientation follows the source-entrance-to-station vector solely for a deterministic display; it is not authoritative doorway orientation.",
      `${stepCount} steps in two switchback flights; ${widthM} m width, ${runM} m tread, ${riserM.toFixed(4)} m assumed rise. No building-code compliance claim.`,
      ...(source.type === "Station House"
        ? [
            "Source type is Station House, not Stair. The upward stairs are an explicitly assumed access illustration inside/beyond that house.",
          ]
        : []),
      ...(up
        ? [
            `Bounded ${riseM} m upward access only. Canonical schematic platform reference ${platformTopM} m is not connected by this template.`,
          ]
        : [
            "Local platform-context room and connection are declared demonstration geometry, not a station survey.",
          ]),
      "X-ray bypasses map occlusion at actual surface-relative heights; no physical ground excavation is represented.",
    ],
    dimensions: {
      widthM,
      treadRunM: runM,
      riserM,
      stepCount,
      flightCount: 2,
      totalRiseM: riseM,
      landingLengthM: landingM,
      railHeightM: 0.98,
      wallThicknessM: 0.18,
    },
  };
}
