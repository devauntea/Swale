import { useEffect, useMemo, useState } from "react";
import { InfrastructureClient } from "./client";
import type { InfrastructureChunk, InfrastructureManifest } from "./contracts";

export function useInfrastructure(enabled: boolean, stationId: string | null) {
  const client = useMemo(() => new InfrastructureClient(), []);
  const [manifest, setManifest] = useState<InfrastructureManifest | null>(null);
  const [chunk, setChunk] = useState<InfrastructureChunk | null>(null);
  const [manifestStatus, setManifestStatus] = useState("idle");
  const [chunkStatus, setChunkStatus] = useState("idle");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    if (!enabled || manifest) return;
    const controller = new AbortController();
    let current = true;
    setManifestStatus("loading");
    setError("");
    client
      .manifest(controller.signal)
      .then((result) => {
        if (!current) return;
        setManifest(result);
        setManifestStatus(result.stations.length ? "ready" : "empty");
      })
      .catch((cause: unknown) => {
        if (!current || controller.signal.aborted) return;
        setManifestStatus("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "Infrastructure index unavailable.",
        );
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, manifest, client, revision]);
  useEffect(() => {
    setChunk(null);
    if (!enabled || !stationId || !manifest) {
      setChunkStatus("idle");
      if (!enabled || (manifest && !stationId)) setError("");
      return;
    }
    const station = manifest.stations.find((item) => item.id === stationId);
    if (!station) {
      setChunkStatus("error");
      setError(
        "This station has no generated infrastructure detail in the current model.",
      );
      return;
    }
    const controller = new AbortController();
    let current = true;
    setChunkStatus("loading");
    setError("");
    client
      .chunk(station, controller.signal)
      .then((result) => {
        if (!current || result.stationId !== stationId) return;
        setChunk(result);
        setChunkStatus(result.primitives.length ? "ready" : "empty");
      })
      .catch((cause: unknown) => {
        if (!current || controller.signal.aborted) return;
        setChunkStatus("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "Selected infrastructure detail unavailable.",
        );
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, stationId, manifest, client, revision]);
  return {
    manifest,
    chunk: chunk?.stationId === stationId ? chunk : null,
    manifestStatus,
    chunkStatus,
    error,
    retry: () => setRevision((value) => value + 1),
    diagnostics: client.diagnostics,
  };
}
