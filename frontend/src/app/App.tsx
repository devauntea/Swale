import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
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
import { ViewingModes } from "../infrastructure/ViewingModes";
import { modelTourCamera } from "../infrastructure/tourCamera";
import { contextSnapshot, snapshotFingerprint } from "./contextSnapshot";
import type { ContextAction, ContextRequest } from "../contextual/contracts";
import {
  MascotCarry,
  type ProjectedMascotTarget,
} from "../contextual/MascotCarry";
import { HazardMotionControl } from "../components/controls/HazardMotionControl";
import { useHazardMotionPreference } from "../map/useHazardPulse";
import type { FloodFrame } from "../infrastructure/floodModel";
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
  const [hazardPaused, setHazardPaused] = useHazardMotionPreference();
  const [mascotMovement, setMascotMovement] = useState(() => {
    try {
      return localStorage.getItem("swale.mascotMovement") !== "false";
    } catch {
      return true;
    }
  });
  const [autoCamera, setAutoCamera] = useState(() => {
    try {
      return localStorage.getItem("swale.autoCamera") !== "false";
    } catch {
      return true;
    }
  });
  const [mascotProjection, setMascotProjection] =
    useState<ProjectedMascotTarget | null>(null);
  const updateMascotProjection = useCallback(
    (next: ProjectedMascotTarget | null) => {
      setMascotProjection((previous) =>
        previous === next ||
        (previous &&
          next &&
          previous.key === next.key &&
          previous.x === next.x &&
          previous.y === next.y &&
          previous.visible === next.visible &&
          previous.moving === next.moving &&
          previous.label === next.label)
          ? previous
          : next,
      );
    },
    [],
  );
  const [manualCamera, setManualCamera] = useState(0);
  const [mascotDock, setMascotDock] = useState({
    x: Math.max(100, window.innerWidth - 420),
    y: Math.max(140, window.innerHeight - 180),
  });
  useEffect(() => {
    const resize = () =>
      setMascotDock({
        x: Math.max(100, window.innerWidth - 420),
        y: Math.max(140, window.innerHeight - 180),
      });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
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
  const [waterView, setWaterView] = useState<"normal" | "flood_simulation">(
    "normal",
  );
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
    transitActive && (infrastructureOpen || infrastructureStationId !== null),
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
  const infrastructureBinding = useMemo(
    () =>
      modelStation
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
        : null,
    [modelStation, knownTransitStations, transit.data.stations.features],
  );
  const [entranceCatalog, setEntranceCatalog] =
    useState<EntranceCatalog | null>(null);
  const [entranceCatalogStatus, setEntranceCatalogStatus] = useState("idle");
  const [entranceCatalogError, setEntranceCatalogError] = useState("");
  const [entranceCatalogRevision, setEntranceCatalogRevision] = useState(0);
  const [selectedDetailComponentId, setSelectedDetailComponentId] = useState<
    string | null
  >(null);
  const needsEntranceCatalog =
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
    transitActive && !!modelStation,
  );
  const infrastructureMapState: InfrastructureMapState | null =
    transitActive && modelStation
      ? {
          stationId: modelStation.id,
          chunk: infrastructure.chunk,
          mode: infrastructureMode,
          verticalExaggeration,
          visible: infrastructureVisible,
          selectedPrimitiveId,
          entranceDetail,
          selectedDetailComponentId,
          entranceScenario:
            waterView === "flood_simulation" && floodPlayback.showScenario
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
  const enterInfrastructure = (
    stationId: string | null = infrastructureStationId,
  ) => {
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
    if (stationId !== infrastructureStationId) {
      setInfrastructureStationId(stationId);
      setSelectedPrimitiveId(null);
    }
  };
  const exitInfrastructure = () => {
    setInfrastructureOpen(false);
    setInfrastructureCamera({
      kind: "return",
      nonce: ++infrastructureCameraSequence.current,
    });
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
    part: "entrance" | "stairwell" | "landing" | "platform" | "overview",
  ) => {
    if (!entranceDetail || !modelStation) return;
    if (part === "overview") {
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
    const camera = modelTourCamera(entranceDetail, part, verticalExaggeration);
    if (!camera) return;
    setInfrastructureCamera({
      kind: "entrance_detail",
      ...camera,
      nonce: ++infrastructureCameraSequence.current,
    });
  };
  useEffect(() => {
    setSelectedDetailComponentId(null);
    if (!entranceDetail || !infrastructureOpen || !autoCamera) return;
    setVerticalExaggeration(1);
    setInfrastructureMode("xray");
    const camera = modelTourCamera(entranceDetail, "entrance", 1);
    if (!camera) return;
    setInfrastructureCamera({
      kind: "entrance_detail",
      ...camera,
      nonce: ++infrastructureCameraSequence.current,
    });
  }, [entranceDetail, infrastructureOpen, autoCamera]);

  useEffect(() => {
    if (!selectedPrimitiveId && detailEntrances.length) {
      const first =
        detailEntrances.find((entry) => entry.type === "Stair") ??
        detailEntrances[0];
      setSelectedPrimitiveId(`entrance_${first.id}`);
    }
  }, [detailEntrances, selectedPrimitiveId]);

  const changeWaterView = (next: "normal" | "flood_simulation") => {
    setWaterView(next);
    if (next === "normal") floodPlayback.evidence();
    else
      floodPlayback.snapshot(
        floodPlayback.trajectory
          ? undefined
          : Math.min(600, floodPlayback.inputs.durationS),
      );
  };
  const prepareWaterSnapshot = useEffectEvent(() => {
    if (
      waterView === "flood_simulation" &&
      entranceDetail &&
      !floodPlayback.trajectory
    )
      floodPlayback.snapshot(Math.min(600, floodPlayback.inputs.durationS));
  });
  useEffect(() => {
    prepareWaterSnapshot();
  }, [waterView, entranceDetail]);
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
    if (
      selectedStation?.id === station.id &&
      !selectedEntrance &&
      !selectedZone
    )
      return;
    if (infrastructureStationId !== station.properties.gtfs_stop_id) {
      setInfrastructureStationId(station.properties.gtfs_stop_id);
      setSelectedPrimitiveId(null);
    }
    setSelectedStation(station);
    setSelectedEntrance(null);
    setSelectedZone(null);
    transit.clearEvidence();
    if (move && autoCamera) focusTransit(station);
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
    infrastructureOpen &&
    modelStation &&
    infrastructureMapState &&
    infrastructureBinding ? (
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
              setWaterView("flood_simulation");
              floodPlayback.open();
            },
            evidence: () => {},
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
        setSelectedStation(
          [...knownTransitStations, ...transit.data.stations.features].find(
            (station) => station.properties.gtfs_stop_id === id,
          ) ?? null,
        );
        setSelectedEntrance(null);
        setSelectedZone(null);
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
  const [lastPausedFrame, setLastPausedFrame] = useState<FloodFrame | null>(
    null,
  );
  useEffect(() => {
    if (!floodPlayback.playing) setLastPausedFrame(floodPlayback.frame);
  }, [floodPlayback.playing, floodPlayback.frame]);
  const briefingSnapshot = useMemo(
    () =>
      entranceDetail
        ? contextSnapshot(
            entranceDetail.stationId,
            entranceDetail.entranceId,
            floodPlayback.inputs,
            lastPausedFrame,
          )
        : undefined,
    [entranceDetail, floodPlayback.inputs, lastPausedFrame],
  );
  const contextualRequest: ContextRequest | null = useMemo(() => {
    if (sourceMode !== "backend") return null;
    const common = {
      water_view: waterView,
      view_scope: infrastructureOpen
        ? ("station_exploration" as const)
        : ("overview" as const),
    };
    if (transitActive) {
      const station =
        infrastructureBinding?.kind === "supported"
          ? infrastructureBinding.station
          : selectedStation;
      const entrance = selectedEntrance;
      const id =
        entrance?.id ??
        (selectedSourceEntrance
          ? `model_entrance:${selectedSourceEntrance.id}`
          : station?.id);
      if (!id) return null;
      return {
        ...common,
        kind: entrance || selectedSourceEntrance ? "entrance" : "station",
        id,
        station_id:
          station?.id ??
          (modelStation ? `subway_station:${modelStation.id}` : undefined),
        state_version: snapshotFingerprint([
          id,
          transit.data.stations.sources,
          transit.data.live.data?.fetched_at,
          transit.data.live.data?.stations.find(
            (item) => item.station_id === station?.id,
          )?.status,
          transit.data.live.data?.feed_times,
          transit.data.feedState,
          waterView,
          common.view_scope,
          briefingSnapshot,
        ]),
        snapshot: briefingSnapshot,
      };
    }
    if (!backend.detail.id || !backend.detail.kind) return null;
    return {
      ...common,
      kind: backend.detail.kind,
      id: backend.detail.id,
      state_version: snapshotFingerprint([
        backend.detail.id,
        backend.detail.feature,
        waterView,
      ]),
    };
  }, [
    sourceMode,
    transitActive,
    infrastructureBinding,
    selectedStation,
    selectedEntrance,
    selectedSourceEntrance,
    modelStation,
    infrastructureOpen,
    waterView,
    briefingSnapshot,
    backend.detail,
    transit.data.stations,
    transit.data.live.data,
    transit.data.feedState,
  ]);
  const contextualKind = contextualRequest?.kind;
  const contextualId = contextualRequest?.id;
  const mascotTarget = useMemo(() => {
    if (!contextualKind || !contextualId) return null;
    const position = transitActive
      ? (selectedEntrance?.geometry?.coordinates ??
        selectedSourceEntrance?.position ??
        modelStation?.position ??
        selectedStation?.geometry?.coordinates)
      : backend.detail.feature?.geometry?.coordinates;
    return position
      ? {
          key: `${contextualKind}/${contextualId}`,
          position: [position[0], position[1]] as [number, number],
          label:
            modelStation?.name ??
            selectedStation?.properties.name ??
            contextualId,
        }
      : null;
  }, [
    contextualKind,
    contextualId,
    transitActive,
    selectedEntrance,
    selectedSourceEntrance,
    modelStation,
    selectedStation,
    backend.detail.feature,
  ]);
  const contextualAction = (action: ContextAction) => {
    switch (action.type) {
      case "set_view":
        if (action.view_scope === "overview") exitInfrastructure();
        else if (modelStation || selectedStation)
          enterInfrastructure(
            modelStation?.id ?? selectedStation!.properties.gtfs_stop_id,
          );
        else throw new Error("This selection has no supported station model.");
        return;
      case "set_water_view":
        changeWaterView(action.water_view);
        return;
      case "seek_simulation":
        if (
          !entranceDetail ||
          action.elapsed_seconds > floodPlayback.inputs.durationS
        )
          throw new Error("Requested time is outside this selected scenario.");
        setWaterView("flood_simulation");
        floodPlayback.snapshot(action.elapsed_seconds);
        return;
      case "select_station": {
        const station = [
          ...knownTransitStations,
          ...transit.data.stations.features,
        ].find((item) => item.id === action.station_id);
        if (!station)
          throw new Error("Station is outside the loaded inventory.");
        setSelectedStation(station);
        setSelectedEntrance(null);
        setSelectedZone(null);
        setInfrastructureStationId(station.properties.gtfs_stop_id);
        setSelectedPrimitiveId(null);
        if (autoCamera) focusTransit(station);
        return;
      }
      case "set_layers":
        if (
          transitActive &&
          Object.keys(action.layers).some((key) => key !== "buildings")
        )
          throw new Error(
            "Those layers belong to the snapshot records view. Choose Snapshot records to change them.",
          );
        setBackendLayers((previous) => ({ ...previous, ...action.layers }));
        return;
      case "highlight":
        if (
          action.ids.length !== 1 ||
          (!backend.data.basins.features.some(
            (item) => item.id === action.ids[0],
          ) &&
            !backend.data.incidents.features.some(
              (item) => item.id === action.ids[0],
            ))
        )
          throw new Error("Highlight requires one loaded evidence record.");
        backend.select(
          backend.data.basins.features.some((item) => item.id === action.ids[0])
            ? "basin"
            : "incident",
          action.ids[0],
        );
        return;
      case "fly_to":
        if (action.target_id !== contextualRequest?.id)
          throw new Error(
            "Camera target differs from the current validated subject.",
          );
        if (transitActive) focusTransit(selectedEntrance ?? selectedStation);
        else if (backend.detail.feature?.geometry)
          setBackendFocus({
            position: backend.detail.feature.geometry.coordinates as [
              number,
              number,
            ],
            nonce: ++backendFocusSequence.current,
          });
        return;
      case "play_briefing":
      case "stop_audio":
        return;
    }
  };
  const contextualActions = (actions: ContextAction[]) => {
    if (actions.length > 8)
      throw new Error("Too many actions in one response.");
    const stations = [
      ...knownTransitStations,
      ...transit.data.stations.features,
    ];
    const selectedIds = new Set(
      actions
        .filter((action) => action.type === "select_station")
        .map((action) => action.station_id),
    );
    if (selectedIds.size > 1)
      throw new Error("One response cannot select multiple stations.");
    const requestedStationId = [...selectedIds][0];
    const destination = requestedStationId
      ? (stations.find((station) => station.id === requestedStationId) ?? null)
      : selectedStation;
    if (requestedStationId && !destination)
      throw new Error("Requested station is outside the loaded inventory.");
    for (const action of actions) {
      if (
        action.type === "set_view" &&
        action.view_scope === "station_exploration" &&
        !modelStation &&
        !destination
      )
        throw new Error("Select a supported station first.");
      if (
        action.type === "seek_simulation" &&
        (!entranceDetail ||
          (destination &&
            destination.properties.gtfs_stop_id !== entranceDetail.stationId) ||
          action.elapsed_seconds > floodPlayback.inputs.durationS)
      )
        throw new Error(
          "Load the selected station scenario before seeking it.",
        );
      if (
        action.type === "set_layers" &&
        transitActive &&
        Object.keys(action.layers).some((key) => key !== "buildings")
      )
        throw new Error("Requested layers are outside the active view.");
      if (
        action.type === "highlight" &&
        (action.ids.length !== 1 ||
          ![
            ...backend.data.basins.features,
            ...backend.data.incidents.features,
          ].some((feature) => feature.id === action.ids[0]))
      )
        throw new Error("Highlight target is outside the loaded evidence.");
      if (
        action.type === "fly_to" &&
        action.target_id !== contextualRequest?.id &&
        action.target_id !== destination?.id
      )
        throw new Error("Camera target is not the validated subject.");
    }
    for (const action of actions) {
      if (
        action.type === "set_view" &&
        action.view_scope === "station_exploration"
      )
        enterInfrastructure(
          destination?.properties.gtfs_stop_id ?? modelStation!.id,
        );
      else if (action.type === "fly_to" && action.target_id === destination?.id)
        focusTransit(destination);
      else contextualAction(action);
    }
  };
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
            mascotTarget={mascotTarget}
            onMascotProjection={updateMascotProjection}
            onManualCamera={() => setManualCamera((value) => value + 1)}
            hazardPaused={hazardPaused}
            theme={theme}
            snapshot={snapshot}
            scenarioId={state.scenarioId}
            layers={
              sourceMode === "backend"
                ? {
                    ...backendLayers,
                    buildings: !infrastructureOpen && backendLayers.buildings,
                    floodZones:
                      waterView === "flood_simulation" &&
                      backendLayers.floodZones,
                  }
                : {
                    ...state.layers,
                    floodZones:
                      waterView === "flood_simulation" &&
                      state.layers.floodZones,
                  }
            }
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
      <ViewingModes
        exploring={infrastructureOpen}
        waterView={waterView}
        onWaterView={changeWaterView}
        stationName={modelStation?.name}
        routes={modelStation?.routes}
        hasDetail={!!entranceDetail}
        hasPlatform={entranceDetail?.components.some(
          (component) => component.kind === "platform",
        )}
        playback={floodPlayback}
        onExplore={
          transitActive && selectedStation
            ? () => enterInfrastructure(selectedStation.properties.gtfs_stop_id)
            : undefined
        }
        onReturn={exitInfrastructure}
        onViewpoint={focusEntranceDetail}
      />
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
          {sourceMode === "backend" && !transitActive && (
            <HazardMotionControl
              paused={hazardPaused}
              onChange={setHazardPaused}
            />
          )}
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
            onOverview={
              infrastructureOpen ? exitInfrastructure : transitOverview
            }
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
                    ? (view) => {
                        if (view) changeWaterView(view);
                        enterInfrastructure(
                          inspectedStation.properties.gtfs_stop_id,
                        );
                      }
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
        contextual={
          sourceMode === "backend"
            ? {
                context: contextualRequest,
                onAction: contextualAction,
                onActions: contextualActions,
                movementEnabled: mascotMovement,
                onMovementChange: (value) => {
                  setMascotMovement(value);
                  try {
                    localStorage.setItem("swale.mascotMovement", String(value));
                  } catch {
                    /* Session preference only. */
                  }
                },
                autoCamera,
                onAutoCameraChange: (value) => {
                  setAutoCamera(value);
                  try {
                    localStorage.setItem("swale.autoCamera", String(value));
                  } catch {
                    /* Session preference only. */
                  }
                },
              }
            : undefined
        }
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
      {sourceMode === "backend" && (
        <MascotCarry
          expression={mascotExpression}
          selectionKey={mascotTarget?.key ?? null}
          target={mascotProjection}
          dock={mascotDock}
          interrupted={manualCamera}
          movementEnabled={mascotMovement}
        />
      )}
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
          {sourceMode === "fixture" && !assistantOpen ? (
            <SwaleMascot expression={mascotExpression} />
          ) : (
            <Icon name="chat" size={24} />
          )}
        </span>
        <span>
          <strong>Swale Assistant</strong>
          <small>
            {sourceMode === "fixture"
              ? "Scripted demonstration"
              : "Evidence and model agent"}
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
