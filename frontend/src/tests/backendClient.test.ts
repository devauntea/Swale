// @vitest-environment jsdom
// Isolated mock-transport/DOM tests; no backend, WebGL or browser resource calls.
import { act, cleanup, renderHook } from "@testing-library/react/pure";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackendApiError,
  BackendClient,
  buildBackendUrl,
} from "../backend/client";
import {
  parseBasin,
  parseHealth,
  parseIncident,
  parseSources,
  safeBackendLink,
  type BackendBasin,
  type BackendBbox,
  type BackendCollectionState,
  type BackendIncident,
  type BackendPage,
} from "../backend/contracts";
import {
  BACKEND_MAX_FEATURES,
  BACKEND_MAX_PAGES,
  BACKEND_PAGE_SIZE,
  BACKEND_VIEWPORT_DEBOUNCE_MS,
  BackendProvider,
  emptyCollection,
  incidentWindow,
} from "../backend/provider";
import { isApprovedBackendRequest } from "../backend/routes";
import { useBackendData } from "../backend/useBackendData";

const bbox: BackendBbox = [-74.02, 40.66, -73.98, 40.7];
const time = "2026-10-16T04:00:00Z";
const fetched = "2026-10-15T03:00:00Z";
const updated = "2025-12-18T16:29:33Z";
const freshness = {
  id: "inventory",
  dataset_updated_at: updated,
  last_ingested_at: time,
  fetched_at: fetched,
  stale: true,
};
const source = {
  id: "inventory",
  dataset: "2w2g-fk3i",
  record_id: "CB-original",
  url: "https://data.cityofnewyork.us/resource/2w2g-fk3i.json",
  updated_at: updated,
};
function basin(id = "catch_basin:opaque_01"): BackendBasin {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [-74.01, 40.68] },
    properties: {
      layer: "catch_basins",
      knowledge_type: "observed",
      unitid: "CB-original",
      area_ids: ["BK0601"],
      state_plane: { x_ft: 0, y_ft: 184528, crs: "EPSG:2263" },
      source,
      ingested_at: time,
    },
  };
}
function incident(id = "incident:opaque_01"): BackendIncident {
  return {
    type: "Feature",
    id,
    geometry: null,
    properties: {
      layer: "incidents",
      knowledge_type: "reported",
      category: "street_flooding",
      category_label: "Street flooding",
      reported_at: "2026-07-22T18:36:00Z",
      closed_at: null,
      source_status: null,
      address: null,
      verification: {
        status: "agency_found_obstruction",
        knowledge_type: "observed",
        basis: "dep_311_resolution",
        rule: "dep-res-obstruction-v1",
        text: "Historical agency text <not HTML>",
        at: "2026-07-23T16:45:00Z",
      },
      linked_basin: {
        id: "catch_basin:opaque_01",
        distance_ft: 0,
        method: "nearest",
        knowledge_type: "inferred",
      },
      source: { ...source, id: "nyc311", dataset: null, updated_at: null },
      ingested_at: time,
      source_fields: { descriptor: "Original source text" },
    },
  };
}
function page<F extends BackendBasin | BackendIncident>(
  features: F[],
  next: string | null = null,
  bounds = bbox,
): BackendPage<F> {
  return {
    type: "FeatureCollection",
    features,
    meta: {
      api_version: "1.0",
      layer: features[0]?.properties.layer ?? "catch_basins",
      request_bbox: bounds,
      filters: {},
      count: features.length,
      limit: BACKEND_PAGE_SIZE,
      truncated: next !== null,
      next_cursor: next,
      generated_at: time,
      sources: [freshness],
    },
  };
}
function json(value: unknown, status = 200, type = "application/json") {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": type },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
function ready<F extends BackendBasin | BackendIncident>(
  features: F[],
): BackendCollectionState<F> {
  return { ...emptyCollection<F>(), features, status: "ready" };
}
function mockMetadata(provider: BackendProvider) {
  vi.spyOn(provider, "metadata").mockResolvedValue({
    health: null,
    layers: [],
    sources: [],
    metadataStatus: "ready",
    metadataError: null,
  });
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("approved backend transport and source-aware validation (mock responses)", () => {
  it("encodes full opaque IDs and accepts exactly the seven approved GET route shapes", () => {
    expect(buildBackendUrl({ route: "basin", id: "catch_basin:a:b +?" })).toBe(
      "/api/v1/catch-basins/catch_basin%3Aa%3Ab%20%2B%3F",
    );
    for (const path of [
      "health",
      "layers",
      "sources",
      "catch-basins",
      "catch-basins/id",
      "incidents",
      "incidents/id",
    ])
      expect(isApprovedBackendRequest("GET", `/api/v1/${path}`)).toBe(true);
    for (const path of [
      "/api/v1/scenarios",
      "/api/v1/risk-rankings",
      "/api/v1/incidents/a%2Fb",
      "https://elsewhere.example/api/v1/health",
    ])
      expect(isApprovedBackendRequest("GET", path)).toBe(false);
    expect(isApprovedBackendRequest("POST", "/api/v1/incidents")).toBe(false);
    expect(() =>
      buildBackendUrl({ route: "health", method: "POST" } as never),
    ).toThrow("approved GET contract");
    expect(() =>
      buildBackendUrl({ route: "https://elsewhere.example" } as never),
    ).toThrow();
    expect(() =>
      buildBackendUrl({ route: "basin", id: "opaque/slash" }),
    ).toThrow();
  });

  it("requires finite ordered bbox and explicit offset-bearing incident filters", () => {
    const window = incidentWindow(new Date(time));
    const url = new URL(
      buildBackendUrl({ route: "incidents", bbox, ...window }),
      "http://localhost",
    );
    expect(url.searchParams.get("bbox")).toBe(bbox.join(","));
    expect(url.searchParams.get("since")).toBe(window.since);
    expect(url.searchParams.get("until")).toBe(window.until);
    expect(() =>
      buildBackendUrl({ route: "catch-basins", bbox: [NaN, 0, 1, 1] }),
    ).toThrow();
    expect(() =>
      buildBackendUrl({
        route: "incidents",
        bbox,
        since: "2026-01-01T00:00:00",
        until: time,
      }),
    ).toThrow();
    expect(() =>
      buildBackendUrl({ route: "incidents", bbox, since: time, until: time }),
    ).toThrow();
  });

  it("preserves null geometry, zero, full IDs, separate trust and all source timestamps", () => {
    const record = parseIncident(incident());
    expect(record.geometry).toBeNull();
    expect(record.id).toBe("incident:opaque_01");
    expect(record.properties.knowledge_type).toBe("reported");
    expect(record.properties.verification.knowledge_type).toBe("observed");
    expect(record.properties.linked_basin).toMatchObject({
      distance_ft: 0,
      knowledge_type: "inferred",
    });
    expect(record.properties.source.updated_at).toBeNull();
    expect(record.properties.closed_at).toBeNull();
    expect(record.properties.ingested_at).toBe(time);
    expect(record.properties.reported_at).toBe("2026-07-22T18:36:00Z");
    expect(parseBasin(basin()).properties.state_plane?.x_ft).toBe(0);
    const register = parseSources({
      api_version: "1.0",
      sources: [
        {
          ...freshness,
          name: "Inventory",
          publisher: "DEP",
          dataset: "2w2g-fk3i",
          url: source.url,
          cadence: "static",
          time_semantics: "Source time differs from replay",
          known_limitations: ["Snapshot coverage only"],
        },
      ],
    });
    expect(register[0]).toMatchObject(freshness);
  });

  it("rejects nonfinite/wrong-order coordinates, invalid trust and unzoned timestamps", () => {
    expect(() =>
      parseBasin({
        ...basin(),
        geometry: { type: "Point", coordinates: [40.68, -740] },
      }),
    ).toThrow();
    expect(() =>
      parseBasin({
        ...basin(),
        geometry: { type: "Point", coordinates: [Infinity, 40.68] },
      }),
    ).toThrow();
    expect(() =>
      parseBasin({
        ...basin(),
        properties: { ...basin().properties, knowledge_type: "inferred" },
      }),
    ).toThrow();
    expect(() =>
      parseIncident({
        ...incident(),
        properties: {
          ...incident().properties,
          reported_at: "2026-07-22T18:36:00",
        },
      }),
    ).toThrow();
  });

  it("keeps source text as text and permits only credential-free http(s) links", () => {
    expect(safeBackendLink("javascript:alert(1)")).toBeNull();
    expect(safeBackendLink("file:///tmp/data")).toBeNull();
    expect(safeBackendLink("//example.com/path")).toBeNull();
    expect(safeBackendLink("https://user:password@example.com")).toBeNull();
    expect(safeBackendLink(source.url)).toBe(source.url);
    expect(parseIncident(incident()).properties.verification.text).toBe(
      "Historical agency text <not HTML>",
    );
    expect(
      parseBasin({
        ...basin(),
        properties: {
          ...basin().properties,
          source: { ...source, url: "data:text/html,unsafe" },
        },
      }).properties.source.url,
    ).toBeNull();
  });

  it("treats HTTP 200 degraded health as degraded and rejects a different API version", async () => {
    const health = {
      api_version: "1.0",
      status: "degraded",
      build: "local",
      db: { status: "ok", engine: "surrealdb" },
      sources: [freshness],
      integrations: { daytona: true },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(health));
    const result = await new BackendClient({ fetcher }).getHealth();
    expect(result.status).toBe("degraded");
    expect(result.integrations?.daytona).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/health",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "error",
      }),
    );
    expect(() => parseHealth({ ...health, api_version: "2.0" })).toThrow();
  });

  it("exposes structured problem details and rejects non-JSON/malformed successful responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json(
          {
            type: "/api/v1/problems/not-found",
            title: "Not found",
            status: 404,
            detail: "No record with that ID",
          },
          404,
          "application/problem+json",
        ),
      )
      .mockResolvedValueOnce(
        new Response("Not JSON", {
          status: 503,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(json({ type: "Feature" }))
      .mockResolvedValueOnce(json(incident()));
    const client = new BackendClient({ fetcher });
    await expect(client.getBasin("opaque")).rejects.toMatchObject({
      kind: "http",
      status: 404,
      problem: { title: "Not found", detail: "No record with that ID" },
    });
    await expect(client.getHealth()).rejects.toThrow(
      "expected a JSON response",
    );
    await expect(client.getBasin("opaque")).rejects.toThrow("invalid");
    await expect(client.getBasin("opaque")).rejects.toThrow(
      "observed basin feature",
    );
  });

  it("times out, aborts obsolete requests and removes its caller abort listener", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const client = new BackendClient({ fetcher, timeoutMs: 30 });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const timeout = expect(
      client.getHealth(controller.signal),
    ).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(30);
    await timeout;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    const cancelled = expect(
      client.getSources(controller.signal),
    ).rejects.toMatchObject({ kind: "aborted" });
    controller.abort();
    await cancelled;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds response bodies before parsing", async () => {
    const client = new BackendClient({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(5 * 1024 * 1024),
          },
        }),
      ),
    });
    await expect(client.getHealth()).rejects.toThrow("size limit");
  });

  it("cancels an unexpected non-JSON response stream without reading or leaving its timeout active", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<html>Proxy unavailable"));
      },
      cancel,
    });
    const client = new BackendClient({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(stream, {
          status: 503,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    });
    await expect(client.getHealth()).rejects.toMatchObject({
      kind: "http",
      status: 503,
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("bounded backend provider (mock pages)", () => {
  it("caps paging and labels the retained viewport subset partial and stale", async () => {
    const client = new BackendClient();
    const get = vi
      .spyOn(client, "getBasinsPage")
      .mockImplementation(async (params) => {
        const n = Number(params.cursor ?? "0");
        return page(
          Array.from({ length: BACKEND_PAGE_SIZE }, (_, i) =>
            basin(`opaque:${n}-${i}`),
          ),
          String(n + 1),
        );
      });
    const result = await new BackendProvider(client).basins(
      bbox,
      new AbortController().signal,
    );
    expect(get).toHaveBeenCalledTimes(BACKEND_MAX_PAGES);
    expect(result.features).toHaveLength(BACKEND_MAX_FEATURES);
    expect(result).toMatchObject({
      status: "ready",
      partial: true,
      stale: true,
      pages: BACKEND_MAX_PAGES,
      generatedAt: time,
    });
    expect(result.sources[0]).toMatchObject({
      fetched_at: fetched,
      last_ingested_at: time,
      dataset_updated_at: updated,
    });
  });

  it("detects repeated cursors without dropping already loaded records", async () => {
    const client = new BackendClient();
    vi.spyOn(client, "getBasinsPage")
      .mockResolvedValueOnce(page([basin("opaque:1")], "repeated"))
      .mockResolvedValueOnce(page([basin("opaque:2")], "repeated"));
    const result = await new BackendProvider(client).basins(
      bbox,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ status: "error", partial: true, pages: 2 });
    expect(result.features.map((f) => f.id)).toEqual(["opaque:1", "opaque:2"]);
    expect(result.error).toContain("repeated a page cursor");
  });

  it("freezes explicit incident time filters across all pages", async () => {
    const client = new BackendClient(),
      window = incidentWindow(new Date(time));
    const get = vi
      .spyOn(client, "getIncidentsPage")
      .mockResolvedValueOnce(page([incident("incident:1")], "next"))
      .mockResolvedValueOnce({
        ...page([incident("incident:2")]),
        meta: { ...page([incident()]).meta, filters: { ...window } },
      });
    const result = await new BackendProvider(client).incidents(
      bbox,
      window,
      new AbortController().signal,
    );
    expect(
      get.mock.calls.map(([params]) => ({
        since: params.since,
        until: params.until,
      })),
    ).toEqual([window, window]);
    expect(result.filters).toEqual(window);
    expect(result).toMatchObject({ partial: false, status: "ready", pages: 2 });
  });

  it("reports empty and partial failure distinctly and never substitutes fixtures", async () => {
    const client = new BackendClient(),
      get = vi.spyOn(client, "getBasinsPage");
    get.mockResolvedValueOnce(page([]));
    const provider = new BackendProvider(client),
      signal = new AbortController().signal;
    expect(await provider.basins(bbox, signal)).toMatchObject({
      features: [],
      status: "empty",
      partial: false,
    });
    get
      .mockResolvedValueOnce(page([basin()], "next"))
      .mockRejectedValueOnce(new BackendApiError("network", "Disconnected"));
    expect(await provider.basins(bbox, signal)).toMatchObject({
      status: "error",
      partial: true,
      error: "Disconnected",
    });
    get.mockRejectedValueOnce(new BackendApiError("network", "Disconnected"));
    expect(await provider.basins(bbox, signal)).toMatchObject({
      features: [],
      status: "error",
      partial: false,
      error: "Disconnected",
    });
  });

  it("rejects duplicate IDs and mismatched viewport metadata", async () => {
    const client = new BackendClient(),
      get = vi.spyOn(client, "getBasinsPage");
    get
      .mockResolvedValueOnce(page([basin()], "next"))
      .mockResolvedValueOnce(page([basin()]));
    const provider = new BackendProvider(client),
      signal = new AbortController().signal;
    expect(await provider.basins(bbox, signal)).toMatchObject({
      status: "error",
      partial: true,
    });
    get.mockResolvedValueOnce(page([basin()], null, [-74, 40, -73, 41]));
    expect(await provider.basins(bbox, signal)).toMatchObject({
      status: "error",
      features: [],
    });
  });

  it("retains successful metadata when another metadata endpoint fails", async () => {
    const client = new BackendClient();
    vi.spyOn(client, "getHealth").mockRejectedValue(
      new BackendApiError("network", "Disconnected"),
    );
    vi.spyOn(client, "getLayers").mockResolvedValue([]);
    vi.spyOn(client, "getSources").mockResolvedValue([]);
    expect(
      await new BackendProvider(client).metadata(new AbortController().signal),
    ).toMatchObject({
      metadataStatus: "error",
      metadataError: "Disconnected",
      health: null,
    });
  });
});

describe("backend hook request lifecycle (isolated DOM, mock provider)", () => {
  it("makes no disabled-mode requests and rejects responses after leaving backend mode even when mocks ignore abort", async () => {
    vi.useFakeTimers();
    const provider = new BackendProvider();
    mockMetadata(provider);
    const pending = deferred<BackendCollectionState<BackendBasin>>();
    const get = vi.spyOn(provider, "basins").mockReturnValue(pending.promise);
    const incidents = vi
      .spyOn(provider, "incidents")
      .mockResolvedValue({ ...emptyCollection(), status: "empty" });
    const pendingDetail = deferred<BackendBasin>();
    const getDetail = vi
      .spyOn(provider.client, "getBasin")
      .mockReturnValue(pendingDetail.promise);
    const hook = renderHook(
      ({ enabled }) => useBackendData(enabled, bbox, provider),
      { initialProps: { enabled: false } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(provider.metadata).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(incidents).not.toHaveBeenCalled();
    expect(getDetail).not.toHaveBeenCalled();
    hook.rerender({ enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKEND_VIEWPORT_DEBOUNCE_MS);
      hook.result.current.select("basin", "old");
    });
    const requestSignal = get.mock.calls[0][1],
      detailSignal = getDetail.mock.calls[0][1]!;
    hook.rerender({ enabled: false });
    expect(requestSignal.aborted).toBe(true);
    expect(detailSignal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(ready([basin("old")]));
      pendingDetail.resolve(basin("old"));
    });
    expect(hook.result.current.data.basins.features).toEqual([]);
    expect(hook.result.current.detail.feature).toBeNull();
    hook.rerender({ enabled: true });
    expect(hook.result.current.data.basins).toMatchObject({
      status: "loading",
      features: [],
    });
    expect(hook.result.current.detail.feature).toBeNull();
  });

  it("debounces viewport changes, cancels old requests, resets paging and rejects stale results", async () => {
    vi.useFakeTimers();
    const provider = new BackendProvider();
    mockMetadata(provider);
    const old = deferred<BackendCollectionState<BackendBasin>>(),
      latest = deferred<BackendCollectionState<BackendBasin>>();
    const get = vi
      .spyOn(provider, "basins")
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    vi.spyOn(provider, "incidents").mockResolvedValue({
      ...emptyCollection(),
      status: "empty",
    });
    const hook = renderHook(
      ({ bounds }) => useBackendData(true, bounds, provider),
      { initialProps: { bounds: bbox } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKEND_VIEWPORT_DEBOUNCE_MS - 1);
    });
    expect(get).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const oldSignal = get.mock.calls[0][1];
    const next: BackendBbox = [-74.01, 40.67, -73.99, 40.69];
    hook.rerender({ bounds: next });
    expect(oldSignal.aborted).toBe(true);
    expect(hook.result.current.data.basins).toMatchObject({
      status: "loading",
      features: [],
      pages: 0,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKEND_VIEWPORT_DEBOUNCE_MS);
      latest.resolve(ready([basin("latest")]));
    });
    expect(hook.result.current.data.basins.features[0].id).toBe("latest");
    await act(async () => {
      old.resolve(ready([basin("obsolete")]));
    });
    expect(hook.result.current.data.basins.features[0].id).toBe("latest");
  });

  it("isolates mode data, aborts detail races and preserves a completed mode-scoped selection", async () => {
    const provider = new BackendProvider();
    mockMetadata(provider);
    const old = deferred<BackendBasin>(),
      latest = deferred<BackendIncident>();
    const getBasin = vi
      .spyOn(provider.client, "getBasin")
      .mockReturnValue(old.promise);
    vi.spyOn(provider.client, "getIncident").mockReturnValue(latest.promise);
    const hook = renderHook(
      ({ enabled }) => useBackendData(enabled, null, provider),
      { initialProps: { enabled: true } },
    );
    await act(async () => {});
    act(() => {
      hook.result.current.select("basin", "old");
    });
    const firstSignal = getBasin.mock.calls[0][1]!;
    act(() => {
      hook.result.current.select("incident", "new");
    });
    expect(firstSignal.aborted).toBe(true);
    await act(async () => {
      latest.resolve(incident("new"));
    });
    await act(async () => {
      old.resolve(basin("old"));
    });
    expect(hook.result.current.detail).toMatchObject({
      id: "new",
      kind: "incident",
      status: "ready",
    });
    hook.rerender({ enabled: false });
    expect(hook.result.current.detail).toMatchObject({
      id: null,
      feature: null,
    });
    expect(hook.result.current.data).toMatchObject({
      health: null,
      sources: [],
      basins: { features: [] },
    });
    act(() => {
      hook.result.current.select("basin", "must-not-run");
    });
    expect(getBasin).toHaveBeenCalledTimes(1);
    hook.rerender({ enabled: true });
    expect(hook.result.current.detail).toMatchObject({
      id: "new",
      status: "ready",
    });
  });

  it("shows detail errors and retry, and clears unknown/mismatched record results", async () => {
    const provider = new BackendProvider();
    mockMetadata(provider);
    const get = vi
      .spyOn(provider.client, "getBasin")
      .mockRejectedValueOnce(new BackendApiError("http", "Not found", 404))
      .mockResolvedValueOnce(basin("requested"));
    const hook = renderHook(() => useBackendData(true, null, provider));
    await act(async () => {
      hook.result.current.select("basin", "requested");
    });
    expect(hook.result.current.detail).toMatchObject({
      status: "error",
      error: "Not found",
      feature: null,
    });
    await act(async () => {
      hook.result.current.retryDetail();
    });
    expect(hook.result.current.detail).toMatchObject({
      status: "ready",
      id: "requested",
    });
    get.mockResolvedValueOnce(basin("wrong-id"));
    await act(async () => {
      hook.result.current.select("basin", "requested");
    });
    expect(hook.result.current.detail).toMatchObject({
      status: "error",
      feature: null,
    });
    act(() => {
      hook.result.current.clearSelection();
    });
    expect(hook.result.current.detail).toMatchObject({
      status: "idle",
      id: null,
      feature: null,
    });
  });
});
