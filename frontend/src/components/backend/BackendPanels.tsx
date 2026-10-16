import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type {
  BackendBasin,
  BackendCollectionState,
  BackendData,
  BackendDetailState,
  BackendFeature,
  BackendIncident,
  BackendSourceFreshness,
} from "../../backend/contracts";
import type { LayerVisibility } from "../../types";
import { displayNumber, formatTime } from "../../app/format";
import { Icon, type IconName } from "../controls/Icon";
import { HazardLegend } from "../controls/HazardMotionControl";
import "./backend.css";

export type BackendLayerKey = "basins" | "complaints" | "buildings";
type RecordKind = "basin" | "incident";

const backendLayers: {
  key: BackendLayerKey;
  title: string;
  detail: string;
  icon: IconName;
}[] = [
  {
    key: "basins",
    title: "Catch basin inventory",
    detail: "OBSERVED INVENTORY · NO CONDITION",
    icon: "basin",
  },
  {
    key: "complaints",
    title: "Reported incidents",
    detail: "REPORTED · HISTORICAL SNAPSHOT",
    icon: "complaint",
  },
  {
    key: "buildings",
    title: "3D buildings",
    detail: "STATIC · OPENFREEMAP",
    icon: "building",
  },
];

export function BackendSidebar(p: {
  modeSelector: ReactNode;
  viewSelector?: ReactNode;
  data: BackendData;
  layers: LayerVisibility;
  onLayer: (key: BackendLayerKey) => void;
  onSelect: (kind: RecordKind, id: string) => void;
  onRefresh: () => void;
  onSources: () => void;
}) {
  const busy =
    p.data.metadataStatus === "loading" ||
    p.data.basins.status === "loading" ||
    p.data.incidents.status === "loading";
  return (
    <aside
      className="control-sidebar backend-sidebar"
      id="planning-controls"
      aria-label="Planning controls"
    >
      <header className="brand-header">
        <div className="brand-mark">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <path d="M4 10c8-9 16 9 28 0M4 18c8-9 16 9 28 0M4 26c8-9 16 9 28 0" />
          </svg>
        </div>
        <div>
          <h1>Swale</h1>
          <p>URBAN FLOOD READINESS</p>
        </div>
        <span className="brand-corner">BK</span>
      </header>
      <div className="workspace-mode">
        <span>LOCAL BACKEND / SNAPSHOT</span>
        <button
          className="icon-button"
          aria-label="Backend sources and freshness"
          onClick={p.onSources}
        >
          <Icon name="info" size={16} />
        </button>
      </div>
      {p.modeSelector}
      {p.viewSelector}
      <div className="sidebar-scroll">
        <section className="backend-section">
          <div className="section-heading">
            <h2>SNAPSHOT COVERAGE</h2>
            <Icon name="pin" size={14} />
          </div>
          <p className="backend-copy">
            BK0601 bounding-box snapshot. Requests follow the settled map
            viewport; loaded records are a subset of this local snapshot, with
            no boroughwide coverage claim.
          </p>
          <p className="backend-copy">
            Source records are replayed locally. This is not a live feed;
            refresh does not fetch new NYC data.
          </p>
          <MetadataNotice data={p.data} onRetry={p.onRefresh} />
        </section>
        <section
          className="layers-section"
          data-tutorial="layers"
          aria-labelledby="backend-layers-title"
        >
          <div className="section-heading">
            <h2 id="backend-layers-title">MAP LAYERS</h2>
            <Icon name="layers" size={14} />
          </div>
          <div className="layer-list">
            {backendLayers.map((layer) => (
              <label className="layer-row" key={layer.key}>
                <span className={`layer-icon layer-icon-${layer.key}`}>
                  <Icon name={layer.icon} size={17} />
                </span>
                <span className="layer-label">
                  <strong>{layer.title}</strong>
                  <small>{layer.detail}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={layer.title}
                  checked={p.layers[layer.key]}
                  aria-checked={p.layers[layer.key]}
                  onChange={() => p.onLayer(layer.key)}
                />
                <span className="switch-track" aria-hidden="true" />
              </label>
            ))}
          </div>
          <p className="backend-copy">
            Inventory records establish location, not present condition.
            Reports, agency findings and inferred associations remain distinct.
          </p>
        </section>
        <CollectionSection
          title="LOADED INVENTORY"
          kind="basin"
          collection={p.data.basins}
          onSelect={p.onSelect}
          onRetry={p.onRefresh}
        />
        <CollectionSection
          title="LOADED INCIDENTS"
          kind="incident"
          collection={p.data.incidents}
          onSelect={p.onSelect}
          onRetry={p.onRefresh}
        />
        <RecordLookup onSelect={p.onSelect} />
        <section className="backend-section backend-unavailable">
          <h2>OUTSIDE THIS CONNECTED VIEW</h2>
          <p>
            Fixture scenarios, synthetic flood polygons and fixture inspection
            priorities are unavailable in this snapshot view. The contextual
            assistant uses selected source evidence and explicit provider
            controls. Subway monitoring provides separately labelled transit,
            weather and flood context. The fixture demonstration keeps its
            authored examples.
          </p>
          <p>
            Advertised backend capabilities do not enable additional actions.
          </p>
        </section>
      </div>
      <footer className="sidebar-footer">
        <button
          className="refresh-button"
          disabled={busy}
          onClick={p.onRefresh}
        >
          <Icon name="refresh" size={15} className={busy ? "spinning" : ""} />
          <span>{busy ? "Loading snapshot…" : "Refresh snapshot view"}</span>
          <span className="key-hint">LOCAL</span>
        </button>
        <p className="refresh-status">
          GET only · no live ingestion or scoring
        </p>
        <button className="sources-link" onClick={p.onSources}>
          Sources, timestamps & limitations <Icon name="arrow" size={13} />
        </button>
      </footer>
    </aside>
  );
}

function MetadataNotice({
  data,
  onRetry,
}: {
  data: BackendData;
  onRetry: () => void;
}) {
  if (data.metadataStatus === "error")
    return (
      <div className="backend-notice" role="alert">
        <strong>Backend metadata unavailable</strong>
        <p>{data.metadataError || "The local backend could not be reached."}</p>
        <p>Fixture data has not been substituted.</p>
        <button onClick={onRetry}>Retry backend</button>
      </div>
    );
  if (data.metadataStatus === "loading")
    return (
      <p className="backend-notice" role="status">
        Loading backend metadata…
      </p>
    );
  if (data.health?.status === "degraded")
    return (
      <p className="backend-notice" role="status">
        <strong>Backend health: DEGRADED</strong>
        Source freshness or database health is degraded, including when the
        request succeeds. Inspect source timestamps below.
      </p>
    );
  if (data.health)
    return (
      <p className="backend-copy" role="status">
        Backend health: {data.health.status}
      </p>
    );
  return (
    <p className="backend-copy" role="status">
      Waiting for backend metadata.
    </p>
  );
}

function CollectionSection<F extends BackendFeature>({
  title,
  kind,
  collection,
  onSelect,
  onRetry,
}: {
  title: string;
  kind: RecordKind;
  collection: BackendCollectionState<F>;
  onSelect: (kind: RecordKind, id: string) => void;
  onRetry: () => void;
}) {
  const displayed = collection.features.slice(0, 8);
  const offMap = collection.features.filter(
    (feature) => feature.geometry === null,
  ).length;
  return (
    <section className="backend-section" aria-label={title}>
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      <CollectionNotice collection={collection} onRetry={onRetry} />
      {kind === "incident" && (
        <p className="backend-copy">
          Reported-time filter: from{" "}
          <SourceTime
            value={
              typeof collection.filters.since === "string"
                ? collection.filters.since
                : null
            }
          />{" "}
          to{" "}
          <SourceTime
            value={
              typeof collection.filters.until === "string"
                ? collection.filters.until
                : null
            }
          />
          . Bounds and time filters constrain this loaded subset.
        </p>
      )}
      {(collection.status === "ready" ||
        collection.status === "empty" ||
        collection.features.length > 0) && (
        <p className="backend-subset-count">
          <strong>{collection.features.length}</strong> loaded in this subset
          {offMap > 0 && (
            <span> · {offMap} location unavailable / off map</span>
          )}
        </p>
      )}
      {displayed.length > 0 && (
        <>
          <div className="backend-record-list">
            {displayed.map((feature) => (
              <button
                key={feature.id}
                onClick={() => onSelect(kind, feature.id)}
              >
                <i
                  className={`backend-point ${kind === "incident" ? "reported" : ""}`}
                  aria-hidden="true"
                />
                <span>
                  <strong>{feature.id}</strong>
                  <small>
                    {feature.geometry === null
                      ? "Location unavailable · off map"
                      : kind === "basin"
                        ? "Inventory · no condition"
                        : "Reported incident"}
                  </small>
                </span>
                <Icon name="arrow" size={13} />
              </button>
            ))}
          </div>
          <p className="backend-copy">
            {displayed.length} of {collection.features.length} loaded records
            shown here; select other mapped records directly. No priority
            ranking is applied.
          </p>
        </>
      )}
      <details className="backend-request-times">
        <summary>Subset timestamps</summary>
        <p>
          Response generated: <SourceTime value={collection.generatedAt} />
        </p>
        {collection.sources.map((source) => (
          <Freshness key={source.id} source={source} />
        ))}
      </details>
    </section>
  );
}

function CollectionNotice<F extends BackendFeature>({
  collection,
  onRetry,
}: {
  collection: BackendCollectionState<F>;
  onRetry: () => void;
}) {
  return (
    <>
      {collection.status === "idle" && (
        <p className="backend-copy" role="status">
          Waiting for map bounds.
        </p>
      )}
      {collection.status === "loading" && (
        <p className="backend-notice" role="status">
          Loading settled viewport…{" "}
          {collection.features.length > 0 &&
            "Previous subset retained during loading."}
        </p>
      )}
      {collection.status === "error" && (
        <div className="backend-notice" role="alert">
          <p>{collection.error || "Snapshot records could not load."}</p>
          <p>
            {collection.features.length > 0
              ? "Last loaded subset retained."
              : "No records available."}{" "}
            No automatic fixture substitution.
          </p>
          <button onClick={onRetry}>Retry snapshot</button>
        </div>
      )}
      {collection.status === "empty" && (
        <p className="backend-notice" role="status">
          No records returned for these bounds and filters. This does not
          establish that no records exist elsewhere.
        </p>
      )}
      {collection.partial && (
        <p className="backend-notice" role="status">
          PARTIAL / TRUNCATED SUBSET · additional records may remain. Zoom in or
          refresh; this is not the complete dataset.
        </p>
      )}
      {collection.stale && (
        <p className="backend-notice" role="status">
          STALE SOURCE SNAPSHOT · original fetched times retained. Dimmed
          markers do not indicate lower severity.
        </p>
      )}
    </>
  );
}

function RecordLookup({
  onSelect,
}: {
  onSelect: (kind: RecordKind, id: string) => void;
}) {
  const [kind, setKind] = useState<RecordKind>("basin");
  const [id, setId] = useState("");
  return (
    <details className="backend-lookup backend-section">
      <summary>Open a known full record ID</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (id.trim()) onSelect(kind, id);
        }}
      >
        <label htmlFor="backend-record-kind">Record type</label>
        <select
          id="backend-record-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as RecordKind)}
        >
          <option value="basin">Catch basin</option>
          <option value="incident">Incident</option>
        </select>
        <label htmlFor="backend-record-id">Full opaque ID</label>
        <input
          id="backend-record-id"
          value={id}
          maxLength={1024}
          onChange={(event) => setId(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={!id.trim()}>
          Open record
        </button>
      </form>
      <p className="backend-copy">
        Uses the selected detail endpoint only. Records without geometry remain
        off map.
      </p>
    </details>
  );
}

export function BackendInspector({
  detail,
  data,
  onRetryDetail,
  onClose,
  onFocus,
}: {
  detail: BackendDetailState;
  data: BackendData;
  onRetryDetail: () => void;
  onClose: () => void;
  onFocus?: () => void;
}) {
  const feature = detail.feature;
  if (!detail.id)
    return (
      <aside className="basin-inspector empty-inspector backend-inspector">
        <Icon name="basin" size={25} />
        <h2>Explore snapshot records</h2>
        <p>
          Select inventory or a reported incident. This view contains no
          inspection scores.
        </p>
        <span className="demo-label">LOCAL BACKEND / SNAPSHOT</span>
      </aside>
    );
  const freshness = feature
    ? data.sources.find((source) => source.id === feature.properties.source.id)
    : undefined;
  return (
    <aside
      className="basin-inspector backend-inspector"
      aria-label="Selected backend record inspector"
      aria-busy={detail.status === "loading"}
    >
      <header className="inspector-topline">
        <span>
          <span className="selection-dot" />
          SNAPSHOT RECORD
        </span>
        <button
          className="icon-button"
          aria-label="Close backend record inspector"
          onClick={onClose}
        >
          <Icon name="close" size={15} />
        </button>
      </header>
      <div className="inspector-body">
        <div className="backend-record-title">
          <h2>{detail.id}</h2>
          {onFocus && feature?.geometry && (
            <button
              className="focus-button"
              aria-label="Focus on selected backend record"
              onClick={onFocus}
            >
              <Icon name="focus" size={17} />
            </button>
          )}
        </div>
        {detail.status === "loading" && (
          <p className="backend-notice" role="status">
            Loading record details…
          </p>
        )}
        {detail.status === "error" && (
          <div className="backend-notice" role="alert">
            <p>{detail.error || "Record details unavailable."}</p>
            <button onClick={onRetryDetail}>Retry record</button>
          </div>
        )}
        {feature && (
          <>
            <p className="backend-trust-label">
              {feature.properties.layer === "catch_basins"
                ? "OBSERVED / STATIC INVENTORY"
                : "REPORTED / HISTORICAL"}
            </p>
            {feature.properties.layer === "catch_basins" ? (
              <BasinDetails feature={feature as BackendBasin} />
            ) : (
              <IncidentDetails feature={feature as BackendIncident} />
            )}
            <section className="backend-section">
              <h3>LOCATION</h3>
              {feature.geometry === null ? (
                <p className="backend-notice">
                  Location unavailable · off-map record. No coordinates have
                  been substituted.
                </p>
              ) : (
                <dl className="backend-fields">
                  <dt>Longitude</dt>
                  <dd>{feature.geometry.coordinates[0]}</dd>
                  <dt>Latitude</dt>
                  <dd>{feature.geometry.coordinates[1]}</dd>
                </dl>
              )}
            </section>
            <section className="backend-section">
              <h3>SOURCE & TIMESTAMPS</h3>
              <dl className="backend-fields">
                <dt>Source</dt>
                <dd>{feature.properties.source.id}</dd>
                <dt>Dataset</dt>
                <dd>{feature.properties.source.dataset ?? "Unavailable"}</dd>
                <dt>Source record ID</dt>
                <dd>{feature.properties.source.record_id}</dd>
                <dt>Record source updated</dt>
                <dd>
                  <SourceTime value={feature.properties.source.updated_at} />
                </dd>
                <dt>Record ingested locally</dt>
                <dd>
                  <SourceTime value={feature.properties.ingested_at} />
                </dd>
                <dt>Last viewport response generated</dt>
                <dd>
                  <SourceTime
                    value={
                      feature.properties.layer === "catch_basins"
                        ? data.basins.generatedAt
                        : data.incidents.generatedAt
                    }
                  />
                </dd>
              </dl>
              {freshness ? (
                <Freshness source={freshness} />
              ) : (
                <p className="backend-copy">
                  Source fetch and dataset timestamps are unavailable in the
                  source register.
                </p>
              )}
              <SourceLink url={feature.properties.source.url}>
                Open original source record
              </SourceLink>
              <p className="backend-copy">
                Generated and ingested timestamps do not establish source
                freshness. Source update, fetch and report times are separate.
              </p>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}

function BasinDetails({ feature }: { feature: BackendBasin }) {
  return (
    <section className="backend-section">
      <p className="backend-notice">
        Inventory confirms a recorded asset location; it does not establish
        present condition, blockage, inspection or maintenance.
      </p>
      <dl className="backend-fields">
        <dt>Inventory unit ID</dt>
        <dd>{feature.properties.unitid}</dd>
        <dt>Area identifiers</dt>
        <dd>
          {feature.properties.area_ids.length > 0
            ? feature.properties.area_ids.join(", ")
            : "Unavailable"}
        </dd>
        <dt>Source State Plane coordinates</dt>
        <dd>
          {feature.properties.state_plane
            ? `${feature.properties.state_plane.x_ft} ft / ${feature.properties.state_plane.y_ft} ft · ${feature.properties.state_plane.crs}`
            : "Unavailable"}
        </dd>
      </dl>
    </section>
  );
}

function IncidentDetails({ feature }: { feature: BackendIncident }) {
  const incident = feature.properties;
  return (
    <>
      <section className="backend-section">
        <h3>{incident.category_label}</h3>
        <p className="backend-copy">
          A public report is not proof of current flooding, a blockage or its
          cause.
        </p>
        <dl className="backend-fields">
          <dt>Category</dt>
          <dd>{incident.category}</dd>
          <dt>Source status</dt>
          <dd>{incident.source_status ?? "Unavailable"}</dd>
          <dt>Reported</dt>
          <dd>
            <SourceTime value={incident.reported_at} />
          </dd>
          <dt>Closed</dt>
          <dd>
            <SourceTime value={incident.closed_at} />
          </dd>
          <dt>Address</dt>
          <dd>{incident.address ?? "Unavailable"}</dd>
        </dl>
        {incident.source_fields && (
          <details className="backend-request-times">
            <summary>Original report fields</summary>
            <dl className="backend-fields">
              {["agency", "complaint_type", "descriptor", "descriptor_2"].map(
                (key) => {
                  const value = incident.source_fields?.[key];
                  return (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>
                        {typeof value === "string" || typeof value === "number"
                          ? value
                          : "Unavailable"}
                      </dd>
                    </div>
                  );
                },
              )}
            </dl>
          </details>
        )}
      </section>
      <section className="backend-section">
        <h3>
          {incident.verification.knowledge_type === "observed"
            ? "OBSERVED AGENCY FINDING"
            : "REPORTED / RESOLUTION STATUS"}
        </h3>
        <dl className="backend-fields">
          <dt>Status classification</dt>
          <dd>{incident.verification.status}</dd>
          <dt>Basis</dt>
          <dd>{incident.verification.basis ?? "Unavailable"}</dd>
          <dt>Classification rule</dt>
          <dd>{incident.verification.rule ?? "Unavailable"}</dd>
          <dt>Finding / resolution time</dt>
          <dd>
            <SourceTime value={incident.verification.at} />
          </dd>
        </dl>
        <p className="backend-source-text">
          {incident.verification.text ?? "No agency resolution text supplied."}
        </p>
        <p className="backend-copy">
          This classification describes the source resolution at its stated
          time, not a verified current basin condition.
        </p>
      </section>
      <section className="backend-section">
        <h3>INFERRED BASIN ASSOCIATION</h3>
        {incident.linked_basin ? (
          <>
            <dl className="backend-fields">
              <dt>Basin ID</dt>
              <dd>{incident.linked_basin.id}</dd>
              <dt>Distance</dt>
              <dd>{displayNumber(incident.linked_basin.distance_ft, 2)} ft</dd>
              <dt>Method</dt>
              <dd>{incident.linked_basin.method}</dd>
            </dl>
            <p className="backend-copy">
              INFERRED spatial association supplied by the backend. Proximity
              does not establish cause or blockage.
            </p>
          </>
        ) : (
          <p className="backend-copy">
            No linked basin supplied. No association has been invented.
          </p>
        )}
      </section>
    </>
  );
}

export function BackendSourcesPanel({
  data,
  onRefresh,
  onClose,
}: {
  data: BackendData;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const trigger = document.activeElement;
    const element = panel.current;
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      if (
        element?.contains(document.activeElement) &&
        trigger instanceof HTMLElement &&
        trigger.isConnected
      )
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape is delegated from descendant controls.
    <aside
      className="sources-panel backend-sources"
      ref={panel}
      aria-labelledby="backend-sources-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <span className="eyebrow">LOCAL SNAPSHOT / GET ONLY</span>
          <h2 id="backend-sources-title">Backend sources & freshness</h2>
        </div>
        <button
          className="icon-button"
          ref={closeButton}
          aria-label="Close backend sources"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="backend-pinned-status">
        <MetadataNotice data={data} onRetry={onRefresh} />
      </div>
      <div className="sources-scroll">
        <div className="sources-intro">
          <span className="demo-label">SNAPSHOT-BACKED DATA / NOT LIVE</span>
          <p>
            Committed BK0601 bounding-box records are replayed into the local
            backend. The map shows a bounded viewport subset, not complete
            Brooklyn inventory or a live feed.
          </p>
          <p>
            Source text and timestamps below are supplied by the backend.
            Refresh reloads the local view; it does not advance source fetch
            timestamps.
          </p>
        </div>
        {data.sources.length === 0 && data.metadataStatus === "ready" && (
          <p className="backend-notice" role="status">
            No source register entries returned.
          </p>
        )}
        {data.sources.map((source) => (
          <section className="source-item backend-source-item" key={source.id}>
            <h3>{source.name}</h3>
            <p>
              {source.publisher} · {source.dataset}
            </p>
            <p>Source ID: {source.id}</p>
            <p>Cadence: {source.cadence}</p>
            <p>Time semantics: {source.time_semantics}</p>
            <Freshness source={source} />
            <SourceLink url={source.url}>Open source documentation</SourceLink>
            <h4>Source limitations</h4>
            {source.known_limitations.length > 0 ? (
              <ul>
                {source.known_limitations.map((limit, index) => (
                  <li key={`${index}-${limit}`}>{limit}</li>
                ))}
              </ul>
            ) : (
              <p>
                No limitations supplied; this does not establish complete
                coverage.
              </p>
            )}
          </section>
        ))}
        <section className="backend-section">
          <h3>BACKEND CATALOG</h3>
          <p className="backend-copy">
            Only catch basin and incident GET views are connected. Server
            availability flags do not authorize other capabilities.
          </p>
          <ul className="backend-catalog">
            {data.layers.map((layer) => (
              <li key={layer.id}>
                <strong>{layer.title}</strong>
                <span>
                  {layer.available
                    ? "Server advertises availability"
                    : "Server marks unavailable"}{" "}
                  ·{" "}
                  {layer.id === "catch_basins" || layer.id === "incidents"
                    ? "Approved GET view"
                    : "Not enabled in this frontend"}
                </span>
                <span>{layer.attribution}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="backend-section">
          <h3>INTEGRATION FLAGS</h3>
          <p className="backend-copy">
            Configuration flags are not authentication, verified functionality,
            billing permission or approval to execute services.
          </p>
          {data.health?.integrations ? (
            <dl className="backend-fields">
              {Object.entries(data.health.integrations).map(
                ([name, configured]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>
                      {configured
                        ? "Configured flag reported"
                        : "Not configured"}{" "}
                      · not executed
                    </dd>
                  </div>
                ),
              )}
            </dl>
          ) : (
            <p className="backend-copy">No integration flags supplied.</p>
          )}
        </section>
        <p className="backend-copy">
          Observed inventory, reported complaints, agency findings at their
          recorded time and inferred spatial associations have different
          meanings. No score or current-condition claim is created by this view.
        </p>
      </div>
    </aside>
  );
}

export function BackendLegend({
  layers,
  data,
}: {
  layers: LayerVisibility;
  data: BackendData;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <section
      className={`map-legend backend-legend ${expanded ? "" : "collapsed"}`}
      aria-label="Map legend"
    >
      <button
        className="legend-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>
          <Icon name="layers" size={14} /> SNAPSHOT MAP LEGEND
        </span>
        <Icon name="chevron" size={14} className={expanded ? "rotated" : ""} />
      </button>
      {expanded && (
        <div className="legend-content">
          <p>
            <img
              src="/markers/catch-basin.svg"
              width="26"
              height="26"
              alt="Catch basin grate"
            />{" "}
            <img
              src="/markers/complaint-311.svg"
              width="26"
              height="26"
              alt="311 complaint badge"
            />{" "}
            Icon colors identify record types, not severity.
          </p>
          <div className="legend-layers">
            {layers.basins && (
              <span>
                <i className="backend-point" />
                Red grate · inventory, not condition
              </span>
            )}
            {layers.complaints && (
              <span>
                <i className="backend-point reported" />
                Yellow 311 · reports, not current proof
              </span>
            )}
            {!layers.basins && !layers.complaints && (
              <span>Snapshot point layers hidden</span>
            )}
            {(data.basins.stale || data.incidents.stale) && (
              <span>
                <i className="backend-point stale" />
                Dimmed: stale source snapshot
              </span>
            )}
          </div>
          <p className="legend-source">
            LOCAL BACKEND / BK0601 SNAPSHOT · bounded subset
            <br />
            Source fetch times and limitations: Sources & freshness
          </p>
          {layers.complaints && <HazardLegend />}
        </div>
      )}
    </section>
  );
}

function Freshness({ source }: { source: BackendSourceFreshness }) {
  return (
    <div className="backend-freshness">
      <p>
        <strong>{source.id}</strong> ·{" "}
        {source.stale ? "STALE" : "Not flagged stale by backend"}
      </p>
      <p>
        Dataset source updated: <SourceTime value={source.dataset_updated_at} />
      </p>
      <p>
        Fetched from source: <SourceTime value={source.fetched_at} />
      </p>
      <p>
        Last ingested locally: <SourceTime value={source.last_ingested_at} />
      </p>
    </div>
  );
}

function SourceTime({ value }: { value: string | null | undefined }) {
  return value ? (
    <time dateTime={value} title={value}>
      {formatTime(value, "Unavailable")}
      <span className="backend-iso">{value}</span>
    </time>
  ) : (
    <span>Unavailable (not supplied)</span>
  );
}

function SourceLink({
  url,
  children,
}: {
  url: string | null;
  children: ReactNode;
}) {
  let safe: string | null = null;
  if (url) {
    try {
      const parsed = new URL(url);
      if (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        !parsed.username &&
        !parsed.password
      )
        safe = parsed.href;
    } catch {
      /* Invalid source URLs remain plain unavailable text. */
    }
  }
  return safe ? (
    <a
      className="backend-source-link"
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children} <Icon name="arrow" size={12} />
    </a>
  ) : (
    <p className="backend-copy">External source link unavailable.</p>
  );
}
