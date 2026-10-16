import { useState } from "react";
import { ServiceBadges } from "../components/transit/ServiceBadges";
import type {
  InfrastructureBinding,
  InfrastructureChunk,
  InfrastructureManifest,
  InfrastructureMapState,
  InfrastructureStation,
  InfrastructureVisibility,
} from "./contracts";
import "./infrastructure.css";

interface ControlsProps {
  open: boolean;
  manifest: InfrastructureManifest | null;
  station: InfrastructureStation | null;
  chunk: InfrastructureChunk | null;
  status: string;
  error: string;
  state: InfrastructureMapState | null;
  onOpen: () => void;
  onExit: () => void;
  onStation: (id: string) => void;
  onMode: (mode: "surface" | "xray") => void;
  onVisibility: (key: keyof InfrastructureVisibility) => void;
  onExaggeration: (value: number) => void;
  onFitEntrances: () => void;
  onSelectPrimitive: (id: string) => void;
  onRetry: () => void;
}

export function InfrastructureControls(p: ControlsProps) {
  const [search, setSearch] = useState("");
  if (!p.open)
    return (
      <section
        className="transit-section infrastructure-entry"
        data-tutorial="station"
      >
        <h2>SCHEMATIC INFRASTRUCTURE</h2>
        <p className="transit-copy">
          Explore Brooklyn station structure, platforms and entrances. Static
          geometry has broader coverage than the live board.
        </p>
        <button
          className="infrastructure-explore"
          data-infrastructure-entry
          onClick={p.onOpen}
        >
          Browse infrastructure
        </button>
      </section>
    );
  const stations =
    p.manifest?.stations.filter((station) =>
      `${station.id} ${station.name} ${station.routes.join(" ")}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    ) ?? [];
  const hasEntrances =
    p.chunk?.primitives.some((primitive) => primitive.kind === "entrance") ??
    false;
  return (
    <section
      className="transit-section infrastructure-controls"
      data-tutorial="station"
      aria-label="Infrastructure exploration controls"
    >
      <div className="section-heading">
        <h2>INFRASTRUCTURE EXPLORER</h2>
        <span className="infrastructure-tag">STATIC / SCHEMATIC</span>
      </div>
      <button className="infrastructure-explore" onClick={p.onExit}>
        Return to previous map
      </button>
      <p className="transit-copy">
        Generated geometry, assumed levels and connectors. This is not surveyed
        station interior or a navigation route.
      </p>
      {p.status === "loading" && (
        <p role="status" className="transit-notice">
          Loading local infrastructure detail…
        </p>
      )}
      {p.error && (
        <div className="transit-notice" role="alert">
          <p>{p.error}</p>
          <button onClick={p.onRetry}>Retry local assets</button>
        </div>
      )}
      <label className="transit-input-label" htmlFor="infrastructure-station">
        BROOKLYN MODEL STATIONS
      </label>
      <input
        id="infrastructure-station"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Station, route or GTFS ID"
        autoComplete="off"
      />
      <label
        className="transit-input-label"
        htmlFor="infrastructure-station-choice"
      >
        Select geometry
      </label>
      <select
        id="infrastructure-station-choice"
        value={p.station?.id ?? ""}
        onChange={(event) =>
          event.target.value && p.onStation(event.target.value)
        }
      >
        <option value="">Choose a station</option>
        {stations.map((station) => (
          <option value={station.id} key={station.id}>
            {station.name} · {station.id} · {station.routes.join("/")}
          </option>
        ))}
      </select>
      {p.station && <ServiceBadges routes={p.station.routes} />}
      <p className="transit-copy">
        {stations.length} matching model stations. Live coverage is validated
        separately.
      </p>
      {p.state && (
        <>
          <div
            className="infrastructure-mode"
            role="group"
            aria-label="Infrastructure view"
          >
            <button
              aria-pressed={p.state.mode === "surface"}
              onClick={() => p.onMode("surface")}
            >
              Surface view
            </button>
            <button
              aria-pressed={p.state.mode === "xray"}
              onClick={() => p.onMode("xray")}
            >
              Schematic X-ray
            </button>
          </div>
          <p className="transit-copy">
            {p.state.mode === "xray"
              ? "X-ray reveals schematic structures through the map surface; ground is not physically clipped."
              : p.state.entranceDetail
                ? "Surface shows above-reference entrance components. Use X-ray for below-reference stairs; no physical ground opening is claimed."
                : "Surface view respects ordinary map occlusion; underground structure may be occluded."}
          </p>
          <div className="infrastructure-visibility">
            {(
              [
                ["structure", "Structure"],
                ["routes", "Route alignments"],
                ["platforms", "Platforms"],
                ["entrances", "Entrances & connectors"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={p.state!.visible[key]}
                  onChange={() => p.onVisibility(key)}
                />
                {label}
              </label>
            ))}
          </div>
          <label
            className="transit-input-label"
            htmlFor="infrastructure-exaggeration"
          >
            VERTICAL EXAGGERATION · {p.state.verticalExaggeration}×
          </label>
          <input
            id="infrastructure-exaggeration"
            type="range"
            min="1"
            max="5"
            step="1"
            value={p.state.verticalExaggeration}
            onChange={(event) => p.onExaggeration(Number(event.target.value))}
          />
          <p className="transit-copy">
            Surface-relative display heights · default 2×. Relative levels are
            assumptions, not measured depth.
          </p>
          <button disabled={!hasEntrances} onClick={p.onFitEntrances}>
            Fit model entrances
          </button>
          {p.chunk && (
            <>
              <label
                className="transit-input-label"
                htmlFor="infrastructure-component"
              >
                INSPECT A COMPONENT · KEYBOARD OR MAP
              </label>
              <select
                id="infrastructure-component"
                value={p.state.selectedPrimitiveId ?? ""}
                onChange={(event) =>
                  event.target.value && p.onSelectPrimitive(event.target.value)
                }
              >
                <option value="">
                  Choose a structure, platform or entrance
                </option>
                {p.chunk.primitives.map((primitive) => (
                  <option key={primitive.id} value={primitive.id}>
                    {primitive.kind} · {primitive.id}
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      )}
      {p.manifest && (
        <>
          <p className="transit-copy">
            Model vintage: {p.manifest.vintage}. {p.manifest.referencePolicy}
          </p>
          <details className="transit-disclosure">
            <summary>Static model sources & editions</summary>
            {p.manifest.sources.map((source) => (
              <p className="transit-copy" key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.id} source
                </a>{" "}
                · edition: {source.vintage ?? "not supplied"}
              </p>
            ))}
            <p className="transit-copy">
              Static source editions, model assumptions, operational schedule
              validity and live-feed timestamps are separate clocks. Loading
              these local assets does not update their source vintage.
            </p>
          </details>
        </>
      )}
    </section>
  );
}

export function InfrastructureInspection({
  station,
  chunk,
  state,
  binding,
}: {
  station: InfrastructureStation;
  chunk: InfrastructureChunk | null;
  state: InfrastructureMapState;
  binding: InfrastructureBinding;
}) {
  const selected = chunk?.primitives.find(
    (primitive) => primitive.id === state.selectedPrimitiveId,
  );
  const selectionVisible =
    !selected ||
    (selected.kind === "entrance" || selected.kind === "connector"
      ? state.visible.entrances
      : selected.kind === "route"
        ? state.visible.routes
        : selected.kind === "platform"
          ? state.visible.platforms
          : state.visible.structure);
  return (
    <section
      className="transit-section infrastructure-inspection"
      aria-label="Selected infrastructure"
    >
      <span className="infrastructure-tag">
        STATIC / SCHEMATIC · {state.verticalExaggeration}× ·{" "}
        {state.mode === "xray" ? "X-RAY" : "SURFACE"}
      </span>
      <h3>{station.name} infrastructure</h3>
      <ServiceBadges routes={station.routes} />
      <p className="transit-copy">
        GTFS {station.gtfsStopId} · complex {station.complexId ?? "unavailable"}{" "}
        · source structure: {station.structure}
      </p>
      <p className="transit-notice">
        {binding.kind === "supported"
          ? `Backend identity verified: ${binding.station.id}. Matching service and flood context follow below.`
          : `GEOMETRY ONLY / NO LIVE COVERAGE. ${binding.reason}`}
      </p>
      {chunk &&
        !chunk.primitives.some(
          (primitive) =>
            primitive.kind === "platform" || primitive.kind === "structure",
        ) && (
          <p className="transit-notice">
            Platform/structure geometry unavailable; only available source
            components are shown. No substitute station geometry is generated.
          </p>
        )}
      {selected ? (
        <>
          <h4>{selected.kind}</h4>
          {!selectionVisible && (
            <p className="transit-notice">
              Selected component retained; its map layer is hidden.
            </p>
          )}
          <p className="transit-opaque-id">{selected.id}</p>
          <p className="transit-copy">{selected.assumption}</p>
          <p className="transit-copy">
            Source identities:{" "}
            {selected.sourceIds.join("; ") || "No source identity supplied"}
          </p>
          {selected.position && (
            <p className="transit-copy">
              Surface-relative schematic height: {selected.position[2]} m at 1×.
            </p>
          )}
        </>
      ) : (
        <p className="transit-copy">
          Select an individual component on the map or with the component
          selector.
        </p>
      )}
      <details className="transit-disclosure">
        <summary>Model provenance & assumptions</summary>
        <p className="transit-copy">
          Source station coordinate:{" "}
          {(station.sourcePosition ?? station.position).join(", ")}. Render
          anchor: {(station.renderAnchor ?? station.position).join(", ")}.
        </p>
        {station.backendPosition && (
          <p className="transit-copy">
            Build-time backend crosswalk coordinate:{" "}
            {station.backendPosition.join(", ")}. Live/inventory coordinates
            below retain their own version.
          </p>
        )}
        <p className="transit-copy">
          Static model vintage:{" "}
          {chunk?.metadata.modelVintage ?? "Detail not loaded"}
        </p>
        <p className="transit-copy">{chunk?.metadata.referencePolicy}</p>
        <p className="transit-copy">
          Source records: {station.sourceIds.join("; ")}
        </p>
        {station.assumptions.map((assumption) => (
          <p className="transit-copy" key={assumption}>
            {assumption}
          </p>
        ))}
        {binding.kind === "supported" && (
          <p className="transit-copy">
            Model coordinate: {station.position.join(", ")}. Backend coordinate:{" "}
            {binding.station.geometry?.coordinates.join(", ") ?? "unavailable"}.
            Source versions remain separate.
          </p>
        )}
      </details>
    </section>
  );
}
