import type { DemoSnapshot, ScenarioId, LayerVisibility } from "../../types";
import { bandLabel, fixtureTime } from "../../app/format";
import { Icon, type IconName } from "../controls/Icon";
import { ForecastCard } from "./ForecastCard";

interface Props {
  snapshot: DemoSnapshot;
  scenarioId: ScenarioId;
  layers: LayerVisibility;
  selectedBasinId: string | null;
  navigationTargetId: string;
  refreshing: boolean;
  refreshMessage: string;
  onScenario: (id: ScenarioId) => void;
  onLayer: (key: keyof LayerVisibility) => void;
  onNavigate: (id: string) => void;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onSources: () => void;
}
const layerItems: {
  key: keyof LayerVisibility;
  name: string;
  detail: string;
  icon: IconName;
}[] = [
  {
    key: "basins",
    name: "Catch basins",
    detail: "DEMO / STATIC INVENTORY",
    icon: "basin",
  },
  {
    key: "floodZones",
    name: "Flood zones",
    detail: "DEMO / SCENARIO",
    icon: "drop",
  },
  {
    key: "complaints",
    name: "311 complaints",
    detail: "DEMO / HISTORICAL",
    icon: "complaint",
  },
  {
    key: "buildings",
    name: "3D buildings",
    detail: "STATIC / OPENFREEMAP",
    icon: "building",
  },
];
export function ControlSidebar(p: Props) {
  const scenario = p.snapshot.scenarios[p.scenarioId];
  const queue = p.snapshot.rankedBasinIds[p.scenarioId]
    .map((id) => p.snapshot.basins.find((b) => b.id === id))
    .filter((b) => b !== undefined)
    .slice(0, 4);
  return (
    <aside className="control-sidebar" aria-label="Planning controls">
      <header className="brand-header">
        <div className="brand-mark">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <path d="M7 9h12c10 0 10 9 0 9h-2c-10 0-10 9 0 9h12M7 18h3m16 0h3" />
          </svg>
        </div>
        <div>
          <h1>SWALE</h1>
          <p>URBAN FLOOD READINESS</p>
        </div>
        <span className="brand-corner">BK</span>
      </header>
      <div className="workspace-mode">
        <span>
          <span className="demo-dot" />
          DEMONSTRATION
        </span>
        <button
          className="icon-button"
          title="Data sources and demonstration settings"
          aria-label="Data sources and demonstration settings"
          onClick={p.onSources}
        >
          <Icon name="info" size={16} />
        </button>
      </div>
      <div className="sidebar-scroll">
        <section className="scenario-section" aria-labelledby="scenario-title">
          <div className="section-heading">
            <h2 id="scenario-title">FLOOD SCENARIO</h2>
            <span className="section-type">SCENARIO</span>
          </div>
          <div
            className="scenario-segments"
            role="group"
            aria-label="Flood scenario"
          >
            <button
              aria-pressed={p.scenarioId === "moderate_current"}
              className={p.scenarioId === "moderate_current" ? "active" : ""}
              onClick={() => p.onScenario("moderate_current")}
            >
              Moderate<span>Current</span>
            </button>
            <button
              aria-pressed={p.scenarioId === "extreme_2080"}
              className={p.scenarioId === "extreme_2080" ? "active" : ""}
              onClick={() => p.onScenario("extreme_2080")}
            >
              Extreme<span>2080</span>
            </button>
          </div>
          <div className="scenario-assumptions">
            <Icon name="drop" size={15} />
            <p>
              <strong>{scenario.rainfallIntensityInchesPerHour} in/hr</strong>
              <span>{scenario.seaLevelAssumption}</span>
            </p>
            <span className="scenario-tag">
              {p.scenarioId === "extreme_2080" ? "EXTREME" : "MODERATE"}
            </span>
          </div>
          <p className="micro-copy">
            NYC DEP scenario definitions · geometry is DEMO. Rainfall and
            sea-level assumptions both change.
          </p>
        </section>
        <section className="location-section">
          <label className="section-heading" htmlFor="location">
            <span>MAP LOCATION</span>
            <Icon name="pin" size={14} />
          </label>
          <div className="select-wrap">
            <select
              id="location"
              value={
                p.snapshot.targets.some((t) => t.id === p.navigationTargetId)
                  ? p.navigationTargetId
                  : "basin-focus"
              }
              onChange={(e) => p.onNavigate(e.target.value)}
            >
              {!p.snapshot.targets.some(
                (t) => t.id === p.navigationTargetId,
              ) && (
                <option value="basin-focus" disabled>
                  Selected example basin
                </option>
              )}
              {p.snapshot.targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <Icon name="chevron" size={15} />
          </div>
        </section>
        <section className="layers-section" aria-labelledby="layers-title">
          <div className="section-heading">
            <h2 id="layers-title">MAP LAYERS</h2>
            <Icon name="layers" size={14} />
          </div>
          <div className="layer-list">
            {layerItems.map((item) => (
              <label className="layer-row" key={item.key}>
                <span className={`layer-icon layer-icon-${item.key}`}>
                  <Icon name={item.icon} size={17} />
                </span>
                <span className="layer-label">
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={item.name}
                  checked={p.layers[item.key]}
                  onChange={() => p.onLayer(item.key)}
                />
                <span className="switch-track" aria-hidden="true" />
              </label>
            ))}
          </div>
          <p className="layer-source-note">
            Local examples authored {fixtureTime(p.snapshot.provenance)}.<br />
            Buildings: basemap estimates · tile generation Oct 11, 2026.
          </p>
        </section>
        <ForecastCard forecast={p.snapshot.forecast} />
        <section className="queue-section" aria-labelledby="queue-title">
          <div className="section-heading">
            <h2 id="queue-title">EXAMPLE INSPECTION QUEUE</h2>
            <span className="demo-label">DEMO</span>
          </div>
          <div className="queue-list">
            {queue.map((b) => {
              const priority = b.priorities[p.scenarioId];
              return (
                <button
                  key={b.id}
                  className={`queue-row ${p.selectedBasinId === b.id ? "selected" : ""}`}
                  onClick={() => p.onSelect(b.id)}
                  aria-label={`Select ${b.id}`}
                >
                  <span className={`priority-dot band-${priority.band}`} />
                  <span>
                    <strong>{b.id}</strong>
                    <small>{b.focusArea}</small>
                  </span>
                  <span className={`queue-score text-${priority.band}`}>
                    {priority.score ?? "—"}
                  </span>
                  <Icon name="chevron" size={14} />
                </button>
              );
            })}
          </div>
          <p className="micro-copy">
            Inspection priority (heuristic, not validated).
            <br />
            HEURISTIC SCORE · stored local examples; illustrative order.
          </p>
        </section>
      </div>
      <footer className="sidebar-footer">
        <button
          className="refresh-button"
          onClick={p.onRefresh}
          disabled={p.refreshing}
        >
          <Icon
            name="refresh"
            size={15}
            className={p.refreshing ? "spinning" : ""}
          />
          <span>
            {p.refreshing ? "Reloading examples…" : "Refresh workspace"}
          </span>
          <span className="key-hint">LOCAL</span>
        </button>
        <p className="refresh-status" role="status">
          {p.refreshMessage || "Local fixtures · live data integration pending"}
        </p>
        <button className="sources-link" onClick={p.onSources}>
          Sources, freshness & demo states <Icon name="arrow" size={13} />
        </button>
      </footer>
    </aside>
  );
}
export { bandLabel };
