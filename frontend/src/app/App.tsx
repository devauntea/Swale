import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
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
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape is delegated from descendant controls; the landmark has no activation behavior.
    <main
      className={`workspace ${assistantOpen ? "assistant-is-open" : ""} ${controlsOpen ? "controls-are-open" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && controlsOpen) {
          setControlsOpen(false);
          controlsTrigger.current?.focus({ preventScroll: true });
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
            layers={state.layers}
            selectedBasinId={state.selectedBasinId}
            highlightedIds={state.highlightedIds}
            cameraRequest={state.cameraRequest}
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
      <ControlSidebar
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
      <div className={`inspector-position ${basin ? "has-selection" : ""}`}>
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
      </div>
      <div className="map-context-heading">
        <span className="eyebrow">BROOKLYN / FOCUS AREA</span>
        <h2>
          Understand the landscape.
          <br />
          <span>Inspect with context.</span>
        </h2>
        <p>Explore illustrative infrastructure priorities.</p>
      </div>
      <MapLegend
        snapshot={snapshot}
        layers={state.layers}
        scenarioId={state.scenarioId}
      />
      {workspaceNotice && !sourcesOpen && (
        <WorkspaceNotice notice={workspaceNotice} onRestore={restoreExamples} />
      )}
      {complaint && (
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
      {sourcesOpen && (
        <SourcesPanel
          snapshot={snapshot}
          settings={settings}
          onSettings={onSettings}
          onClose={() => setSourcesOpen(false)}
          notice={workspaceNotice}
          onRestore={restoreExamples}
        />
      )}
      <AssistantPanel
        open={assistantOpen}
        snapshot={snapshot}
        scenarioId={state.scenarioId}
        selectedBasinId={state.selectedBasinId}
        onClose={closeAssistant}
        onExpressionChange={setMascotExpression}
        onSubmit={runAssistant}
        onSelect={(id) => {
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
          <small>Scripted demonstration</small>
        </span>
        <span className="demo-label">DEMO</span>
        <Icon name={assistantOpen ? "close" : "arrow"} size={16} />
      </button>
      <footer className="workspace-footer">
        <span>
          <i />
          SYNTHETIC DEMONSTRATION · NO LIVE INFRASTRUCTURE DATA
        </span>
        <button onClick={() => setSourcesOpen((v) => !v)}>
          Data provenance <Icon name="info" size={11} />
        </button>
      </footer>
    </main>
  );
}
