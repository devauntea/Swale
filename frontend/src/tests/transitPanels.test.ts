// @vitest-environment jsdom
// Mocked presentation semantics; not browser/map or live-source acceptance.
import { createElement, useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react/pure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TransitInspector,
  TransitSidebar,
  TransitSourcesPanel,
  TransitLegend,
} from "../components/transit/TransitPanels";
import type {
  TransitData,
  TransitStation,
  TransitEntrance,
  TransitZone,
  TransitEvidenceState,
} from "../backend/transitContracts";
import { emptyTransitData } from "../backend/useTransitData";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const time = "2026-10-16T12:00:00Z";
const source = {
  id: "test-mta",
  dataset: "test",
  record_id: "test-record",
  updated_at: null,
  url: "https://example.org/mta",
};
const station: TransitStation = {
  type: "Feature",
  id: "subway_station:opaque/F 21",
  geometry: { type: "Point", coordinates: [-74, 40.68] },
  properties: {
    layer: "subway_stations",
    knowledge_type: "observed",
    gtfs_stop_id: "F21",
    name: "Test Station",
    routes: ["F", "G"],
    line: "Test line",
    structure: null,
    ada: 0,
    complex_id: null,
    source,
  },
};
const entrance: TransitEntrance = {
  type: "Feature",
  id: "subway_entrance:opaque/1",
  geometry: { type: "Point", coordinates: [-74, 40.68] },
  properties: {
    layer: "subway_entrances",
    knowledge_type: "observed",
    station_id: station.id,
    station_name: station.properties.name,
    routes: ["F", "G"],
    entrance_type: "Stair",
    entry_allowed: true,
    exit_allowed: false,
    source,
  },
};
const zone: TransitZone = {
  type: "Feature",
  id: "zone:measured-test",
  geometry: null,
  properties: {
    layer: "danger_zones",
    zone_type: "measured",
    knowledge_type: "observed",
    level: "high",
    assumes: "Historical street measurements",
    explanation: "Sensor-linked buffer from test source",
    evidence_ids: ["sensor:opaque/full"],
    entrance_count: 1,
    entrances: [
      {
        entrance_id: entrance.id,
        station_id: station.id,
        station_name: station.properties.name,
        routes: ["F", "G"],
      },
    ],
    last_flood_at: time,
  },
};
const noEvidence: TransitEvidenceState = {
  id: null,
  kind: null,
  status: "idle",
  feature: null,
  error: null,
  note: null,
};
const layers = { stations: true, entrances: true, exposure: true, zones: true };

function data(): TransitData {
  const result = emptyTransitData();
  result.stations = {
    ...result.stations,
    status: "ready",
    features: [station],
    generatedAt: time,
  };
  result.entrances = {
    ...result.entrances,
    status: "ready",
    features: [entrance],
    generatedAt: time,
  };
  result.zones = {
    ...result.zones,
    status: "ready",
    features: [zone],
    generatedAt: time,
  };
  result.exposures = {
    ...result.exposures,
    status: "ready",
    generatedAt: time,
    features: [
      {
        type: "Feature",
        id: "station_exposure:opaque",
        geometry: station.geometry,
        properties: {
          layer: "station_flood_exposure",
          knowledge_type: "inferred",
          station_id: station.id,
          name: station.properties.name,
          routes: ["F", "G"],
          rank: 1,
          score: 0,
          tier: "low",
          method_version: "test-exposure-v1",
          assessed_at: time,
          run_id: null,
          entrances: 1,
          factors: [
            {
              id: "test-reports",
              label: "Test reported context",
              knowledge_type: "reported",
              value: 0,
              weight: 0.2,
              contribution: 0,
              evidence_ids: ["incident:opaque/report"],
              explanation: "No additional test report evidence supplied.",
            },
          ],
          missing_factors: [
            { id: "simulated_ponding", reason: "No stored run selected." },
          ],
          live: null,
          caveats: ["Exposure is not present flooding."],
        },
      },
    ],
  };
  result.live = {
    ...result.live,
    status: "ready",
    lastSuccessAt: time,
    data: {
      api_version: "1.0",
      area_id: "BK0601",
      fetched_at: time,
      feed_times: { test_feed: time },
      stations: [
        {
          station_id: station.id,
          gtfs_stop_id: "F21",
          name: station.properties.name,
          routes: ["F", "G"],
          lon: -74,
          lat: 40.68,
          status: "flooding_reported",
          reasons: ["MTA alert mentions water conditions"],
          trains_next_30_min: { predicted: 3, scheduled: 3 },
          delay_min: { median: 0, max: 0, trains_matched: 2 },
          next: {
            N: [
              {
                route: "F",
                direction: "N",
                trip_id: "trip-early",
                predicted_at: time,
                minutes_away: 0,
                scheduled_at: time,
                delay_min: -2,
              },
              {
                route: "G",
                direction: "N",
                trip_id: "trip-zero",
                predicted_at: time,
                minutes_away: 0,
                scheduled_at: time,
                delay_min: 0,
              },
            ],
            S: [
              {
                route: "F",
                direction: "S",
                trip_id: "trip-unmatched",
                predicted_at: time,
                minutes_away: 0,
                scheduled_at: null,
                delay_min: null,
              },
            ],
          },
          direction_labels: { N: "Source north label", S: null },
          alert_ids: ["alert:water"],
        },
      ],
      trains: [
        {
          route: "F",
          trip_id: "trip-early",
          stop_id: "F21",
          direction: "N",
          status: "incoming_at",
          seen_at: time,
          knowledge_type: "observed",
        },
      ],
      alerts: [
        {
          id: "alert:water",
          alert_type: "Delays",
          header: "<img src=x onerror=alert(1)> Water conditions on route F",
          description: "Official source text",
          routes: ["F"],
          stops: [],
          station_specific: false,
          mentions_flooding: true,
          active_from: time,
          updated_at: null,
          knowledge_type: "observed",
          basis: "MTA service alert",
        },
      ],
      errors: [],
      summary: {
        stations: 1,
        delayed: 0,
        alert: 0,
        flooding_reported: 1,
        trains_in_area: 1,
        alerts: 1,
      },
      knowledge: {},
      source: { publisher: "MTA", url: "https://example.org/mta" },
    },
  };
  result.history = {
    ...result.history,
    status: "ready",
    data: {
      api_version: "1.0",
      area_id: "BK0601",
      hours: 6,
      note: "Monitoring snapshots only",
      polls: [0, 1].map(() => ({
        polled_at: time,
        delayed: 0,
        flooding_reported: 1,
        alerts: 1,
        stations: [
          {
            gtfs_stop_id: "F21",
            status: "flooding_reported",
            predicted: 3,
            scheduled: null,
            median_delay_min: null,
            max_delay_min: null,
          },
        ],
      })),
    },
  };
  result.feedState = "live";
  return result;
}
function inspectorProps(current = data()) {
  return {
    station,
    data: current,
    selectedEntranceId: entrance.id,
    onSelectEntrance: vi.fn(),
    onFocus: vi.fn(),
    onFitEntrances: vi.fn(),
    onOverview: vi.fn(),
    onClose: vi.fn(),
    onEvidence: vi.fn(),
    evidence: noEvidence,
  };
}

describe("transit presentation trust and unknown states", () => {
  it("shows the matching repaired historical event and source metadata without the former detail error", () => {
    const eventId = "flood_event:⟨TEST_événement:02⟩";
    const evidence: TransitEvidenceState = {
      ...noEvidence,
      id: eventId,
      kind: "flood_observation",
      status: "ready",
      feature: {
        type: "Feature",
        id: eventId,
        geometry: station.geometry,
        properties: {
          layer: "flood_observations",
          knowledge_type: "observed",
          sensor_id: "TEST_SENSOR",
          sensor: "sensor:TEST_SENSOR",
          started_at: "2026-10-01T10:00:00Z",
          ended_at: "2026-10-01T10:02:00Z",
          max_depth_in: 2,
          duration_min: 2,
          onset_min: null,
          drain_min: 0,
          duration_above_4in_min: 0,
          duration_above_12in_min: 0,
          tidally_influenced: false,
          source: { ...source, record_id: "TEST_événement:02" },
          ingested_at: time,
          profile: { t_s: [0, 60, 120], depth_in: [0, 2, 0] },
        },
      },
    };
    const view = render(
      createElement(TransitInspector, { ...inspectorProps(), evidence }),
    );
    const panel = view.container.querySelector(".transit-evidence-detail")!;
    expect(panel.textContent).toContain(eventId);
    expect(panel.textContent).toContain("observed");
    expect(panel.textContent).toContain("2026-10-01T10:00:00Z");
    expect(panel.textContent).toContain("2026-10-01T10:02:00Z");
    expect(panel.textContent).toContain("source record TEST_événement:02");
    expect(panel.textContent).toContain(
      "Measurements apply at the sensor/time",
    );
    expect(panel.querySelector('[role="alert"]')).toBeNull();
    expect(panel.textContent).not.toContain("profile unavailable");
  });
  it("shows backend weather-enabled zone rain summary instead of the unknown static exposure summary", () => {
    const current = data();
    const meta = {
      api_version: "1.0" as const,
      layer: "test",
      request_bbox: [-74.1, 40.6, -73.9, 40.7] as const,
      filters: {},
      count: 1,
      limit: 100,
      truncated: false,
      next_cursor: null,
      generated_at: time,
      sources: [],
    };
    current.exposures.meta = { ...meta, rain: { level: "unknown" } };
    current.zones.meta = {
      ...meta,
      rain: { level: "warning", rule: "Test backend rain summary" },
    };
    render(createElement(TransitInspector, inspectorProps(current)));
    expect(screen.getByText(/Backend rain summary: warning/)).toBeTruthy();
    expect(screen.queryByText(/Backend rain summary: unknown/)).toBeNull();
  });

  it("sorts/deduplicates displayed arrivals and filters mismatched alert scope without rewriting backend counts", () => {
    const current = data();
    const board = current.live.data!;
    board.stations[0].next.N.push(board.stations[0].next.N[0]);
    board.alerts.push({
      ...board.alerts[0],
      id: "unrelated",
      routes: ["R"],
      header: "Unrelated route alert",
    });
    board.stations[0].alert_ids.push("unrelated");
    render(createElement(TransitInspector, inspectorProps(current)));
    expect(screen.getAllByText("trip-early")).toHaveLength(1);
    expect(screen.getByText(/duplicate arrival rows removed/)).toBeTruthy();
    expect(screen.queryByText("Unrelated route alert")).toBeNull();
    expect(board.stations[0].trains_next_30_min.predicted).toBe(3);
    expect(board.stations[0].next.N).toHaveLength(3);
  });

  it("keeps predictions but marks delay comparison unavailable after reviewed schedule validity expires", () => {
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    render(createElement(TransitInspector, inspectorProps()));
    expect(screen.getByText(/Schedule comparison state: expired/)).toBeTruthy();
    expect(screen.getByText("trip-early")).toBeTruthy();
    expect(screen.queryByText("-2 min (early)")).toBeNull();
    expect(screen.queryByText("0 min (matched)")).toBeNull();
  });

  it("preserves negative, zero and unavailable delays plus source directions without inventing destinations or train coordinates", () => {
    const view = render(createElement(TransitInspector, inspectorProps()));
    expect(screen.getByText("-2 min (early)")).toBeTruthy();
    expect(screen.getByText("0 min (matched)")).toBeTruthy();
    expect(screen.getByText("Unavailable / no valid match")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "N · Source north label" }),
    ).toBeTruthy();
    expect(screen.getByText(/Destinations are not supplied/)).toBeTruthy();
    expect(
      screen.getByText(
        /A stop association is not an exact underground vehicle location/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Route-wide; may apply elsewhere/)).toBeTruthy();
    expect(screen.getByText(data().live.data!.alerts[0].header)).toBeTruthy();
    expect(view.container.querySelector("img")).toBeNull();
    expect(
      screen.getByText(
        /does not establish station closure or a flood-caused shutdown/,
      ),
    ).toBeTruthy();
  });

  it("does not present default normal status as a current assessment with a stale or incomplete feed", () => {
    const current = data();
    current.live.data!.stations[0].status = "normal";
    current.feedState = "stale";
    current.live.stale = true;
    render(createElement(TransitInspector, inspectorProps(current)));
    expect(
      screen.getByText("Current service assessment unavailable / incomplete"),
    ).toBeTruthy();
    expect(screen.getByText("Backend classification: normal")).toBeTruthy();
    expect(screen.queryByText("No disruption classified")).toBeNull();
    expect(screen.getByText(/STALE MTA board/)).toBeTruthy();
  });

  it("keeps supplied exposure zero, missing simulation, unknown structure and schematic limits separate", () => {
    const view = render(createElement(TransitInspector, inspectorProps()));
    expect(screen.getByText("0 / 100")).toBeTruthy();
    expect(
      screen.getByText("Unknown — source attribute unavailable"),
    ).toBeTruthy();
    expect(
      screen.getByText(/Unavailable — no stored run selected/),
    ).toBeTruthy();
    expect(screen.getByText(/Missing factors remain unavailable/)).toBeTruthy();
    expect(screen.getByText(/not a calibrated flood probability/)).toBeTruthy();
    expect(
      screen.getByText(
        /Not to scale · no surveyed underground model or camera feed/,
      ),
    ).toBeTruthy();
    expect(view.container.querySelector(".transit-schematic svg")).toBeNull();
    expect(
      screen.getByText(
        /Repeated polls are monitoring samples, not distinct flood events/,
      ),
    ).toBeTruthy();
  });

  it("supports zone-only selection and identifies a sensor buffer as derived context", () => {
    const props = {
      ...inspectorProps(),
      station: null,
      selectedEntranceId: null,
      selectedZoneId: zone.id,
    };
    render(createElement(TransitInspector, props));
    expect(screen.getByRole("heading", { name: "SELECTED ZONE" })).toBeTruthy();
    expect(
      screen.getByText(
        /buffer is not a measured flood boundary or station sensor/,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Inspect evidence sensor:opaque\/full/,
      }),
    );
    expect(props.onEvidence).toHaveBeenCalledWith("sensor:opaque/full");
    expect(
      screen.queryByRole("heading", { name: station.properties.name }),
    ).toBeNull();
  });

  it("labels collapsed sensor context as a derived buffer and opens selected-zone derivation immediately", () => {
    const props = inspectorProps();
    const view = render(createElement(TransitInspector, props));
    const associated =
      view.container.querySelector<HTMLDetailsElement>(".transit-zone")!;
    expect(associated.open).toBe(false);
    expect(associated.querySelector("summary")!.textContent).toBe(
      "Derived sensor buffer · high · historical measurement context",
    );
    expect(associated.querySelector("summary")!.textContent).not.toMatch(
      /observed/,
    );
    view.rerender(
      createElement(TransitInspector, {
        ...props,
        station: null,
        selectedEntranceId: null,
        selectedZoneId: zone.id,
      }),
    );
    const selected =
      view.container.querySelector<HTMLDetailsElement>(".transit-zone")!;
    expect(selected.open).toBe(true);
    expect(selected.textContent).toContain(
      "zone_type: measured · knowledge_type: observed",
    );
    expect(selected.textContent).toContain(
      "buffer is not a measured flood boundary or station sensor",
    );
    expect(selected.textContent).toContain(zone.id);
  });

  it("keeps an observed entrance inspectable when its parent station is outside the loaded viewport", () => {
    const current = data();
    current.stations.features = [];
    current.entrances.features = [];
    const props = { ...inspectorProps(current), station: null, entrance };
    render(createElement(TransitInspector, props));
    expect(
      screen.getByRole("heading", { name: "Station entrance" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/without constructing a station record/),
    ).toBeTruthy();
    expect(screen.getByText(station.id)).toBeTruthy();
    expect(
      screen.getByText(
        /Inventory flags are not a live opening or closure status/,
      ),
    ).toBeTruthy();
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Close transit inspector" }),
      { key: "Escape" },
    );
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});

describe("native transit controls and focus", () => {
  it("searches loaded station/route data and preserves full opaque IDs through selection", () => {
    const current = data();
    current.stations.features.push({
      ...station,
      id: "subway_station:other",
      properties: {
        ...station.properties,
        name: "Another stop",
        routes: ["R"],
      },
    });
    const select = vi.fn();
    const pause = vi.fn();
    render(
      createElement(TransitSidebar, {
        data: current,
        layers,
        selectedStationId: station.id,
        modeSelector: null,
        viewSelector: null,
        paused: false,
        onPauseChange: pause,
        onRefresh: vi.fn(),
        onSelectStation: select,
        onFocus: vi.fn(),
        onFitEntrances: vi.fn(),
        onOverview: vi.fn(),
        onLayer: vi.fn(),
      }),
    );
    fireEvent.change(screen.getByLabelText("FIND A LOADED STATION OR ROUTE"), {
      target: { value: "G" },
    });
    expect(screen.queryByRole("button", { name: /Another stop/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Test Station/ }));
    expect(select).toHaveBeenCalledWith(station.id);
    fireEvent.click(
      screen.getByRole("button", { name: "Pause transit updates" }),
    );
    expect(pause).toHaveBeenCalledWith(true);
    expect(
      screen
        .getByRole("switch", { name: "Station flood exposure" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("keeps transit source refresh pinned and restores focus after Escape", () => {
    const refresh = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return createElement(
        "div",
        null,
        createElement(
          "button",
          { onClick: () => setOpen(true) },
          "Open transit sources",
        ),
        open &&
          createElement(TransitSourcesPanel, {
            data: data(),
            onClose: () => setOpen(false),
            onRefresh: refresh,
          }),
      );
    }
    render(createElement(Harness));
    const trigger = screen.getByRole("button", {
      name: "Open transit sources",
    });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole("button", { name: "Close transit sources" });
    expect(document.activeElement).toBe(close);
    const retry = screen.getByRole("button", {
      name: "Retry / refresh transit",
    });
    expect(retry.closest(".sources-scroll")).toBeNull();
    fireEvent.click(retry);
    expect(refresh).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/verified committed-artifact metadata/),
    ).toBeTruthy();
    close.focus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    expect(
      screen.queryByRole("heading", { name: "Transit sources & freshness" }),
    ).toBeNull();
  });

  it("keeps inferred, observed and context meanings explicit in the collapsible legend", () => {
    render(createElement(TransitLegend, { data: data(), layers }));
    expect(screen.getByText("Observed station inventory")).toBeTruthy();
    expect(
      screen.getByText("Inferred exposure · not current flooding"),
    ).toBeTruthy();
    const toggle = screen.getByRole("button", {
      name: "TRANSIT / CONTEXT LEGEND",
    });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Observed station inventory")).toBeNull();
  });
});
