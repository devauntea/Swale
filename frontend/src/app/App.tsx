import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  LocalFixtureProvider,
  type LocalFixtureOptions,
} from "../data/providers/LocalFixtureProvider";
import type { DemoAssistantReply, DemoSnapshot, ScenarioId } from "../types";
import { appReducer, createInitialState, validateUIAction } from "./state";
import { runDemoAssistant } from "./demoAssistant";
import { ControlSidebar } from "../components/sidebar/ControlSidebar";
import { SourcesPanel } from "../components/sidebar/SourcesPanel";
import { BasinInspector } from "../components/inspector/BasinInspector";
import { AssistantPanel } from "../components/assistant/AssistantPanel";
import { MapLegend } from "../components/controls/MapLegend";
import {
  WorkspaceNotice,
  type WorkspaceNoticeContent,
} from "../components/controls/WorkspaceNotice";
import { Icon } from "../components/controls/Icon";
import {
  SwaleMascot,
  type MascotExpression,
} from "../components/assistant/SwaleMascot";
import { useTheme } from "./useTheme";
import { MapErrorBoundary } from "./MapErrorBoundary";
import { useBackendData } from "../backend/useBackendData";
import type { BackendBbox } from "../backend/contracts";
import { useTransitData } from "../backend/useTransitData";
import type {
  TransitStation,
  TransitEntrance,
  TransitZone,
  TransitLayerVisibility,
} from "../backend/transitContracts";
import type { TransitCameraRequest } from "../map/SwaleMap";
import type { TransitPickKind } from "../map/transitLayers";
import {
  TransitSidebar,
  TransitInspector,
  TransitLegend,
  TransitSourcesPanel,
} from "../components/transit/TransitPanels";
import "./transitView.css";
import { useInfrastructure } from "../infrastructure/useInfrastructure";
import {
  loadEntranceCatalog,
  sourceEntranceForPrimitive,
  type EntranceCatalog,
} from "../infrastructure/entranceCatalog";
import { buildEntranceDetail } from "../infrastructure/entranceGeometry";
import { useFloodPlayback } from "../infrastructure/useFloodPlayback";
import { EntranceExperience } from "../infrastructure/EntranceExperience";
import { StationEvidence } from "../infrastructure/StationEvidence";
import {
  InfrastructureControls,
  InfrastructureInspection,
} from "../infrastructure/InfrastructurePanels";
import {
  resolveInfrastructureBinding,
  type InfrastructureCameraRequest,
  type InfrastructureMapState,
  type InfrastructureVisibility,
} from "../infrastructure/contracts";
import {
  BackendSidebar,
  BackendInspector,
  BackendSourcesPanel,
  BackendLegend,
} from "../components/backend/BackendPanels";

const SwaleMap = lazy(() => import("../map/SwaleMap"));

const DEFAULT_SETTINGS: Required<LocalFixtureOptions> = {
  mode: "ready",
  forecastState: "available",
};
export function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const provider = useMemo(
    () => new LocalFixtureProvider(settings),
    [settings],
  );
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    provider
      .load()
      .then((data) => {
        if (active) setSnapshot(data);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Local examples could not load.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [provider]);
  if (!snapshot)
    return (
      <main className="initial-loading">
        <img src="/swale.svg" alt="" />
        <h1>Swale</h1>
        <p role="status">
          {error || "Opening the Brooklyn demonstration workspace…"}
        </p>
        {error && (
          <button onClick={() => setSettings({ ...DEFAULT_SETTINGS })}>
            Reload local examples
          </button>
        )}
        <span>STANDALONE FRONTEND · SYNTHETIC EXAMPLES</span>
      </main>
    );
  return (
    <Workspace
      snapshot={snapshot}
      onSnapshot={setSnapshot}
      provider={provider}
      loading={loading}
      error={error}
      settings={settings}
      onSettings={setSettings}
    />
  );
}
function Workspace({
  snapshot,
  onSnapshot,
  provider,
  loading,
  error,
  settings,
  onSettings,
}: {
  snapshot: DemoSnapshot;
  onSnapshot: (snapshot: DemoSnapshot) => void;
  provider: LocalFixtureProvider;
  loading: boolean;
  error: string;
  settings: Required<LocalFixtureOptions>;
  onSettings: (settings: Required<LocalFixtureOptions>) => void;
}) {
  const [theme, setTheme] = useTheme();
  const [state, dispatch] = useReducer(
    appReducer,
    snapshot,
    createInitialState,
  );
  const [sourceMode, setSourceMode] = useState<"fixture" | "backend">(
    "fixture",
  );
  const [bounds, setBounds] = useState<BackendBbox | null>(null);
  const [backendView, setBackendView] = useState<"snapshot" | "transit">(
    "snapshot",
  );
  const transitActive = sourceMode === "backend" && backendView === "transit";
  const [infrastructureOpen, setInfrastructureOpen] = useState(false);
  const [infrastructureStationId, setInfrastructureStationId] = useState<
    string | null
  >(null);
  const [infrastructureMode, setInfrastructureMode] = useState<
    "surface" | "xray"
  >("xray");
  const [verticalExaggeration, setVerticalExaggeration] = useState(2);
  const [infrastructureVisible, setInfrastructureVisible] =
    useState<InfrastructureVisibility>({
      structure: true,
      routes: true,
      platforms: true,
      entrances: true,
    });
  const [selectedPrimitiveId, setSelectedPrimitiveId] = useState<string | null>(
    null,
  );
  const [infrastructureCamera, setInfrastructureCamera] =
    useState<InfrastructureCameraRequest | null>(null);
  const infrastructureCameraSequence = useRef(0);
  const [infrastructureTransitBounds, setInfrastructureTransitBounds] =
    useState<BackendBbox | null>(null);
  const infrastructure = useInfrastructure(
    infrastructureOpen && transitActive,
    infrastructureStationId,
  );
  const modelHasBackendCrosswalk =
    infrastructure.manifest?.stations.some(
      (station) =>
        station.id === infrastructureStationId &&
        station.backendStationId !== null &&
        station.relationship === "exact_gtfs_stop_id",
    ) ?? false;
  // Geometry-only camera movement must not expand the backend's viewport coverage.
  // The existing hook remains the sole live polling owner with its original cadence.
  const transit = useTransitData(
    transitActive,
    infrastructureOpen && !modelHasBackendCrosswalk
      ? infrastructureTransitBounds
      : bounds,
  );
  const [transitLayers, setTransitLayers] = useState<TransitLayerVisibility>({
    stations: true,
    entrances: true,
    exposure: true,
    zones: true,
  });
  const [selectedStation, setSelectedStation] = useState<TransitStation | null>(
    null,
  );
  const [selectedEntrance, setSelectedEntrance] =
    useState<TransitEntrance | null>(null);
  const [selectedZone, setSelectedZone] = useState<TransitZone | null>(null);
  const priorInfrastructureState = useRef<{
    station: TransitStation | null;
    entrance: TransitEntrance | null;
    zone: TransitZone | null;
    layers: TransitLayerVisibility;
  } | null>(null);
  const infrastructureTrigger = useRef<HTMLElement | null>(null);
  const refocusInfrastructure = useRef(false);
  useLayoutEffect(() => {
    if (infrastructureOpen || !refocusInfrastructure.current) return;
    refocusInfrastructure.current = false;
    const previous = infrastructureTrigger.current;
    const target = previous?.isConnected
      ? previous
      : document.querySelector<HTMLButtonElement>(
          "[data-infrastructure-entry]",
        );
    target?.focus({ preventScroll: true });
  }, [infrastructureOpen]);
  const [knownTransitStations, setKnownTransitStations] = useState<
    TransitStation[]
  >([]);
  useEffect(() => {
    if (!transit.data.stations.features.length) return;
    setKnownTransitStations((previous) => [
      ...new Map([
        ...previous.map((station) => [station.id, station] as const),
        ...transit.data.stations.features.map(
          (station) => [station.id, station] as const,
        ),
      ]).values(),
    ]);
  }, [transit.data.stations.features]);
  const modelStation =
    infrastructure.manifest?.stations.find(
      (station) => station.id === infrastructureStationId,
    ) ?? null;
  const infrastructureBinding = modelStation
    ? resolveInfrastructureBinding(modelStation, [
        ...new Map([
          ...knownTransitStations.map(
            (station) => [station.id, station] as const,
          ),
          ...transit.data.stations.features.map(
            (station) => [station.id, station] as const,
          ),
        ]).values(),
      ])
    : null;
  const [entranceCatalog, setEntranceCatalog] =
    useState<EntranceCatalog | null>(null);
  const [entranceCatalogStatus, setEntranceCatalogStatus] = useState("idle");
  const [entranceCatalogError, setEntranceCatalogError] = useState("");
  const [entranceCatalogRevision, setEntranceCatalogRevision] = useState(0);
  const [selectedDetailComponentId, setSelectedDetailComponentId] = useState<
    string | null
  >(null);
  const needsEntranceCatalog =
    infrastructureOpen &&
    transitActive &&
    !!infrastructure.chunk?.primitives.some(
      (primitive) => primitive.kind === "entrance",
    );
  useEffect(() => {
    if (!needsEntranceCatalog || entranceCatalog) return;
    const controller = new AbortController();
    let current = true;
    setEntranceCatalogStatus("loading");
    setEntranceCatalogError("");
    loadEntranceCatalog(controller.signal)
      .then((catalog) => {
        if (!current) return;
        setEntranceCatalog(catalog);
        setEntranceCatalogStatus("ready");
      })
      .catch((cause: unknown) => {
        if (!current || controller.signal.aborted) return;
        setEntranceCatalogStatus("error");
        setEntranceCatalogError(
          cause instanceof Error
            ? cause.message
            : "Entrance source types unavailable.",
        );
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [needsEntranceCatalog, entranceCatalog, entranceCatalogRevision]);
  const detailEntrances = useMemo(
    () =>
      entranceCatalog && modelStation && infrastructure.chunk
        ? infrastructure.chunk.primitives
            .map((primitive) =>
              sourceEntranceForPrimitive(
                entranceCatalog,
                modelStation.id,
                primitive,
              ),
            )
            .filter((entry) => entry !== null)
        : [],
    [entranceCatalog, modelStation, infrastructure.chunk],
  );
  const selectedSourceEntrance =
    detailEntrances.find(
      (entry) => `entrance_${entry.id}` === selectedPrimitiveId,
    ) ?? null;
  const entranceDetail = useMemo(
    () =>
      modelStation && infrastructure.chunk && selectedSourceEntrance
        ? buildEntranceDetail(
            modelStation,
            infrastructure.chunk,
            selectedSourceEntrance,
          )
        : null,
    [modelStation, infrastructure.chunk, selectedSourceEntrance],
  );
  const floodPlayback = useFloodPlayback(
    entranceDetail?.floodGeometry ?? null,
    infrastructureOpen && transitActive,
  );
  const infrastructureMapState: InfrastructureMapState | null =
    infrastructureOpen && transitActive && modelStation
      ? {
          stationId: modelStation.id,
          chunk: infrastructure.chunk,
          mode: infrastructureMode,
          verticalExaggeration,
          visible: infrastructureVisible,
          selectedPrimitiveId,
          entranceDetail,
          selectedDetailComponentId,
          entranceScenario: floodPlayback.showScenario
            ? {
                frame: floodPlayback.frame,
                inputs: floodPlayback.inputs,
                compareBaseline: floodPlayback.compareBaseline,
                playing: floodPlayback.playing,
              }
            : undefined,
        }
      : null;
  const [transitCamera, setTransitCamera] =
    useState<TransitCameraRequest | null>(null);
  const transitCameraSequence = useRef(0);
  const enterInfrastructure = (stationId: string | null = null) => {
    if (!transitActive) return;
    transit.clearEvidence();
    if (!infrastructureOpen) {
      priorInfrastructureState.current = {
        station: selectedStation,
        entrance: selectedEntrance,
        zone: selectedZone,
        layers: { ...transitLayers },
      };
      infrastructureTrigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setInfrastructureTransitBounds(bounds);
    }
    setInfrastructureOpen(true);
    setInfrastructureStationId(stationId);
    setSelectedPrimitiveId(null);
  };
  const exitInfrastructure = () => {
    const previous = priorInfrastructureState.current;
    setInfrastructureOpen(false);
    setInfrastructureStationId(null);
    setSelectedPrimitiveId(null);
    setInfrastructureCamera({
      kind: "return",
      nonce: ++infrastructureCameraSequence.current,
    });
    if (previous) {
      setSelectedStation(previous.station);
      setSelectedEntrance(previous.entrance);
      setSelectedZone(previous.zone);
      setTransitLayers(previous.layers);
    }
    priorInfrastructureState.current = null;
    refocusInfrastructure.current = true;
  };
  useEffect(() => {
    if (!infrastructureOpen || !transitActive || !modelStation) return;
    setInfrastructureCamera({
      kind: "explore",
      stationId: modelStation.id,
      position: modelStation.position,
      nonce: ++infrastructureCameraSequence.current,
    });
  }, [infrastructureOpen, transitActive, modelStation]);
  const selectInfrastructurePrimitive = (id: string) => {
    if (entranceDetail?.components.some((component) => component.id === id)) {
      if (infrastructureVisible.entrances) setSelectedDetailComponentId(id);
      return;
    }
    const primitive = infrastructure.chunk?.primitives.find(
      (item) => item.id === id && item.stationId === infrastructureStationId,
    );
    if (!primitive || !infrastructureMapState) return;
    const visible =
      primitive.kind === "entrance" || primitive.kind === "connector"
        ? infrastructureVisible.entrances
        : primitive.kind === "route"
          ? infrastructureVisible.routes
          : primitive.kind === "platform"
            ? infrastructureVisible.platforms
            : infrastructureVisible.structure;
    if (visible) setSelectedPrimitiveId(id);
  };
  const focusEntranceDetail = (
    part: "entrance" | "stairwell" | "landing" | "overview",
  ) => {
    if (!entranceDetail || !modelStation) return;
    if (part === "overview") {
      floodPlayback.evidence();
      setInfrastructureCamera({
        kind: "explore",
        stationId: modelStation.id,
        position: modelStation.position,
        nonce: ++infrastructureCameraSequence.current,
      });
      return;
    }
    const kind = part === "stairwell" ? "flight" : part;
    const component = entranceDetail.components.find(
      (item) => item.kind === kind,
    );
    if (!component) return;
    setSelectedDetailComponentId(component.id);
    setInfrastructureMode("xray");
    setInfrastructureVisible((previous) => ({ ...previous, entrances: true }));
    setInfrastructureCamera({
      kind: "entrance_detail",
      position: [component.position[0], component.position[1]],
      elevation: component.position[2] * verticalExaggeration,
      bearing: entranceDetail.orientationDeg + 175,
      zoom: part === "entrance" ? 21.8 : 22,
      pitch: part === "entrance" ? 48 : 57,
      nonce: ++infrastructureCameraSequence.current,
    });
  };
  useEffect(() => {
    setSelectedDetailComponentId(null);
    if (!entranceDetail) return;
    setVerticalExaggeration(1);
    setInfrastructureMode("xray");
    const center = entranceDetail.components.find(
      (item) => item.kind === "flight",
    )!.position;
    setInfrastructureCamera({
      kind: "entrance_detail",
      position: [center[0], center[1]],
      elevation: center[2],
      bearing: entranceDetail.orientationDeg + 175,
      zoom: 21.8,
      pitch: 50,
      nonce: ++infrastructureCameraSequence.current,
    });
  }, [entranceDetail]);
  const fitInfrastructureEntrances = () => {
    const positions =
      infrastructure.chunk?.primitives
        .filter(
          (primitive) => primitive.kind === "entrance" && primitive.position,
        )
        .map(
          (primitive) =>
            [primitive.position![0], primitive.position![1]] as [
              number,
              number,
            ],
        ) ?? [];
    if (positions.length)
      setInfrastructureCamera({
        kind: "fit_entrances",
        positions,
        nonce: ++infrastructureCameraSequence.current,
      });
  };
  const transitSelection = useMemo(
    () => ({
      stationId:
        infrastructureOpen && infrastructureStationId
          ? infrastructureBinding?.kind === "supported"
            ? infrastructureBinding.station.id
            : null
          : (selectedStation?.id ?? null),
      entranceId: infrastructureOpen ? null : (selectedEntrance?.id ?? null),
      zoneId: infrastructureOpen ? null : (selectedZone?.id ?? null),
    }),
    [
      selectedStation,
      selectedEntrance,
      selectedZone,
      infrastructureOpen,
      infrastructureStationId,
      infrastructureBinding,
    ],
  );
  const backend = useBackendData(
    sourceMode === "backend" && backendView === "snapshot",
    bounds,
  );
  const [backendLayers, setBackendLayers] = useState({
    basins: true,
    complaints: true,
    floodZones: false,
    buildings: true,
  });
  const [backendFocus, setBackendFocus] = useState<{
    position: [number, number];
    nonce: number;
  } | null>(null);
  const backendFocusSequence = useRef(0);
  const modeSelect = useRef<HTMLSelectElement>(null);
  const refocusMode = useRef(false);
  useLayoutEffect(() => {
    if (refocusMode.current) {
      modeSelect.current?.focus({ preventScroll: true });
      refocusMode.current = false;
    }
  }, [sourceMode, backendView]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mascotExpression, setMascotExpression] =
    useState<MascotExpression>("idle");
  const assistantTrigger = useRef<HTMLButtonElement>(null);
  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
    assistantTrigger.current?.focus({ preventScroll: true });
  }, []);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsTrigger = useRef<HTMLButtonElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const refreshGeneration = useRef(0);
  useEffect(() => {
    setRefreshing(false);
    setRefreshMessage("");
    return () => {
      refreshGeneration.current += 1;
    };
  }, [provider]);
  const [complaintId, setComplaintId] = useState<string | null>(null);
  useEffect(() => {
    dispatch({ type: "replace_snapshot", snapshot });
  }, [snapshot]);
  const selectBasin = useCallback((id: string) => {
    dispatch({ type: "select_basin", id });
  }, []);
  const onQueueSelect = (id: string) => {
    selectBasin(id);
    setControlsOpen(false);
    if (controlsOpen) controlsTrigger.current?.focus({ preventScroll: true });
    dispatch({ type: "fly_to", targetId: id });
  };
  const basin = snapshot.basins.find((b) => b.id === state.selectedBasinId);
  const complaint = snapshot.complaints.find((c) => c.id === complaintId);
  const workspaceNotice: WorkspaceNoticeContent | null = error
    ? { kind: "error", message: `${error} Last valid workspace retained.` }
    : snapshot.basins.length === 0
      ? {
          kind: "empty",
          message:
            "No infrastructure examples loaded. The basemap remains available.",
        }
      : null;
  const restoreExamples = () => onSettings({ ...settings, mode: "ready" });
  const refresh = async () => {
    if (refreshing || loading) return;
    const generation = ++refreshGeneration.current;
    setRefreshing(true);
    setRefreshMessage("Reloading local examples…");
    try {
      const result = await provider.refresh();
      if (generation !== refreshGeneration.current) return;
      onSnapshot(result.snapshot);
      setRefreshMessage(result.message);
    } catch {
      if (generation !== refreshGeneration.current) return;
      setRefreshMessage(
        "Local example reload failed. Last valid workspace retained; no live request was made.",
      );
    } finally {
      if (generation === refreshGeneration.current) setRefreshing(false);
    }
  };
  const runAssistant = (text: string): DemoAssistantReply => {
    if (sourceMode !== "fixture")
      throw new Error("Fixture actions are unavailable in backend mode.");
    const reply = runDemoAssistant(text, snapshot, state);
    const checked = reply.actions.map((action) =>
      validateUIAction(action, snapshot),
    );
    if (checked.some((result) => !result.valid))
      throw new Error("Invalid local map command.");
    for (const result of checked) {
      if (!result.valid) continue;
      const action = result.action;
      switch (action.name) {
        case "set_scenario":
          dispatch({ type: "set_scenario", scenarioId: action.arguments.name });
          break;
        case "set_layers":
          dispatch({
            type: "set_layers",
            visibility: action.arguments.visibility,
          });
          break;
        case "highlight":
          dispatch({ type: "highlight", ids: action.arguments.ids });
          break;
        case "fly_to":
          dispatch({ type: "fly_to", targetId: action.arguments.target });
          break;
      }
    }
    return reply;
  };
  const modeSelector = (
    <label className="source-mode-select">
      <span>DATA MODE</span>
      <select
        aria-label="Data mode"
        ref={modeSelect}
        value={sourceMode}
        onChange={(event) => {
          if (
            event.target.value !== "fixture" &&
            event.target.value !== "backend"
          )
            return;
          refocusMode.current = true;
          if (infrastructureOpen) exitInfrastructure();
          setSourceMode(event.target.value);
          setSourcesOpen(false);
          setBackendFocus(null);
          setTransitCamera(null);
        }}
      >
        <option value="fixture">Fixture / demo</option>
        <option value="backend">Backend / snapshot + transit</option>
      </select>
    </label>
  );
  const selectBackend = (kind: "basin" | "incident", id: string) => {
    if (sourceMode !== "backend" || backendView !== "snapshot") return;
    backend.select(kind, id);
    if (controlsOpen) {
      setControlsOpen(false);
      controlsTrigger.current?.focus({ preventScroll: true });
    }
  };
  const focusTransit = (
    feature: TransitStation | TransitEntrance | null = selectedStation,
  ) => {
    if (!transitActive || !feature?.geometry) return;
    setTransitCamera({
      kind: "focus",
      position: [
        feature.geometry.coordinates[0],
        feature.geometry.coordinates[1],
      ],
      nonce: ++transitCameraSequence.current,
    });
  };
  const selectTransitStation = (id: string, move = false) => {
    if (!transitActive) return;
    const station = transit.data.stations.features.find(
      (item) => item.id === id,
    );
    if (!station) return;
    if (infrastructureOpen) {
      setInfrastructureStationId(station.properties.gtfs_stop_id);
      setSelectedPrimitiveId(null);
    }
    setSelectedStation(station);
    setSelectedEntrance(null);
    setSelectedZone(null);
    transit.clearEvidence();
    if (move) focusTransit(station);
    if (controlsOpen) {
      setControlsOpen(false);
      controlsTrigger.current?.focus({ preventScroll: true });
    }
  };
  const selectTransitEntrance = (id: string) => {
    if (!transitActive) return;
    const entrance =
      transit.data.entrances.features.find((item) => item.id === id) ??
      (selectedEntrance?.id === id ? selectedEntrance : null);
    if (!entrance) return;
    const station =
      transit.data.stations.features.find(
        (item) => item.id === entrance.properties.station_id,
      ) ??
      (selectedStation?.id === entrance.properties.station_id
        ? selectedStation
        : null);
    setSelectedStation(station);
    setSelectedEntrance(entrance);
    setSelectedZone(null);
    transit.clearEvidence();
    focusTransit(entrance);
  };
  const selectTransitMap = (kind: TransitPickKind, id: string) => {
    if (!transitActive) return;
    if (kind === "station") selectTransitStation(id);
    else if (kind === "entrance") selectTransitEntrance(id);
    else {
      const zone = transit.data.zones.features.find((item) => item.id === id);
      if (zone) {
        setSelectedStation(null);
        setSelectedZone(zone);
        setSelectedEntrance(null);
        transit.clearEvidence();
      }
    }
  };
  const fitEntrances = () => {
    if (!transitActive || !selectedStation) return;
    const positions = transit.data.entrances.features
      .filter(
        (e) => e.properties.station_id === selectedStation.id && e.geometry,
      )
      .map(
        (e) =>
          [e.geometry!.coordinates[0], e.geometry!.coordinates[1]] as [
            number,
            number,
          ],
      );
    if (positions.length)
      setTransitCamera({
        kind: "fit",
        positions,
        nonce: ++transitCameraSequence.current,
      });
  };
  const transitOverview = () => {
    if (transitActive)
      setTransitCamera({
        kind: "overview",
        nonce: ++transitCameraSequence.current,
      });
  };
  const viewSelector = (
    <div className="backend-view-switch" role="group" aria-label="Backend view">
      {(["snapshot", "transit"] as const).map((view) => (
        <button
          key={view}
          aria-pressed={backendView === view}
          onClick={() => {
            refocusMode.current = true;
            if (infrastructureOpen) exitInfrastructure();
            setBackendView(view);
            setSourcesOpen(false);
            setBackendFocus(null);
            setTransitCamera(null);
          }}
        >
          {view === "snapshot" ? "Snapshot records" : "Subway monitoring"}
        </button>
      ))}
      {transitActive && (
        <button
          aria-pressed={backendLayers.buildings}
          onClick={() =>
            setBackendLayers((current) => ({
              ...current,
              buildings: !current.buildings,
            }))
          }
        >
          3D buildings
        </button>
      )}
    </div>
  );
  const infrastructureSelected =
    infrastructureOpen && infrastructureStationId !== null;
  const inspectedStation = infrastructureSelected
    ? infrastructureBinding?.kind === "supported"
      ? infrastructureBinding.station
      : null
    : selectedStation;
  const infrastructureInspection =
    modelStation && infrastructureMapState && infrastructureBinding ? (
      <>
        <EntranceExperience
          key={modelStation.id}
          station={modelStation}
          entrances={detailEntrances}
          selectedId={selectedSourceEntrance?.id ?? null}
          detail={entranceDetail}
          status={
            infrastructure.chunkStatus === "loading"
              ? "loading"
              : entranceCatalogStatus
          }
          error={entranceCatalogError}
          onRetry={() => setEntranceCatalogRevision((value) => value + 1)}
          onSelect={(id) => selectInfrastructurePrimitive(`entrance_${id}`)}
          onFocus={focusEntranceDetail}
          selectedComponentId={selectedDetailComponentId}
          onComponent={selectInfrastructurePrimitive}
          playback={{
            ...floodPlayback,
            open: () => {
              setVerticalExaggeration(1);
              floodPlayback.open();
            },
          }}
          evidence={
            <StationEvidence
              station={
                infrastructureBinding.kind === "supported"
                  ? infrastructureBinding.station
                  : null
              }
              data={transit.data}
              evidence={transit.evidence}
              onEvidence={transit.openEvidence}
            />
          }
        />
        <InfrastructureInspection
          station={modelStation}
          chunk={infrastructure.chunk}
          state={infrastructureMapState}
          binding={infrastructureBinding}
        />
      </>
    ) : null;
  const infrastructureControls = (
    <InfrastructureControls
      open={infrastructureOpen}
      manifest={infrastructure.manifest}
      station={modelStation}
      chunk={infrastructure.chunk}
      status={
        infrastructure.manifestStatus === "loading"
          ? "loading"
          : infrastructure.chunkStatus
      }
      error={infrastructure.error}
      state={infrastructureMapState}
      onOpen={() => enterInfrastructure()}
      onExit={exitInfrastructure}
      onStation={(id) => {
        transit.clearEvidence();
        setInfrastructureStationId(id);
        setSelectedPrimitiveId(null);
      }}
      onMode={setInfrastructureMode}
      onVisibility={(key) =>
        setInfrastructureVisible((current) => ({
          ...current,
          [key]: !current[key],
        }))
      }
      onExaggeration={(value) => {
        if (Number.isInteger(value) && value >= 1 && value <= 5)
          setVerticalExaggeration(value);
      }}
      onFitEntrances={fitInfrastructureEntrances}
      onSelectPrimitive={selectInfrastructurePrimitive}
      onRetry={infrastructure.retry}
    />
  );
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape is delegated from descendant controls; the landmark has no activation behavior.
    <main
      data-source-mode={sourceMode}
      data-backend-view={backendView}
      className={`workspace ${assistantOpen ? "assistant-is-open" : ""} ${controlsOpen ? "controls-are-open" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && controlsOpen) {
          setControlsOpen(false);
          controlsTrigger.current?.focus({ preventScroll: true });
        } else if (event.key === "Escape" && infrastructureOpen) {
          exitInfrastructure();
        }
      }}
    >
      <MapErrorBoundary
        onFailure={() => {
          setMapFailed(true);
          setMapReady(false);
        }}
      >
        <Suspense
          fallback={
            <div className="map-status" role="status">
              <span className="loading-orbit" />
              <strong>Preparing the city model</strong>
            </div>
          }
        >
          <SwaleMap
            theme={theme}
            snapshot={snapshot}
            scenarioId={state.scenarioId}
            layers={sourceMode === "backend" ? backendLayers : state.layers}
            selectedBasinId={
              sourceMode === "fixture" ? state.selectedBasinId : null
            }
            highlightedIds={
              sourceMode === "fixture" ? state.highlightedIds : []
            }
            cameraRequest={
              sourceMode === "fixture" ? state.cameraRequest : null
            }
            backend={sourceMode === "backend" ? backend.data : null}
            backendSelectedId={
              sourceMode === "backend" ? backend.detail.id : null
            }
            backendFocus={sourceMode === "backend" ? backendFocus : null}
            transit={transitActive ? transit.data : null}
            transitLayers={transitLayers}
            transitSelection={transitSelection}
            transitCamera={transitActive ? transitCamera : null}
            infrastructure={infrastructureMapState}
            infrastructureCamera={infrastructureCamera}
            onSelectInfrastructure={selectInfrastructurePrimitive}
            onSelectTransit={selectTransitMap}
            onSelectBackend={selectBackend}
            onViewportChange={setBounds}
            onSelectBasin={selectBasin}
            onSelectComplaint={setComplaintId}
            onReady={setMapReady}
          />
        </Suspense>
      </MapErrorBoundary>
      <button
        className="mobile-controls-toggle"
        ref={controlsTrigger}
        aria-expanded={controlsOpen}
        aria-controls="planning-controls"
        onClick={() => {
          if (!controlsOpen) {
            setAssistantOpen(false);
            setSourcesOpen(false);
          }
          setControlsOpen((value) => !value);
        }}
      >
        <Icon name={controlsOpen ? "close" : "layers"} size={17} />
        Planning controls
      </button>
      <div className="workspace-topbar">
        <div className="workspace-breadcrumb">
          <Icon name="pin" size={15} />
          <strong>Brooklyn, New York</strong>
          <span>/</span>
          <span>Stormwater planning</span>
        </div>
        <div className="workspace-actions">
          <span className="workspace-readiness" role="status">
            <i className={mapReady ? "ready" : ""} />
            {mapFailed
              ? "MAP UNAVAILABLE"
              : mapReady
                ? "BASEMAP READY"
                : "LOADING BASEMAP"}
          </span>
          <button
            className="theme-toggle"
            aria-label="Dark mode"
            aria-pressed={theme === "dark"}
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
        </div>
      </div>
      {sourceMode === "backend" ? (
        transitActive ? (
          <TransitSidebar
            data={transit.data}
            layers={transitLayers}
            selectedStationId={inspectedStation?.id ?? null}
            modeSelector={modeSelector}
            viewSelector={viewSelector}
            paused={transit.paused}
            onPauseChange={transit.setPaused}
            onRefresh={transit.refresh}
            onSelectStation={(id) => selectTransitStation(id, true)}
            onFocus={() => focusTransit(inspectedStation)}
            onFitEntrances={
              infrastructureSelected ? fitInfrastructureEntrances : fitEntrances
            }
            onOverview={transitOverview}
            onLayer={(key) =>
              setTransitLayers((current) => ({
                ...current,
                [key]: !current[key],
              }))
            }
            onSources={() => setSourcesOpen((value) => !value)}
            infrastructureControls={infrastructureControls}
          />
        ) : (
          <BackendSidebar
            modeSelector={modeSelector}
            viewSelector={viewSelector}
            data={backend.data}
            layers={backendLayers}
            onLayer={(key) =>
              setBackendLayers((current) => ({
                ...current,
                [key]: !current[key],
              }))
            }
            onSelect={selectBackend}
            onRefresh={backend.refresh}
            onSources={() => setSourcesOpen((value) => !value)}
          />
        )
      ) : (
        <ControlSidebar
          modeSelector={modeSelector}
          snapshot={snapshot}
          scenarioId={state.scenarioId}
          layers={state.layers}
          selectedBasinId={state.selectedBasinId}
          navigationTargetId={state.cameraRequest.targetId}
          refreshing={refreshing || loading}
          refreshMessage={refreshMessage}
          onScenario={(scenarioId: ScenarioId) =>
            dispatch({ type: "set_scenario", scenarioId })
          }
          onLayer={(key) =>
            dispatch({
              type: "set_layers",
              visibility: { [key]: !state.layers[key] },
            })
          }
          onNavigate={(targetId) => dispatch({ type: "fly_to", targetId })}
          onSelect={onQueueSelect}
          onRefresh={() => void refresh()}
          onSources={() => setSourcesOpen((v) => !v)}
        />
      )}
      <div
        className={`inspector-position ${(sourceMode === "backend" ? (transitActive ? infrastructureSelected || selectedStation || selectedZone || selectedEntrance : backend.detail.id) : basin) ? "has-selection" : ""}`}
      >
        {sourceMode === "backend" ? (
          transitActive ? (
            infrastructureSelected && !inspectedStation ? (
              <aside
                className="basin-inspector transit-inspector infrastructure-geometry-inspector"
                aria-label="Geometry-only infrastructure inspector"
              >
                <button
                  className="transit-text-button"
                  onClick={exitInfrastructure}
                >
                  Return to previous map
                </button>
                {infrastructureInspection ?? (
                  <p role="status">
                    Loading static model identity. No previous station's live
                    board is attached.
                  </p>
                )}
              </aside>
            ) : (
              <TransitInspector
                station={inspectedStation}
                entrance={infrastructureSelected ? null : selectedEntrance}
                zone={infrastructureSelected ? null : selectedZone}
                data={transit.data}
                selectedEntranceId={selectedEntrance?.id ?? null}
                selectedZoneId={selectedZone?.id ?? null}
                onSelectEntrance={selectTransitEntrance}
                onFocus={() =>
                  focusTransit(inspectedStation ?? selectedEntrance)
                }
                onFitEntrances={
                  infrastructureSelected
                    ? fitInfrastructureEntrances
                    : fitEntrances
                }
                onOverview={transitOverview}
                onClose={() => {
                  if (infrastructureOpen) {
                    exitInfrastructure();
                    return;
                  }
                  setSelectedStation(null);
                  setSelectedEntrance(null);
                  setSelectedZone(null);
                  transit.clearEvidence();
                }}
                onEvidence={transit.openEvidence}
                evidence={transit.evidence}
                clearEvidence={transit.clearEvidence}
                onExploreInfrastructure={
                  inspectedStation
                    ? () =>
                        enterInfrastructure(
                          inspectedStation.properties.gtfs_stop_id,
                        )
                    : undefined
                }
                infrastructureInspection={infrastructureInspection}
              />
            )
          ) : (
            <BackendInspector
              data={backend.data}
              detail={backend.detail}
              onRetryDetail={backend.retryDetail}
              onClose={backend.clearSelection}
              onFocus={() => {
                const geometry = backend.detail.feature?.geometry;
                if (geometry?.type === "Point")
                  setBackendFocus({
                    position: [
                      geometry.coordinates[0],
                      geometry.coordinates[1],
                    ],
                    nonce: ++backendFocusSequence.current,
                  });
              }}
            />
          )
        ) : (
          <BasinInspector
            basin={basin}
            snapshot={snapshot}
            scenarioId={state.scenarioId}
            hiddenLayer={!state.layers.basins}
            onFocus={() =>
              basin && dispatch({ type: "fly_to", targetId: basin.id })
            }
            onClose={() => dispatch({ type: "select_basin", id: null })}
          />
        )}
      </div>
      {!entranceDetail && (
        <div className="map-context-heading">
          <span className="eyebrow">BROOKLYN / FOCUS AREA</span>
          <h2>
            Understand the landscape.
            <br />
            <span>Inspect with context.</span>
          </h2>
          <p>
            {sourceMode === "fixture"
              ? "Explore illustrative infrastructure priorities."
              : transitActive
                ? "Station service, entrances and flood evidence."
                : "Explore snapshot inventory and reported incidents."}
          </p>
        </div>
      )}
      {sourceMode === "backend" ? (
        transitActive ? (
          !entranceDetail && (
            <TransitLegend data={transit.data} layers={transitLayers} />
          )
        ) : (
          <BackendLegend data={backend.data} layers={backendLayers} />
        )
      ) : (
        <MapLegend
          snapshot={snapshot}
          layers={state.layers}
          scenarioId={state.scenarioId}
        />
      )}
      {sourceMode === "fixture" && workspaceNotice && !sourcesOpen && (
        <WorkspaceNotice notice={workspaceNotice} onRestore={restoreExamples} />
      )}
      {sourceMode === "fixture" && complaint && (
        <div className="complaint-detail" role="status">
          <button
            className="icon-button"
            aria-label="Close complaint example"
            onClick={() => setComplaintId(null)}
          >
            <Icon name="close" size={14} />
          </button>
          <span className="demo-label">DEMO / HISTORICAL</span>
          <strong>{complaint.descriptor}</strong>
          <p>
            {complaint.complaintType} · {complaint.id}
          </p>
          <small>{complaint.createdAt} · Local synthetic fixture</small>
        </div>
      )}
      {sourcesOpen &&
        (sourceMode === "backend" ? (
          transitActive ? (
            <TransitSourcesPanel
              data={transit.data}
              onClose={() => setSourcesOpen(false)}
              onRefresh={transit.refresh}
            />
          ) : (
            <BackendSourcesPanel
              data={backend.data}
              onRefresh={backend.refresh}
              onClose={() => setSourcesOpen(false)}
            />
          )
        ) : (
          <SourcesPanel
            snapshot={snapshot}
            settings={settings}
            onSettings={onSettings}
            onClose={() => setSourcesOpen(false)}
            notice={workspaceNotice}
            onRestore={restoreExamples}
          />
        ))}
      <AssistantPanel
        open={assistantOpen}
        dataMode={sourceMode}
        snapshot={snapshot}
        scenarioId={state.scenarioId}
        selectedBasinId={state.selectedBasinId}
        onClose={closeAssistant}
        onExpressionChange={setMascotExpression}
        onSubmit={runAssistant}
        onSelect={(id) => {
          if (sourceMode !== "fixture") return;
          closeAssistant();
          onQueueSelect(id);
        }}
      />
      <button
        className={`assistant-launcher ${assistantOpen ? "is-open" : ""}`}
        ref={assistantTrigger}
        onClick={() => {
          if (assistantOpen) closeAssistant();
          else {
            setControlsOpen(false);
            setSourcesOpen(false);
            setAssistantOpen(true);
          }
        }}
        aria-expanded={assistantOpen}
        aria-controls="swale-assistant-panel"
        aria-label={
          assistantOpen ? "Close Swale assistant" : "Open Swale assistant"
        }
      >
        <span className="launcher-symbol">
          <SwaleMascot expression={mascotExpression} />
        </span>
        <span>
          <strong>Swale Assistant</strong>
          <small>
            {sourceMode === "fixture"
              ? "Scripted demonstration"
              : "Fixture actions unavailable"}
          </small>
        </span>
        <span className="demo-label">DEMO</span>
        <Icon name={assistantOpen ? "close" : "arrow"} size={16} />
      </button>
      <footer className="workspace-footer">
        <span>
          <i />
          {sourceMode === "fixture"
            ? "SYNTHETIC DEMONSTRATION · NO LIVE INFRASTRUCTURE DATA"
            : transitActive
              ? `TRANSIT ${transit.data.feedState.toUpperCase()} · LOCAL FLOOD CONTEXT · BK0601`
              : "LOCAL SNAPSHOT · BK0601 COVERAGE · NOT A LIVE FEED"}
        </span>
        <button onClick={() => setSourcesOpen((v) => !v)}>
          Data provenance <Icon name="info" size={11} />
        </button>
      </footer>
    </main>
  );
}
