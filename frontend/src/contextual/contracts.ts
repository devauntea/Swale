export const CONTEXT_LANGUAGES = ["en", "es", "zh", "ar", "ru", "fr"] as const;
export type ContextLanguage = (typeof CONTEXT_LANGUAGES)[number];
export type ViewScope = "overview" | "station_exploration";
export type WaterView = "normal" | "flood_simulation";
export interface ContextSnapshot {
  station_id: string;
  entrance_id?: string;
  scenario_id: string;
  model_version: string;
  elapsed_seconds: number;
  fingerprint: string;
  inputs: Record<string, number>;
  results: Record<string, number>;
}
export interface ContextRequest {
  kind: "station" | "entrance" | "basin" | "incident";
  id: string;
  station_id?: string;
  water_view: WaterView;
  view_scope: ViewScope;
  state_version: string;
  snapshot?: ContextSnapshot;
}
export interface ContextEvidence {
  id: string;
  subject_id: string;
  type: "STATIC INVENTORY" | "HISTORICAL" | "OBSERVED" | "SCENARIO";
  source_id: string;
  url: string | null;
  source_time: string | null;
  fetched_at: string | null;
  stale: boolean | null;
  text: string;
}
export interface ContextReply {
  id: string;
  context_key: string;
  context: ContextRequest;
  subject: {
    id: string;
    station_id: string | null;
    geometry: { type: "Point"; coordinates: [number, number] };
  };
  transcript: string;
  original_transcript: string;
  language: ContextLanguage;
  source: "model" | "template" | "machine_translation";
  evidence: ContextEvidence[];
  actions: ContextAction[];
  limitations: string[];
  created_at: string;
  expires_at: string;
  error: string | null;
  translation: {
    configured: ContextLanguage[];
    available: ContextLanguage[];
    verified: false;
  };
  audio: { ready: boolean; url: string | null };
}
export type ContextAction =
  | { type: "set_view"; view_scope: ViewScope }
  | { type: "set_water_view"; water_view: WaterView }
  | { type: "seek_simulation"; elapsed_seconds: number }
  | { type: "select_station"; station_id: string }
  | {
      type: "set_layers";
      layers: Partial<
        Record<"basins" | "complaints" | "floodZones" | "buildings", boolean>
      >;
    }
  | { type: "highlight"; ids: string[] }
  | { type: "fly_to"; target_id: string }
  | { type: "play_briefing" }
  | { type: "stop_audio" };

/** All unknown fields fail closed; source text can never become a command. */
export function parseContextAction(value: unknown): ContextAction {
  const p = object(value);
  const keys = (allowed: string[]) => {
    if (Object.keys(p).some((key) => !allowed.includes(key))) invalid();
  };
  switch (p.type) {
    case "set_view":
      keys(["type", "view_scope"]);
      if (p.view_scope !== "overview" && p.view_scope !== "station_exploration")
        invalid();
      return { type: p.type, view_scope: p.view_scope };
    case "set_water_view":
      keys(["type", "water_view"]);
      if (p.water_view !== "normal" && p.water_view !== "flood_simulation")
        invalid();
      return { type: p.type, water_view: p.water_view };
    case "seek_simulation":
      keys(["type", "elapsed_seconds"]);
      return {
        type: p.type,
        elapsed_seconds: finite(p.elapsed_seconds, 0, 1800),
      };
    case "select_station": {
      keys(["type", "station_id"]);
      const station_id = identifier(p.station_id);
      if (!station_id.startsWith("subway_station:")) invalid();
      return { type: p.type, station_id };
    }
    case "set_layers": {
      keys(["type", "layers"]);
      const layers = object(p.layers);
      if (
        Object.keys(layers).some(
          (key) =>
            !["basins", "complaints", "floodZones", "buildings"].includes(
              key,
            ) || typeof layers[key] !== "boolean",
        )
      )
        invalid();
      return {
        type: p.type,
        layers: layers as Extract<
          ContextAction,
          { type: "set_layers" }
        >["layers"],
      };
    }
    case "highlight":
      keys(["type", "ids"]);
      if (!Array.isArray(p.ids) || p.ids.length > 20) invalid();
      return { type: p.type, ids: p.ids.map(identifier) };
    case "fly_to":
      keys(["type", "target_id"]);
      return { type: p.type, target_id: identifier(p.target_id) };
    case "play_briefing":
    case "stop_audio":
      keys(["type"]);
      return { type: p.type };
    default:
      return invalid();
  }
}
export function invalid(): never {
  throw new Error(
    "The contextual response does not match the validated contract.",
  );
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 20000): string {
  if (typeof value !== "string" || !value.length || value.length > max)
    return invalid();
  return value;
}
export function identifier(value: unknown): string {
  const id = text(value, 250);
  if (
    Array.from(id).some((character) => character.charCodeAt(0) <= 32) ||
    /[/\\?#]/u.test(id)
  )
    invalid();
  return id;
}
export function finite(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    return invalid();
  return value;
}
export function contextIdentity(context: ContextRequest): string {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([, item]) => item !== undefined && item !== null)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, canonical(item)]),
          )
        : value;
  return JSON.stringify(canonical(context));
}

const only = (p: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(p).some((key) => !keys.includes(key))) invalid();
};
function quantities(value: unknown) {
  const record = object(value);
  if (Object.keys(record).length > 40) invalid();
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      text(key, 100),
      finite(value, -1e12, 1e12),
    ]),
  );
}
export function parseContextRequest(value: unknown): ContextRequest {
  const p = object(value);
  only(p, [
    "kind",
    "id",
    "station_id",
    "water_view",
    "view_scope",
    "state_version",
    "snapshot",
  ]);
  if (
    !["station", "entrance", "basin", "incident"].includes(String(p.kind)) ||
    !["normal", "flood_simulation"].includes(String(p.water_view)) ||
    !["overview", "station_exploration"].includes(String(p.view_scope))
  )
    invalid();
  const context: ContextRequest = {
    kind: p.kind as ContextRequest["kind"],
    id: identifier(p.id),
    water_view: p.water_view as WaterView,
    view_scope: p.view_scope as ViewScope,
    state_version: text(p.state_version, 250),
  };
  if (p.station_id !== null && p.station_id !== undefined)
    context.station_id = identifier(p.station_id);
  if (p.snapshot !== null && p.snapshot !== undefined) {
    const s = object(p.snapshot);
    only(s, [
      "station_id",
      "entrance_id",
      "scenario_id",
      "model_version",
      "elapsed_seconds",
      "fingerprint",
      "inputs",
      "results",
    ]);
    context.snapshot = {
      station_id: identifier(s.station_id),
      scenario_id: text(s.scenario_id, 250),
      model_version: text(s.model_version, 250),
      elapsed_seconds: finite(s.elapsed_seconds, 0, 1800),
      fingerprint: text(s.fingerprint, 250),
      inputs: quantities(s.inputs),
      results: quantities(s.results),
    };
    if (s.entrance_id !== null && s.entrance_id !== undefined)
      context.snapshot.entrance_id = identifier(s.entrance_id);
  }
  return context;
}
export function sameContext(a: ContextRequest, b: ContextRequest): boolean {
  return (
    contextIdentity(parseContextRequest(a)) ===
    contextIdentity(parseContextRequest(b))
  );
}
export function parseContextReply(
  value: unknown,
  expected?: ContextRequest,
): ContextReply {
  const p = object(value),
    context = parseContextRequest(p.context);
  if (expected && !sameContext(context, expected)) invalid();
  const rawSubject = object(p.subject),
    geometry = object(rawSubject.geometry);
  if (
    rawSubject.id !== context.id ||
    (context.station_id !== undefined &&
      rawSubject.station_id !== context.station_id) ||
    (context.kind === "station" && rawSubject.station_id !== context.id) ||
    geometry.type !== "Point" ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length !== 2
  )
    invalid();
  const subject: ContextReply["subject"] = {
    id: identifier(rawSubject.id),
    station_id:
      rawSubject.station_id === null ? null : identifier(rawSubject.station_id),
    geometry: {
      type: "Point",
      coordinates: [
        finite(geometry.coordinates[0], -180, 180),
        finite(geometry.coordinates[1], -90, 90),
      ],
    },
  };
  const id = identifier(p.id);
  if (
    !/^[a-f0-9]{32}$/.test(id) ||
    !/^[a-f0-9]{64}$/.test(text(p.context_key, 64))
  )
    invalid();
  if (
    !CONTEXT_LANGUAGES.includes(p.language as ContextLanguage) ||
    !["model", "template", "machine_translation"].includes(String(p.source))
  )
    invalid();
  if (
    !Array.isArray(p.actions) ||
    p.actions.length > 4 ||
    !Array.isArray(p.evidence) ||
    p.evidence.length > 100 ||
    !Array.isArray(p.limitations) ||
    p.limitations.length > 40
  )
    invalid();
  const evidence = p.evidence.map((value): ContextEvidence => {
    const e = object(value);
    if (e.subject_id !== context.id) invalid();
    if (
      !["STATIC INVENTORY", "HISTORICAL", "OBSERVED", "SCENARIO"].includes(
        String(e.type),
      ) ||
      (e.stale !== null && typeof e.stale !== "boolean")
    )
      invalid();
    const url = e.url === null ? null : text(e.url, 2048);
    if (
      url !== null &&
      url !== "/infrastructure/index.json" &&
      !/^https:\/\//.test(url)
    )
      invalid();
    return {
      id: text(e.id, 250),
      subject_id: text(e.subject_id, 250),
      type: e.type as ContextEvidence["type"],
      source_id: text(e.source_id, 250),
      url,
      source_time: e.source_time === null ? null : text(e.source_time, 250),
      fetched_at: e.fetched_at === null ? null : text(e.fetched_at, 250),
      stale: e.stale as boolean | null,
      text: text(e.text, 6000),
    };
  });
  const translation = object(p.translation),
    audio = object(p.audio);
  const languages = (value: unknown): ContextLanguage[] => {
    if (
      !Array.isArray(value) ||
      value.length > 6 ||
      value.some(
        (language) => !CONTEXT_LANGUAGES.includes(language as ContextLanguage),
      )
    )
      return invalid();
    return value as ContextLanguage[];
  };
  if (translation.verified !== false || typeof audio.ready !== "boolean")
    invalid();
  const audioUrl = audio.url === null ? null : text(audio.url, 250);
  if (audioUrl !== null && audioUrl !== `/api/v1/context/briefings/${id}/audio`)
    invalid();
  const created_at = text(p.created_at, 100),
    expires_at = text(p.expires_at, 100);
  if (
    ![created_at, expires_at].every((date) => Number.isFinite(Date.parse(date)))
  )
    invalid();
  return {
    id,
    context_key: p.context_key as string,
    context,
    subject,
    transcript: text(p.transcript),
    original_transcript: text(p.original_transcript),
    language: p.language as ContextLanguage,
    source: p.source as ContextReply["source"],
    evidence,
    actions: p.actions.map(parseContextAction),
    limitations: p.limitations.map((v) => text(v, 6000)),
    created_at,
    expires_at,
    error: p.error === null ? null : text(p.error, 2000),
    translation: {
      configured: languages(translation.configured),
      available: languages(translation.available),
      verified: false,
    },
    audio: { ready: audio.ready, url: audioUrl },
  };
}
