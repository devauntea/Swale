// @vitest-environment jsdom
// Presentation/identity checks only; not fresh live-source or browser evidence.
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react/pure";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationEvidence } from "../infrastructure/StationEvidence";
import { emptyTransitData } from "../backend/useTransitData";
import type {
  TransitData,
  TransitEvidenceState,
  TransitStation,
} from "../backend/transitContracts";

afterEach(cleanup);
const source = {
  id: "test-source",
  dataset: "test",
  record_id: "source-record",
  url: "https://example.org/source",
  updated_at: "2026-10-01T00:00:00Z",
};
const station: TransitStation = {
  type: "Feature",
  id: "subway_station:opaque/F21",
  geometry: { type: "Point", coordinates: [-73.995, 40.68] },
  properties: {
    layer: "subway_stations",
    knowledge_type: "observed",
    gtfs_stop_id: "F21",
    name: "Test Carroll St",
    routes: ["F", "G"],
    line: null,
    structure: "Subway",
    ada: 0,
    complex_id: null,
    source,
  },
};
const idle: TransitEvidenceState = {
  id: null,
  kind: null,
  status: "idle",
  feature: null,
  error: null,
  note: null,
};
function data(): TransitData {
  const d = emptyTransitData();
  d.live = {
    ...d.live,
    status: "ready",
    lastSuccessAt: "2026-10-16T16:00:02Z",
    data: {
      api_version: "1.0",
      area_id: "BK0601",
      fetched_at: "2026-10-16T16:00:00Z",
      feed_times: { test_feed: "2026-10-16T15:59:55Z" },
      stations: [
        {
          station_id: station.id,
          gtfs_stop_id: "F21",
          name: station.properties.name,
          routes: ["F", "G"],
          lon: -73.995,
          lat: 40.68,
          status: "normal",
          reasons: [],
          trains_next_30_min: { predicted: 0, scheduled: null },
          delay_min: { median: null, max: null, trains_matched: 0 },
          next: { N: [], S: [] },
          direction_labels: { N: null, S: null },
          alert_ids: [],
        },
      ],
      trains: [],
      alerts: [],
      errors: [],
      summary: {
        stations: 1,
        delayed: 0,
        alert: 0,
        flooding_reported: 0,
        trains_in_area: 0,
        alerts: 0,
      },
      knowledge: {},
      source: { publisher: "MTA test source", url: null },
    },
  };
  d.feedState = "live";
  d.exposures.features = [
    {
      type: "Feature",
      id: "exposure:F21",
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
        method_version: "test-method-v1",
        assessed_at: "2026-10-16T15:00:00Z",
        run_id: null,
        entrances: 1,
        factors: [
          {
            id: "reports",
            label: "Nearby reported context",
            knowledge_type: "reported",
            value: 0,
            weight: 0.2,
            contribution: 0,
            evidence_ids: ["incident:test"],
            explanation: "Supplied context only",
          },
        ],
        missing_factors: [],
        live: null,
        caveats: [],
      },
    },
  ];
  return d;
}
function draw(
  d = data(),
  evidence = idle,
  selected: TransitStation | null = station,
) {
  const onEvidence = vi.fn();
  const result = render(
    createElement(StationEvidence, {
      station: selected,
      data: d,
      evidence,
      onEvidence,
    }),
  );
  return { ...result, onEvidence };
}

describe("station evidence boundaries", () => {
  it("separates unknown interior water from official operations and all source clocks", () => {
    const d = data();
    const before = JSON.stringify(d);
    const view = draw(d);
    expect(
      screen.getByRole("heading", { name: "Current evidence" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Exposure and history" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Interior water level not measured by these sources"),
    ).toBeTruthy();
    expect(
      screen.getByText(/No matching alert does not establish/),
    ).toBeTruthy();
    expect(
      view.container.querySelector('time[datetime="2026-10-16T16:00:02Z"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector('time[datetime="2026-10-16T16:00:00Z"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector('time[datetime="2026-10-16T15:59:55Z"]'),
    ).toBeTruthy();
    expect(JSON.stringify(d)).toBe(before);
  });

  it("keeps valid zero exposure and supplied citation IDs without recalculating", () => {
    const view = draw();
    expect(screen.getByText(/Inferred exposure · 0\/100 · low/)).toBeTruthy();
    expect(
      screen.getByText(/Inspection priority \(heuristic, not validated\)/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Inspect evidence incident:test/ }),
    );
    expect(view.onEvidence).toHaveBeenCalledExactlyOnceWith("incident:test");
  });

  it("cannot borrow a live board or exposure when geometry has no supported identity", () => {
    draw(data(), idle, null);
    expect(screen.getByText(/GEOMETRY ONLY \/ NO LIVE COVERAGE/)).toBeTruthy();
    expect(screen.queryByText(/MTA test source/)).toBeNull();
    expect(screen.queryByText(/Inferred exposure ·/)).toBeNull();
    expect(screen.queryByText(/Test Carroll St/)).toBeNull();
  });

  it("requires station and GTFS identity to both match a live board", () => {
    const d = data();
    d.live.data!.stations[0].gtfs_stop_id = "F22";
    draw(d);
    expect(screen.getByText(/No live board matching both/)).toBeTruthy();
    expect(
      screen.queryByText(
        /No matching official MTA alert in the supplied board/,
      ),
    ).toBeNull();
  });

  it("shows dated 311 reporting and agency findings separately and qualifies basin distance", () => {
    const evidence: TransitEvidenceState = {
      ...idle,
      id: "incident:test",
      kind: "incident",
      status: "ready",
      feature: {
        type: "Feature",
        id: "incident:test",
        geometry: { type: "Point", coordinates: [-73.994, 40.681] },
        properties: {
          layer: "incidents",
          knowledge_type: "reported",
          category: "street_flooding",
          category_label: "Street flooding",
          reported_at: "2026-01-01T12:00:00Z",
          closed_at: null,
          source_status: "Closed",
          address: null,
          verification: {
            status: "reported",
            knowledge_type: "reported",
            basis: null,
            rule: null,
            text: "No finding supplied",
            at: "2026-01-02T12:00:00Z",
          },
          linked_basin: {
            id: "basin:test",
            distance_ft: 12,
            method: "nearest",
            knowledge_type: "inferred",
          },
          source,
          ingested_at: "2026-10-15T12:00:00Z",
        },
      },
    };
    const view = draw(data(), evidence);
    expect(screen.getByText(/311 REPORT/)).toBeTruthy();
    expect(
      screen.getByText(/Agency classification: reported · reported/),
    ).toBeTruthy();
    expect(
      screen.getByText(/This is not distance to this station or entrance/),
    ).toBeTruthy();
    expect(
      view.container.querySelector('time[datetime="2026-01-01T12:00:00Z"]'),
    ).toBeTruthy();
    expect(
      view.container.querySelector('time[datetime="2026-01-02T12:00:00Z"]'),
    ).toBeTruthy();
    view.rerender(
      createElement(StationEvidence, {
        station: { ...station, id: "subway_station:other" },
        data: data(),
        evidence,
        onEvidence: vi.fn(),
      }),
    );
    expect(screen.queryByText(/311 REPORT/)).toBeNull();
  });

  it("labels repeated polls as monitoring, preserves a stale/error state, and invents no event history", () => {
    const d = data();
    d.history = {
      status: "error",
      error: "HTTP 502",
      stale: true,
      partial: true,
      lastSuccessAt: "2026-10-16T15:00:00Z",
      data: {
        api_version: "1.0",
        area_id: "BK0601",
        hours: 6,
        note: "test",
        polls: ["2026-10-16T14:00:00Z", "2026-10-16T14:01:00Z"].map(
          (polled_at) => ({
            polled_at,
            delayed: 0,
            flooding_reported: 0,
            alerts: 0,
            stations: [
              {
                gtfs_stop_id: "F21",
                status: "normal",
                predicted: 0,
                scheduled: null,
                median_delay_min: null,
                max_delay_min: null,
              },
            ],
          }),
        ),
      },
    };
    draw(d);
    expect(screen.getByText(/2 matching monitoring samples/)).toBeTruthy();
    expect(
      screen.getByText(
        /No established distinct long-term station flood-event history/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Monitoring history: error · STALE/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("HTTP 502");
  });
});
