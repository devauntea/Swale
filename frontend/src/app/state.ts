import type {
  AssistantUIAction,
  CameraRequest,
  DemoSnapshot,
  LayerVisibility,
  ScenarioId,
} from "../types";

export interface AppState {
  scenarioId: ScenarioId;
  layers: LayerVisibility;
  selectedBasinId: string | null;
  highlightedIds: string[];
  cameraRequest: CameraRequest;
  /** Snapshot-derived allowlists keep even direct UI actions fail-closed. */
  validBasinIds: string[];
  validTargetIds: string[];
}

export type AppAction =
  | { type: "set_scenario"; scenarioId: ScenarioId }
  | { type: "set_layers"; visibility: Partial<LayerVisibility> }
  | { type: "select_basin"; id: string | null }
  | { type: "highlight"; ids: string[] }
  | { type: "fly_to"; targetId: string }
  | { type: "replace_snapshot"; snapshot: DemoSnapshot };

export type ValidationResult =
  | { valid: true; action: AssistantUIAction }
  | { valid: false; error: string };
export const MAX_HIGHLIGHTS = 20;
const SCENARIOS: ScenarioId[] = ["moderate_current", "extreme_2080"];
const LAYERS: (keyof LayerVisibility)[] = [
  "basins",
  "floodZones",
  "complaints",
  "buildings",
];

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));
const isScenario = (value: unknown): value is ScenarioId =>
  typeof value === "string" && SCENARIOS.includes(value as ScenarioId);
const validVisibility = (value: unknown): value is Partial<LayerVisibility> =>
  record(value) &&
  Object.keys(value).length > 0 &&
  Object.entries(value).every(
    ([key, visible]) =>
      LAYERS.includes(key as keyof LayerVisibility) &&
      typeof visible === "boolean",
  );
const validIds = (value: unknown, known: string[]): value is string[] =>
  Array.isArray(value) &&
  value.length <= MAX_HIGHLIGHTS &&
  value.every((id) => typeof id === "string" && known.includes(id)) &&
  new Set(value).size === value.length;

export function isValidDisplayCoordinate(
  value: unknown,
): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    value[0] >= -74.05 &&
    value[0] <= -73.83 &&
    value[1] >= 40.56 &&
    value[1] <= 40.74
  );
}

/** Four explicit frontend commands only. Arbitrary coordinate targets are rejected. */
export function validateUIAction(
  input: unknown,
  snapshot: DemoSnapshot,
): ValidationResult {
  const fail = (error: string): ValidationResult => ({ valid: false, error });
  if (
    !record(input) ||
    !exactKeys(input, ["name", "arguments"]) ||
    typeof input.name !== "string" ||
    !record(input.arguments)
  )
    return fail("Invalid command schema.");
  const args = input.arguments;
  switch (input.name) {
    case "set_scenario":
      return exactKeys(args, ["name"]) &&
        isScenario(args.name) &&
        snapshot.scenarios[args.name]
        ? {
            valid: true,
            action: { name: "set_scenario", arguments: { name: args.name } },
          }
        : fail("Unknown scenario or unexpected arguments.");
    case "set_layers":
      return exactKeys(args, ["visibility"]) && validVisibility(args.visibility)
        ? {
            valid: true,
            action: {
              name: "set_layers",
              arguments: { visibility: { ...args.visibility } },
            },
          }
        : fail(
            "Only known layer names and boolean visibility values are allowed.",
          );
    case "highlight":
      return exactKeys(args, ["ids"]) &&
        validIds(
          args.ids,
          snapshot.basins.map((basin) => basin.id),
        )
        ? {
            valid: true,
            action: { name: "highlight", arguments: { ids: [...args.ids] } },
          }
        : fail(
            "Highlight IDs must be unique loaded fixture IDs within the result limit.",
          );
    case "fly_to": {
      if (!exactKeys(args, ["target"]) || typeof args.target !== "string")
        return fail(
          "A known target ID is required; arbitrary coordinates are not accepted.",
        );
      const target =
        snapshot.targets.find((item) => item.id === args.target) ??
        snapshot.basins.find((item) => item.id === args.target);
      return target && isValidDisplayCoordinate(target.position)
        ? {
            valid: true,
            action: { name: "fly_to", arguments: { target: args.target } },
          }
        : fail("Unknown target or invalid loaded coordinates.");
    }
    default:
      return fail(
        "Unsupported command. Only frontend map commands are available.",
      );
  }
}

export function createInitialState(snapshot: DemoSnapshot): AppState {
  const validBasins = snapshot.basins.filter((basin) =>
    isValidDisplayCoordinate(basin.position),
  );
  return {
    scenarioId: "moderate_current",
    layers: {
      basins: true,
      floodZones: true,
      complaints: true,
      buildings: true,
    },
    selectedBasinId:
      (
        validBasins.find((basin) => basin.focusArea === "Gowanus") ??
        validBasins[0]
      )?.id ?? null,
    highlightedIds: [],
    cameraRequest: { targetId: "gowanus", nonce: 0 },
    validBasinIds: validBasins.map((basin) => basin.id),
    validTargetIds: snapshot.targets
      .filter((target) => isValidDisplayCoordinate(target.position))
      .map((target) => target.id),
  };
}

/** Pure reducer: no clocks, timers, network calls or score calculations. */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "set_scenario":
      return isScenario(action.scenarioId)
        ? { ...state, scenarioId: action.scenarioId }
        : state;
    case "set_layers":
      return validVisibility(action.visibility)
        ? { ...state, layers: { ...state.layers, ...action.visibility } }
        : state;
    case "select_basin":
      return action.id === null || state.validBasinIds.includes(action.id)
        ? { ...state, selectedBasinId: action.id }
        : state;
    case "highlight":
      return validIds(action.ids, state.validBasinIds)
        ? { ...state, highlightedIds: [...action.ids] }
        : state;
    case "fly_to":
      return state.validBasinIds.includes(action.targetId) ||
        state.validTargetIds.includes(action.targetId)
        ? {
            ...state,
            cameraRequest: {
              targetId: action.targetId,
              nonce: state.cameraRequest.nonce + 1,
            },
          }
        : state;
    case "replace_snapshot": {
      const next = createInitialState(action.snapshot);
      return {
        ...next,
        scenarioId: state.scenarioId,
        layers: { ...state.layers },
        selectedBasinId:
          state.selectedBasinId &&
          next.validBasinIds.includes(state.selectedBasinId)
            ? state.selectedBasinId
            : null,
        highlightedIds: state.highlightedIds.filter((id) =>
          next.validBasinIds.includes(id),
        ),
        cameraRequest:
          next.validTargetIds.includes(state.cameraRequest.targetId) ||
          next.validBasinIds.includes(state.cameraRequest.targetId)
            ? state.cameraRequest
            : next.cameraRequest,
      };
    }
    default:
      return state;
  }
}

export function applyUIAction(
  state: AppState,
  input: unknown,
  snapshot: DemoSnapshot,
): AppState {
  const checked = validateUIAction(input, snapshot);
  if (!checked.valid) return state;
  const action = checked.action;
  switch (action.name) {
    case "set_scenario":
      return appReducer(state, {
        type: "set_scenario",
        scenarioId: action.arguments.name,
      });
    case "set_layers":
      return appReducer(state, {
        type: "set_layers",
        visibility: action.arguments.visibility,
      });
    case "highlight":
      return appReducer(state, {
        type: "highlight",
        ids: action.arguments.ids,
      });
    case "fly_to":
      return appReducer(state, {
        type: "fly_to",
        targetId: action.arguments.target,
      });
  }
}
