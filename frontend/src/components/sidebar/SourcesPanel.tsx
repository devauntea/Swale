import { useLayoutEffect, useRef } from "react";
import type { DemoSnapshot } from "../../types";
import type { LocalFixtureOptions } from "../../data/providers/LocalFixtureProvider";
import { fixtureTime, formatTime } from "../../app/format";
import { Icon } from "../controls/Icon";
import {
  WorkspaceNotice,
  type WorkspaceNoticeContent,
} from "../controls/WorkspaceNotice";

export function SourcesPanel({
  snapshot,
  settings,
  onSettings,
  onClose,
  notice,
  onRestore,
}: {
  snapshot: DemoSnapshot;
  settings: Required<LocalFixtureOptions>;
  onSettings: (settings: Required<LocalFixtureOptions>) => void;
  onClose: () => void;
  notice: WorkspaceNoticeContent | null;
  onRestore: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const trigger = document.activeElement;
    const element = panel.current;
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      // Do not steal focus if the user moved to another workspace control.
      if (
        element?.contains(document.activeElement) &&
        trigger instanceof HTMLElement &&
        trigger.isConnected
      )
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape is delegated from descendant controls, not a landmark activation key.
    <aside
      className="sources-panel"
      ref={panel}
      aria-labelledby="sources-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <span className="eyebrow">WORKSPACE TRANSPARENCY</span>
          <h2 id="sources-title">Sources & freshness</h2>
        </div>
        <button
          className="icon-button"
          ref={closeButton}
          aria-label="Close data sources"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      {notice && (
        <WorkspaceNotice notice={notice} onRestore={onRestore} inline />
      )}
      <div className="sources-scroll">
        <div className="sources-intro">
          <span className="demo-label">STANDALONE DEMONSTRATION</span>
          <p>
            The map background is real basemap geography. Infrastructure
            overlays, identifiers and values are synthetic examples with limited
            focus-area coverage.
          </p>
        </div>
        <Source
          name="Basins & priorities"
          kind="DEMO / STATIC INVENTORY + HEURISTIC SCORE"
          detail={snapshot.provenance.source}
          time={`Fixture authored: ${fixtureTime(snapshot.provenance)}`}
        />
        <Source
          name="Flood overlays"
          kind="DEMO / SCENARIO"
          detail="Local illustrative polygons. Not the official NYC DEP flood maps."
          time={`Fixture authored: ${fixtureTime(snapshot.provenance)}`}
        />
        <Source
          name="Complaint examples"
          kind="DEMO / HISTORICAL"
          detail="Local recent points and prebuilt historical hexagons; not actual 311 records."
          time={`Fixture authored: ${fixtureTime(snapshot.provenance)}`}
        />
        <Source
          name="Rainfall outlook"
          kind="DEMO / FORECAST EXAMPLE"
          detail={snapshot.forecast.provenance.source}
          time={`Example issued: ${formatTime(snapshot.forecast.issuedAt, "Unavailable")}`}
        />
        <Source
          name="Map & buildings"
          kind="STATIC / OPENFREEMAP"
          detail="OpenFreeMap / OpenMapTiles / OpenStreetMap. Basemap heights are approximate and may be inferred."
          time="Tile generation: Oct 11, 2026 · source OSM edit times vary"
        />
        <div className="source-dates">
          <p>External source update: not connected</p>
          <p>External retrieval: not connected</p>
          <p>Local fixture reload does not update source timestamps.</p>
        </div>
        <section className="demo-settings">
          <h3>Preview demonstration states</h3>
          <p>These controls only change local examples.</p>
          <label htmlFor="forecast-state">
            Forecast example
            <select
              id="forecast-state"
              value={settings.forecastState}
              onChange={(e) =>
                onSettings({
                  ...settings,
                  forecastState: e.target
                    .value as Required<LocalFixtureOptions>["forecastState"],
                })
              }
            >
              <option value="available">Available</option>
              <option value="stale">Stale</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </label>
          <label htmlFor="workspace-state">
            Workspace example
            <select
              id="workspace-state"
              value={settings.mode}
              onChange={(e) =>
                onSettings({
                  ...settings,
                  mode: e.target.value as Required<LocalFixtureOptions>["mode"],
                })
              }
            >
              <option value="ready">Ready</option>
              <option value="empty">Empty infrastructure</option>
              <option value="error">Provider error</option>
            </select>
          </label>
          <p>
            Predefined priority values stay unchanged when previewing forecast
            availability.
          </p>
        </section>
        <div className="scope-note">
          <Icon name="info" size={16} />
          <p>
            Backend, production data, scoring and real AI are independently
            owned by the backend team. Integration has not started.
          </p>
        </div>
      </div>
    </aside>
  );
}
function Source({
  name,
  kind,
  detail,
  time,
}: {
  name: string;
  kind: string;
  detail: string;
  time: string;
}) {
  return (
    <section className="source-item">
      <h3>{name}</h3>
      <span>{kind}</span>
      <p>{detail}</p>
      <small>{time}</small>
    </section>
  );
}
