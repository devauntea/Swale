/** PROPOSED — NOT YET AGREED WITH BACKEND TEAM. WGS84 longitude, latitude. */
export type Coordinate = [number, number];
export type ScenarioId = "moderate_current" | "extreme_2080";
export type FocusArea = "Red Hook" | "Gowanus";
export type DataType =
  | "STATIC INVENTORY"
  | "STATIC"
  | "HISTORICAL"
  | "OBSERVED"
  | "FORECAST"
  | "MODELED"
  | "SCENARIO"
  | "HEURISTIC SCORE";
export type PriorityBand =
  | "low"
  | "moderate"
  | "elevated"
  | "high"
  | "unavailable";

export interface DataProvenance {
  type: DataType;
  source: string;
  sourceUpdatedAt: string | null;
  retrievedAt: string | null;
  demo: boolean;
  fixtureCreatedAt?: string;
  sourceUrl?: string;
  notes?: string;
}

export interface DataFreshness {
  status: "available" | "stale" | "unavailable";
  lastSuccessAt: string | null;
  reason?: string;
}

export interface ScoreFactor {
  id: "complaint_history" | "flood_exposure" | "rainfall";
  label: string;
  normalizedValue: number | null;
  weight: number;
  contributionPoints: number | null;
  explanation: string;
  provenance: DataProvenance;
}

export interface BasinInspectionPriority {
  scenarioId: ScenarioId;
  score: number | null;
  band: PriorityBand;
  factors: ScoreFactor[];
  version: string;
  provenance: DataProvenance;
}

export interface CatchBasin {
  id: string;
  label: string;
  position: Coordinate;
  focusArea: FocusArea;
  priorities: Record<ScenarioId, BasinInspectionPriority>;
  complaintIds: string[];
  provenance: DataProvenance;
}

export interface FloodScenario {
  id: ScenarioId;
  title: string;
  shortLabel: string;
  rainfallIntensityInchesPerHour: number;
  seaLevelAssumption: string;
  description: string;
  excludedProductionCategories: number[];
  provenance: DataProvenance;
}

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Coordinate[][];
}
export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: Coordinate[][][];
}
export interface GeoFeature<G, P> {
  type: "Feature";
  geometry: G;
  properties: P;
}

export type FloodZoneFeature = GeoFeature<
  PolygonGeometry | MultiPolygonGeometry,
  {
    id: string;
    scenarioId: ScenarioId;
    label: string;
    category: "demo-zone";
    provenance: DataProvenance;
  }
>;

export interface DrainageComplaint {
  id: string;
  position: Coordinate;
  complaintType: "Sewer" | "Sewer Maintenance";
  descriptor: string;
  createdAt: string;
  recent: boolean;
  focusArea: FocusArea;
  provenance: DataProvenance;
}

export interface ComplaintDensityCell {
  id: string;
  position: Coordinate;
  geometry: PolygonGeometry;
  count: number;
  windowLabel: string;
  provenance: DataProvenance;
}

export type BuildingFeature = GeoFeature<
  PolygonGeometry | MultiPolygonGeometry,
  {
    id: string;
    heightMeters: number;
    baseHeightMeters: number;
    provenance: DataProvenance;
  }
>;

export interface RainfallForecast {
  status: "available" | "stale" | "unavailable";
  amount: number | null;
  unit: "mm";
  validFrom: string | null;
  validTo: string | null;
  issuedAt: string | null;
  freshness: DataFreshness;
  provenance: DataProvenance;
}

export interface NavigationTarget {
  id: "red_hook" | "gowanus" | "overview";
  label: string;
  position: Coordinate;
  zoom: number;
  pitch: number;
  bearing: number;
  provenance: DataProvenance;
}

export interface DemoSnapshot {
  mode: "synthetic-demo";
  version: string;
  basins: CatchBasin[];
  scenarios: Record<ScenarioId, FloodScenario>;
  floodZones: FloodZoneFeature[];
  complaints: DrainageComplaint[];
  densityCells: ComplaintDensityCell[];
  buildings: BuildingFeature[];
  forecast: RainfallForecast;
  targets: NavigationTarget[];
  rankedBasinIds: Record<ScenarioId, string[]>;
  provenance: DataProvenance;
}

export interface LayerVisibility {
  basins: boolean;
  floodZones: boolean;
  complaints: boolean;
  buildings: boolean;
}
export interface CameraRequest {
  targetId: string;
  nonce: number;
}
export type AssistantUIAction =
  | { name: "set_scenario"; arguments: { name: ScenarioId } }
  | { name: "set_layers"; arguments: { visibility: Partial<LayerVisibility> } }
  | { name: "highlight"; arguments: { ids: string[] } }
  | { name: "fly_to"; arguments: { target: string } };

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  demo: boolean;
  status: "complete" | "pending" | "error";
  basinIds?: string[];
  actions?: AssistantUIAction[];
}

export interface DemoAssistantReply {
  text: string;
  actions: AssistantUIAction[];
  basinIds?: string[];
  status: "complete" | "unsupported" | "error";
}

export interface ProviderRefreshResult {
  snapshot: DemoSnapshot;
  status: "integration_pending";
  message: string;
}

export interface FrontendDataProvider {
  load(): Promise<DemoSnapshot>;
  refresh(): Promise<ProviderRefreshResult>;
}
