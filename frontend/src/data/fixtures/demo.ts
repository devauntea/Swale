import type {
  BasinInspectionPriority,
  CatchBasin,
  ComplaintDensityCell,
  Coordinate,
  DataProvenance,
  DataType,
  DemoSnapshot,
  DrainageComplaint,
  FloodScenario,
  FloodZoneFeature,
  PriorityBand,
  RainfallForecast,
  ScenarioId,
  ScoreFactor,
} from "../../types";

export const FIXTURE_CREATED_AT = "2026-10-16T04:36:34Z";
const provenance = (type: DataType, notes?: string): DataProvenance => ({
  type,
  source: "Swale locally authored synthetic demonstration fixtures",
  sourceUpdatedAt: null,
  retrievedAt: null,
  fixtureCreatedAt: FIXTURE_CREATED_AT,
  demo: true,
  notes,
});

const scoreProvenance = provenance(
  "HEURISTIC SCORE",
  "Stored presentation examples; no inspection-priority algorithm runs in this frontend. Bands are illustrative, not validated.",
);
const factor = (
  id: ScoreFactor["id"],
  label: string,
  normalizedValue: number,
  weight: number,
  contributionPoints: number,
  explanation: string,
): ScoreFactor => ({
  id,
  label,
  normalizedValue,
  weight,
  contributionPoints,
  explanation,
  provenance: scoreProvenance,
});

/** Values below are authored constants, not calculated scores or modeled exposure. */
function priority(
  scenarioId: ScenarioId,
  score: number,
  band: PriorityBand,
  history: [number, number],
  exposure: [number, number],
  rainfall: [number, number],
): BasinInspectionPriority {
  return {
    scenarioId,
    score,
    band,
    version: "synthetic-examples-v1",
    provenance: scoreProvenance,
    factors: [
      factor(
        "complaint_history",
        "Complaint history",
        history[0],
        0.45,
        history[1],
        "Predefined demonstration factor; nearby reports do not establish cause.",
      ),
      factor(
        "flood_exposure",
        "Scenario exposure",
        exposure[0],
        0.4,
        exposure[1],
        "Predefined example value, unrelated to official DEP polygon intersections.",
      ),
      factor(
        "rainfall",
        "Rainfall context",
        rainfall[0],
        0.15,
        rainfall[1],
        "Predefined scenario example, not a live forecast or measured rainfall.",
      ),
    ],
  };
}

const scenarios: Record<ScenarioId, FloodScenario> = {
  moderate_current: {
    id: "moderate_current",
    title: "Moderate Flood — Current Sea Levels",
    shortLabel: "Moderate Current",
    rainfallIntensityInchesPerHour: 2.13,
    seaLevelAssumption: "Current Sea Levels",
    description:
      "Published NYC DEP scenario definition. The displayed polygons and priorities are synthetic examples.",
    excludedProductionCategories: [3],
    provenance: provenance(
      "SCENARIO",
      "Published scenario metadata only; local geometry is not an official NYC DEP flood map.",
    ),
  },
  extreme_2080: {
    id: "extreme_2080",
    title: "Extreme Flood — 2080 Sea Level Rise",
    shortLabel: "Extreme 2080",
    rainfallIntensityInchesPerHour: 3.66,
    seaLevelAssumption: "2080 Sea Level Rise",
    description:
      "Both rainfall intensity and sea-level assumptions differ. Future-high-tide category 3 is excluded from the future stormwater overlay and scoring.",
    excludedProductionCategories: [3],
    provenance: provenance(
      "SCENARIO",
      "Published scenario metadata only; local geometry is not an official NYC DEP flood map.",
    ),
  },
};

type BasinSeed = [
  string,
  CatchBasin["focusArea"],
  Coordinate,
  number,
  PriorityBand,
  number,
  PriorityBand,
  [number, number],
  [number, number],
  [number, number],
];
const basinSeeds: BasinSeed[] = [
  [
    "SYNTHETIC-RH-01",
    "Red Hook",
    [-74.0108, 40.6756],
    84,
    "high",
    91,
    "high",
    [0.8, 36],
    [0.9, 36],
    [1, 40],
  ],
  [
    "SYNTHETIC-RH-02",
    "Red Hook",
    [-74.0089, 40.678],
    76,
    "elevated",
    83,
    "high",
    [0.8, 36],
    [0.7, 28],
    [0.8, 32],
  ],
  [
    "SYNTHETIC-RH-03",
    "Red Hook",
    [-74.0121, 40.6734],
    72,
    "elevated",
    91,
    "high",
    [0.8, 36],
    [0.6, 24],
    [1, 40],
  ],
  [
    "SYNTHETIC-RH-04",
    "Red Hook",
    [-74.0077, 40.6747],
    59,
    "moderate",
    70,
    "elevated",
    [0.6, 27],
    [0.5, 20],
    [0.7, 28],
  ],
  [
    "SYNTHETIC-RH-05",
    "Red Hook",
    [-74.0059, 40.6791],
    50,
    "moderate",
    57,
    "moderate",
    [0.4, 18],
    [0.5, 20],
    [0.6, 24],
  ],
  [
    "SYNTHETIC-RH-06",
    "Red Hook",
    [-74.0136, 40.6772],
    42,
    "moderate",
    49,
    "moderate",
    [0.4, 18],
    [0.3, 12],
    [0.4, 16],
  ],
  [
    "SYNTHETIC-GW-01",
    "Gowanus",
    [-73.9904, 40.6806],
    80,
    "high",
    91,
    "high",
    [0.8, 36],
    [0.8, 32],
    [1, 40],
  ],
  [
    "SYNTHETIC-GW-02",
    "Gowanus",
    [-73.9881, 40.6787],
    71,
    "elevated",
    78,
    "elevated",
    [0.6, 27],
    [0.8, 32],
    [0.9, 36],
  ],
  [
    "SYNTHETIC-GW-03",
    "Gowanus",
    [-73.9861, 40.6761],
    63,
    "elevated",
    74,
    "elevated",
    [0.6, 27],
    [0.6, 24],
    [0.8, 32],
  ],
  [
    "SYNTHETIC-GW-04",
    "Gowanus",
    [-73.9923, 40.6778],
    50,
    "moderate",
    61,
    "elevated",
    [0.4, 18],
    [0.5, 20],
    [0.7, 28],
  ],
  [
    "SYNTHETIC-GW-05",
    "Gowanus",
    [-73.9843, 40.681],
    42,
    "moderate",
    53,
    "moderate",
    [0.4, 18],
    [0.3, 12],
    [0.5, 20],
  ],
  [
    "SYNTHETIC-GW-06",
    "Gowanus",
    [-73.991, 40.6836],
    29,
    "low",
    36,
    "low",
    [0.2, 9],
    [0.2, 8],
    [0.3, 12],
  ],
];

const basins: CatchBasin[] = basinSeeds.map(
  (
    [
      id,
      focusArea,
      position,
      moderateScore,
      moderateBand,
      extremeScore,
      extremeBand,
      history,
      moderateExposure,
      extremeExposure,
    ],
    index,
  ) => ({
    id,
    label: `${focusArea} example ${String((index % 6) + 1).padStart(2, "0")}`,
    position,
    focusArea,
    priorities: {
      moderate_current: priority(
        "moderate_current",
        moderateScore,
        moderateBand,
        history,
        moderateExposure,
        [0.8, 12],
      ),
      extreme_2080: priority(
        "extreme_2080",
        extremeScore,
        extremeBand,
        history,
        extremeExposure,
        [1, 15],
      ),
    },
    complaintIds: [`SYNTHETIC-C-${String(index + 1).padStart(2, "0")}`],
    provenance: provenance(
      "STATIC INVENTORY",
      "Synthetic marker positions; not official NYC catch-basin locations or a boroughwide inventory.",
    ),
  }),
);

function zone(
  id: string,
  scenarioId: ScenarioId,
  ring: Coordinate[],
): FloodZoneFeature {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: {
      id,
      scenarioId,
      label: "DEMO / SCENARIO zone",
      category: "demo-zone",
      provenance: provenance(
        "SCENARIO",
        "Authored illustrative geometry; not official DEP geometry, observed flooding, or a flood-depth estimate.",
      ),
    },
  };
}

const floodZones: FloodZoneFeature[] = [
  zone("SYNTHETIC-M-RH", "moderate_current", [
    [-74.0149, 40.6741],
    [-74.0124, 40.6725],
    [-74.0082, 40.6741],
    [-74.0089, 40.6767],
    [-74.0123, 40.6778],
    [-74.0149, 40.6741],
  ]),
  zone("SYNTHETIC-M-GW", "moderate_current", [
    [-73.993, 40.6797],
    [-73.9904, 40.6821],
    [-73.987, 40.68],
    [-73.9867, 40.676],
    [-73.9901, 40.6768],
    [-73.993, 40.6797],
  ]),
  zone("SYNTHETIC-M-RH-N", "moderate_current", [
    [-74.0102, 40.6777],
    [-74.008, 40.6793],
    [-74.0056, 40.6789],
    [-74.0068, 40.677],
    [-74.0102, 40.6777],
  ]),
  zone("SYNTHETIC-E-RH", "extreme_2080", [
    [-74.016, 40.6741],
    [-74.0125, 40.6716],
    [-74.0067, 40.6734],
    [-74.0047, 40.677],
    [-74.0068, 40.6801],
    [-74.0137, 40.6794],
    [-74.016, 40.6741],
  ]),
  zone("SYNTHETIC-E-GW", "extreme_2080", [
    [-73.995, 40.679],
    [-73.9921, 40.6844],
    [-73.9866, 40.6833],
    [-73.9828, 40.6795],
    [-73.9853, 40.6744],
    [-73.9916, 40.675],
    [-73.995, 40.679],
  ]),
  zone("SYNTHETIC-E-CENTER", "extreme_2080", [
    [-74.004, 40.6771],
    [-74.0002, 40.6795],
    [-73.9973, 40.6779],
    [-74.0013, 40.6751],
    [-74.004, 40.6771],
  ]),
];

const categoryPairs = [
  ["Sewer Maintenance", "Catch Basin Clogged"],
  ["Sewer Maintenance", "Backup"],
  ["Sewer Maintenance", "Flooding on Street"],
  ["Sewer", "Catch Basin Clogged/Flooding (Use Comments) (SC)"],
  ["Sewer", "Sewer Backup (Use Comments) (SA)"],
  ["Sewer", "Street Flooding (SJ)"],
] as const;

const complaints: DrainageComplaint[] = basins.map((basin, index) => ({
  id: `SYNTHETIC-C-${String(index + 1).padStart(2, "0")}`,
  position: [
    basin.position[0] + (index % 2 ? 0.00045 : -0.00035),
    basin.position[1] + 0.00035,
  ],
  complaintType: categoryPairs[index % 6][0],
  descriptor: categoryPairs[index % 6][1],
  createdAt: index % 3 === 0 ? "2026-10-13T14:00:00Z" : "2026-09-21T10:00:00Z",
  recent: index % 3 === 0,
  focusArea: basin.focusArea,
  provenance: provenance(
    "HISTORICAL",
    "Synthetic complaint example using verified category labels, not an actual 311 request. Association with a marker is illustrative, not a causal claim.",
  ),
}));

/** Prebuilt display hexagons and authored counts; no production spatial aggregation. */
const densitySeeds: [Coordinate, number][] = [
  [[-74.0105, 40.6755], 18],
  [[-74.0079, 40.6774], 11],
  [[-74.0132, 40.677], 7],
  [[-73.9905, 40.6805], 22],
  [[-73.9879, 40.6785], 14],
  [[-73.9903, 40.6831], 8],
];
const densityCells: ComplaintDensityCell[] = densitySeeds.map(
  ([position, count], index) => {
    const [x, y] = position;
    const ring: Coordinate[] = [
      [x - 0.0011, y],
      [x - 0.00055, y + 0.00073],
      [x + 0.00055, y + 0.00073],
      [x + 0.0011, y],
      [x + 0.00055, y - 0.00073],
      [x - 0.00055, y - 0.00073],
      [x - 0.0011, y],
    ];
    return {
      id: `SYNTHETIC-HEX-${index + 1}`,
      position,
      geometry: { type: "Polygon", coordinates: [ring] },
      count,
      windowLabel: "Illustrative historical density — not a record aggregation",
      provenance: provenance(
        "HISTORICAL",
        "Predefined synthetic density counts; independent display examples, not counts of the local point list or official 311 records.",
      ),
    };
  },
);

const forecastProvenance = provenance(
  "FORECAST",
  "DEMO / FORECAST EXAMPLE. Fictional accumulation and issue/validity times; no NWS request occurred.",
);
const exampleForecast: RainfallForecast = {
  status: "available",
  amount: 12.7,
  unit: "mm",
  validFrom: "2026-10-16T06:00:00Z",
  validTo: "2026-10-16T12:00:00Z",
  issuedAt: "2026-10-16T00:00:00Z",
  freshness: { status: "available", lastSuccessAt: null },
  provenance: forecastProvenance,
};
export const FORECAST_EXAMPLES: Record<
  "available" | "zero" | "stale" | "unavailable",
  RainfallForecast
> = {
  available: exampleForecast,
  zero: { ...exampleForecast, amount: 0 },
  stale: {
    ...exampleForecast,
    status: "stale",
    freshness: {
      status: "stale",
      lastSuccessAt: null,
      reason:
        "Archived synthetic example; source refresh awaits backend integration.",
    },
  },
  unavailable: {
    ...exampleForecast,
    status: "unavailable",
    amount: null,
    validFrom: null,
    validTo: null,
    issuedAt: null,
    freshness: {
      status: "unavailable",
      lastSuccessAt: null,
      reason: "No forecast supplied in this demonstration state.",
    },
  },
};

const navigationProvenance: DataProvenance = {
  type: "STATIC",
  source: "OpenFreeMap neighbourhood label points",
  sourceUpdatedAt: null,
  retrievedAt: "2026-10-16T04:34:04Z",
  demo: false,
  sourceUrl:
    "https://tiles.openfreemap.org/planet/20261011_080001_pt/14/4824/6162.pbf",
  notes:
    "Label points verified from permitted place-layer tiles, build 20261011_080001_pt. Camera targets only; not administrative boundaries. Overview reuses the Gowanus label point at a wider zoom.",
};

export const DEMO_SNAPSHOT: DemoSnapshot = {
  mode: "synthetic-demo",
  version: "swale-frontend-demo-v1",
  basins,
  scenarios,
  floodZones,
  complaints,
  densityCells,
  buildings: [],
  forecast: FORECAST_EXAMPLES.available,
  targets: [
    {
      id: "red_hook",
      label: "Red Hook",
      position: [-74.00958180427551, 40.67510513691509],
      zoom: 15.3,
      pitch: 57,
      bearing: -25,
      provenance: {
        ...navigationProvenance,
        sourceUrl:
          "https://tiles.openfreemap.org/planet/20261011_080001_pt/14/4823/6162.pbf",
      },
    },
    {
      id: "gowanus",
      label: "Gowanus",
      position: [-73.98850500583649, 40.6791694136038],
      zoom: 15.3,
      pitch: 57,
      bearing: -25,
      provenance: navigationProvenance,
    },
    {
      id: "overview",
      label: "Focus area overview",
      position: [-73.98850500583649, 40.6791694136038],
      zoom: 13.9,
      pitch: 53,
      bearing: -25,
      provenance: navigationProvenance,
    },
  ],
  rankedBasinIds: {
    moderate_current: [
      "SYNTHETIC-RH-01",
      "SYNTHETIC-GW-01",
      "SYNTHETIC-RH-02",
      "SYNTHETIC-RH-03",
      "SYNTHETIC-GW-02",
      "SYNTHETIC-GW-03",
      "SYNTHETIC-RH-04",
      "SYNTHETIC-RH-05",
      "SYNTHETIC-GW-04",
      "SYNTHETIC-RH-06",
      "SYNTHETIC-GW-05",
      "SYNTHETIC-GW-06",
    ],
    extreme_2080: [
      "SYNTHETIC-RH-01",
      "SYNTHETIC-RH-03",
      "SYNTHETIC-GW-01",
      "SYNTHETIC-RH-02",
      "SYNTHETIC-GW-02",
      "SYNTHETIC-GW-03",
      "SYNTHETIC-RH-04",
      "SYNTHETIC-GW-04",
      "SYNTHETIC-RH-05",
      "SYNTHETIC-GW-05",
      "SYNTHETIC-RH-06",
      "SYNTHETIC-GW-06",
    ],
  },
  provenance: provenance(
    "SCENARIO",
    "Limited Red Hook/Gowanus synthetic focus examples; no boroughwide or official infrastructure coverage. All local geometry and numerical examples are synthetic.",
  ),
};
