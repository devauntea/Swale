// @vitest-environment jsdom
// App regression with the map and resource hooks replaced; no browser/live calls.
import { createElement, useEffect, useMemo } from "react";
import {
  act,
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
import type {
  InfrastructureManifest,
  InfrastructureMapState,
} from "../infrastructure/contracts";
import type { EntranceCatalog } from "../infrastructure/entranceCatalog";

const mapProps = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  renders: 0,
  projections: 0,
}));

vi.mock("../map/SwaleMap", () => ({
  default: function MockMap(props: Record<string, unknown>) {
    mapProps.current = props;
    mapProps.renders += 1;
    useEffect(() => {
      const target = props.mascotTarget as {
        key: string;
        label: string;
      } | null;
      const project = props.onMascotProjection as
        | ((
            value: {
              key: string;
              label: string;
              x: number;
              y: number;
              visible: boolean;
              moving: boolean;
            } | null,
          ) => void)
        | undefined;
      if (!project) return;
      mapProps.projections += 1;
      if (mapProps.projections > 50)
        throw new Error("Projection feedback did not settle.");
      project(
        target
          ? {
              key: target.key,
              label: target.label,
              x: 650,
              y: 400,
              visible: true,
              moving: false,
            }
          : null,
      );
    }, [props.mascotTarget, props.onMascotProjection]);
    const infrastructure =
      props.infrastructure as InfrastructureMapState | null;
    return createElement("div", {
      "data-testid": "infrastructure-map-double",
      // The actual full geometry is retained in mapProps for assertions. This
      // DOM attribute only represents identity; repeatedly serializing all XYZ
      // faces made the worker-loaded harness unnecessarily expensive.
      "data-infrastructure": JSON.stringify(
        infrastructure ? { stationId: infrastructure.stationId } : null,
      ),
      "data-transit-selection": JSON.stringify(props.transitSelection),
      "data-transit-layers": JSON.stringify(props.transitLayers),
    });
  },
}));
vi.mock("../infrastructure/entranceCatalog", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../infrastructure/entranceCatalog")
  >()),
  loadEntranceCatalog: (...args: unknown[]) => catalogLoad(...args),
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
    // The real hook derives a fresh live wrapper while retaining its data body.
    // Presentation updates must not turn that wrapper into a projection loop.
    data: { ...transitData, live: { ...transitData.live } },
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
    chunk: useMemo(
      () =>
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
                ...catalog.entrances
                  .filter((entry) => entry.gtfsStopId === id)
                  .map((entry) => ({
                    id: `entrance_${entry.id}`,
                    stationId: id,
                    kind: "entrance",
                    sourceIds: entry.sourceIds,
                    assumption:
                      "Test source inventory point, no surveyed dimensions",
                    position: [...entry.position, 0],
                  })),
              ],
              metadata: {
                modelVintage: "source edition",
                referencePolicy: "flat reference",
                schematic: true,
              },
            }
          : null,
      [enabled, id],
    ),
    manifestStatus: enabled ? "ready" : "idle",
    chunkStatus: enabled && id ? "ready" : "idle",
    error: "",
    retry: vi.fn(),
    diagnostics: { chunks: 0, decodedBytes: 0, active: 0 },
  }),
}));

const clearEvidence = vi.fn();
const catalog: EntranceCatalog = {
  version: 1,
  sourceEdition: "2024 test source edition",
  sourceTimestamp: "2026-10-01T00:00:00Z",
  inputSha256: "a".repeat(64),
  entrances: ["test-entrance-one", "test-entrance-two"].map((id, index) => ({
    id,
    gtfsStopId: "F21",
    stationId: "237",
    complexId: "237",
    position: [-74 + index * 0.0001, 40.68],
    type: "Stair",
    matched: true,
    reason: null,
    sourceIds: [`S4:${id}`],
  })),
};
const catalogLoad = vi
  .fn<(...args: unknown[]) => Promise<EntranceCatalog>>()
  .mockImplementation(async () => catalog);
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
  vi.useRealTimers();
  Reflect.deleteProperty(document, "hidden");
});
async function openTransit() {
  mapProps.renders = 0;
  mapProps.projections = 0;
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
  it("finishes the tutorial without replaying camera travel or clearing station selection", async () => {
    await openTransit();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore station — Normal view" }),
    );
    await screen.findByRole("combobox", { name: "Source-linked entrance" });
    await waitFor(() =>
      expect(
        (mapProps.current.infrastructure as InfrastructureMapState)
          .entranceDetail,
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "How to Use Swale" }));
    fireEvent.click(screen.getByRole("button", { name: "2 Steps" }));
    const camera = mapProps.current.infrastructureCamera;
    const selected = (mapProps.current.infrastructure as InfrastructureMapState)
      .selectedDetailComponentId;
    for (let i = 0; i < 9; i++)
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish Tour" }));
    expect(mapProps.current.infrastructureCamera).toBe(camera);
    expect(
      (mapProps.current.infrastructure as InfrastructureMapState)
        .selectedDetailComponentId,
    ).toBe(selected);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("settles mascot projection with fresh live wrappers and retains the target through presentation rerenders", async () => {
    await openTransit();
    await waitFor(() =>
      expect(
        (mapProps.current.mascotTarget as { key: string } | null)?.key,
      ).toBe("entrance/model_entrance:test-entrance-one"),
    );
    const target = mapProps.current.mascotTarget;
    const projections = mapProps.projections;
    const renders = mapProps.renders;
    fireEvent.click(screen.getByRole("button", { name: "Dark mode" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Open Swale assistant" }),
    );
    expect(mapProps.current.mascotTarget).toBe(target);
    expect(mapProps.projections).toBe(projections);
    expect(mapProps.renders - renders).toBeLessThan(10);
    expect(mapProps.projections).toBeLessThan(8);
    expect(
      screen.getByRole("heading", { name: "Swale assistant" }),
    ).toBeTruthy();
  });
  it("loads a selected station for shared overview and exploration, propagates the local snapshot and invalidates changed entrance identities", async () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    const liveBefore = JSON.stringify(transitData);
    await openTransit();
    expect(
      (mapProps.current.layers as import("../types").LayerVisibility).buildings,
    ).toBe(true);
    await waitFor(() => expect(catalogLoad).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole("button", { name: "Explore station — Normal view" }),
    );
    await waitFor(() => expect(catalogLoad).toHaveBeenCalledOnce());
    const entranceChoice = await screen.findByRole("combobox", {
      name: "Source-linked entrance",
    });
    await waitFor(() =>
      expect((entranceChoice as HTMLSelectElement).options.length).toBe(3),
    );
    fireEvent.change(entranceChoice, {
      target: { value: "test-entrance-one" },
    });
    const state = () =>
      mapProps.current
        .infrastructure as import("../infrastructure/contracts").InfrastructureMapState;
    const camera = () =>
      mapProps.current
        .infrastructureCamera as import("../infrastructure/contracts").InfrastructureCameraRequest;
    expect(state().selectedPrimitiveId).toBe("entrance_test-entrance-one");
    expect(state().entranceDetail?.sourcePosition).toEqual(
      catalog.entrances[0].position,
    );
    expect(state().verticalExaggeration).toBe(1);
    expect(state().entranceScenario).toBeUndefined();
    expect(
      (mapProps.current.layers as import("../types").LayerVisibility).buildings,
    ).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "3D buildings" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(camera().kind).toBe("entrance_detail");
    fireEvent.click(screen.getByRole("button", { name: "3 · Landing" }));
    expect(state().selectedDetailComponentId).toBe(
      state().entranceDetail!.components.find(
        (item) => item.kind === "landing",
      )!.id,
    );
    expect(camera()).toEqual(
      expect.objectContaining({
        kind: "entrance_detail",
        elevation: expect.any(Number),
        zoom: 22,
        pitch: 62,
        position: state()
          .entranceDetail!.components.find((item) => item.kind === "landing")!
          .position.slice(0, 2),
      }),
    );
    vi.useFakeTimers();
    fireEvent.click(
      screen.getByRole("button", { name: "What-if flood simulation" }),
    );
    expect(state().entranceScenario?.frame?.timeS).toBe(600);
    fireEvent.click(screen.getByRole("button", { name: "Play / resume" }));
    act(() => vi.advanceTimersByTime(1000));
    expect(state().entranceScenario!.frame!.timeS).toBe(30);
    expect(state().entranceScenario!.frame!.ledger.suppliedM3).toBeGreaterThan(
      0,
    );
    const frame = state().entranceScenario!.frame;
    fireEvent.click(screen.getByRole("button", { name: "Baseline geometry" }));
    expect(state().entranceScenario?.compareBaseline).toBe(true);
    expect(state().entranceScenario?.frame).toBe(frame);
    const snapshotAtPause = state().entranceScenario!.frame;
    const entranceAtPause = state().entranceDetail;
    fireEvent.click(screen.getByRole("button", { name: "Normal view" }));
    expect(state().entranceScenario).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Dark mode" }));
    expect(state().entranceDetail).toBe(entranceAtPause);
    fireEvent.click(screen.getByRole("button", { name: "Flood simulation" }));
    expect(state().entranceScenario!.frame).toBe(snapshotAtPause);
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "Scene and water view" }),
      ).getByRole("button", { name: "Return to overview" }),
    );
    expect(
      (mapProps.current.layers as import("../types").LayerVisibility).buildings,
    ).toBe(true);
    expect(state().entranceDetail).toBe(entranceAtPause);
    expect(state().entranceScenario!.frame).toBe(snapshotAtPause);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Explore station — Normal view",
      }),
    );
    expect(state().entranceScenario).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Flood simulation" }));
    expect(state().entranceScenario!.frame).toBe(snapshotAtPause);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Source-linked entrance" }),
      {
        target: { value: "test-entrance-two" },
      },
    );
    expect(state().entranceDetail?.entranceId).toBe("test-entrance-two");
    expect(state().entranceDetail?.sourcePosition).toEqual(
      catalog.entrances[1].position,
    );
    expect(state().entranceScenario?.frame?.timeS).toBe(600);
    expect(state().selectedDetailComponentId).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Current evidence" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("fixture-carroll-trip")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "What-if flood simulation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Play / resume" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select geometry" }),
      { target: { value: "R99" } },
    );
    expect(state().stationId).toBe("R99");
    expect(state().entranceDetail).toBeNull();
    expect(state().entranceScenario).toBeUndefined();
    expect(screen.queryByText("fixture-carroll-trip")).toBeNull();
    expect(JSON.stringify(transitData)).toBe(liveBefore);
    expect(clearEvidence).toHaveBeenCalled();
  });
  it("keeps genuine backend error and stale board visible while supported static geometry remains usable", async () => {
    await openTransit();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore station — Normal view" }),
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
  it("removes the previous station board for geometry-only picks and retains the selected model and layers on return", async () => {
    await openTransit();
    fireEvent.click(screen.getByRole("switch", { name: "Station entrances" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Explore station — Normal view" }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select geometry" }),
      { target: { value: "R99" } },
    );
    const inspector = screen.getByRole("complementary", {
      name: "Geometry-only infrastructure inspector",
    });
    expect(
      within(
        within(inspector).getByRole("region", {
          name: "Selected infrastructure",
        }),
      ).getByText(/GEOMETRY ONLY \/ NO LIVE COVERAGE/),
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
      expect(
        JSON.parse(map.getAttribute("data-infrastructure")!).stationId,
      ).toBe("R99"),
    );
    expect(
      JSON.parse(map.getAttribute("data-transit-selection")!).stationId,
    ).toBeNull();
    expect(JSON.parse(map.getAttribute("data-transit-layers")!).entrances).toBe(
      false,
    );
    expect(screen.queryByText("fixture-carroll-trip")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Browse infrastructure" }),
    );
  });
});
