import type { ReactNode } from "react";
import type {
  TransitData,
  TransitEvidenceState,
  TransitStation,
} from "../backend/transitContracts";
import { applicableTransitAlerts } from "../backend/transitContracts";
import { safeBackendLink } from "../backend/contracts";
import { displayNumber, formatTime } from "../app/format";
import "./stationEvidence.css";

export interface StationEvidenceProps {
  /** Exact supported backend identity, or null for geometry-only selection. */
  station: TransitStation | null;
  data: TransitData;
  /** Already-loaded citation state from the existing polling/request owner. */
  evidence: TransitEvidenceState;
  onEvidence: (id: string) => void;
}

/** Read-only presentation. It never fetches, starts timers, or accepts scenario state. */
export function StationEvidence({
  station,
  data,
  evidence,
  onEvidence,
}: StationEvidenceProps) {
  const board = station
    ? data.live.data?.stations.find(
        (item) =>
          item.station_id === station.id &&
          item.gtfs_stop_id === station.properties.gtfs_stop_id,
      )
    : undefined;
  const alerts =
    board && data.live.data
      ? applicableTransitAlerts(data.live.data, board)
      : [];
  const exposure = station
    ? data.exposures.features.find(
        (item) => item.properties.station_id === station.id,
      )
    : undefined;
  const zones = station
    ? data.zones.features.filter((zone) =>
        zone.properties.entrances.some(
          (entrance) => entrance.station_id === station.id,
        ),
      )
    : [];
  const citationIds = new Set([
    ...(exposure?.properties.factors.flatMap((factor) => factor.evidence_ids) ??
      []),
    ...zones.flatMap((zone) => zone.properties.evidence_ids),
  ]);
  // A citation from a previous station must not acquire the new station's context.
  const cited =
    evidence.id &&
    (citationIds.has(evidence.id) ||
      (evidence.feature?.properties.layer === "flood_observations" &&
        citationIds.has(evidence.feature.properties.sensor)))
      ? evidence
      : null;
  const polls = station
    ? (data.history.data?.polls
        .filter((poll) =>
          poll.stations.some(
            (item) => item.gtfs_stop_id === station.properties.gtfs_stop_id,
          ),
        )
        .sort((a, b) => Date.parse(a.polled_at) - Date.parse(b.polled_at)) ??
      [])
    : [];
  return (
    <div className="station-evidence">
      <section className="transit-section station-evidence-current">
        <h3>Current evidence</h3>
        <p className="station-evidence-label">
          OFFICIAL OPERATIONS / WATER UNKNOWN
        </p>
        <p className="transit-notice">
          <strong>Interior water level not measured by these sources</strong>
          No interior depth is supplied. A neutral structure or absent water
          mesh does not mean confirmed dry. No matching alert does not establish
          that a station is safe.
        </p>
        {!station ? (
          <p className="transit-notice">
            GEOMETRY ONLY / NO LIVE COVERAGE. No other station's live board,
            exposure, or history is reused for this selection.
          </p>
        ) : (
          <>
            <p className="transit-copy">
              {station.properties.name} · GTFS {station.properties.gtfs_stop_id}
              . Existing arrivals and delays remain in the separate live board.
            </p>
            <Status label="MTA board" state={data.live} />
            <dl className="transit-fields station-evidence-clocks">
              <Field label="Live feed state">{data.feedState}</Field>
              <Field label="Board retrieval time">
                <EvidenceTime value={data.live.data?.fetched_at} />
              </Field>
              <Field label="Last successful live refresh">
                <EvidenceTime value={data.live.lastSuccessAt} />
              </Field>
            </dl>
            {!board && (
              <p className="transit-notice">
                No live board matching both this station ID and GTFS identity is
                available. Current service assessment is unavailable.
              </p>
            )}
            <details className="transit-disclosure">
              <summary>MTA source times, health and applicable alerts</summary>
              <p className="transit-copy">
                Source: {data.live.data?.source.publisher ?? "Not supplied"}.
                Source/event time and live refresh time are separate clocks.
                Alerts do not provide numerical interior water measurements.
              </p>
              {Object.entries(data.live.data?.feed_times ?? {}).map(
                ([feed, time]) => (
                  <p className="transit-copy" key={feed}>
                    Source feed {feed}: <EvidenceTime value={time} />
                  </p>
                ),
              )}
              {!Object.keys(data.live.data?.feed_times ?? {}).length && (
                <p className="transit-copy">Source feed times not supplied.</p>
              )}
              {(data.live.data?.errors ?? []).map((error) => (
                <p className="transit-notice" key={error}>
                  Source error: {error}
                </p>
              ))}
              {alerts.map((alert) => (
                <article className="transit-alert" key={alert.id}>
                  <h4>{alert.header}</h4>
                  <p className="transit-copy">{alert.description}</p>
                  <p className="transit-copy">
                    {alert.station_specific
                      ? "Station-specific stop references"
                      : "Route-wide applicability; may concern another part of the line"}
                    .{" "}
                    {alert.mentions_flooding
                      ? "Alert mentions flooding/water; no depth is inferred."
                      : "No flooding/water wording classified."}
                  </p>
                  <dl className="transit-fields">
                    <Field label="Alert ID">{alert.id}</Field>
                    <Field label="Active from">
                      <EvidenceTime value={alert.active_from} />
                    </Field>
                    <Field label="Official update">
                      <EvidenceTime value={alert.updated_at} />
                    </Field>
                  </dl>
                </article>
              ))}
              {board && !alerts.length && (
                <p className="transit-copy">
                  No matching official MTA alert in the supplied board. This is
                  not proof of safe or uninterrupted service.
                </p>
              )}
            </details>
          </>
        )}
      </section>
      <section className="transit-section station-evidence-history">
        <h3>Exposure and history</h3>
        <p className="station-evidence-label">
          INFERRED / MODELED / DATED EVIDENCE
        </p>
        <p className="transit-copy">
          These sources do not reconstruct current entrance or station water.
          Exposure never automatically sets hypothetical water depth.
        </p>
        {station && (
          <>
            <Status label="Exposure evidence" state={data.exposures} />
            <Status label="Flood context" state={data.zones} />
          </>
        )}
        {exposure ? (
          <details className="transit-disclosure">
            <summary>
              Inferred exposure · {displayNumber(exposure.properties.score, 1)}
              /100 · {exposure.properties.tier}
            </summary>
            <p className="transit-notice">
              Inspection priority (heuristic, not validated). Partner-supplied
              assessment; not a probability, present flooding, or measured
              depth.
            </p>
            <dl className="transit-fields">
              <Field label="Assessment time">
                <EvidenceTime value={exposure.properties.assessed_at} />
              </Field>
              <Field label="Method version">
                {exposure.properties.method_version}
              </Field>
            </dl>
            {exposure.properties.factors.map((factor) => (
              <div className="station-evidence-factor" key={factor.id}>
                <h4>
                  {factor.label} · {factor.knowledge_type}
                </h4>
                <p className="transit-copy">{factor.explanation}</p>
                <p className="transit-copy">
                  Supplied normalized value {factor.value}; weight{" "}
                  {factor.weight}; contribution {factor.contribution} score
                  points.
                </p>
                <Citations ids={factor.evidence_ids} onEvidence={onEvidence} />
              </div>
            ))}
            {exposure.properties.missing_factors.map((factor) => (
              <p className="transit-notice" key={factor.id}>
                Missing factor {factor.id}: {factor.reason}
              </p>
            ))}
            {exposure.properties.caveats.map((caveat) => (
              <p className="transit-copy" key={caveat}>
                {caveat}
              </p>
            ))}
          </details>
        ) : (
          <p className="transit-copy">
            No associated exposure assessment available. No score is invented.
          </p>
        )}
        {zones.map((zone) => (
          <details className="transit-zone" key={zone.id}>
            <summary>
              {zone.properties.zone_type === "dep_mapped"
                ? "DEP modeled scenario context"
                : zone.properties.zone_type === "measured"
                  ? "Nearby historical sensor context"
                  : "Stored illustrative model context"}
            </summary>
            <p className="transit-copy">{zone.properties.explanation}</p>
            <p className="transit-copy">
              Assumptions: {zone.properties.assumes}
            </p>
            <p className="transit-copy">
              Associated by supplied entrance IDs. Association does not
              establish water entering the station. Station/entrance distance is
              not supplied.
            </p>
            {zone.properties.zone_type === "measured" && (
              <p className="transit-notice">
                Derived buffer around a street sensor, not measured flood extent
                or an interior sensor. Historical depth stays at its sensor and
                time.
              </p>
            )}
            <p className="transit-copy">
              Last measured event, if supplied:{" "}
              <EvidenceTime value={zone.properties.last_flood_at} />
            </p>
            <Citations
              ids={zone.properties.evidence_ids}
              onEvidence={onEvidence}
            />
          </details>
        ))}
        {station && !zones.length && (
          <p className="transit-copy">
            No loaded flood context zone is associated with this station's
            entrances. Coverage may be incomplete; this does not show no
            exposure.
          </p>
        )}
        <p className="transit-notice">
          No established distinct long-term station flood-event history is
          supplied. Repeated monitoring polls are samples, not distinct flooding
          events. Nearby historical evidence does not establish that this
          station usually floods.
        </p>
        {station && (
          <details className="transit-disclosure">
            <summary>Monitoring window and evidence source clocks</summary>
            <Status label="Monitoring history" state={data.history} />
            <p className="transit-copy">
              {polls.length} matching monitoring samples in the supplied{" "}
              {data.history.data?.hours ?? "unavailable"}-hour query window.
              This query window is not an event archive or retention claim.
            </p>
            <dl className="transit-fields">
              <Field label="Earliest supplied matching poll">
                <EvidenceTime value={polls[0]?.polled_at} />
              </Field>
              <Field label="Latest supplied matching poll">
                <EvidenceTime value={polls.at(-1)?.polled_at} />
              </Field>
              <Field label="Last successful history refresh">
                <EvidenceTime value={data.history.lastSuccessAt} />
              </Field>
              <Field label="Exposure response generated">
                <EvidenceTime value={data.exposures.generatedAt} />
              </Field>
              <Field label="Flood context response generated">
                <EvidenceTime value={data.zones.generatedAt} />
              </Field>
            </dl>
            {[
              { label: "Exposure", sources: data.exposures.sources },
              { label: "Flood context", sources: data.zones.sources },
            ].flatMap((collection) =>
              collection.sources.map((source) => (
                <div key={`${collection.label}:${source.id}`}>
                  <p className="transit-copy">
                    {collection.label} source {source.id} ·{" "}
                    {source.stale ? "STALE" : "not flagged stale"}
                  </p>
                  <dl className="transit-fields">
                    <Field label="Dataset update">
                      <EvidenceTime value={source.dataset_updated_at} />
                    </Field>
                    <Field label="Source fetch">
                      <EvidenceTime value={source.fetched_at} />
                    </Field>
                    <Field label="Local ingestion">
                      <EvidenceTime value={source.last_ingested_at} />
                    </Field>
                  </dl>
                </div>
              )),
            )}
            <p className="transit-copy">
              Response generation, source update, ingestion, and live refresh
              are different clocks. Missing times remain unavailable.
            </p>
          </details>
        )}
        {cited && <CitedRecord evidence={cited} onEvidence={onEvidence} />}
      </section>
    </div>
  );
}

function CitedRecord({
  evidence,
  onEvidence,
}: Pick<StationEvidenceProps, "evidence" | "onEvidence">) {
  const feature = evidence.feature;
  const p = feature?.properties;
  const sourceUrl = safeBackendLink(p?.source.url);
  return (
    <details className="transit-disclosure" open>
      <summary>Selected source evidence · {evidence.id}</summary>
      {evidence.status === "loading" && (
        <p className="transit-copy">Loading cited evidence…</p>
      )}
      {evidence.error && (
        <p className="transit-notice" role="alert">
          Evidence unavailable: {evidence.error}
        </p>
      )}
      {evidence.note && <p className="transit-copy">{evidence.note}</p>}
      {p && (
        <>
          <p className="transit-copy">
            Source {p.source.id} · record {p.source.record_id}. Source update:{" "}
            <EvidenceTime value={p.source.updated_at} />
          </p>
          <p className="transit-copy">
            Source location [longitude, latitude]:{" "}
            {feature.geometry?.type === "Point"
              ? feature.geometry.coordinates.join(", ")
              : feature.geometry
                ? "See source polygon; no point location supplied"
                : "Location unavailable"}
            . Station/entrance distance not supplied.
          </p>
          {sourceUrl && (
            <a
              className="transit-source-link"
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Original cited source
            </a>
          )}
          {p.layer === "incidents" && (
            <>
              <p className="transit-copy">
                311 REPORT · {p.category_label} · reported{" "}
                <EvidenceTime value={p.reported_at} />
              </p>
              <p className="transit-copy">
                Agency classification: {p.verification.status} ·{" "}
                {p.verification.knowledge_type}.{" "}
                {p.verification.text ?? "No agency finding text supplied."}
              </p>
              <p className="transit-copy">
                Agency finding/resolution time:{" "}
                <EvidenceTime value={p.verification.at} />
              </p>
              {p.linked_basin && (
                <p className="transit-copy">
                  Reported location to linked basin:{" "}
                  {p.linked_basin.distance_ft} ft · {p.linked_basin.method} ·
                  inferred association. This is not distance to this station or
                  entrance.
                </p>
              )}
              <p className="transit-notice">
                A complaint and an agency finding are separate. Neither
                establishes a current station flood condition.
              </p>
            </>
          )}
          {p.layer === "sensors" && (
            <p className="transit-copy">
              FloodNet historical street sensor {p.sensor_id} · maximum{" "}
              {p.max_depth_in ?? "unavailable"} in at this sensor · latest
              supplied event <EvidenceTime value={p.last_event_at} />. Sensor
              event count {p.event_count} is not a station-event count.
            </p>
          )}
          {p.layer === "flood_observations" && (
            <p className="transit-copy">
              FloodNet historical sensor event · {p.max_depth_in} in maximum at
              sensor {p.sensor_id} · <EvidenceTime value={p.started_at} /> to{" "}
              <EvidenceTime value={p.ended_at} />. This profile is not replayed
              inside the station.
            </p>
          )}
          {p.layer === "dep_flood_maps" && (
            <p className="transit-copy">
              DEP modeled scenario: {p.scenario_label} · {p.intensity_in_hr}{" "}
              in/hr · {p.sea_level} · {p.depth_class} class. {p.note} Outdoor
              modeled categories do not give exact indoor depths.
            </p>
          )}
          <p className="transit-copy">
            Local ingestion: <EvidenceTime value={p.ingested_at} />
          </p>
        </>
      )}
      {p?.layer === "sensors" &&
        evidence.observations
          ?.filter((event) => event.properties.sensor_id === p.sensor_id)
          .map((event) => (
            <div className="transit-alert" key={event.id}>
              <p className="transit-copy">
                Historical sensor {event.properties.sensor_id} ·{" "}
                {event.properties.max_depth_in} in maximum ·{" "}
                <EvidenceTime value={event.properties.started_at} /> to{" "}
                <EvidenceTime value={event.properties.ended_at} />
              </p>
              <button
                type="button"
                className="transit-text-button"
                onClick={() => onEvidence(event.id)}
              >
                Inspect this historical sensor event
              </button>
            </div>
          ))}
    </details>
  );
}

function Citations({
  ids,
  onEvidence,
}: {
  ids: string[];
  onEvidence: (id: string) => void;
}) {
  return ids.length ? (
    <ul className="transit-evidence-buttons">
      {[...new Set(ids)].map((id) => (
        <li key={id}>
          <button type="button" onClick={() => onEvidence(id)}>
            Inspect evidence <span>{id}</span>
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="transit-copy">No source record IDs supplied.</p>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function EvidenceTime({ value }: { value: string | null | undefined }) {
  return value ? (
    <time dateTime={value}>
      {formatTime(value, "Unavailable")}
      <span className="transit-iso">{value}</span>
    </time>
  ) : (
    <span>Unavailable (not supplied)</span>
  );
}

function Status({
  label,
  state,
}: {
  label: string;
  state: {
    status: string;
    stale: boolean;
    partial: boolean;
    error: string | null;
  };
}) {
  return (
    <>
      <p className="transit-copy">
        {label}: {state.status}
        {state.stale ? " · STALE, original source times retained" : ""}
        {state.partial ? " · PARTIAL COVERAGE" : ""}
      </p>
      {state.error && (
        <p className="transit-notice" role="alert">
          {label}: {state.error}. No fixture substitution.
        </p>
      )}
    </>
  );
}
