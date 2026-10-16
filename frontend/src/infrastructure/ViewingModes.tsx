import type { FloodPlayback } from "./useFloodPlayback";
import { ServiceBadges } from "../components/transit/ServiceBadges";
import "./viewingModes.css";

export type WaterView = "normal" | "flood_simulation";

export function ViewingModes({
  exploring,
  waterView,
  onWaterView,
  stationName,
  routes = [],
  hasDetail,
  hasPlatform,
  playback: p,
  onExplore,
  onReturn,
  onViewpoint,
}: {
  exploring: boolean;
  waterView: WaterView;
  onWaterView: (view: WaterView) => void;
  stationName?: string;
  routes?: string[];
  hasDetail: boolean;
  hasPlatform?: boolean;
  playback: FloodPlayback;
  onExplore?: () => void;
  onReturn: () => void;
  onViewpoint: (
    part: "entrance" | "stairwell" | "landing" | "platform" | "overview",
  ) => void;
}) {
  return (
    <section className="viewing-modes" aria-label="Scene and water view">
      <div className="viewing-heading">
        <strong>
          {exploring
            ? `${stationName ?? "Station"} · Model tour`
            : "Brooklyn overview"}
        </strong>
        {exploring && <button onClick={onReturn}>Return to overview</button>}
      </div>
      {exploring && <ServiceBadges routes={routes} />}
      <div role="group" aria-label="Water view" className="water-view-options">
        <button
          aria-pressed={waterView === "normal"}
          onClick={() => onWaterView("normal")}
        >
          Normal view
        </button>
        <button
          aria-pressed={waterView === "flood_simulation"}
          onClick={() => onWaterView("flood_simulation")}
        >
          Flood simulation
        </button>
        {!exploring && onExplore && (
          <button onClick={onExplore}>Explore station</button>
        )}
      </div>
      {waterView === "normal" ? (
        <p>
          Infrastructure baseline · interior water unknown. Normal view does not
          establish dry, safe or open conditions.
        </p>
      ) : (
        <>
          <strong className="simulation-label">
            Hypothetical flood simulation
          </strong>
          <p>
            {hasDetail
              ? `${stationName} · local entrance storage model · ${Math.floor(p.timeS)} s`
              : "Select a supported station and entrance to view a local hypothetical snapshot."}
          </p>
          <p>
            Uncalibrated; prescribed street boundary. Regional scenario polygons
            and station storage are separate, uncoupled models.
          </p>
          {hasDetail && (
            <>
              {p.frame && (
                <p className="snapshot-value">
                  Selected entrance snapshot:{" "}
                  {(p.frame.ledger.storedM3 * 1000).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}{" "}
                  L stored in modeled compartments · hypothetical, not measured.
                </p>
              )}
              <div className="simulation-transport">
                <button onClick={() => (p.playing ? p.pause() : p.play())}>
                  {p.playing ? "Pause simulation" : "Play simulation"}
                </button>
                <button onClick={p.reset}>Reset simulation</button>
                <button
                  onClick={() => p.snapshot(600)}
                  disabled={p.inputs.durationS < 600}
                >
                  600 s snapshot
                </button>
                <label>
                  Elapsed seconds
                  <input
                    aria-label="Simulation elapsed seconds"
                    type="range"
                    min={0}
                    max={p.inputs.durationS}
                    step={1}
                    value={p.timeS}
                    onChange={(event) => p.scrub(event.target.valueAsNumber)}
                  />
                </label>
              </div>
              <details>
                <summary>Scenario assumptions</summary>
                <p>
                  Street ponding {p.inputs.streetDepthM} m · threshold{" "}
                  {p.inputs.barrierHeightM} m · supply{" "}
                  {p.inputs.inflowCapacityLps} L/s · removal{" "}
                  {p.inputs.drainageCapacityLps} L/s · duration{" "}
                  {p.inputs.durationS} s. Change these in the entrance lab. No
                  current water observation.
                </p>
              </details>
              {p.error && <p role="alert">{p.error}</p>}
            </>
          )}
        </>
      )}
      {exploring && (
        <>
          <nav className="guided-tour" aria-label="Virtual model viewpoints">
            <button
              disabled={!hasDetail}
              onClick={() => onViewpoint("entrance")}
            >
              1 Entrance
            </button>
            <button
              disabled={!hasDetail}
              onClick={() => onViewpoint("stairwell")}
            >
              2 Steps
            </button>
            <button
              disabled={!hasDetail}
              onClick={() => onViewpoint("landing")}
            >
              3 Landing
            </button>
            {hasPlatform && (
              <button onClick={() => onViewpoint("platform")}>
                4 Local platform
              </button>
            )}
            <button onClick={() => onViewpoint("overview")}>
              Reset orientation
            </button>
          </nav>
          <details>
            <summary>Virtual tour controls and limitations</summary>
            <p>
              Basemap buildings are hidden during close model tours; your
              building preference returns in the overview. Use the viewpoint
              buttons to follow modeled connections. Drag to look around, wheel
              or pinch to zoom, Shift + drag to rotate; focus the map and use
              arrow keys to pan, +/− to zoom. Escape returns to overview.
              Viewpoint arrows are virtual camera controls, not real-world
              walking or evacuation directions. Schematic geometry has assumed
              dimensions; constrained viewpoints do not provide
              collision-accurate navigation.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
