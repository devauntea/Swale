import {
  BackendValidationError,
  parseBackendPage,
  parseBasin,
  parseHealth,
  parseIncident,
  parseLayers,
  parseSources,
  validateBackendBbox,
  validateBackendId,
  type BackendBbox,
} from "./contracts";
import { isApprovedBackendRequest } from "./routes";

interface PageRequest {
  bbox: BackendBbox;
  limit?: number;
  cursor?: string;
}
export interface IncidentPageRequest extends PageRequest {
  since: string;
  until: string;
  category?: string;
  verification?: string;
  basin?: string;
}
export type BackendRequest =
  | { route: "health" | "layers" | "sources" }
  | ({ route: "catch-basins" } & PageRequest)
  | ({ route: "incidents" } & IncidentPageRequest)
  | { route: "basin" | "incident"; id: string };

export interface BackendProblem {
  type: string;
  title: string;
  status: number;
  detail: string | null;
}
export class BackendApiError extends Error {
  constructor(
    public readonly kind:
      | "http"
      | "network"
      | "timeout"
      | "aborted"
      | "validation",
    message: string,
    public readonly status: number | null = null,
    public readonly problem: BackendProblem | null = null,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}
function requestInvalid(): never {
  throw new BackendApiError(
    "validation",
    "The local backend request is outside the approved GET contract.",
  );
}
function approvedUrl(url: string): string {
  return isApprovedBackendRequest("GET", url) ? url : requestInvalid();
}
function explicitInstant(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    return requestInvalid();
  return value;
}
// This is the entire application transport allowlist. Catalog/detail links never
// become request URLs. Extra arguments (including methods and URLs) fail closed.
export function buildBackendUrl(request: BackendRequest): string {
  if (!request || typeof request !== "object") return requestInvalid();
  const route = request.route;
  const baseKeys = ["route"];
  const pageKeys = [...baseKeys, "bbox", "limit", "cursor"];
  const allowedKeys =
    route === "catch-basins"
      ? pageKeys
      : route === "incidents"
        ? [...pageKeys, "since", "until", "category", "verification", "basin"]
        : route === "basin" || route === "incident"
          ? [...baseKeys, "id"]
          : baseKeys;
  if (Object.keys(request).some((key) => !allowedKeys.includes(key)))
    return requestInvalid();
  if (route === "health" || route === "layers" || route === "sources")
    return approvedUrl(`/api/v1/${route}`);
  if (route === "basin" || route === "incident") {
    const collection = route === "basin" ? "catch-basins" : "incidents";
    return approvedUrl(
      `/api/v1/${collection}/${encodeURIComponent(validateBackendId(request.id))}`,
    );
  }
  if (route !== "catch-basins" && route !== "incidents")
    return requestInvalid();
  const params = new URLSearchParams();
  params.set("bbox", validateBackendBbox(request.bbox).join(","));
  const limit = request.limit ?? 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000)
    return requestInvalid();
  params.set("limit", String(limit));
  if (request.cursor !== undefined)
    params.set("cursor", validateBackendId(request.cursor));
  if (route === "incidents") {
    const since = explicitInstant(request.since),
      until = explicitInstant(request.until);
    if (Date.parse(since) >= Date.parse(until)) return requestInvalid();
    params.set("since", since);
    params.set("until", until);
    for (const name of ["category", "verification", "basin"] as const) {
      if (request[name] !== undefined)
        params.set(name, validateBackendId(request[name]));
    }
  }
  return approvedUrl(`/api/v1/${route}?${params.toString()}`);
}
function aborted(): BackendApiError {
  return new BackendApiError(
    "aborted",
    "The local backend request was cancelled.",
  );
}
export function isBackendAbort(error: unknown): boolean {
  return error instanceof BackendApiError && error.kind === "aborted";
}
export function backendErrorMessage(error: unknown): string {
  return error instanceof BackendApiError ||
    error instanceof BackendValidationError
    ? error.message
    : "The local backend could not be reached. Fixture examples have not been substituted.";
}
function parseProblem(value: unknown, status: number): BackendProblem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  if (
    typeof p.type !== "string" ||
    typeof p.title !== "string" ||
    p.status !== status ||
    (p.detail !== undefined && typeof p.detail !== "string")
  )
    return null;
  return {
    type: p.type.slice(0, 256),
    title: p.title.slice(0, 160),
    status,
    detail: typeof p.detail === "string" ? p.detail.slice(0, 400) : null,
  };
}
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
async function readJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new BackendApiError(
      "validation",
      "The local backend response exceeded the frontend size limit.",
    );
  }
  if (!response.body)
    throw new BackendApiError(
      "validation",
      "The local backend returned an empty response.",
    );
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let bytes = 0,
    content = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new BackendApiError(
          "validation",
          "The local backend response exceeded the frontend size limit.",
        );
      }
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new BackendApiError(
        "validation",
        "The local backend returned invalid JSON.",
      );
    }
  } finally {
    reader.releaseLock();
  }
}

export class BackendClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: { fetcher?: typeof fetch; timeoutMs?: number } = {}) {
    this.fetcher =
      options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 10000;
    if (
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 30000
    )
      requestInvalid();
  }
  private async request<T>(
    request: BackendRequest,
    parser: (value: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = buildBackendUrl(request);
    if (signal?.aborted) throw aborted();
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method: "GET",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        headers: { Accept: "application/json, application/problem+json" },
        signal: controller.signal,
      });
      const type = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim();
      if (type !== "application/json" && type !== "application/problem+json") {
        await response.body?.cancel();
        throw new BackendApiError(
          "http",
          `Local backend HTTP ${response.status}: expected a JSON response.`,
          response.status,
        );
      }
      const value = await readJson(response);
      if (controller.signal.aborted) throw aborted();
      if (!response.ok) {
        const problem = parseProblem(value, response.status);
        throw new BackendApiError(
          "http",
          problem
            ? `${problem.title}${problem.detail ? `: ${problem.detail}` : ""}`
            : `Local backend HTTP ${response.status}.`,
          response.status,
          problem,
        );
      }
      if (type === "application/problem+json")
        throw new BackendApiError(
          "validation",
          "The local backend returned a problem response with a success status.",
        );
      return parser(value);
    } catch (error) {
      if (timedOut)
        throw new BackendApiError(
          "timeout",
          "The local backend request timed out. Retry to reconnect.",
        );
      if (signal?.aborted || controller.signal.aborted) throw aborted();
      if (
        error instanceof BackendApiError ||
        error instanceof BackendValidationError
      )
        throw error;
      throw new BackendApiError(
        "network",
        "The local backend could not be reached. Fixture examples have not been substituted.",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  getHealth(signal?: AbortSignal) {
    return this.request({ route: "health" }, parseHealth, signal);
  }
  getLayers(signal?: AbortSignal) {
    return this.request({ route: "layers" }, parseLayers, signal);
  }
  getSources(signal?: AbortSignal) {
    return this.request({ route: "sources" }, parseSources, signal);
  }
  getBasinsPage(params: PageRequest, signal?: AbortSignal) {
    return this.request(
      { ...params, route: "catch-basins" },
      (value) => parseBackendPage(value, "catch_basins", parseBasin),
      signal,
    );
  }
  getIncidentsPage(params: IncidentPageRequest, signal?: AbortSignal) {
    return this.request(
      { ...params, route: "incidents" },
      (value) => parseBackendPage(value, "incidents", parseIncident),
      signal,
    );
  }
  getBasin(id: string, signal?: AbortSignal) {
    return this.request({ route: "basin", id }, parseBasin, signal);
  }
  getIncident(id: string, signal?: AbortSignal) {
    return this.request({ route: "incident", id }, parseIncident, signal);
  }
}
