import { useState } from "react";
import type { DemoSnapshot, LayerVisibility, ScenarioId } from "../../types";
import { Icon } from "./Icon";
import { fixtureTime } from "../../app/format";

export function MapLegend({
  snapshot,
  layers,
  scenarioId,
}: {
  snapshot: DemoSnapshot;
  layers: LayerVisibility;
  scenarioId: ScenarioId;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <section
      className={`map-legend ${expanded ? "" : "collapsed"}`}
      aria-label="Map legend"
    >
      <button
        className="legend-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span>
          <Icon name="layers" size={14} /> MAP LEGEND
        </span>
        <Icon name="chevron" size={14} className={expanded ? "rotated" : ""} />
      </button>
      {expanded && (
        <div className="legend-content">
          {layers.basins && (
            <div className="legend-priority">
              <p>Inspection priority (heuristic, not validated)</p>
              <div>
                {(["low", "moderate", "elevated", "high"] as const).map((b) => (
                  <span key={b}>
                    <i className={`priority-dot band-${b}`} />
                    {b[0].toUpperCase() + b.slice(1)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="legend-layers">
            {layers.basins && (
              <span>
                <img
                  src="/markers/catch-basin.svg"
                  width="24"
                  height="24"
                  alt=""
                />
                Catch basin · red identifies type, not condition
              </span>
            )}
            {layers.floodZones && (
              <span>
                <i
                  className={`flood-swatch ${scenarioId === "extreme_2080" ? "extreme" : ""}`}
                />
                Illustrative flood extent
              </span>
            )}
            {layers.complaints && (
              <>
                <span>
                  <img
                    src="/markers/complaint-311.svg"
                    width="24"
                    height="24"
                    alt=""
                  />
                  Recent report examples
                </span>
                <span>
                  <i className="hex-swatch" />
                  Historical density examples
                </span>
              </>
            )}
            {!layers.floodZones && !layers.complaints && !layers.basins && (
              <span>Analysis overlays hidden</span>
            )}
          </div>
          <p className="legend-source">
            DEMO · local fixtures · authored {fixtureTime(snapshot.provenance)}
            <br />
            SCENARIO / HEURISTIC SCORE / HISTORICAL · no real-world coverage
          </p>
        </div>
      )}
    </section>
  );
}
