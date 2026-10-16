import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { BackendBbox } from "./contracts";
import { BackendApiError, backendErrorMessage, isBackendAbort } from "./client";
import { TransitClient } from "./transitClient";
import type {
  TransitCollection,
  TransitData,
  TransitPage,
  TransitResource,
  TransitLive,
  TransitFeedState,
  TransitEvidenceState,
  TransitObservation,
} from "./transitContracts";

export const TRANSIT_POLL_MS = 60000;
export const TRANSIT_WEATHER_MS = 600000;
export const TRANSIT_STALE_MS = 120000;
export function emptyTransitCollection<F>(): TransitCollection<F> {
  return {
    features: [],
    status: "idle",
    error: null,
    partial: false,
    stale: false,
    generatedAt: null,
    sources: [],
    filters: {},
    pages: 0,
    meta: null,
  };
}
export function emptyTransitResource<T>(): TransitResource<T> {
  return {
    data: null,
    status: "idle",
    error: null,
    stale: false,
    partial: false,
    lastSuccessAt: null,
  };
}
export function emptyTransitData(): TransitData {
  return {
    stations: emptyTransitCollection(),
    entrances: emptyTransitCollection(),
    exposures: emptyTransitCollection(),
    zones: emptyTransitCollection(),
    live: emptyTransitResource(),
    weather: emptyTransitResource(),
    history: emptyTransitResource(),
    feedState: "idle",
    nextRefreshAt: null,
  };
}
const emptyEvidence = (): TransitEvidenceState => ({
  id: null,
  kind: null,
  status: "idle",
  feature: null,
  error: null,
  note: null,
});
export function transitCollection<F>(
  page: TransitPage<F>,
  cap = 2000,
): TransitCollection<F> {
  const ids = new Set<string>();
  for (const feature of page.features) {
    const id = (feature as { id: string }).id;
    if (ids.has(id))
      throw new BackendApiError(
        "validation",
        "The transit collection repeated a full record ID.",
      );
    ids.add(id);
  }
  return {
    features: page.features.slice(0, cap),
    status: page.features.length ? "ready" : "empty",
    error: null,
    partial:
      page.meta.truncated ||
      page.features.length > cap ||
      (page.meta.layer === "subway_stations" && page.features.length >= 1000) ||
      (page.meta.layer === "subway_entrances" && page.features.length >= 5000),
    stale: page.meta.sources.some((s) => s.stale),
    generatedAt: page.meta.generated_at,
    sources: page.meta.sources,
    filters: page.meta.filters,
    pages: 1,
    meta: page.meta,
  };
}
export function transitLiveIsStale(
  board: TransitLive,
  now = Date.now(),
): boolean {
  const times = Object.values(board.feed_times);
  return (
    !times.length ||
    times.some(
      (t) =>
        now - Date.parse(t) > TRANSIT_STALE_MS || Date.parse(t) > now + 60000,
    )
  );
}
export function assertTransitOrder(
  previous: TransitLive | null,
  next: TransitLive,
): void {
  if (
    previous &&
    (Date.parse(next.fetched_at) < Date.parse(previous.fetched_at) ||
      Object.entries(previous.feed_times).some(
        ([id, t]) =>
          next.feed_times[id] !== undefined &&
          Date.parse(next.feed_times[id]) < Date.parse(t),
      ))
  )
    throw new BackendApiError(
      "validation",
      "An older transit feed response was rejected; the last successful board is retained.",
    );
}
export function transitFeedState(
  resource: TransitResource<TransitLive>,
  now: number,
): TransitFeedState {
  if (!resource.data)
    return resource.status === "error"
      ? "offline"
      : resource.status === "loading"
        ? "loading"
        : "idle";
  if (!Object.keys(resource.data.feed_times).length) return "offline";
  if (
    resource.status === "error" ||
    resource.stale ||
    transitLiveIsStale(resource.data, now)
  )
    return "stale";
  if (resource.partial || resource.data.errors.length) return "partial";
  return "live";
}
function success<T>(data: T, partial = false): TransitResource<T> {
  return {
    data,
    status: "ready",
    error: null,
    stale: false,
    partial,
    lastSuccessAt: new Date().toISOString(),
  };
}
function failed<T>(
  previous: TransitResource<T>,
  error: unknown,
): TransitResource<T> {
  return {
    ...previous,
    status: "error",
    error: backendErrorMessage(error),
    stale: previous.data !== null,
  };
}
async function boundedPages<F>(
  getPage: (cursor?: string) => Promise<TransitPage<F>>,
  signal: AbortSignal,
): Promise<{ features: F[]; partial: boolean }> {
  const features: F[] = [],
    seen = new Set<string>(),
    ids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 4; page++) {
    if (signal.aborted)
      throw new BackendApiError(
        "aborted",
        "Cancelled transit evidence request.",
      );
    const result = await getPage(cursor);
    if (signal.aborted)
      throw new BackendApiError(
        "aborted",
        "Cancelled transit evidence request.",
      );
    if (result.features.length > 500)
      throw new BackendApiError(
        "validation",
        "Transit evidence page exceeded its limit.",
      );
    for (const feature of result.features) {
      const id = (feature as { id: string }).id;
      if (ids.has(id))
        throw new BackendApiError(
          "validation",
          "Transit evidence repeated a record ID.",
        );
      ids.add(id);
      features.push(feature);
    }
    if (!result.meta.truncated) return { features, partial: false };
    const next = result.meta.next_cursor!;
    if (seen.has(next))
      throw new BackendApiError(
        "validation",
        "Transit evidence repeated a page cursor.",
      );
    seen.add(next);
    cursor = next;
  }
  return { features, partial: true };
}

export function useTransitData(
  enabled: boolean,
  bbox: BackendBbox | null,
  suppliedClient?: TransitClient,
) {
  const [client] = useState(() => suppliedClient ?? new TransitClient());
  const [data, setData] = useState<TransitData>(emptyTransitData);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  const [clock, setClock] = useState(Date.now);
  const [revision, setRevision] = useState(0);
  const [evidence, setEvidence] = useState<TransitEvidenceState>(emptyEvidence);
  const dataRef = useRef(data),
    enabledRef = useRef(enabled),
    boundsRef = useRef(bbox);
  useLayoutEffect(() => {
    dataRef.current = data;
    enabledRef.current = enabled;
    boundsRef.current = bbox;
  }, [data, enabled, bbox]);
  const lifecycle = useRef({ nextLive: 0, nextWeather: 0, failures: 0 });
  const wakeLive = useRef<(() => void) | null>(null),
    wakeWeather = useRef<(() => void) | null>(null);
  const evidenceRequest = useRef<AbortController | null>(null),
    evidenceGeneration = useRef(0),
    observations = useRef(new Map<string, TransitObservation>());
  const zoneGeneration = useRef(0);
  const bboxKey = bbox?.join(",") ?? "";
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!enabled || hidden) return;
    const timer = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [enabled, hidden]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let current = true;
    setData((p) => ({
      ...p,
      stations: {
        ...emptyTransitCollection(),
        status: bboxKey ? "loading" : "idle",
      },
      entrances: {
        ...emptyTransitCollection(),
        status: bboxKey ? "loading" : "idle",
      },
    }));
    if (!bboxKey) return () => controller.abort();
    const box = bboxKey.split(",").map(Number) as unknown as BackendBbox;
    const timer = setTimeout(() => {
      for (const kind of ["stations", "entrances"] as const) {
        void client[kind](box, controller.signal)
          .then((page) => {
            if (current && !controller.signal.aborted) {
              if (
                page.meta.request_bbox.some(
                  (coordinate, index) => coordinate !== box[index],
                )
              )
                throw new BackendApiError(
                  "validation",
                  "Transit response bounds did not match the requested viewport.",
                );
              const collection = transitCollection(
                page as TransitPage<(typeof page.features)[number]>,
              );
              setData((p) => ({ ...p, [kind]: collection }));
            }
          })
          .catch((error) => {
            if (current && !isBackendAbort(error))
              setData((p) => ({
                ...p,
                [kind]: {
                  ...emptyTransitCollection(),
                  status: "error",
                  error: backendErrorMessage(error),
                },
              }));
          });
      }
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, bboxKey, client, revision]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let current = true;
    const keepZones =
      dataRef.current.zones.meta?.rain?.level !== undefined &&
      dataRef.current.zones.meta.rain.level !== "unknown";
    const zoneRequest = keepZones
      ? zoneGeneration.current
      : ++zoneGeneration.current;
    setData((p) => ({
      ...p,
      exposures: { ...p.exposures, status: "loading", error: null },
      zones: keepZones
        ? p.zones
        : { ...p.zones, status: "loading", error: null },
    }));
    void client
      .exposures(controller.signal)
      .then((page) => {
        if (current && !controller.signal.aborted)
          setData((p) => ({ ...p, exposures: transitCollection(page) }));
      })
      .catch((error) => {
        if (current && !isBackendAbort(error))
          setData((p) => ({
            ...p,
            exposures: {
              ...emptyTransitCollection(),
              status: "error",
              error: backendErrorMessage(error),
            },
          }));
      });
    if (!keepZones)
      void client
        .zones(false, controller.signal)
        .then((page) => {
          if (
            current &&
            !controller.signal.aborted &&
            zoneRequest === zoneGeneration.current
          )
            setData((p) => ({ ...p, zones: transitCollection(page) }));
        })
        .catch((error) => {
          if (current && !isBackendAbort(error))
            setData((p) => ({
              ...p,
              zones: {
                ...emptyTransitCollection(),
                status: "error",
                error: backendErrorMessage(error),
              },
            }));
        });
    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, client, revision]);
  useEffect(() => {
    if (!enabled || paused || hidden) return;
    let current = true,
      liveBusy = false,
      weatherBusy = false;
    const controller = new AbortController();
    let liveTimer: ReturnType<typeof setTimeout> | undefined,
      weatherTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleLive = () => {
      if (current) {
        clearTimeout(liveTimer);
        const next = lifecycle.current.nextLive;
        setData((p) => ({ ...p, nextRefreshAt: new Date(next).toISOString() }));
        liveTimer = setTimeout(
          () => void pollLive(),
          Math.max(0, next - Date.now()),
        );
      }
    };
    const pollLive = async () => {
      if (!current || liveBusy) return;
      if (Date.now() < lifecycle.current.nextLive) {
        scheduleLive();
        return;
      }
      liveBusy = true;
      lifecycle.current.nextLive = Date.now() + TRANSIT_POLL_MS;
      setData((p) => ({
        ...p,
        live: { ...p.live, status: "loading", error: null },
      }));
      try {
        const board = await client.live(controller.signal);
        if (!current || controller.signal.aborted) return;
        assertTransitOrder(dataRef.current.live.data, board);
        lifecycle.current.failures = board.errors.length
          ? lifecycle.current.failures + 1
          : 0;
        if (board.errors.length)
          lifecycle.current.nextLive =
            Date.now() +
            Math.min(
              600000,
              60000 * 2 ** Math.min(lifecycle.current.failures, 4),
            );
        setData((p) => ({
          ...p,
          live: {
            ...success(board, board.errors.length > 0),
            stale: transitLiveIsStale(board),
          },
        }));
      } catch (error) {
        if (current && !isBackendAbort(error)) {
          lifecycle.current.failures++;
          lifecycle.current.nextLive =
            Date.now() +
            Math.min(
              600000,
              60000 * 2 ** Math.min(lifecycle.current.failures, 4),
            );
          setData((p) => ({ ...p, live: failed(p.live, error) }));
        }
      } finally {
        liveBusy = false;
        if (current) {
          scheduleLive();
          setData((p) => ({
            ...p,
            history: { ...p.history, status: "loading", error: null },
          }));
          void client
            .history(controller.signal)
            .then((history) => {
              if (current && !controller.signal.aborted) {
                const unique = new Map(
                  history.polls.map((p) => [p.polled_at, p]),
                );
                setData((p) => ({
                  ...p,
                  history: success({ ...history, polls: [...unique.values()] }),
                }));
              }
            })
            .catch((error) => {
              if (current && !isBackendAbort(error))
                setData((p) => ({ ...p, history: failed(p.history, error) }));
            });
        }
      }
    };
    const scheduleWeather = () => {
      if (current) {
        clearTimeout(weatherTimer);
        weatherTimer = setTimeout(
          () => void pollWeather(),
          Math.max(0, lifecycle.current.nextWeather - Date.now()),
        );
      }
    };
    const pollWeather = async () => {
      if (!current || weatherBusy) return;
      if (Date.now() < lifecycle.current.nextWeather) {
        scheduleWeather();
        return;
      }
      weatherBusy = true;
      lifecycle.current.nextWeather = Date.now() + TRANSIT_WEATHER_MS;
      setData((p) => ({
        ...p,
        weather: { ...p.weather, status: "loading", error: null },
      }));
      try {
        const weather = await client.weather(controller.signal);
        if (!current || controller.signal.aborted) return;
        if (
          dataRef.current.weather.data &&
          Date.parse(weather.fetched_at) <
            Date.parse(dataRef.current.weather.data.fetched_at)
        )
          throw new BackendApiError(
            "validation",
            "An older weather response was rejected.",
          );
        setData((p) => ({
          ...p,
          weather: success(weather, weather.errors.length > 0),
        }));
        const zoneRequest = ++zoneGeneration.current;
        const zones = await client.zones(true, controller.signal);
        if (
          current &&
          !controller.signal.aborted &&
          zoneRequest === zoneGeneration.current
        )
          setData((p) => ({ ...p, zones: transitCollection(zones) }));
      } catch (error) {
        if (current && !isBackendAbort(error))
          setData((p) => ({ ...p, weather: failed(p.weather, error) }));
      } finally {
        weatherBusy = false;
        scheduleWeather();
      }
    };
    wakeLive.current = () => void pollLive();
    wakeWeather.current = () => void pollWeather();
    void pollLive();
    void pollWeather();
    return () => {
      current = false;
      controller.abort();
      clearTimeout(liveTimer);
      clearTimeout(weatherTimer);
      wakeLive.current = null;
      wakeWeather.current = null;
    };
  }, [enabled, paused, hidden, client]);
  const clearEvidence = useCallback(() => {
    ++evidenceGeneration.current;
    evidenceRequest.current?.abort();
    setEvidence(emptyEvidence());
  }, []);
  useEffect(() => {
    clearEvidence();
    observations.current.clear();
  }, [enabled, bboxKey, clearEvidence]);
  useEffect(
    () => () => {
      evidenceRequest.current?.abort();
    },
    [],
  );
  const openEvidence = useCallback(
    (id: string) => {
      if (!enabledRef.current) return;
      const known = new Map<
        string,
        NonNullable<TransitEvidenceState["kind"]>
      >();
      for (const item of dataRef.current.exposures.features)
        for (const factor of item.properties.factors) {
          const kind =
            factor.id === "flood_reports_nearby"
              ? "incident"
              : factor.id === "measured_flooding_nearby"
                ? "sensor"
                : factor.id === "dep_flood_map_at_entrance"
                  ? "dep_model"
                  : "unsupported";
          for (const key of factor.evidence_ids) known.set(key, kind);
        }
      for (const zone of dataRef.current.zones.features)
        for (const key of zone.properties.evidence_ids)
          known.set(
            key,
            zone.properties.zone_type === "measured"
              ? "sensor"
              : zone.properties.zone_type === "dep_mapped"
                ? "dep_model"
                : "unsupported",
          );
      for (const key of observations.current.keys())
        known.set(key, "flood_observation");
      const kind = known.get(id);
      clearEvidence();
      if (!kind) {
        setEvidence({
          id,
          kind: "unsupported",
          status: "error",
          feature: null,
          error:
            "This ID is not cited by the current validated transit evidence.",
          note: null,
        });
        return;
      }
      const controller = new AbortController();
      evidenceRequest.current = controller;
      const generation = ++evidenceGeneration.current;
      setEvidence({
        id,
        kind,
        status: "loading",
        feature: null,
        error: null,
        note: null,
      });
      const box = boundsRef.current;
      const update = (result: Partial<TransitEvidenceState>) => {
        if (
          enabledRef.current &&
          !controller.signal.aborted &&
          generation === evidenceGeneration.current
        )
          setEvidence((p) => ({ ...p, ...result }));
      };
      void (async () => {
        try {
          if (kind === "incident") {
            const feature = await client.getIncident(id, controller.signal);
            if (feature.id !== id)
              throw new BackendApiError(
                "validation",
                "Evidence response ID did not match.",
              );
            update({ status: "ready", feature });
            return;
          }
          if (kind === "flood_observation") {
            const canonical = observations.current.get(id) ?? null;
            try {
              const feature = await client.observation(id, controller.signal);
              if (feature.id !== id)
                throw new BackendApiError(
                  "validation",
                  "Evidence response ID did not match.",
                );
              update({ status: "ready", feature });
            } catch (error) {
              if (!isBackendAbort(error))
                update({
                  status: "error",
                  feature: canonical,
                  error: backendErrorMessage(error),
                  note: "Canonical collection record retained; detail/profile unavailable. Full opaque ID was not rewritten.",
                });
            }
            return;
          }
          if (!box)
            throw new BackendApiError(
              "validation",
              "Map bounds are needed to load this context.",
            );
          if (kind === "dep_model") {
            const page = await client.floodMaps(box, controller.signal);
            const feature = page.features.find((f) => f.id === id);
            if (!feature)
              throw new BackendApiError(
                "http",
                "Cited DEP geometry is outside this loaded viewport or unavailable.",
                404,
              );
            update({
              status: "ready",
              feature,
              note: "NYC DEP Moderate2.13in/hr/current sea-level model; not observed flooding.",
            });
            return;
          }
          if (kind === "sensor") {
            const until = new Date().toISOString(),
              since = new Date(Date.now() - 730 * 86400000).toISOString();
            const sensors = await boundedPages(
              (cursor) => client.sensors(box, since, cursor, controller.signal),
              controller.signal,
            );
            const feature = sensors.features.find((f) => f.id === id);
            if (!feature)
              throw new BackendApiError(
                "http",
                "Cited sensor is outside the loaded viewport or unavailable; zoom out to load its context.",
                404,
              );
            update({
              status: "ready",
              feature,
              note: "Historical FloodNet street measurements; every-two-week source cadence, not live station sensors.",
            });
            const events = await boundedPages(
              (cursor) =>
                client.observations(
                  box,
                  since,
                  until,
                  cursor,
                  controller.signal,
                ),
              controller.signal,
            );
            const matching = events.features.filter(
              (f) => f.properties.sensor_id === feature.properties.sensor_id,
            );
            if (
              !controller.signal.aborted &&
              generation === evidenceGeneration.current
            )
              for (const event of matching)
                observations.current.set(event.id, event);
            update({
              observations: matching,
              note: `Historical non-tidal events in the loaded730-day viewport subset${events.partial || sensors.partial ? "; PARTIAL/TRUNCATED" : ""}. Sensor buffer is not measured flood extent.`,
            });
            return;
          }
          throw new BackendApiError(
            "validation",
            "No approved stored simulation context is available; no run has been executed.",
          );
        } catch (error) {
          if (!isBackendAbort(error))
            update({ status: "error", error: backendErrorMessage(error) });
        }
      })();
    },
    [client, clearEvidence],
  );
  const refresh = useCallback(() => {
    if (!enabledRef.current) return;
    setRevision((p) => p + 1);
    wakeLive.current?.();
    wakeWeather.current?.();
    setClock(Date.now());
  }, []);
  const feedState = !enabled
    ? "idle"
    : hidden
      ? "hidden"
      : paused
        ? "paused"
        : transitFeedState(data.live, clock);
  const visible: TransitData = enabled
    ? {
        ...data,
        live: {
          ...data.live,
          stale:
            data.live.stale ||
            (data.live.data
              ? transitLiveIsStale(data.live.data, clock)
              : false),
        },
        weather: {
          ...data.weather,
          stale:
            data.weather.stale ||
            (data.weather.data
              ? clock - Date.parse(data.weather.data.fetched_at) >
                2 * TRANSIT_WEATHER_MS
              : false),
        },
        feedState,
      }
    : emptyTransitData();
  return {
    data: visible,
    paused,
    setPaused,
    refresh,
    evidence: enabled ? evidence : emptyEvidence(),
    openEvidence,
    clearEvidence,
  };
}
