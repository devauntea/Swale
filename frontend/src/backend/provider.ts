import {
  BackendApiError,
  BackendClient,
  backendErrorMessage,
  isBackendAbort,
} from "./client";
import type {
  BackendBasin,
  BackendBbox,
  BackendCollectionState,
  BackendData,
  BackendFeature,
  BackendIncident,
  BackendPage,
  BackendSourceFreshness,
} from "./contracts";

export const BACKEND_PAGE_SIZE = 500;
export const BACKEND_MAX_PAGES = 4;
export const BACKEND_MAX_FEATURES = 2000;
export const BACKEND_VIEWPORT_DEBOUNCE_MS = 250;
export interface IncidentWindow {
  since: string;
  until: string;
}
export function incidentWindow(now = new Date()): IncidentWindow {
  return {
    since: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    until: now.toISOString(),
  };
}
export function emptyCollection<
  F extends BackendFeature,
>(): BackendCollectionState<F> {
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
  };
}
export function emptyBackendData(): BackendData {
  return {
    health: null,
    layers: [],
    sources: [],
    metadataStatus: "idle",
    metadataError: null,
    basins: emptyCollection(),
    incidents: emptyCollection(),
  };
}
export class BackendProvider {
  constructor(public readonly client = new BackendClient()) {}
  async metadata(
    signal: AbortSignal,
  ): Promise<
    Pick<
      BackendData,
      "health" | "layers" | "sources" | "metadataStatus" | "metadataError"
    >
  > {
    const [health, layers, sources] = await Promise.allSettled([
      this.client.getHealth(signal),
      this.client.getLayers(signal),
      this.client.getSources(signal),
    ]);
    if (signal.aborted)
      throw new BackendApiError(
        "aborted",
        "The local backend request was cancelled.",
      );
    const errors = [health, layers, sources].flatMap((result) =>
      result.status === "rejected" ? [backendErrorMessage(result.reason)] : [],
    );
    return {
      health: health.status === "fulfilled" ? health.value : null,
      layers: layers.status === "fulfilled" ? layers.value : [],
      sources: sources.status === "fulfilled" ? sources.value : [],
      metadataStatus: errors.length ? "error" : "ready",
      metadataError: errors.length ? [...new Set(errors)].join(" ") : null,
    };
  }
  basins(
    bbox: BackendBbox,
    signal: AbortSignal,
  ): Promise<BackendCollectionState<BackendBasin>> {
    return this.pages(
      bbox,
      (cursor) =>
        this.client.getBasinsPage(
          { bbox, limit: BACKEND_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
          signal,
        ),
      signal,
    );
  }
  incidents(
    bbox: BackendBbox,
    window: IncidentWindow,
    signal: AbortSignal,
  ): Promise<BackendCollectionState<BackendIncident>> {
    // The explicit window is captured once, then reused unchanged on every page.
    return this.pages(
      bbox,
      (cursor) =>
        this.client.getIncidentsPage(
          {
            bbox,
            ...window,
            limit: BACKEND_PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
          },
          signal,
        ),
      signal,
    );
  }
  private async pages<F extends BackendFeature>(
    bbox: BackendBbox,
    getPage: (cursor?: string) => Promise<BackendPage<F>>,
    signal: AbortSignal,
  ): Promise<BackendCollectionState<F>> {
    const state = emptyCollection<F>(),
      cursors = new Set<string>(),
      ids = new Set<string>(),
      sources = new Map<string, BackendSourceFreshness>();
    let cursor: string | undefined;
    try {
      do {
        if (signal.aborted)
          throw new BackendApiError(
            "aborted",
            "The local backend request was cancelled.",
          );
        const page = await getPage(cursor);
        if (signal.aborted)
          throw new BackendApiError(
            "aborted",
            "The local backend request was cancelled.",
          );
        if (
          page.meta.request_bbox.some((n, i) => n !== bbox[i]) ||
          page.features.length > BACKEND_PAGE_SIZE
        )
          throw new BackendApiError(
            "validation",
            "The local backend page did not match the requested viewport or page limit.",
          );
        for (const feature of page.features) {
          if (ids.has(feature.id))
            throw new BackendApiError(
              "validation",
              "The local backend repeated a record across pages. The loaded subset is partial.",
            );
          ids.add(feature.id);
          if (state.features.length < BACKEND_MAX_FEATURES)
            state.features.push(feature);
        }
        state.pages += 1;
        state.generatedAt = page.meta.generated_at;
        state.filters = page.meta.filters;
        for (const source of page.meta.sources) sources.set(source.id, source);
        state.sources = [...sources.values()];
        state.stale = state.sources.some((source) => source.stale);
        if (!page.meta.truncated) break;
        const next = page.meta.next_cursor!;
        state.partial = true;
        if (cursors.has(next))
          throw new BackendApiError(
            "validation",
            "The local backend repeated a page cursor. The loaded subset is partial.",
          );
        cursors.add(next);
        if (
          state.pages >= BACKEND_MAX_PAGES ||
          state.features.length >= BACKEND_MAX_FEATURES
        )
          break;
        cursor = next;
        state.partial = false;
      } while (cursor);
      state.status = state.features.length ? "ready" : "empty";
    } catch (error) {
      if (isBackendAbort(error) || signal.aborted) throw error;
      state.status = "error";
      state.error = backendErrorMessage(error);
      state.partial = state.features.length > 0;
    }
    return state;
  }
}
