import {
  INFRASTRUCTURE_LIMITS as LIMITS,
  parseInfrastructureChunk,
  parseInfrastructureManifest,
  validateInfrastructurePath,
  type InfrastructureChunk,
  type InfrastructureStation,
} from "./contracts";

const aborted = () =>
  new DOMException("Infrastructure loading cancelled.", "AbortError");

/** Only same-origin generated JSON is fetched. No source GIS or full GLB request. */
async function readLocalJson(path: string, limit: number, signal: AbortSignal) {
  const response = await fetch(path, {
    signal,
    redirect: "error",
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      `Local infrastructure asset unavailable (HTTP ${response.status}).`,
    );
  if (
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new Error("Infrastructure asset was not JSON.");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit)
    throw new Error("Infrastructure asset exceeds its byte budget.");
  if (!response.body)
    throw new Error("Infrastructure asset body is unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let json = "";
  try {
    while (true) {
      if (signal.aborted) throw aborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit)
        throw new Error("Infrastructure asset exceeds its byte budget.");
      json += decoder.decode(value, { stream: true });
    }
    json += decoder.decode();
    if (signal.aborted) throw aborted();
    return { value: JSON.parse(json) as unknown, bytes };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

interface CacheEntry {
  chunk: InfrastructureChunk;
  decodedBytes: number;
}
export class InfrastructureClient {
  private cache = new Map<string, CacheEntry>();
  private active = 0;
  private waiters: (() => void)[] = [];

  get diagnostics() {
    return {
      chunks: this.cache.size,
      decodedBytes: [...this.cache.values()].reduce(
        (sum, entry) => sum + entry.decodedBytes,
        0,
      ),
      active: this.active,
    };
  }
  clear() {
    this.cache.clear();
  }

  async manifest(signal: AbortSignal) {
    const result = await readLocalJson(
      "/infrastructure/index.json",
      LIMITS.manifestBytes,
      signal,
    );
    return parseInfrastructureManifest(result.value);
  }

  async chunk(
    station: InfrastructureStation,
    signal: AbortSignal,
  ): Promise<InfrastructureChunk> {
    validateInfrastructurePath(station.detailUrl, station.id);
    if (signal.aborted) throw aborted();
    const cached = this.cache.get(station.id);
    if (cached) {
      this.cache.delete(station.id);
      this.cache.set(station.id, cached);
      return cached.chunk;
    }
    await this.acquire(signal);
    try {
      if (signal.aborted) throw aborted();
      const result = await readLocalJson(
        station.detailUrl,
        LIMITS.chunkBytes,
        signal,
      );
      const chunk = parseInfrastructureChunk(result.value, station.id);
      if (signal.aborted) throw aborted();
      // Conservative owned JS estimate, distinct from transfer bytes and GPU memory.
      // Geometry uses double precision arrays; string/object allocation is bounded here.
      const coordinateCount = chunk.primitives.reduce(
        (count, primitive) =>
          count +
          (primitive.path?.length ?? 0) +
          (primitive.polygon?.length ?? 0) +
          (primitive.position ? 1 : 0),
        0,
      );
      const decodedBytes =
        result.bytes * 2 + coordinateCount * 64 + chunk.primitives.length * 512;
      if (decodedBytes > LIMITS.cacheBytes)
        throw new Error("Selected detail exceeds the decoded resource budget.");
      this.cache.set(station.id, { chunk, decodedBytes });
      while (
        this.cache.size > LIMITS.cacheChunks ||
        this.diagnostics.decodedBytes > LIMITS.cacheBytes
      ) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
      return chunk;
    } finally {
      this.release();
    }
  }

  private async acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw aborted();
    if (this.active >= LIMITS.concurrency) {
      await new Promise<void>((resolve, reject) => {
        const resume = () => {
          signal.removeEventListener("abort", cancel);
          resolve();
        };
        const cancel = () => {
          this.waiters = this.waiters.filter((waiter) => waiter !== resume);
          reject(aborted());
        };
        signal.addEventListener("abort", cancel, { once: true });
        this.waiters.push(resume);
      });
      // The releasing request transfers its occupied slot to this waiter.
      if (signal.aborted) {
        this.release();
        throw aborted();
      }
      return;
    }
    if (signal.aborted) throw aborted();
    this.active += 1;
  }
  private release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.active -= 1;
  }
}
