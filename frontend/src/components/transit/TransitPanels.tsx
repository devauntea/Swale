import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type {
  TransitData,
  TransitEntrance,
  TransitEvidenceState,
  TransitLayerVisibility,
  TransitLiveStation,
  TransitStation,
  TransitZone,
} from "../../backend/transitContracts";
import {
  TRANSIT_SCHEDULE_SOURCE,
  TRANSIT_SOURCE_LIMITATIONS,
  distinctTransitArrivals,
  applicableTransitAlerts,
  transitScheduleAvailability,
} from "../../backend/transitContracts";
import { safeBackendLink } from "../../backend/contracts";
import { formatTime, displayNumber } from "../../app/format";
import { Icon } from "../controls/Icon";
import "./transit.css";

type LayerKey = keyof TransitLayerVisibility;
interface NoticeState {
  status: string;
  error: string | null;
  stale: boolean;
  partial: boolean;
}
const layerLabels: { key: LayerKey; name: string; meaning: string }[] = [
  {
    key: "stations",
    name: "Subway stations",
    meaning: "OBSERVED / MTA INVENTORY",
  },
  {
    key: "entrances",
    name: "Station entrances",
    meaning: "OBSERVED / MTA INVENTORY",
  },
  {
    key: "exposure",
    name: "Station flood exposure",
    meaning: "INFERRED / NOT CURRENT FLOODING",
  },
  {
    key: "zones",
    name: "Flood context zones",
    meaning: "MODELED OR SENSOR-LINKED CONTEXT",
  },
];
const statuses: Record<string, string> = {
  normal: "No disruption classified",
  alert: "MTA alert applies",
  delayed: "Delay classified",
  flooding_reported: "Alert mentions flooding / water",
  no_service: "No predicted or scheduled trains",
};

export function TransitSidebar(p: {
  data: TransitData;
  layers: TransitLayerVisibility;
  selectedStationId: string | null;
  modeSelector: ReactNode;
  viewSelector: ReactNode;
  paused: boolean;
  onPauseChange: (paused: boolean) => void;
  onRefresh: () => void;
  onSelectStation: (id: string) => void;
  onFocus: () => void;
  onFitEntrances: () => void;
  onOverview: () => void;
  onLayer: (key: LayerKey) => void;
  onSources?: () => void;
  infrastructureControls?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const stations = p.data.stations.features.filter((station) => {
    const text = [
      station.id,
      station.properties.name,
      ...station.properties.routes,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  const selected = p.data.stations.features.find(
    (station) => station.id === p.selectedStationId,
  );
  const hasEntrances = p.data.entrances.features.some(
    (entrance) => entrance.properties.station_id === p.selectedStationId,
  );
  return (
    <aside
      className="control-sidebar transit-sidebar"
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
        <span>SUBWAY / BK0601 COVERAGE</span>
        {p.onSources && (
          <button
            className="icon-button"
            aria-label="Transit sources and freshness"
            onClick={p.onSources}
          >
            <Icon name="info" size={16} />
          </button>
        )}
      </div>
      {p.modeSelector}
      {p.viewSelector}
      <div className="sidebar-scroll">
        <section className="transit-section">
          <div className="section-heading">
            <h2>LIVE TRANSIT BOARD</h2>
            <Icon name="clock" size={14} />
          </div>
          <FeedState data={p.data} />
          <p className="transit-copy">
            MTA transit updates are separate from local snapshot inventory and
            historical flood context. Coverage is clipped to BK0601.
          </p>
          <p className="transit-copy">
            Board fetched: <TransitTime value={p.data.live.data?.fetched_at} />
          </p>
          <p className="transit-copy">
            Last successful refresh:{" "}
            <TransitTime value={p.data.live.lastSuccessAt} />
          </p>
          {p.data.nextRefreshAt && (
            <p className="transit-copy">
              Next eligible refresh:{" "}
              <TransitTime value={p.data.nextRefreshAt} />
            </p>
          )}
          <div className="transit-button-row">
            <button
              aria-pressed={p.paused}
              onClick={() => p.onPauseChange(!p.paused)}
            >
              {p.paused ? "Resume transit updates" : "Pause transit updates"}
            </button>
            <button onClick={p.onRefresh}>Refresh transit</button>
          </div>
          <p className="transit-copy">
            Baseline: 60-second board refresh; hidden and inactive views pause
            work. Weather uses a separate 10-minute cache. Manual refresh
            respects the same upstream boundary.
          </p>
          <ResourceNotice state={p.data.live} label="MTA board" />
        </section>
        {p.infrastructureControls}
        <section className="transit-section">
          <label
            className="transit-input-label"
            htmlFor="transit-station-search"
          >
            FIND A LOADED STATION OR ROUTE
          </label>
          <p className="transit-copy" id="transit-search-hint">
            Search station name, route or full ID within loaded map coverage.
          </p>
          <input
            id="transit-station-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-describedby="transit-search-hint"
            autoComplete="off"
          />
          <ResourceNotice state={p.data.stations} label="Station inventory" />
          <p className="transit-copy">
            {stations.length} matching / {p.data.stations.features.length}{" "}
            loaded station records. This is not citywide coverage.
          </p>
          {stations.length === 0 && (
            <p className="transit-notice">
              No loaded station matches. Change the search or map bounds.
            </p>
          )}
          <ul className="transit-station-list">
            {stations.map((station) => {
              const board = p.data.live.data?.stations.find(
                (item) =>
                  item.station_id === station.id &&
                  item.gtfs_stop_id === station.properties.gtfs_stop_id,
              );
              return (
                <li key={station.id}>
                  <button
                    aria-pressed={station.id === p.selectedStationId}
                    onClick={() => p.onSelectStation(station.id)}
                  >
                    <strong>{station.properties.name}</strong>
                    <RouteLabels routes={station.properties.routes} />
                    <small>{station.id}</small>
                    <small>
                      {p.data.feedState === "live" && board
                        ? (statuses[board.status] ?? board.status)
                        : "Current service assessment unavailable / incomplete"}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="transit-button-row">
            <button disabled={!selected?.geometry} onClick={p.onFocus}>
              Focus station
            </button>
            <button disabled={!hasEntrances} onClick={p.onFitEntrances}>
              Fit loaded entrances
            </button>
            <button onClick={p.onOverview}>Return to overview</button>
          </div>
        </section>
        <section className="layers-section">
          <div className="section-heading">
            <h2>TRANSIT & FLOOD CONTEXT</h2>
            <Icon name="layers" size={14} />
          </div>
          <div className="layer-list">
            {layerLabels.map((layer) => (
              <label className="layer-row" key={layer.key}>
                <span className="layer-icon">
                  <Icon
                    name={layer.key === "zones" ? "drop" : "pin"}
                    size={17}
                  />
                </span>
                <span className="layer-label">
                  <strong>{layer.name}</strong>
                  <small>{layer.meaning}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={layer.name}
                  checked={p.layers[layer.key]}
                  aria-checked={p.layers[layer.key]}
                  onChange={() => p.onLayer(layer.key)}
                />
                <span className="switch-track" aria-hidden="true" />
              </label>
            ))}
          </div>
          <ResourceNotice state={p.data.exposures} label="Station exposure" />
          <ResourceNotice state={p.data.zones} label="Flood context zones" />
          <p className="transit-copy">
            Exposure and zones do not show present station flooding. No
            simulation is started. No exact train positions, station interiors
            or live flood sensors are supplied.
          </p>
        </section>
        <WeatherContext data={p.data} compact />
      </div>
      <footer className="sidebar-footer">
        <p className="refresh-status">
          Planning context · no emergency or closure instructions
        </p>
        {p.onSources && (
          <button className="sources-link" onClick={p.onSources}>
            Sources & limitations <Icon name="arrow" size={13} />
          </button>
        )}
      </footer>
    </aside>
  );
}

export function TransitInspector(p: {
  station: TransitStation | null;
  entrance?: TransitEntrance | null;
  zone?: TransitZone | null;
  data: TransitData;
  selectedEntranceId?: string | null;
  selectedZoneId?: string | null;
  onSelectEntrance: (id: string) => void;
  onFocus: () => void;
  onFitEntrances: () => void;
  onOverview: () => void;
  onClose: () => void;
  onEvidence: (id: string) => void;
  evidence: TransitEvidenceState;
  clearEvidence?: () => void;
  onExploreInfrastructure?: () => void;
  infrastructureInspection?: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const stationId = p.station?.id ?? null;
  const selectedZone =
    p.zone ??
    p.data.zones.features.find((zone) => zone.id === p.selectedZoneId);
  const selectedEntrance =
    p.entrance ??
    p.data.entrances.features.find((item) => item.id === p.selectedEntranceId);
  const selectionKey =
    stationId ?? selectedZone?.id ?? selectedEntrance?.id ?? null;
  useLayoutEffect(() => {
    if (!selectionKey) return;
    const trigger = document.activeElement;
    const element = panel.current;
    close.current?.focus({ preventScroll: true });
    return () => {
      if (
        element?.contains(document.activeElement) &&
        trigger instanceof HTMLElement &&
        trigger.isConnected
      )
        trigger.focus({ preventScroll: true });
    };
  }, [selectionKey]);
  if (!p.station && !selectedZone && !selectedEntrance)
    return (
      <aside className="basin-inspector empty-inspector transit-inspector">
        <Icon name="pin" size={25} />
        <h2>Explore a subway station</h2>
        <p>
          Select a station marker or search the loaded inventory for service,
          entrances and flood context.
        </p>
        <span className="demo-label">
          OBSERVED / INFERRED / PREDICTED KEPT SEPARATE
        </span>
      </aside>
    );
  const station = p.station;
  const entrances = p.data.entrances.features.filter(
    (entrance) => entrance.properties.station_id === stationId,
  );
  const entrance =
    selectedEntrance?.properties.station_id === stationId
      ? selectedEntrance
      : undefined;
  const board = p.data.live.data?.stations.find(
    (item) =>
      item.station_id === stationId &&
      item.gtfs_stop_id === station?.properties.gtfs_stop_id,
  );
  const scheduleState = transitScheduleAvailability(p.data.live.data);
  const canCompareSchedule =
    scheduleState !== "unavailable" && scheduleState !== "expired";
  const exposure = p.data.exposures.features.find(
    (item) => item.properties.station_id === stationId,
  );
  const zones = p.data.zones.features.filter((zone) =>
    zone.properties.entrances.some((item) => item.station_id === stationId),
  );
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape is delegated from controls inside this non-modal inspector.
    <aside
      className="basin-inspector transit-inspector"
      ref={panel}
      aria-label="Selected transit inspector"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          p.onClose();
        }
      }}
    >
      <header className="inspector-topline">
        <span>
          <span className="selection-dot" />
          {station
            ? "STATION CONTEXT"
            : selectedZone
              ? "FLOOD CONTEXT ZONE"
              : "ENTRANCE INVENTORY"}
        </span>
        <button
          className="icon-button"
          ref={close}
          aria-label="Close transit inspector"
          onClick={p.onClose}
        >
          <Icon name="close" size={15} />
        </button>
      </header>
      <div className="inspector-body">
        {p.infrastructureInspection}
        {station && (
          <>
            <h2 className="transit-station-title">{station.properties.name}</h2>
            <RouteLabels routes={station.properties.routes} />
            <p className="transit-opaque-id">{station.id}</p>
            <dl className="transit-fields">
              <dt>GTFS parent stop ID</dt>
              <dd>{station.properties.gtfs_stop_id}</dd>
              <dt>Station complex</dt>
              <dd>{station.properties.complex_id ?? "Unavailable"}</dd>
              <dt>Source structure</dt>
              <dd>
                {station.properties.structure ??
                  "Unknown — source attribute unavailable"}
              </dd>
              <dt>Source line</dt>
              <dd>{station.properties.line ?? "Unavailable"}</dd>
            </dl>
            <p className="transit-copy">
              Schedule comparisons follow {TRANSIT_SCHEDULE_SOURCE.timezone}{" "}
              service days. Reviewed schedule dates:{" "}
              {TRANSIT_SCHEDULE_SOURCE.firstServiceDate} through{" "}
              {TRANSIT_SCHEDULE_SOURCE.lastServiceDate}, inclusive. Null or
              unmatched comparisons remain unavailable.
            </p>
            <div className="transit-button-row">
              {p.onExploreInfrastructure && (
                <button onClick={p.onExploreInfrastructure}>
                  Explore infrastructure
                </button>
              )}
              <button disabled={!station.geometry} onClick={p.onFocus}>
                Focus station
              </button>
              <button
                disabled={entrances.length === 0}
                onClick={p.onFitEntrances}
              >
                Fit loaded entrances
              </button>
              <button onClick={p.onOverview}>Overview</button>
            </div>
            <SourceTimes
              collection={p.data.stations}
              sourceId={station.properties.source.id}
            />
            <section className="transit-section">
              <h3>SERVICE / LIVE BOARD</h3>
              <FeedState data={p.data} />
              <p className="transit-copy">
                Service status is separate from flood exposure. No matching
                alert received does not establish safety.
              </p>
              <ResourceNotice state={p.data.live} label="MTA board" />
              {board ? (
                <>
                  <p className="transit-status">
                    <strong>
                      {p.data.feedState === "live"
                        ? (statuses[board.status] ?? board.status)
                        : "Current service assessment unavailable / incomplete"}
                    </strong>
                    <span>Backend classification: {board.status}</span>
                  </p>
                  {board.reasons.length > 0 && (
                    <ul className="transit-text-list">
                      {board.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  <p className="transit-copy">
                    The flooding_reported classification reflects an applicable
                    alert mentioning flooding or water conditions. It does not
                    establish station closure or a flood-caused shutdown.
                    no_service means no predicted trains with zero scheduled
                    trains.
                  </p>
                  <dl className="transit-fields">
                    <dt>Next 30-minute prediction entries</dt>
                    <dd>{board.trains_next_30_min.predicted}</dd>
                    <dt>Next 30-minute scheduled entries</dt>
                    <dd>
                      {board.trains_next_30_min.scheduled ??
                        "Unavailable — schedule not matched/current"}
                    </dd>
                    <dt>Matched arrival entries</dt>
                    <dd>{board.delay_min.trains_matched}</dd>
                    <dt>Median / maximum delay</dt>
                    <dd>
                      {delayText(
                        canCompareSchedule ? board.delay_min.median : null,
                      )}{" "}
                      /{" "}
                      {delayText(
                        canCompareSchedule ? board.delay_min.max : null,
                      )}
                    </dd>
                  </dl>
                  <p className="transit-copy">
                    Counts are backend arrival entries, not independently
                    counted distinct trains. Repeated or cancelled/skipped
                    updates cannot be fully distinguished when that metadata is
                    absent.
                  </p>
                  <p className="transit-copy">
                    Schedule comparison state: {scheduleState}.
                    Expired/unavailable schedule comparisons are not displayed
                    as zero delay.
                  </p>
                  {(["N", "S"] as const).map((direction) => {
                    const raw = board.next[direction];
                    const arrivals = distinctTransitArrivals(raw);
                    const changed =
                      arrivals.length !== raw.length ||
                      arrivals.some((arrival, index) => arrival !== raw[index]);
                    return (
                      <section className="transit-direction" key={direction}>
                        <h4>
                          {direction} ·{" "}
                          {board.direction_labels[direction] ??
                            "Direction label unavailable"}
                        </h4>
                        {arrivals.length > 0 ? (
                          <table className="transit-arrivals">
                            <caption>
                              MTA predicted arrivals · {direction}
                            </caption>
                            <thead>
                              <tr>
                                <th scope="col">Route / trip</th>
                                <th scope="col">Prediction</th>
                                <th scope="col">Delay</th>
                              </tr>
                            </thead>
                            <tbody>
                              {arrivals.map((arrival, index) => (
                                <tr
                                  key={`${arrival.trip_id}-${arrival.predicted_at}-${index}`}
                                >
                                  <th scope="row">
                                    {arrival.route}
                                    <small>{arrival.trip_id}</small>
                                  </th>
                                  <td>
                                    <TransitTime value={arrival.predicted_at} />
                                    <small>
                                      {arrival.minutes_away} min from board
                                      fetch
                                    </small>
                                    <small>
                                      Scheduled:{" "}
                                      <TransitTime
                                        value={arrival.scheduled_at}
                                      />
                                    </small>
                                  </td>
                                  <td>
                                    {delayText(
                                      canCompareSchedule
                                        ? arrival.delay_min
                                        : null,
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="transit-copy">
                            No predictions supplied for this direction. This is
                            not proof that service is suspended.
                          </p>
                        )}
                        {changed && (
                          <p className="transit-copy">
                            Display sorted by prediction time and exact
                            duplicate arrival rows removed. Backend summary
                            counts above remain raw arrival-entry counts.
                          </p>
                        )}
                      </section>
                    );
                  })}
                  <p className="transit-copy">
                    Destinations are not supplied by this API. N/S and direction
                    labels above are retained as provided.
                  </p>
                  <TrainAssociations
                    data={p.data}
                    gtfsStopId={station.properties.gtfs_stop_id}
                  />
                  <AlertEvidence data={p.data} station={board} />
                </>
              ) : (
                <p className="transit-notice">
                  No live board entry supplied for this station. Service status
                  is unknown.
                </p>
              )}
              <FeedTimes data={p.data} />
            </section>
            <section className="transit-section">
              <h3>ENTRANCES / STATION SCHEMATIC</h3>
              <ResourceNotice
                state={p.data.entrances}
                label="Entrance inventory"
              />
              <p className="transit-copy">
                {entrances.length} entrance records currently loaded for this
                station. A viewport subset may omit other entrances.
              </p>
              <StationSchematic
                station={station}
                entrances={entrances}
                selectedEntranceId={p.selectedEntranceId ?? null}
                onSelect={p.onSelectEntrance}
              />
              {entrance && (
                <div className="transit-entrance-detail">
                  <h4>Selected entrance</h4>
                  <p className="transit-opaque-id">{entrance.id}</p>
                  <dl className="transit-fields">
                    <dt>Entrance type</dt>
                    <dd>
                      {entrance.properties.entrance_type ?? "Unavailable"}
                    </dd>
                    <dt>Inventory entry / exit flags</dt>
                    <dd>
                      {entrance.properties.entry_allowed
                        ? "Entry allowed"
                        : "Entry not marked allowed"}{" "}
                      /{" "}
                      {entrance.properties.exit_allowed
                        ? "Exit allowed"
                        : "Exit not marked allowed"}
                    </dd>
                    <dt>Inventory coordinates [longitude, latitude]</dt>
                    <dd>
                      {entrance.geometry
                        ? entrance.geometry.coordinates.join(", ")
                        : "Location unavailable"}
                    </dd>
                  </dl>
                  <p className="transit-copy">
                    Inventory flags are not a live opening or closure status.
                  </p>
                  <SourceTimes
                    collection={p.data.entrances}
                    sourceId={entrance.properties.source.id}
                  />
                </div>
              )}
            </section>
            <section className="transit-section">
              <h3>INFERRED STATION FLOOD EXPOSURE</h3>
              <ResourceNotice
                state={p.data.exposures}
                label="Exposure assessment"
              />
              {exposure ? (
                <>
                  <p className="transit-exposure">
                    <strong>
                      {displayNumber(exposure.properties.score, 1)} / 100
                    </strong>
                    <span>{exposure.properties.tier} · INFERRED</span>
                  </p>
                  <p className="transit-copy">
                    Inspection priority (heuristic, not validated). This
                    partner-supplied station exposure assessment is not a
                    calibrated flood probability, official warning or
                    observation of present flooding.
                  </p>
                  <dl className="transit-fields">
                    <dt>Method</dt>
                    <dd>{exposure.properties.method_version}</dd>
                    <dt>Assessed</dt>
                    <dd>
                      <TransitTime value={exposure.properties.assessed_at} />
                    </dd>
                    <dt>Entrances in backend assessment</dt>
                    <dd>{exposure.properties.entrances}</dd>
                    <dt>Stored simulation context</dt>
                    <dd>
                      {exposure.properties.run_id ??
                        "Unavailable — no stored run selected"}
                    </dd>
                  </dl>
                  {exposure.properties.factors.map((factor) => (
                    <details className="transit-factor" key={factor.id}>
                      <summary>
                        {factor.label} · {factor.knowledge_type}
                      </summary>
                      <dl className="transit-fields">
                        <dt>Backend normalized value</dt>
                        <dd>{factor.value}</dd>
                        <dt>Weight</dt>
                        <dd>{factor.weight}</dd>
                        <dt>Contribution (score points)</dt>
                        <dd>{factor.contribution}</dd>
                      </dl>
                      <p className="transit-copy">{factor.explanation}</p>
                      <EvidenceButtons
                        ids={factor.evidence_ids}
                        onEvidence={p.onEvidence}
                      />
                    </details>
                  ))}
                  {exposure.properties.missing_factors.length > 0 && (
                    <div className="transit-notice">
                      <strong>Missing factors remain unavailable</strong>
                      <ul className="transit-text-list">
                        {exposure.properties.missing_factors.map((factor) => (
                          <li key={factor.id}>
                            {factor.id}: {factor.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <ul className="transit-text-list">
                    {exposure.properties.caveats.map((caveat) => (
                      <li key={caveat}>{caveat}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="transit-notice">
                  No exposure assessment supplied for this station. No score has
                  been invented.
                </p>
              )}
              <p className="transit-copy">
                The frontend presents supplied factors and scores without
                recalculating them. Nearby reports do not confirm station
                flooding; street measurements apply at their sensor and event
                time.
              </p>
              <SourceTimes collection={p.data.exposures} />
            </section>
            <section className="transit-section">
              <h3>ASSOCIATED FLOOD CONTEXT ZONES</h3>
              {zones.length ? (
                zones.map((zone) => (
                  <ZoneDetails
                    key={zone.id}
                    zone={zone}
                    onEvidence={p.onEvidence}
                  />
                ))
              ) : (
                <p className="transit-copy">
                  No loaded zone is associated with this station's entrances.
                  This is not proof of no exposure.
                </p>
              )}
              <p className="transit-copy">
                DEP entrance association includes entrances within the backend's
                proximity threshold, not only strict polygon containment.
              </p>
            </section>
            <MonitoringHistory
              data={p.data}
              gtfsStopId={station.properties.gtfs_stop_id}
            />
          </>
        )}
        {!station && selectedEntrance && (
          <section className="transit-section">
            <h2 className="transit-station-title">Station entrance</h2>
            <p className="transit-opaque-id">{selectedEntrance.id}</p>
            <p className="transit-notice">
              Parent station point/details are not loaded. This observed
              entrance is shown without constructing a station record.
            </p>
            <dl className="transit-fields">
              <dt>Parent station ID</dt>
              <dd>{selectedEntrance.properties.station_id}</dd>
              <dt>Inventory station name</dt>
              <dd>{selectedEntrance.properties.station_name}</dd>
              <dt>Entrance type</dt>
              <dd>
                {selectedEntrance.properties.entrance_type ?? "Unavailable"}
              </dd>
              <dt>Inventory entry / exit flags</dt>
              <dd>
                {selectedEntrance.properties.entry_allowed
                  ? "Entry allowed"
                  : "Entry not marked allowed"}{" "}
                /{" "}
                {selectedEntrance.properties.exit_allowed
                  ? "Exit allowed"
                  : "Exit not marked allowed"}
              </dd>
              <dt>Inventory coordinates [longitude, latitude]</dt>
              <dd>
                {selectedEntrance.geometry
                  ? selectedEntrance.geometry.coordinates.join(", ")
                  : "Location unavailable"}
              </dd>
            </dl>
            <p className="transit-copy">
              Inventory flags are not a live opening or closure status.
              Structure and underground geometry remain unknown without the
              parent station's source attributes.
            </p>
            <SourceTimes
              collection={p.data.entrances}
              sourceId={selectedEntrance.properties.source.id}
            />
            <SafeSourceLink
              url={selectedEntrance.properties.source.url}
              label={`MTA entrance source ${selectedEntrance.id}`}
            />
          </section>
        )}
        {selectedZone && (
          <section className="transit-section">
            <h3>SELECTED ZONE</h3>
            <ZoneDetails zone={selectedZone} onEvidence={p.onEvidence} open />
            <SourceTimes collection={p.data.zones} />
          </section>
        )}
        <EvidenceDetail
          evidence={p.evidence}
          onClose={p.clearEvidence}
          onEvidence={p.onEvidence}
        />
        <WeatherContext data={p.data} />
      </div>
    </aside>
  );
}

function StationSchematic({
  station,
  entrances,
  selectedEntranceId,
  onSelect,
}: {
  station: TransitStation;
  entrances: TransitEntrance[];
  selectedEntranceId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <figure className="transit-schematic">
      <figcaption>
        <strong>Station / entrance relationship schematic</strong>
        <span>Not to scale · no surveyed underground model or camera feed</span>
      </figcaption>
      <p className="transit-schematic-street">
        Observed street entrance inventory
      </p>
      <ul>
        {entrances.map((entrance) => (
          <li key={entrance.id}>
            <button
              aria-pressed={entrance.id === selectedEntranceId}
              onClick={() => onSelect(entrance.id)}
            >
              <i aria-hidden="true" />
              <span>
                {entrance.properties.entrance_type ?? "Entrance"}
                <small>{entrance.id}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {entrances.length === 0 && (
        <p className="transit-copy">No entrance points loaded.</p>
      )}
      <div className="transit-schematic-unknown">
        <strong>Interior / underground geometry unavailable</strong>
        <span>
          Source structure: {station.properties.structure ?? "unknown"}
        </span>
        <p>
          No depth, tunnel, corridor, platform layout or exact train path is
          supplied. Unknown structure does not establish an underground
          location.
        </p>
      </div>
    </figure>
  );
}

function AlertEvidence({
  data,
  station,
}: {
  data: TransitData;
  station: TransitLiveStation;
}) {
  const alerts = data.live.data
    ? applicableTransitAlerts(data.live.data, station)
    : [];
  return (
    <details className="transit-disclosure">
      <summary>
        Applicable official MTA alert evidence ({alerts.length})
      </summary>
      {alerts.length ? (
        alerts.map((alert) => (
          <article className="transit-alert" key={alert.id}>
            <h4>{alert.header}</h4>
            <p className="transit-copy">
              {alert.description ?? "Description unavailable"}
            </p>
            <dl className="transit-fields">
              <dt>Alert ID / type</dt>
              <dd>
                {alert.id} / {alert.alert_type ?? "Unavailable"}
              </dd>
              <dt>Published scope</dt>
              <dd>
                {alert.station_specific
                  ? "Station-specific stop references"
                  : "Route-wide; may apply elsewhere on the line"}
              </dd>
              <dt>Routes / stop references</dt>
              <dd>
                {alert.routes.join(", ") || "Not supplied"} /{" "}
                {alert.stops.join(", ") || "Not supplied"}
              </dd>
              <dt>Active from</dt>
              <dd>
                <TransitTime value={alert.active_from} />
              </dd>
              <dt>Official update</dt>
              <dd>
                <TransitTime value={alert.updated_at} />
              </dd>
              <dt>Flooding / water keyword classification</dt>
              <dd>
                {alert.mentions_flooding
                  ? "Backend matched flooding or water wording"
                  : "No such wording matched"}
              </dd>
            </dl>
            <p className="transit-copy">
              Active end time and direction scope are not supplied here. This
              alert evidence alone does not establish a flood-caused shutdown at
              this station.
            </p>
          </article>
        ))
      ) : (
        <p className="transit-copy">
          No matching MTA alert received in the current board response. This
          does not establish safe or uninterrupted service.
        </p>
      )}
    </details>
  );
}

function TrainAssociations({
  data,
  gtfsStopId,
}: {
  data: TransitData;
  gtfsStopId: string;
}) {
  const trains =
    data.live.data?.trains.filter((train) => train.stop_id === gtfsStopId) ??
    [];
  return (
    <details className="transit-disclosure">
      <summary>Reported train / stop associations ({trains.length})</summary>
      <p className="transit-copy">
        No vehicle coordinates are supplied. A stop association is not an exact
        underground vehicle location.
      </p>
      <ul className="transit-text-list">
        {trains.map((train, index) => (
          <li key={`${train.trip_id}-${train.direction}-${index}`}>
            {train.route} · {train.direction} · {train.status}
            <small>
              Trip {train.trip_id} · stop {train.stop_id}
            </small>
            <small>
              Seen: <TransitTime value={train.seen_at} />
            </small>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ZoneDetails({
  zone,
  onEvidence,
  open = false,
}: {
  zone: TransitZone;
  onEvidence: (id: string) => void;
  open?: boolean;
}) {
  const p = zone.properties;
  return (
    <details className={`transit-zone transit-zone-${p.level}`} open={open}>
      <summary>
        {p.zone_type === "measured"
          ? `Derived sensor buffer · ${p.level} · historical measurement context`
          : `${p.zone_type.replaceAll("_", " ")} · ${p.level} · ${p.knowledge_type}`}
      </summary>
      <p className="transit-opaque-id">{zone.id}</p>
      <p className="transit-copy">{p.explanation}</p>
      <dl className="transit-fields">
        <dt>Backend classification</dt>
        <dd>
          zone_type: {p.zone_type} · knowledge_type: {p.knowledge_type}
        </dd>
        <dt>Assumption / model</dt>
        <dd>{p.assumes}</dd>
        <dt>Associated entrance records</dt>
        <dd>{p.entrance_count}</dd>
        <dt>Last measured event, when supplied</dt>
        <dd>
          <TransitTime value={p.last_flood_at} />
        </dd>
      </dl>
      {p.zone_type === "measured" ? (
        <p className="transit-notice">
          Derived buffer around a FloodNet street sensor. The sensor reading is
          observed at its location; the buffer is not a measured flood boundary
          or station sensor. FloodNet context is historical, not realtime.
        </p>
      ) : p.zone_type === "swale_simulated" ? (
        <p className="transit-notice">
          Swale simulation · uncalibrated demonstrator. Buffered/merged model
          points are not official DEP polygons. No simulation has been started
          by this view.
        </p>
      ) : (
        <p className="transit-notice">
          NYC DEP model / scenario geometry. This is not observed water or a
          current flood extent.
        </p>
      )}
      <p className="transit-copy">
        Entrance associations are supplied by the backend; they do not prove
        water entering a station.
      </p>
      <ul className="transit-text-list">
        {p.entrances.map((entrance) => (
          <li key={entrance.entrance_id}>
            {entrance.station_name} · {entrance.entrance_id}
          </li>
        ))}
      </ul>
      <EvidenceButtons ids={p.evidence_ids} onEvidence={onEvidence} />
    </details>
  );
}

function MonitoringHistory({
  data,
  gtfsStopId,
}: {
  data: TransitData;
  gtfsStopId: string;
}) {
  const polls =
    data.history.data?.polls.filter((poll) =>
      poll.stations.some((station) => station.gtfs_stop_id === gtfsStopId),
    ) ?? [];
  return (
    <section className="transit-section">
      <h3>RECENT MONITORING / HISTORY LIMIT</h3>
      <ResourceNotice state={data.history} label="Monitoring history" />
      <p className="transit-notice">
        Insufficient station-specific event history to say which stations tend
        to flood. Repeated polls are monitoring samples, not distinct flood
        events.
      </p>
      <p className="transit-copy">
        {polls.length} supplied poll samples include this station. No
        years-of-history or most-flooded ranking is inferred.
      </p>
      <details className="transit-disclosure">
        <summary>Recent monitoring samples</summary>
        <ul className="transit-text-list">
          {polls.slice(-12).map((poll, index) => (
            <li key={`${poll.polled_at}-${index}`}>
              <TransitTime value={poll.polled_at} />
              <span>
                Backend classification:{" "}
                {poll.stations.find(
                  (station) => station.gtfs_stop_id === gtfsStopId,
                )?.status ?? "Unavailable"}
              </span>
            </li>
          ))}
        </ul>
        {polls.length > 12 && (
          <p className="transit-copy">Latest 12 supplied samples shown.</p>
        )}
        <p className="transit-copy">
          History does not supply alert identities needed to derive distinct
          station flood events.
        </p>
      </details>
    </section>
  );
}

function WeatherContext({
  data,
  compact = false,
}: {
  data: TransitData;
  compact?: boolean;
}) {
  const weather = data.weather.data;
  const rain = data.zones.meta?.rain ?? data.exposures.meta?.rain;
  return (
    <section className="transit-section">
      <h3>WEATHER / SEPARATE SOURCE CONTEXT</h3>
      <ResourceNotice state={data.weather} label="NWS weather" />
      {weather ? (
        <>
          <p className="transit-copy">
            Fetched: <TransitTime value={weather.fetched_at} /> ·{" "}
            {weather.cached
              ? "Backend cache reused"
              : "Backend reported uncached response"}
          </p>
          <p className="transit-copy">
            Forecast issued: <TransitTime value={weather.forecast_issued_at} />
          </p>
          {weather.observation ? (
            <div className="transit-weather-observed">
              <strong>OBSERVED / {weather.observation.station_name}</strong>
              <p>
                {weather.observation.description ?? "Description unavailable"}
              </p>
              <p>
                <TransitTime value={weather.observation.observed_at} />
              </p>
              <p>
                Last-hour precipitation:{" "}
                {weather.observation.precip_last_hour_in === null
                  ? "Unavailable"
                  : `${weather.observation.precip_last_hour_in} in`}
              </p>
            </div>
          ) : (
            <p className="transit-copy">Weather observation unavailable.</p>
          )}
          <p className="transit-copy">
            PREDICTED forecast accumulation: {weather.forecast.total_rain_in} in
            · peak backend rate {weather.forecast.peak_rate_in_hr} in/hr.
            Forecast is not a measurement.
          </p>
          <p className="transit-copy">{weather.context.note}</p>
          <p className="transit-copy">
            The backend maps some missing precipitation/chance values to zero; a
            returned zero does not certify that no rain is possible.
          </p>
          {weather.errors.length > 0 && (
            <ul className="transit-text-list">
              {weather.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {!compact && (
            <details className="transit-disclosure">
              <summary>Forecast intervals & official NWS alerts</summary>
              {weather.forecast.hours.map((hour) => (
                <p className="transit-copy" key={hour.start}>
                  <TransitTime value={hour.start} /> to{" "}
                  <TransitTime value={hour.end} /> · {hour.rain_in} in
                  accumulated · {hour.rain_chance_pct}% rain chance ·{" "}
                  {hour.short_forecast}
                </p>
              ))}
              {weather.alerts.length ? (
                weather.alerts.map((alert, index) => (
                  <article
                    className="transit-alert"
                    key={`${alert.event}-${index}`}
                  >
                    <h4>{alert.event}</h4>
                    <p className="transit-copy">{alert.headline}</p>
                    <p className="transit-copy">
                      {alert.severity} · <TransitTime value={alert.onset} /> to{" "}
                      <TransitTime value={alert.ends} />
                    </p>
                  </article>
                ))
              ) : (
                <p className="transit-copy">
                  No official NWS alerts supplied by this response.
                </p>
              )}
            </details>
          )}
        </>
      ) : (
        <p className="transit-copy">
          No weather response available; conditions remain unknown.
        </p>
      )}
      {rain && (
        <p className="transit-copy">
          Backend rain summary: {rain.level}. This is a backend rule summary,
          not itself an official NWS watch or warning.
        </p>
      )}
      <p className="transit-copy">
        FloodNet historical measurements are not realtime station flood sensors.
        Forecast and live service updates use different sources and clocks.
      </p>
    </section>
  );
}

function EvidenceButtons({
  ids,
  onEvidence,
}: {
  ids: string[];
  onEvidence: (id: string) => void;
}) {
  return ids.length ? (
    <ul className="transit-evidence-buttons">
      {ids.map((id) => (
        <li key={id}>
          <button onClick={() => onEvidence(id)}>
            Inspect evidence <span>{id}</span>
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="transit-copy">
      No cited record IDs supplied for this factor.
    </p>
  );
}

function EvidenceDetail({
  evidence,
  onClose,
  onEvidence,
}: {
  evidence: TransitEvidenceState;
  onClose?: () => void;
  onEvidence: (id: string) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!evidence.id) return;
    const trigger = document.activeElement;
    const element = panel.current;
    heading.current?.focus();
    return () => {
      if (
        element?.contains(document.activeElement) &&
        trigger instanceof HTMLElement &&
        trigger.isConnected
      )
        trigger.focus({ preventScroll: true });
    };
  }, [evidence.id]);
  if (!evidence.id) return null;
  const props = evidence.feature?.properties as
    | Record<string, unknown>
    | undefined;
  return (
    <section className="transit-section transit-evidence-detail" ref={panel}>
      <h3 ref={heading} tabIndex={-1}>
        CITED EVIDENCE
      </h3>
      <p className="transit-opaque-id">{evidence.id}</p>
      {onClose && (
        <button className="transit-text-button" onClick={onClose}>
          Close cited evidence
        </button>
      )}
      {evidence.status === "loading" && (
        <p className="transit-notice" role="status">
          Loading cited source record…
        </p>
      )}
      {evidence.error && (
        <p className="transit-notice" role="alert">
          {evidence.error}
        </p>
      )}
      {evidence.note && <p className="transit-notice">{evidence.note}</p>}
      {props && (
        <dl className="transit-fields">
          {[
            "knowledge_type",
            "category_label",
            "reported_at",
            "started_at",
            "ended_at",
            "max_depth_in",
            "event_count",
            "last_event_at",
            "tidally_influenced",
            "scenario_code",
            "depth_class",
            "ingested_at",
          ]
            .filter((key) => key in props)
            .map((key) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{primitiveText(props[key])}</dd>
              </div>
            ))}
        </dl>
      )}
      {evidence.feature && (
        <>
          <p className="transit-copy">
            Source: {evidence.feature.properties.source.id} · source record{" "}
            {evidence.feature.properties.source.record_id}
          </p>
          <p className="transit-copy">
            Source updated:{" "}
            <TransitTime
              value={evidence.feature.properties.source.updated_at}
            />
          </p>
          <SafeSourceLink
            url={evidence.feature.properties.source.url}
            label={`Original evidence record ${evidence.id}`}
          />
          {evidence.feature.properties.layer === "incidents" && (
            <div className="transit-notice">
              <strong>Report and agency finding are separate</strong>
              <p>
                Verification classification:{" "}
                {evidence.feature.properties.verification.status} ·{" "}
                {evidence.feature.properties.verification.knowledge_type}
              </p>
              <p>
                {evidence.feature.properties.verification.text ??
                  "No agency resolution text supplied."}
              </p>
              <p>
                Finding/resolution time:{" "}
                <TransitTime
                  value={evidence.feature.properties.verification.at}
                />
              </p>
              <p>
                A historical agency finding is not a current station condition.
              </p>
            </div>
          )}
          {evidence.feature.properties.layer === "dep_flood_maps" && (
            <p className="transit-notice">
              NYC DEP model: {evidence.feature.properties.scenario_label} ·{" "}
              {evidence.feature.properties.intensity_in_hr} in/hr ·{" "}
              {evidence.feature.properties.sea_level}.{" "}
              {evidence.feature.properties.note}
            </p>
          )}
        </>
      )}
      {evidence.observations && (
        <details className="transit-disclosure">
          <summary>
            Retrieved sensor event records ({evidence.observations.length})
          </summary>
          <p className="transit-copy">
            Historical street measurements, not station sensors. The retrieved
            subset is not a complete station event history.
          </p>
          {evidence.observations.map((observation) => (
            <article className="transit-alert" key={observation.id}>
              <p className="transit-opaque-id">{observation.id}</p>
              <button
                className="transit-text-button"
                onClick={() => onEvidence(observation.id)}
              >
                Inspect this measured event
              </button>
              <p className="transit-copy">
                {observation.properties.max_depth_in} in maximum ·{" "}
                <TransitTime value={observation.properties.started_at} /> to{" "}
                <TransitTime value={observation.properties.ended_at} />
              </p>
              <p className="transit-copy">
                Sensor {observation.properties.sensor_id} · tidal flag{" "}
                {primitiveText(observation.properties.tidally_influenced)}
              </p>
            </article>
          ))}
        </details>
      )}
      <p className="transit-copy">
        Nearby evidence is not proof of a station event. Measurements apply at
        the sensor/time; complaints remain reported; model polygons remain
        predicted.
      </p>
    </section>
  );
}

export function TransitSourcesPanel({
  data,
  onClose,
  onRefresh,
}: {
  data: TransitData;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const trigger = document.activeElement;
    const element = panel.current;
    close.current?.focus({ preventScroll: true });
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
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape is delegated from descendant controls in this non-modal sources panel.
    <aside
      className="sources-panel transit-sources"
      ref={panel}
      aria-labelledby="transit-sources-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <span className="eyebrow">MIXED SOURCES / SEPARATE CLOCKS</span>
          <h2 id="transit-sources-title">Transit sources & freshness</h2>
        </div>
        <button
          className="icon-button"
          ref={close}
          aria-label="Close transit sources"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="transit-pinned-status">
        <FeedState data={data} />
        <button className="transit-text-button" onClick={onRefresh}>
          Retry / refresh transit
        </button>
      </div>
      <div className="sources-scroll">
        <p className="transit-copy">
          MTA service updates and NWS weather are public-source responses.
          Station/entrance inventories and flood evidence are separately dated
          records. Local snapshot layers are not a live feed.
        </p>
        <ResourceNotice state={data.live} label="MTA board" />
        <FeedTimes data={data} />
        <p className="transit-copy">
          Last successful browser refresh:{" "}
          <TransitTime value={data.live.lastSuccessAt} />. This timestamp does
          not replace an MTA feed timestamp.
        </p>
        <SafeSourceLink
          url={data.live.data?.source.url ?? null}
          label="MTA feed source documentation"
        />
        <section className="transit-section">
          <h3>STATION & ENTRANCE INVENTORY</h3>
          <ResourceNotice state={data.stations} label="Station inventory" />
          <SourceTimes collection={data.stations} />
          <ResourceNotice state={data.entrances} label="Entrance inventory" />
          <SourceTimes collection={data.entrances} />
          <p className="transit-copy">
            BK0601/source-clipped coverage; entrance inventory supplies points,
            not entrance elevations, flood barriers or interior geometry.
            Structure stays unknown when its source attribute is missing.
          </p>
        </section>
        <section className="transit-section">
          <h3>REVIEWED SCHEDULE ARTIFACT</h3>
          <dl className="transit-fields">
            <dt>Source timezone</dt>
            <dd>{TRANSIT_SCHEDULE_SOURCE.timezone}</dd>
            <dt>Service dates (inclusive)</dt>
            <dd>
              {TRANSIT_SCHEDULE_SOURCE.firstServiceDate} through{" "}
              {TRANSIT_SCHEDULE_SOURCE.lastServiceDate}
            </dd>
            <dt>Source extraction</dt>
            <dd>
              <TransitTime value={TRANSIT_SCHEDULE_SOURCE.extractedAt} />
            </dd>
            <dt>Reviewed backend commit</dt>
            <dd>{TRANSIT_SCHEDULE_SOURCE.backendCommit}</dd>
          </dl>
          <p className="transit-copy">
            These are verified committed-artifact metadata, separate from API
            results. A matching current service day/trip is required for delay
            comparisons. Missing/expired/unmatched schedules do not become zero
            delay or normal service.
          </p>
        </section>
        <section className="transit-section">
          <h3>EXPOSURE & ZONE CONTEXT</h3>
          <ResourceNotice state={data.exposures} label="Exposure" />
          <SourceTimes collection={data.exposures} />
          <ResourceNotice state={data.zones} label="Zones" />
          <SourceTimes collection={data.zones} />
          <p className="transit-copy">
            Partner-supplied station exposure is inferred. DEP polygons are
            model/scenario extents; FloodNet zone buffers are derived context
            around historical street sensors. SWMM context is unavailable
            without an identified stored run; no scenario or simulation is
            created here.
          </p>
        </section>
        <WeatherContext data={data} />
        <SafeSourceLink
          url={data.weather.data?.source.url ?? null}
          label="National Weather Service source documentation"
        />
        <section className="transit-section">
          <h3>MONITORING HISTORY LIMIT</h3>
          <ResourceNotice state={data.history} label="Monitoring history" />
          <p className="transit-copy">
            History last successfully loaded:{" "}
            <TransitTime value={data.history.lastSuccessAt} />.{" "}
            {data.history.data?.note ?? "No history response available."}
          </p>
          <p className="transit-notice">
            Monitoring samples are not distinct flood events. Insufficient
            station-specific event history remains a partner-owned data gap.
          </p>
        </section>
        <section className="transit-section">
          <h3>SOURCE LIMITATIONS</h3>
          <ul className="transit-text-list">
            {TRANSIT_SOURCE_LIMITATIONS.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}

export function TransitLegend({
  data,
  layers,
}: {
  data: TransitData;
  layers: TransitLayerVisibility;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <section
      className={`map-legend transit-legend ${expanded ? "" : "collapsed"}`}
      aria-label="Map legend"
    >
      <button
        className="legend-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>
          <Icon name="layers" size={14} /> TRANSIT / CONTEXT LEGEND
        </span>
        <Icon name="chevron" size={14} className={expanded ? "rotated" : ""} />
      </button>
      {expanded && (
        <div className="legend-content">
          <div className="legend-layers">
            {layers.stations && (
              <span>
                <i className="transit-swatch station" />
                Observed station inventory
              </span>
            )}
            {layers.entrances && (
              <span>
                <i className="transit-swatch entrance" />
                Observed entrance inventory
              </span>
            )}
            {layers.exposure && (
              <span>
                <i className="transit-swatch exposure" />
                Inferred exposure · not current flooding
              </span>
            )}
            {layers.zones && (
              <>
                <span>
                  <i className="transit-swatch zone-high" />
                  High context level
                </span>
                <span>
                  <i className="transit-swatch zone-moderate" />
                  Moderate context level
                </span>
                {data.zones.features.some(
                  (zone) => zone.properties.zone_type === "measured",
                ) && (
                  <span>
                    <i className="transit-swatch zone-derived" />
                    Dashed: derived sensor-buffer boundary
                  </span>
                )}
              </>
            )}
          </div>
          <p className="legend-source">
            BK0601 loaded coverage · {data.feedState} transit feed
            <br />
            Zones are modeled extents or derived sensor buffers, not live flood
            boundaries. Text labels distinguish meanings.
          </p>
        </div>
      )}
    </section>
  );
}

function FeedState({ data }: { data: TransitData }) {
  return (
    <p
      className={`transit-feed-state transit-feed-${data.feedState}`}
      role="status"
    >
      <i aria-hidden="true" />
      <strong>{data.feedState.toUpperCase()}</strong>
      <span>
        {data.feedState === "live"
          ? "MTA response current within configured freshness limits"
          : "Availability and freshness are separate from service classification"}
      </span>
    </p>
  );
}
function ResourceNotice({
  state,
  label,
}: {
  state: NoticeState;
  label: string;
}) {
  return (
    <>
      {state.status === "loading" && (
        <p className="transit-copy">{label}: loading…</p>
      )}
      {state.status === "error" && (
        <p className="transit-notice" role="alert">
          {label}: {state.error ?? "Unavailable"}. No fixture substitution.
        </p>
      )}
      {state.stale && (
        <p className="transit-notice">
          STALE {label} · original source times retained.
        </p>
      )}
      {state.partial && (
        <p className="transit-notice">
          PARTIAL {label} · coverage or source responses are incomplete.
        </p>
      )}
    </>
  );
}
function SourceTimes({
  collection,
  sourceId,
}: {
  collection: {
    generatedAt: string | null;
    sources: {
      id: string;
      dataset_updated_at: string | null;
      fetched_at: string | null;
      last_ingested_at: string | null;
      stale: boolean;
    }[];
  };
  sourceId?: string;
}) {
  const sources = sourceId
    ? collection.sources.filter((source) => source.id === sourceId)
    : collection.sources;
  return (
    <details className="transit-disclosure">
      <summary>Source & response timestamps</summary>
      <p className="transit-copy">
        Response generated: <TransitTime value={collection.generatedAt} />
      </p>
      {sources.map((source) => (
        <div className="transit-source-times" key={source.id}>
          <strong>
            {source.id} · {source.stale ? "STALE" : "not flagged stale"}
          </strong>
          <p>
            Dataset updated: <TransitTime value={source.dataset_updated_at} />
          </p>
          <p>
            Source fetched: <TransitTime value={source.fetched_at} />
          </p>
          <p>
            Locally ingested: <TransitTime value={source.last_ingested_at} />
          </p>
        </div>
      ))}
      {sources.length === 0 && (
        <p className="transit-copy">
          Source timestamps not supplied for this record.
        </p>
      )}
      <p className="transit-copy">
        A response-generation time is not a new source observation or fetch.
      </p>
    </details>
  );
}
function FeedTimes({ data }: { data: TransitData }) {
  return (
    <details className="transit-disclosure">
      <summary>MTA source feed timestamps & errors</summary>
      <p className="transit-copy">
        Board fetched: <TransitTime value={data.live.data?.fetched_at} />
      </p>
      {Object.entries(data.live.data?.feed_times ?? {}).map(
        ([id, timestamp]) => (
          <p className="transit-copy" key={id}>
            {id}: <TransitTime value={timestamp} />
          </p>
        ),
      )}
      <ul className="transit-text-list">
        {data.live.data?.errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </details>
  );
}
function RouteLabels({ routes }: { routes: string[] }) {
  return (
    <span
      className="transit-routes"
      aria-label={`Routes ${routes.join(", ") || "unavailable"}`}
    >
      {routes.map((route) => (
        <span key={route}>{route}</span>
      ))}
    </span>
  );
}
function TransitTime({ value }: { value: string | null | undefined }) {
  return value ? (
    <time dateTime={value} title={value}>
      {formatTime(value, "Unavailable")}
      <span className="transit-iso">{value}</span>
    </time>
  ) : (
    <span>Unavailable (not supplied)</span>
  );
}
function delayText(value: number | null) {
  return value === null
    ? "Unavailable / no valid match"
    : value < 0
      ? `${value} min (early)`
      : value === 0
        ? "0 min (matched)"
        : `${value} min late`;
}
function primitiveText(value: unknown): string {
  return value === null || value === undefined
    ? "Unavailable"
    : typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ? String(value)
      : "Nested source details unavailable in this view";
}

function SafeSourceLink({ url, label }: { url: string | null; label: string }) {
  const safe = safeBackendLink(url);
  return safe ? (
    <a
      className="transit-source-link"
      href={safe}
      rel="noopener noreferrer"
      target="_blank"
    >
      {label} <Icon name="arrow" size={12} />
    </a>
  ) : (
    <p className="transit-copy">Source link unavailable.</p>
  );
}
