// @vitest-environment jsdom
// App regression with the map and resource hooks replaced; no browser/live calls.
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react/pure";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/App";
import { emptyTransitData } from "../backend/useTransitData";
import { emptyBackendData } from "../backend/provider";
import type { TransitStation } from "../backend/transitContracts";
import type { InfrastructureManifest } from "../infrastructure/contracts";

vi.mock("../map/SwaleMap", () => ({
  default: (props: Record<string, unknown>) =>
    createElement("div", {
      "data-testid": "infrastructure-map-double",
      "data-infrastructure": JSON.stringify(props.infrastructure),
      "data-transit-selection": JSON.stringify(props.transitSelection),
      "data-transit-layers": JSON.stringify(props.transitLayers),
    }),
}));
vi.mock("../backend/useBackendData", () => ({
  useBackendData: () => ({
    data: emptyBackendData(),
    detail: {
      kind: null,
      id: null,
      feature: null,
      status: "idle",
      error: null,
    },
    refresh: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    retryDetail: vi.fn(),
  }),
}));
vi.mock("../backend/useTransitData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../backend/useTransitData")>()),
  useTransitData: () => ({
    data: transitData,
    paused: true,
    setPaused: vi.fn(),
    refresh: vi.fn(),
    clearEvidence,
    evidence: {
      id: null,
      kind: null,
      status: "idle",
      feature: null,
      error: null,
      note: null,
    },
    openEvidence: vi.fn(),
  }),
}));
vi.mock("../infrastructure/useInfrastructure", () => ({
  useInfrastructure: (enabled: boolean, id: string | null) => ({
    manifest: enabled ? manifest : null,
    chunk:
      enabled && id
        ? {
            stationId: id,
            primitives: [
              {
                id: `${id}-platform`,
                stationId: id,
                kind: "platform",
                sourceIds: [`S3:${id}`],
                assumption: "Generated schematic platform, not surveyed",
                polygon: [
                  [-74, 40.68, -6],
                  [-73.9999, 40.68, -6],
                  [-73.9999, 40.6801, -6],
                ],
              },
            ],
            metadata: {
              modelVintage: "source edition",
              referencePolicy: "flat reference",
              schematic: true,
            },
          }
        : null,
    manifestStatus: enabled ? "ready" : "idle",
    chunkStatus: enabled && id ? "ready" : "idle",
    error: "",
    retry: vi.fn(),
    diagnostics: { chunks: 0, decodedBytes: 0, active: 0 },
  }),
}));

const clearEvidence = vi.fn();
const station: TransitStation = {
  type: "Feature",
  id: "subway_station:opaque-F21",
  geometry: { type: "Point", coordinates: [-74, 40.68] },
  properties: {
    layer: "subway_stations",
    knowledge_type: "observed",
    gtfs_stop_id: "F21",
    name: "Carroll test station",
    routes: ["F"],
    line: null,
    structure: "Subway",
    ada: 0,
    complex_id: "237",
    source: {
      id: "S3",
      dataset: "39hk-dx4f",
      record_id: "F21",
      updated_at: null,
      url: null,
    },
  },
};
const manifest: InfrastructureManifest = {
  version: 1,
  modelId: "test",
  vintage: "source edition",
  referencePolicy: "flat reference",
  bounds: [-74.1, 40.5, -73.8, 40.8],
  sources: [],
  stations: ["F21", "R99"].map((id) => ({
    id,
    gtfsStopId: id,
    name: id === "F21" ? "Carroll test station" : "Geometry-only test station",
    complexId: id === "F21" ? "237" : null,
    routes: ["F"],
    structure: "Subway",
    position: [-74, 40.68],
    detailUrl: `/infrastructure/stations/${id}.json`,
    sourceIds: [`S3:${id}`],
    assumptions: ["Schematic test"],
    backendStationId: id === "F21" ? station.id : null,
    relationship: id === "F21" ? "exact_gtfs_stop_id" : "unmatched",
  })),
};
const transitData = emptyTransitData();
transitData.stations = {
  ...transitData.stations,
  status: "ready",
  features: [station],
};
transitData.live = {
  ...transitData.live,
  status: "error",
  error: "Controlled backend failure test",
  stale: true,
  data: {
    api_version: "1.0",
    area_id: "BK0601",
    fetched_at: "2026-10-16T12:00:00Z",
    feed_times: { test: "2026-10-16T12:00:00Z" },
    stations: [
      {
        station_id: station.id,
        gtfs_stop_id: "F21",
        name: station.properties.name,
        routes: ["F"],
        lon: -74,
        lat: 40.68,
        status: "normal",
        reasons: [],
        trains_next_30_min: { predicted: 1, scheduled: null },
        delay_min: { median: null, max: null, trains_matched: 0 },
        next: {
          N: [
            {
              route: "F",
              direction: "N",
              trip_id: "fixture-carroll-trip",
              predicted_at: "2026-10-16T12:04:00Z",
              minutes_away: 4,
              scheduled_at: null,
              delay_min: null,
            },
          ],
          S: [],
        },
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
    source: { publisher: "test", url: null },
  },
};
transitData.feedState = "stale";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
async function openTransit() {
  localStorage.clear();
  Element.prototype.scrollTo = vi.fn();
  render(createElement(App));
  await screen.findByTestId("infrastructure-map-double");
  fireEvent.change(screen.getByRole("combobox", { name: "Data mode" }), {
    target: { value: "backend" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Subway monitoring" }));
  fireEvent.click(screen.getByRole("button", { name: /Carroll test station/ }));
}
describe("infrastructure identity and failure isolation in App", () => {
  it("keeps genuine backend error and stale board visible while supported static geometry remains usable", async () => {
    await openTransit();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore infrastructure" }),
    );
    expect(
      screen.getByText(/Backend identity verified: subway_station:opaque-F21/),
    ).toBeTruthy();
    expect(screen.getByText("fixture-carroll-trip")).toBeTruthy();
    expect(
      screen.getAllByText(/Controlled backend failure test/).length,
    ).toBeGreaterThan(0);
    expect(
      screen
        .getByRole("button", { name: "Schematic X-ray" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByText("EXAMPLE INSPECTION QUEUE")).toBeNull();
  });
  it("removes the previous station board for geometry-only picks, clears evidence and restores selection/layers on exit", async () => {
    await openTransit();
    fireEvent.click(screen.getByRole("switch", { name: "Station entrances" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Explore infrastructure" }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select geometry" }),
      { target: { value: "R99" } },
    );
    const inspector = screen.getByRole("complementary", {
      name: "Geometry-only infrastructure inspector",
    });
    expect(
      within(inspector).getByText(/GEOMETRY ONLY \/ NO LIVE COVERAGE/),
    ).toBeTruthy();
    expect(screen.queryByText("fixture-carroll-trip")).toBeNull();
    const map = screen.getByTestId("infrastructure-map-double");
    expect(
      JSON.parse(map.getAttribute("data-transit-selection")!).stationId,
    ).toBeNull();
    expect(clearEvidence).toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole("combobox", { name: /INSPECT A COMPONENT/ }),
      { target: { value: "R99-platform" } },
    );
    expect(within(inspector).getByText("R99-platform")).toBeTruthy();
    fireEvent.click(
      within(inspector).getByRole("button", { name: "Return to previous map" }),
    );
    await waitFor(() =>
      expect(map.getAttribute("data-infrastructure")).toBe("null"),
    );
    expect(
      JSON.parse(map.getAttribute("data-transit-selection")!).stationId,
    ).toBe(station.id);
    expect(JSON.parse(map.getAttribute("data-transit-layers")!).entrances).toBe(
      false,
    );
    expect(screen.getByText("fixture-carroll-trip")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Browse infrastructure" }),
    );
  });
});
