import type { CatchBasin, DemoSnapshot, ScenarioId } from "../../types";
import {
  bandLabel,
  displayNumber,
  fixtureTime,
  formatTime,
} from "../../app/format";
import { Icon } from "../controls/Icon";

export function BasinInspector({
  basin,
  snapshot,
  scenarioId,
  hiddenLayer,
  onFocus,
  onClose,
}: {
  basin: CatchBasin | undefined;
  snapshot: DemoSnapshot;
  scenarioId: ScenarioId;
  hiddenLayer: boolean;
  onFocus: () => void;
  onClose: () => void;
}) {
  if (!basin)
    return (
      <aside className="basin-inspector empty-inspector">
        <Icon name="basin" size={25} />
        <h2>Explore the evidence</h2>
        <p>Select an example basin on the map or in the inspection queue.</p>
        <span className="demo-label">SYNTHETIC DEMONSTRATION</span>
      </aside>
    );
  const priority = basin.priorities[scenarioId];
  const reports = snapshot.complaints.filter((c) =>
    basin.complaintIds.includes(c.id),
  );
  return (
    <aside className="basin-inspector" aria-label="Selected basin inspector">
      <header className="inspector-topline">
        <span>
          <span className="selection-dot" />
          BASIN INSPECTOR
        </span>
        <button
          className="icon-button"
          aria-label="Close basin inspector"
          onClick={onClose}
        >
          <Icon name="close" size={15} />
        </button>
      </header>
      <div className="inspector-body">
        <div className="inspector-location">
          <Icon name="pin" size={13} /> {basin.focusArea}{" "}
          <span>DEMO ASSET</span>
        </div>
        <div className="basin-title">
          <div>
            <h2>{basin.id}</h2>
            <p>{basin.label}</p>
          </div>
          <button
            className="focus-button"
            title="Focus on selected basin"
            aria-label="Focus on selected basin"
            onClick={onFocus}
          >
            <Icon name="focus" size={17} />
          </button>
        </div>
        {hiddenLayer && (
          <p className="state-notice">
            Basin layer hidden · selection retained
          </p>
        )}
        <section className="priority-card">
          <div className="priority-card-head">
            <span>DEMO / HEURISTIC SCORE</span>
            <span className={`priority-band band-${priority.band}`}>
              {bandLabel(priority.band)}
            </span>
          </div>
          <div className="score-row">
            <strong>{displayNumber(priority.score, 1)}</strong>
            <span>
              / 100
              <br />
              <small>example score</small>
            </span>
            <ScoreGlyph band={priority.band} />
          </div>
          <p className="priority-exact-label">
            Inspection priority (heuristic, not validated)
          </p>
          <div className="priority-ramp">
            <i className="band-low" />
            <i className="band-moderate" />
            <i className="band-elevated" />
            <i className="band-high" />
          </div>
          <div className="ramp-labels">
            <span>Lower</span>
            <span>Higher</span>
          </div>
        </section>
        <section className="factor-section">
          <div className="section-heading">
            <h3>SCORE BREAKDOWN</h3>
            <span>DEMO</span>
          </div>
          <p className="factor-intro">
            Precomputed example · {snapshot.scenarios[scenarioId].shortLabel}
          </p>
          <div className="factor-table">
            <div className="factor-header">
              <span>Factor</span>
              <span>Value</span>
              <span>Weight</span>
              <span>Points</span>
            </div>
            {priority.factors.map((f) => (
              <div className="factor-block" key={f.id}>
                <div className="factor-row">
                  <span>{f.label}</span>
                  <span>{displayNumber(f.normalizedValue, 2)}</span>
                  <span>{displayNumber(f.weight * 100)}%</span>
                  <strong>{displayNumber(f.contributionPoints, 1)}</strong>
                </div>
                <div className="factor-bar">
                  <i style={{ width: `${(f.normalizedValue ?? 0) * 100}%` }} />
                </div>
                <p className="factor-source">DEMO / {f.provenance.type}</p>
              </div>
            ))}
          </div>
          <p className="micro-copy">
            Values normalized to 0–1; contributions shown in score points.
            Backend calculation is not connected.
          </p>
        </section>
        <section className="evidence-section">
          <div className="section-heading">
            <h3>ASSOCIATED EXAMPLE REPORTS</h3>
            <span className="count-pill">{reports.length}</span>
          </div>
          {reports.length ? (
            reports.slice(0, 2).map((r) => (
              <div key={r.id} className="report-row">
                <Icon name="complaint" size={15} />
                <div>
                  <strong>{r.descriptor}</strong>
                  <span>
                    {r.complaintType} · {formatTime(r.createdAt)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="micro-copy">No associated complaint examples.</p>
          )}
          <p className="evidence-caveat">
            DEMO / HISTORICAL · association is illustrative.
            <br />
            Nearby reports do not establish cause or blockage.
          </p>
        </section>
        <div className="uncertainty-note">
          <Icon name="info" size={15} />
          <p>
            A priority score cannot establish whether a catch basin is blocked.
          </p>
        </div>
        <details className="inspector-provenance">
          <summary>
            Source & example timestamps <Icon name="chevron" size={13} />
          </summary>
          <p>
            {priority.provenance.source} · {priority.version}
          </p>
          <p>Fixture authored: {fixtureTime(priority.provenance)}</p>
          <p>
            Source updated: {formatTime(priority.provenance.sourceUpdatedAt)}
          </p>
          <p>Retrieved: {formatTime(priority.provenance.retrievedAt)}</p>
          <p>
            Synthetic IDs, positions, scores and associations. No official
            inventory or production data loaded.
          </p>
        </details>
      </div>
    </aside>
  );
}
function ScoreGlyph({ band }: { band: string }) {
  return (
    <svg
      className={`score-glyph text-${band}`}
      viewBox="0 0 60 48"
      width="64"
      height="48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 40V29m11 11V21m11 19V14m11 26V8m11 32V3"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        opacity=".75"
      />
    </svg>
  );
}
