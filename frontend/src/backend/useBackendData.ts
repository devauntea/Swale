import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { backendErrorMessage, isBackendAbort } from "./client";
import type {
  BackendBbox,
  BackendData,
  BackendDetailState,
  BackendKind,
} from "./contracts";
import {
  BACKEND_VIEWPORT_DEBOUNCE_MS,
  BackendProvider,
  emptyBackendData,
  emptyCollection,
  incidentWindow,
} from "./provider";

const emptyDetail = (): BackendDetailState => ({
  kind: null,
  id: null,
  status: "idle",
  feature: null,
  error: null,
});

export function useBackendData(
  enabled: boolean,
  bbox: BackendBbox | null,
  suppliedProvider?: BackendProvider,
) {
  const [provider] = useState(() => suppliedProvider ?? new BackendProvider());
  const [data, setData] = useState<BackendData>(emptyBackendData);
  const [detail, setDetail] = useState<BackendDetailState>(emptyDetail);
  const [revision, setRevision] = useState(0);
  const detailController = useRef<AbortController | null>(null);
  const detailGeneration = useRef(0);
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  const bboxKey = bbox?.join(",") ?? "";

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let current = true;
    setData((previous) => ({
      ...previous,
      metadataStatus: "loading",
      metadataError: null,
    }));
    void provider
      .metadata(controller.signal)
      .then((result) => {
        if (current && !controller.signal.aborted)
          setData((previous) => ({ ...previous, ...result }));
      })
      .catch((error) => {
        if (current && !isBackendAbort(error))
          setData((previous) => ({
            ...previous,
            metadataStatus: "error",
            metadataError: backendErrorMessage(error),
          }));
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, provider, revision]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let current = true;
    // Clearing old viewport collections avoids presenting an old extent as new.
    setData((previous) => ({
      ...previous,
      basins: { ...emptyCollection(), status: bboxKey ? "loading" : "idle" },
      incidents: { ...emptyCollection(), status: bboxKey ? "loading" : "idle" },
    }));
    if (!bboxKey)
      return () => {
        current = false;
        controller.abort();
      };
    const bounds = bboxKey.split(",").map(Number) as unknown as BackendBbox;
    const window = incidentWindow();
    const timer = setTimeout(() => {
      void provider
        .basins(bounds, controller.signal)
        .then((basins) => {
          if (current && !controller.signal.aborted)
            setData((previous) => ({ ...previous, basins }));
        })
        .catch((error) => {
          if (current && !isBackendAbort(error))
            setData((previous) => ({
              ...previous,
              basins: {
                ...emptyCollection(),
                status: "error",
                error: backendErrorMessage(error),
              },
            }));
        });
      void provider
        .incidents(bounds, window, controller.signal)
        .then((incidents) => {
          if (current && !controller.signal.aborted)
            setData((previous) => ({ ...previous, incidents }));
        })
        .catch((error) => {
          if (current && !isBackendAbort(error))
            setData((previous) => ({
              ...previous,
              incidents: {
                ...emptyCollection(),
                status: "error",
                error: backendErrorMessage(error),
              },
            }));
        });
    }, BACKEND_VIEWPORT_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, bboxKey, provider, revision]);

  const select = useCallback(
    (kind: BackendKind, id: string) => {
      if (!enabledRef.current) return;
      detailController.current?.abort();
      const controller = new AbortController();
      detailController.current = controller;
      const generation = ++detailGeneration.current;
      setDetail({ kind, id, status: "loading", feature: null, error: null });
      const request =
        kind === "basin"
          ? provider.client.getBasin(id, controller.signal)
          : provider.client.getIncident(id, controller.signal);
      void request
        .then((feature) => {
          if (
            enabledRef.current &&
            !controller.signal.aborted &&
            generation === detailGeneration.current
          ) {
            if (feature.id !== id) {
              setDetail({
                kind,
                id,
                status: "error",
                feature: null,
                error: "The local backend returned a different record ID.",
              });
              return;
            }
            setDetail({ kind, id, status: "ready", feature, error: null });
          }
        })
        .catch((error) => {
          if (
            enabledRef.current &&
            !controller.signal.aborted &&
            generation === detailGeneration.current &&
            !isBackendAbort(error)
          )
            setDetail({
              kind,
              id,
              status: "error",
              feature: null,
              error: backendErrorMessage(error),
            });
        });
    },
    [provider],
  );
  const clearSelection = useCallback(() => {
    ++detailGeneration.current;
    detailController.current?.abort();
    setDetail(emptyDetail());
  }, []);
  const retryDetail = useCallback(() => {
    if (detail.kind && detail.id) select(detail.kind, detail.id);
  }, [detail.kind, detail.id, select]);
  useEffect(() => {
    if (!enabled) {
      ++detailGeneration.current;
      detailController.current?.abort();
      // Retain a completed backend selection internally, isolated from fixture UI.
      setDetail((previous) =>
        previous.status === "loading" ? emptyDetail() : previous,
      );
    }
    return () => {
      detailController.current?.abort();
    };
  }, [enabled]);
  const refresh = useCallback(() => {
    if (enabledRef.current) setRevision((previous) => previous + 1);
  }, []);
  return {
    data: enabled ? data : emptyBackendData(),
    detail: enabled ? detail : emptyDetail(),
    refresh,
    select,
    clearSelection,
    retryDetail,
  };
}
