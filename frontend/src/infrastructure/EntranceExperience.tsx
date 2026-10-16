import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { InfrastructureStation } from "./contracts";
import type { EntranceSourceRecord } from "./entranceCatalog";
import type { EntranceDetailGeometry } from "./entranceGeometry";
import type { FloodPlayback } from "./useFloodPlayback";
import "./entranceExperience.css";

export function EntranceExperience({
  station,
  entrances,
  selectedId,
  detail,
  status,
  error,
  onRetry,
  onSelect,
  onFocus,
  selectedComponentId,
  onComponent,
  playback: p,
  evidence,
}: {
  station: InfrastructureStation;
  entrances: EntranceSourceRecord[];
  selectedId: string | null;
  detail: EntranceDetailGeometry | null;
  status: string;
  error: string;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onFocus: (part: "entrance" | "stairwell" | "landing" | "overview") => void;
  selectedComponentId: string | null;
  onComponent: (id: string) => void;
  playback: FloodPlayback;
  evidence: ReactNode;
}) {
  type View = "current" | "history" | "whatif";
  const [viewState, setViewState] = useState<{
    identity: string | null;
    view: View;
  }>({ identity: selectedId, view: "current" });
  const tab: View =
    viewState.identity === selectedId ? viewState.view : "current";
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    setViewState({ identity: selectedId, view: "current" });
    panel.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [selectedId]);
  const selected = entrances.find((item) => item.id === selectedId);
  const view = (next: typeof tab) => {
    setViewState({ identity: selectedId, view: next });
    if (next === "whatif") p.open();
    else p.evidence();
  };
  return (
    <section
      className="entrance-experience"
      aria-label="Entrance and flood what-if experience"
      ref={panel}
    >
      <span className="infrastructure-tag">
        ENTRANCE LAB · SOURCE-LINKED / SCHEMATIC DETAIL
      </span>
      <h3>From street to stairwell</h3>
      <p className="transit-copy">
        {station.name} · {station.routes.join(" / ")} · GTFS {station.id}
      </p>
      {status === "loading" && (
        <p role="status">Loading cached entrance types…</p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={onRetry}>Retry entrance inventory</button>
        </div>
      )}
      <label htmlFor="detail-entrance">Source-linked entrance</label>
      <select
        id="detail-entrance"
        value={selectedId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="">Choose an entrance</option>
        {entrances.map((item) => (
          <option key={item.id} value={item.id}>
            {item.type} · {item.id}
          </option>
        ))}
      </select>
      {!entrances.length && status === "ready" && (
        <p>No matched source entrances are available for this station.</p>
      )}
      {selected && (
        <>
          <p className="entrance-source-id">
            S4 / 2024 inventory · {selected.id}
            <br />
            Source type: {selected.type} · source point unchanged
          </p>
          {!detail && (
            <p className="transit-notice">
              Detailed stairs are unavailable for this source type. Its marker
              remains at the source point; no staircase or hydraulic connection
              is inferred.
            </p>
          )}
        </>
      )}
      {detail && (
        <>
          <nav
            className="entrance-journey"
            aria-label="Entrance inspection stages"
          >
            <button onClick={() => onFocus("overview")}>
              Station overview
            </button>
            <button onClick={() => onFocus("entrance")}>1 · Entrance</button>
            <button onClick={() => onFocus("stairwell")}>2 · Stairwell</button>
            <button onClick={() => onFocus("landing")}>3 · Landing</button>
          </nav>
          <label htmlFor="entrance-detail-component">
            Select detail component
          </label>
          <select
            id="entrance-detail-component"
            value={selectedComponentId ?? ""}
            onChange={(event) => onComponent(event.target.value)}
          >
            <option value="">Pick geometry or choose a component</option>
            {detail.components.map((component) => (
              <option key={component.id} value={component.id}>
                {component.label}
              </option>
            ))}
          </select>
          <details>
            <summary>Schematic geometry basis</summary>
            <ul>
              {detail.assumptions.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <p>
              Original source coordinate: {detail.sourcePosition.join(", ")}.
              Reference images inform architecture only.
            </p>
          </details>
          <p className="transit-notice">
            {detail.floodGeometry.unsupportedConnections?.join(" ")}
          </p>
        </>
      )}
      <div
        className="entrance-tabs"
        role="group"
        aria-label="Evidence and hypothetical views"
      >
        <button
          aria-pressed={tab === "current"}
          onClick={() => view("current")}
        >
          Current evidence
        </button>
        <button
          aria-pressed={tab === "history"}
          onClick={() => view("history")}
        >
          Exposure & history
        </button>
        <button
          aria-pressed={tab === "whatif"}
          disabled={!detail}
          onClick={() => view("whatif")}
        >
          What-if flood simulation
        </button>
      </div>
      {tab !== "whatif" ? (
        <div data-evidence-view={tab}>{evidence}</div>
      ) : (
        detail && (
          <div className="what-if-panel">
            <strong>HYPOTHETICAL · LOCAL CALCULATION</strong>
            <p>Illustrative what-if model — not calibrated station flooding.</p>
            <p className="transit-copy">
              {station.name} · {selectedId}. All defaults below are illustrative
              user assumptions. Street water is a prescribed boundary;
              dimensions, thresholds, drainage and connections are unmeasured.
              This does not predict the actual station.
            </p>
            <div className="what-if-inputs">
              {(
                [
                  ["streetDepthM", "Assumed street ponding (m)", 0, 2, 0.05],
                  [
                    "barrierHeightM",
                    "Assumed threshold / barrier (m)",
                    0,
                    2,
                    0.05,
                  ],
                  [
                    "inflowCapacityLps",
                    "Assumed inflow capacity (L/s)",
                    0,
                    100,
                    1,
                  ],
                  [
                    "drainageCapacityLps",
                    "Assumed removal capacity (L/s)",
                    0,
                    100,
                    1,
                  ],
                  ["durationS", "Scenario duration (s)", 1, 1800, 1],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={Number.isFinite(p.inputs[key]) ? p.inputs[key] : ""}
                    onChange={(event) =>
                      p.setInput(key, event.target.valueAsNumber)
                    }
                  />
                </label>
              ))}
            </div>
            <div className="what-if-actions">
              <button onClick={p.play}>
                {p.trajectory ? "Play / resume" : "Run illustrative scenario"}
              </button>
              <button disabled={!p.playing} onClick={p.pause}>
                Pause
              </button>
              <button onClick={p.reset}>Reset water</button>
            </div>
            {p.error && <p role="alert">{p.error}</p>}
            <label htmlFor="what-if-speed">Playback speed</label>
            <select
              id="what-if-speed"
              value={p.speed}
              onChange={(event) => p.setSpeed(Number(event.target.value))}
            >
              <option value="1">1× time</option>
              <option value="30">30× time</option>
              <option value="60">60× time</option>
            </select>
            <label htmlFor="what-if-time">
              Hypothetical elapsed time · {Math.floor(p.timeS)} /{" "}
              {p.inputs.durationS} s · {p.playing ? "PLAYING" : "PAUSED"}
            </label>
            <input
              id="what-if-time"
              type="range"
              min="0"
              max={p.inputs.durationS}
              step="1"
              value={p.timeS}
              disabled={!p.trajectory}
              onChange={(event) => p.scrub(Number(event.target.value))}
            />
            <div
              className="what-if-actions"
              role="group"
              aria-label="Compare hypothetical water"
            >
              <button
                aria-pressed={p.compareBaseline}
                onClick={() => p.compare(true)}
              >
                Baseline geometry
              </button>
              <button
                aria-pressed={!p.compareBaseline}
                onClick={() => p.compare(false)}
              >
                Scenario water
              </button>
            </div>
            <p className="transit-copy">
              Baseline = zero initial water in this demonstrator, not an
              observed dry station. Comparison changes visibility only. Flood
              detail starts at 1× vertical scale.
            </p>
            {p.frame && (
              <>
                <table className="what-if-results">
                  <caption>Computed hypothetical storage · SI units</caption>
                  <thead>
                    <tr>
                      <th scope="col">Space</th>
                      <th scope="col">Depth (m)</th>
                      <th scope="col">Volume (L)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.frame.compartments.map((compartment) => (
                      <tr key={compartment.id}>
                        <th scope="row">{compartment.id}</th>
                        <td>{compartment.depthM.toFixed(2)}</td>
                        <td>{(compartment.volumeM3 * 1000).toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="transit-copy">
                  Supplied {(p.frame.ledger.suppliedM3 * 1000).toFixed(0)} L ·
                  removed {(p.frame.ledger.drainedM3 * 1000).toFixed(0)} L ·
                  overflow {(p.frame.ledger.overflowM3 * 1000).toFixed(0)} L.
                  Balance residual{" "}
                  {p.frame.ledger.balanceErrorM3.toExponential(1)} m³.
                </p>
                <p className="transit-copy">
                  Model {p.trajectory?.modelVersion} · geometry{" "}
                  {p.trajectory?.geometryVersion}. Simulation time is separate
                  from source/feed time.
                </p>
              </>
            )}
            <ul className="transit-copy">
              {(
                p.trajectory?.warnings ?? [
                  "Station-wide corridors and unresolved network gaps are excluded.",
                ]
              ).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <button
              onClick={() => {
                p.reset();
                view("current");
              }}
            >
              Reset and return to current evidence
            </button>
          </div>
        )
      )}
    </section>
  );
}
