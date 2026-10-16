// @vitest-environment jsdom
// Isolated mock-transport/DOM tests. No MTA, NWS, backend or browser calls.
import { act, cleanup, renderHook } from "@testing-library/react/pure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendApiError } from "../backend/client";
import { isApprovedBackendRequest } from "../backend/routes";
import { buildTransitUrl, TransitClient } from "../backend/transitClient";
import {
  applicableTransitAlerts,
  distinctTransitArrivals,
  parseTransitLive,
  parseTransitStation,
  parseTransitZone,
  parseTransitPage,
  parseTransitWeather,
  transitScheduleAvailability,
  TRANSIT_SCHEDULE_SOURCE,
  type TransitArrival,
  type TransitStation,
  type TransitLive,
  type TransitPage,
  type TransitWeather,
  type TransitExposure,
  type TransitSensor,
  type TransitObservation,
} from "../backend/transitContracts";
import {
  assertTransitOrder,
  TRANSIT_POLL_MS,
  TRANSIT_WEATHER_MS,
  transitCollection,
  transitLiveIsStale,
  useTransitData,
} from "../backend/useTransitData";
import type { BackendBbox } from "../backend/contracts";
const bbox: BackendBbox = [-74.02, 40.66, -73.98, 40.7];
const fixed = "2026-10-16T14:00:00Z";
const now = () => new Date().toISOString();
function station(id = "subway_station:TEST_F21"): TransitStation {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [-73.996, 40.69] },
    properties: {
      layer: "subway_stations",
      knowledge_type: "observed",
      gtfs_stop_id: "TEST_F21",
      name: "Test station",
      routes: ["F", "G"],
      line: null,
      structure: null,
      ada: 0,
      complex_id: null,
      source: {
        id: "mta_subway_stations",
        dataset: "39hk-dx4f",
        record_id: "TEST_F21",
        url: "https://data.ny.gov/d/39hk-dx4f",
        updated_at: null,
      },
    },
  };
}
function page<F>(
  features: F[],
  layer = "subway_stations",
  cursor: string | null = null,
): TransitPage<F> {
  return {
    type: "FeatureCollection",
    features,
    meta: {
      api_version: "1.0",
      layer,
      request_bbox: bbox,
      filters: {},
      count: features.length,
      limit: features.length,
      truncated: cursor !== null,
      next_cursor: cursor,
      generated_at: now(),
      sources: [
        {
          id: "test-source",
          dataset_updated_at: null,
          last_ingested_at: fixed,
          fetched_at: "2026-10-15T10:00:00Z",
          stale: false,
        },
      ],
    },
  };
}
function arrival(): TransitArrival {
  return {
    route: "F",
    direction: "N",
    trip_id: "TEST-trip",
    predicted_at: now(),
    minutes_away: 0,
    scheduled_at: null,
    delay_min: null,
  };
}
function board(): TransitLive {
  return {
    api_version: "1.0",
    area_id: "BK0601",
    fetched_at: now(),
    feed_times: { "gtfs-bdfm": now(), "gtfs-g": now() },
    stations: [
      {
        station_id: station().id,
        gtfs_stop_id: "TEST_F21",
        name: "Test station",
        routes: ["F", "G"],
        lon: -73.996,
        lat: 40.69,
        status: "normal",
        reasons: [],
        trains_next_30_min: { predicted: 1, scheduled: 2 },
        delay_min: { median: -1, max: -1, trains_matched: 1 },
        next: {
          N: [{ ...arrival(), delay_min: -1, scheduled_at: now() }],
          S: [],
        },
        direction_labels: { N: null, S: "Brooklyn" },
        alert_ids: [],
      },
    ],
    trains: [
      {
        route: "F",
        trip_id: "TEST-trip",
        stop_id: "TEST_F21",
        direction: "N",
        status: "unknown",
        seen_at: null,
        knowledge_type: "observed",
      },
    ],
    alerts: [],
    errors: [],
    summary: {
      stations: 1,
      delayed: 0,
      alert: 0,
      flooding_reported: 0,
      trains_in_area: 1,
      alerts: 0,
    },
    knowledge: { arrivals: "predicted", trains: "observed stop associations" },
    source: { publisher: "MTA", url: "https://api.mta.info/" },
  };
}
function weather(): TransitWeather {
  return {
    api_version: "1.0",
    area_id: "BK0601",
    fetched_at: now(),
    forecast_issued_at: fixed,
    gridpoint: "TEST/1,1",
    cached: false,
    observation: null,
    forecast: {
      knowledge_type: "predicted",
      total_rain_in: 0,
      peak_rate_in_hr: 0,
      peak_at: null,
      max_rain_chance_pct: 0,
      rain_expected: false,
      hours: [
        {
          start: now(),
          end: new Date(Date.now() + 3600000).toISOString(),
          rain_chance_pct: 0,
          rain_in: 0,
          short_forecast: null,
          temperature_f: null,
          wind: null,
        },
      ],
    },
    alerts: [],
    context: {
      smallest_dep_design_storm_in_hr: 1.77,
      peak_vs_smallest_dep_storm_pct: 0,
      note: "Missing input can be zero in this backend; not proof of no rain.",
    },
    errors: [],
    source: {
      publisher: "National Weather Service",
      url: "https://api.weather.gov/gridpoints/TEST/1,1",
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mocks() {
  const c = new TransitClient();
  vi.spyOn(c, "stations").mockResolvedValue(page([station()]));
  vi.spyOn(c, "entrances").mockResolvedValue(page([], "subway_entrances"));
  vi.spyOn(c, "exposures").mockResolvedValue(
    page([], "station_flood_exposure"),
  );
  vi.spyOn(c, "zones").mockResolvedValue(page([], "danger_zones"));
  vi.spyOn(c, "live").mockImplementation(async () => board());
  vi.spyOn(c, "weather").mockImplementation(async () => weather());
  vi.spyOn(c, "history").mockResolvedValue({
    api_version: "1.0",
    area_id: "BK0601",
    hours: 6,
    polls: [],
    note: "Monitoring samples, not distinct events.",
  });
  return c;
}
async function flush() {
  await act(async () => {});
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(fixed));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("transit route and runtime contracts (mock transport)", () => {
  it("allows only exact approved GET paths and scoped query arguments", () => {
    for (const route of ["live", "exposures", "weather"] as const)
      expect(isApprovedBackendRequest("GET", buildTransitUrl({ route }))).toBe(
        true,
      );
    expect(buildTransitUrl({ route: "exposures" })).toContain("live=false");
    expect(buildTransitUrl({ route: "zones", weather: false })).toContain(
      "weather=false",
    );
    expect(buildTransitUrl({ route: "stations", bbox })).not.toContain("limit");
    expect(
      buildTransitUrl({ route: "observation", id: "flood_event:⟨TEST_01⟩" }),
    ).toContain(encodeURIComponent("flood_event:⟨TEST_01⟩"));
    for (const path of [
      "/api/v1/subway/live?area_id=Queens",
      "/api/v1/subway/stations?limit=5000",
      "/api/v1/subway/flood-exposure?live=true",
      "/api/v1/subway/live?area_id=BK0601&area_id=BK0601",
      "/api/v1/subway/live?url=https://example.com",
      "/api/v1/subway/stations/ID",
      "/api/v1/scenarios",
      "/api/v1/danger-zones?run_id=simulation_run:test",
    ])
      expect(isApprovedBackendRequest("GET", path)).toBe(false);
    expect(isApprovedBackendRequest("POST", "/api/v1/subway/live")).toBe(false);
    expect(() =>
      buildTransitUrl({ route: "live", method: "POST" } as never),
    ).toThrow();
    expect(() => buildTransitUrl({ route: "history", hours: 73 })).toThrow();
  });
  it("uses the guarded shared transport with encoded IDs, deadlines and no credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(board()), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const c = new TransitClient({ fetcher });
    expect((await c.live()).stations[0].status).toBe("normal");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/subway/live?area_id=BK0601",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "error",
      }),
    );
  });
  it("preserves opaque IDs, null geometry/structure/destination absence, zero and negative delays", () => {
    const s = parseTransitStation({ ...station(), geometry: null });
    expect(s.geometry).toBeNull();
    expect(s.properties.structure).toBeNull();
    expect(s.properties.ada).toBe(0);
    const b = parseTransitLive(board());
    expect(b.stations[0].delay_min.median).toBe(-1);
    expect(b.stations[0].direction_labels.N).toBeNull();
    expect(b.trains[0]).not.toHaveProperty("coordinates");
    expect(b.stations[0].next.N[0]).not.toHaveProperty("destination");
    expect(() =>
      parseTransitLive({ ...board(), api_version: "2.0" }),
    ).toThrow();
    expect(() =>
      parseTransitStation({
        ...station(),
        geometry: { type: "Point", coordinates: [Infinity, 40] },
      }),
    ).toThrow();
  });
  it("preserves water mentions and station/route scope without turning them into flood shutdown claims", () => {
    const b = board();
    b.alerts = [
      {
        id: "route-alert",
        alert_type: "Delays",
        header: "Heavy rain may cause delays",
        description: null,
        routes: ["G"],
        stops: [],
        station_specific: false,
        mentions_flooding: true,
        active_from: fixed,
        updated_at: null,
        knowledge_type: "observed",
        basis: "MTA service alert",
      },
      {
        id: "other-stop",
        alert_type: "Station Notice",
        header: "Flooding: station bypassed",
        description: null,
        routes: ["F"],
        stops: ["OTHER"],
        station_specific: true,
        mentions_flooding: true,
        active_from: fixed,
        updated_at: fixed,
        knowledge_type: "observed",
        basis: "MTA service alert",
      },
    ];
    b.stations[0].status = "flooding_reported";
    b.stations[0].alert_ids = ["route-alert", "other-stop"];
    const parsed = parseTransitLive(b);
    expect(
      applicableTransitAlerts(parsed, parsed.stations[0]).map((a) => a.id),
    ).toEqual(["route-alert"]);
    expect(parsed.stations[0].status).toBe("flooding_reported");
    expect(parsed.alerts[0]).not.toHaveProperty("suspended");
    b.stations[0].status = "no_service";
    expect(parseTransitLive(b).stations[0].status).toBe("no_service");
  });
  it("deduplicates displayed arrival rows while keeping raw backend count unchanged", () => {
    const b = board(),
      a = arrival(),
      later = {
        ...a,
        predicted_at: new Date(Date.now() + 60000).toISOString(),
      };
    b.stations[0].next.N = [later, a, a];
    b.stations[0].trains_next_30_min.predicted = 3;
    expect(distinctTransitArrivals(b.stations[0].next.N)).toEqual([a, later]);
    expect(b.stations[0].trains_next_30_min.predicted).toBe(3);
  });
  it("keeps schedule artifact provenance separate, identifies expiry and unmatched comparisons", () => {
    expect(TRANSIT_SCHEDULE_SOURCE.lastServiceDate).toBe("2026-10-23");
    const b = board();
    expect(transitScheduleAvailability(b, new Date(fixed))).toBe("matched");
    b.stations[0].delay_min.trains_matched = 0;
    expect(transitScheduleAvailability(b, new Date(fixed))).toBe("unmatched");
    b.errors = ["no static schedule covers today"];
    expect(transitScheduleAvailability(b, new Date(fixed))).toBe("unavailable");
    expect(
      transitScheduleAvailability(b, new Date("2026-10-24T05:00:00Z")),
    ).toBe("expired");
  });
  it("preserves forecast versus observation and does not certify returned zero as measured dry conditions", () => {
    const w = parseTransitWeather(weather());
    expect(w.observation).toBeNull();
    expect(w.forecast.knowledge_type).toBe("predicted");
    expect(w.forecast.total_rain_in).toBe(0);
    expect(w.context.note).toContain("not proof");
    expect(w.forecast_issued_at).toBe(fixed);
    expect(w.fetched_at).toBe(now());
  });
  it("validates derived sensor-buffer zone geometry and separates trust from measured extent", () => {
    const zone = {
      type: "Feature",
      id: "zone:TEST",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-74, 40.6],
            [-74, 40.61],
            [-73.99, 40.61],
            [-74, 40.6],
          ],
        ],
      },
      properties: {
        layer: "danger_zones",
        zone_type: "measured",
        knowledge_type: "observed",
        level: "high",
        assumes: "Past24months",
        explanation: "250ft derived sensor buffer",
        evidence_ids: ["sensor:TEST"],
        entrance_count: 0,
        entrances: [],
        last_flood_at: null,
      },
    };
    expect(parseTransitZone(zone).properties.explanation).toContain("derived");
    expect(() =>
      parseTransitZone({
        ...zone,
        properties: { ...zone.properties, knowledge_type: "predicted" },
      }),
    ).toThrow();
    expect(() =>
      parseTransitZone({
        ...zone,
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-74, 40.6],
              [-74, 40.61],
              [-73.99, 40.61],
              [-73.98, 40.6],
            ],
          ],
        },
      }),
    ).toThrow();
    expect(
      parseTransitPage(
        page([], "danger_zones"),
        "danger_zones",
        parseTransitZone,
      ).meta.limit,
    ).toBe(0);
  });
  it("bounds fixed endpoints without adding unsupported pagination parameters", () => {
    const p = page(
      Array.from({ length: 2001 }, (_, i) => station(`opaque:${i}`)),
    );
    p.meta.limit = 5000;
    expect(transitCollection(p).features).toHaveLength(2000);
    expect(transitCollection(p).partial).toBe(true);
    expect(() => transitCollection(page([station(), station()]))).toThrow(
      "repeated",
    );
  });
  it("rejects backward generated/feed timestamps and detects stale sources separately", () => {
    const b = board();
    expect(transitLiveIsStale(b)).toBe(false);
    expect(transitLiveIsStale(b, Date.now() + 120001)).toBe(true);
    expect(() =>
      assertTransitOrder(b, { ...b, fetched_at: "2026-10-16T13:00:00Z" }),
    ).toThrow("older");
    expect(() =>
      assertTransitOrder(b, {
        ...b,
        feed_times: { "gtfs-g": "2026-10-16T13:00:00Z" },
      }),
    ).toThrow("older");
  });
});

describe("transit lifecycle (isolated DOM and mock client)", () => {
  it("keeps the newer backend rain assessment when initial static zones finish late and manual refresh stays within weather cooldown", async () => {
    const c = mocks(),
      old = deferred<ReturnType<typeof page<never>>>();
    const warm = {
      ...page([], "danger_zones"),
      meta: {
        ...page([], "danger_zones").meta,
        rain: { level: "watch" as const, forecast_peak_in_hr: 0.6 },
      },
    };
    vi.mocked(c.zones).mockImplementation((weather) =>
      weather ? Promise.resolve(warm) : old.promise,
    );
    const h = renderHook(() => useTransitData(true, bbox, c));
    await flush();
    expect(h.result.current.data.zones.meta?.rain?.level).toBe("watch");
    await act(async () => {
      old.resolve({
        ...page([], "danger_zones"),
        meta: { ...page([], "danger_zones").meta, rain: { level: "unknown" } },
      });
    });
    expect(h.result.current.data.zones.meta?.rain?.level).toBe("watch");
    act(() => h.result.current.refresh());
    await flush();
    expect(c.weather).toHaveBeenCalledTimes(1);
    expect(c.zones).toHaveBeenCalledTimes(2);
    expect(h.result.current.data.zones.meta?.rain?.level).toBe("watch");
  });
  it("makes no requests while inactive, polls once per60seconds and enforces manual/weather cooldown", async () => {
    const c = mocks();
    const h = renderHook(({ enabled }) => useTransitData(enabled, bbox, c), {
      initialProps: { enabled: false },
    });
    await flush();
    expect(c.live).not.toHaveBeenCalled();
    expect(c.stations).not.toHaveBeenCalled();
    h.rerender({ enabled: true });
    await flush();
    expect(c.live).toHaveBeenCalledTimes(1);
    expect(c.weather).toHaveBeenCalledTimes(1);
    act(() => h.result.current.refresh());
    await flush();
    expect(c.live).toHaveBeenCalledTimes(1);
    expect(c.weather).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TRANSIT_POLL_MS);
    });
    expect(c.live).toHaveBeenCalledTimes(2);
    expect(c.weather).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TRANSIT_WEATHER_MS - TRANSIT_POLL_MS);
    });
    expect(c.weather).toHaveBeenCalledTimes(2);
  });
  it("pauses hidden/user-paused views and aborts responses that ignore cancellation on mode changes", async () => {
    const c = mocks(),
      old = deferred<TransitLive>();
    vi.mocked(c.live).mockReturnValueOnce(old.promise);
    const h = renderHook(({ enabled }) => useTransitData(enabled, bbox, c), {
      initialProps: { enabled: true },
    });
    await flush();
    const signal = vi.mocked(c.live).mock.calls[0][0]!;
    h.rerender({ enabled: false });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      old.resolve(board());
    });
    expect(h.result.current.data.live.data).toBeNull();
    h.rerender({ enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TRANSIT_POLL_MS);
    });
    expect(c.live).toHaveBeenCalledTimes(2);
    act(() => h.result.current.setPaused(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000);
    });
    expect(c.live).toHaveBeenCalledTimes(2);
    expect(h.result.current.data.feedState).toBe("paused");
    act(() => h.result.current.setPaused(false));
    await flush();
    expect(c.live).toHaveBeenCalledTimes(3);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000);
    });
    expect(c.live).toHaveBeenCalledTimes(3);
    expect(h.result.current.data.feedState).toBe("hidden");
  });
  it("backs off outage retries, retains a marked-stale board and recovers without fixture fallback", async () => {
    const c = mocks();
    const h = renderHook(() => useTransitData(true, bbox, c));
    await flush();
    expect(h.result.current.data.feedState).toBe("live");
    vi.mocked(c.live).mockRejectedValueOnce(
      new BackendApiError("network", "MTA unavailable"),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(h.result.current.data.live.data?.stations[0].station_id).toBe(
      station().id,
    );
    expect(h.result.current.data.feedState).toBe("stale");
    expect(h.result.current.data.live.error).toBe("MTA unavailable");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(119999);
    });
    expect(c.live).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(c.live).toHaveBeenCalledTimes(3);
    expect(h.result.current.data.feedState).toBe("live");
  });
  it("shows a partial outage rather than accepting backend normal as a complete service answer", async () => {
    const c = mocks();
    vi.mocked(c.live).mockResolvedValue({
      ...board(),
      errors: ["gtfs-g: unavailable"],
    });
    const h = renderHook(() => useTransitData(true, bbox, c));
    await flush();
    expect(h.result.current.data.live.data?.stations[0].status).toBe("normal");
    expect(h.result.current.data.feedState).toBe("partial");
    expect(h.result.current.data.live.partial).toBe(true);
  });
  it("rejects obsolete bbox collections and uses no new stations/entrances pagination", async () => {
    const c = mocks(),
      old = deferred<TransitPage<TransitStation>>();
    vi.mocked(c.stations)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({
        ...page([station("latest")]),
        meta: {
          ...page([station("latest")]).meta,
          request_bbox: [-74.01, 40.67, -73.99, 40.69],
        },
      });
    const h = renderHook(({ bounds }) => useTransitData(true, bounds, c), {
      initialProps: { bounds: bbox },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    const signal = vi.mocked(c.stations).mock.calls[0][1]!;
    h.rerender({ bounds: [-74.01, 40.67, -73.99, 40.69] as BackendBbox });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      old.resolve(page([station("obsolete")]));
    });
    expect(h.result.current.data.stations.features[0].id).toBe("latest");
  });
  it("deduplicates monitoring polls by sample timestamp without converting them to flood events", async () => {
    const c = mocks(),
      poll = {
        polled_at: fixed,
        delayed: 0,
        flooding_reported: 1,
        alerts: 1,
        stations: [
          {
            gtfs_stop_id: "TEST_F21",
            status: "flooding_reported" as const,
            predicted: 1,
            scheduled: null,
            median_delay_min: null,
            max_delay_min: null,
          },
        ],
      };
    vi.mocked(c.history).mockResolvedValue({
      api_version: "1.0",
      area_id: "BK0601",
      hours: 6,
      polls: [poll, poll],
      note: "Monitoring polls, insufficient distinct event history.",
    });
    const h = renderHook(() => useTransitData(true, bbox, c));
    await flush();
    expect(h.result.current.data.history.data?.polls).toHaveLength(1);
    expect(h.result.current.data.history.data).not.toHaveProperty(
      "distinct_flood_events",
    );
  });
  it("fails closed for unknown evidence and retains full-ID collection events when partner profile detail returns404", async () => {
    const c = mocks();
    const sensorId = "sensor:TEST",
      eventId = "flood_event:⟨TEST_event⟩";
    const exposure = {
      type: "Feature",
      id: "station_exposure:TEST",
      geometry: null,
      properties: {
        layer: "station_flood_exposure",
        knowledge_type: "inferred",
        station_id: station().id,
        name: "Test",
        routes: ["F"],
        rank: 1,
        score: 20,
        tier: "low",
        method_version: "station-exposure-v1",
        assessed_at: fixed,
        run_id: null,
        entrances: 0,
        factors: [
          {
            id: "measured_flooding_nearby",
            label: "Nearby street sensor",
            knowledge_type: "observed",
            value: 0.2,
            weight: 0.3,
            contribution: 20,
            evidence_ids: [sensorId],
            explanation: "Nearby, not station water",
          },
        ],
        missing_factors: [],
        live: null,
        caveats: [],
      },
    } as TransitExposure;
    vi.mocked(c.exposures).mockResolvedValue(
      page([exposure], "station_flood_exposure"),
    );
    const sensor = {
      ...station(sensorId),
      properties: { sensor_id: "TEST_SENSOR" },
    } as unknown as TransitSensor;
    const observation = {
      ...station(eventId),
      properties: { sensor_id: "TEST_SENSOR", layer: "flood_observations" },
    } as unknown as TransitObservation;
    const getSensors = vi
      .spyOn(c, "sensors")
      .mockResolvedValue(page([sensor], "sensors"));
    vi.spyOn(c, "observations").mockResolvedValue(
      page([observation], "flood_observations"),
    );
    const detail = vi
      .spyOn(c, "observation")
      .mockRejectedValue(new BackendApiError("http", "Not found", 404));
    const h = renderHook(() => useTransitData(true, bbox, c));
    await flush();
    act(() => h.result.current.openEvidence("not-cited"));
    expect(h.result.current.evidence.status).toBe("error");
    expect(getSensors).not.toHaveBeenCalled();
    await act(async () => {
      h.result.current.openEvidence(sensorId);
    });
    expect(h.result.current.evidence.observations?.[0].id).toBe(eventId);
    await act(async () => {
      h.result.current.openEvidence(eventId);
    });
    expect(detail).toHaveBeenCalledWith(eventId, expect.any(AbortSignal));
    expect(h.result.current.evidence).toMatchObject({
      id: eventId,
      status: "error",
      feature: { id: eventId },
      error: "Not found",
    });
    expect(h.result.current.evidence.note).toContain("not rewritten");
  });
});
