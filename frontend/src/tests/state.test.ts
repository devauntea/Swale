import { describe, expect, it } from "vitest";
import { DEMO_SNAPSHOT } from "../data/fixtures/demo";
import {
  appReducer,
  applyUIAction,
  createInitialState,
  isValidDisplayCoordinate,
  validateUIAction,
} from "../app/state";
import type { AssistantUIAction } from "../types";

const snapshot = DEMO_SNAPSHOT;
const id = snapshot.basins[0].id;

describe("four frontend commands fail closed", () => {
  const allowed: AssistantUIAction[] = [
    { name: "set_scenario", arguments: { name: "extreme_2080" } },
    { name: "set_layers", arguments: { visibility: { complaints: false } } },
    { name: "highlight", arguments: { ids: [id] } },
    { name: "highlight", arguments: { ids: [] } },
    { name: "fly_to", arguments: { target: "gowanus" } },
    { name: "fly_to", arguments: { target: id } },
  ];
  it.each(allowed)("accepts a well formed $name command", (action) => {
    expect(validateUIAction(action, snapshot)).toEqual({ valid: true, action });
  });

  const rejected: unknown[] = [
    null,
    [],
    {},
    "set_scenario",
    { name: "search_basins", arguments: { limit: 10 } },
    { name: "explain_basin", arguments: { id } },
    { name: "run_analysis", arguments: { sql: "SELECT * FROM basins" } },
    { name: "set_scenario", arguments: { name: "moderate_2050" } },
    {
      name: "set_scenario",
      arguments: { name: "extreme_2080", unexpected: true },
    },
    {
      name: "set_scenario",
      arguments: { name: "extreme_2080" },
      execute: true,
    },
    { name: "set_layers", arguments: { visibility: { traffic: true } } },
    { name: "set_layers", arguments: { visibility: { basins: "false" } } },
    { name: "set_layers", arguments: { visibility: {} } },
    {
      name: "highlight",
      arguments: { ids: [id, "CB-OFFICIAL-LOOKING-UNKNOWN"] },
    },
    { name: "highlight", arguments: { ids: [id, id] } },
    { name: "highlight", arguments: { ids: Array(21).fill(id) } },
    { name: "highlight", arguments: { ids: [42] } },
    { name: "highlight", arguments: { ids: new Array(1) } },
    { name: "fly_to", arguments: { target: "unverified_neighborhood" } },
    { name: "fly_to", arguments: { target: [-74, 40.68] } },
    {
      name: "fly_to",
      arguments: { target: "gowanus", coordinates: [-74, 40.68] },
    },
  ];
  it.each(rejected.map((command, index) => ({ command, index })))(
    "rejects invalid command $index without changing state",
    ({ command }) => {
      expect(validateUIAction(command, snapshot).valid).toBe(false);
      const before = createInitialState(snapshot);
      expect(applyUIAction(before, command, snapshot)).toBe(before);
    },
  );

  it("rejects unsafe loaded navigation coordinates rather than accepting arbitrary geography", () => {
    const invalid = structuredClone(snapshot);
    invalid.targets[0].position = [181, 91];
    expect(
      validateUIAction(
        { name: "fly_to", arguments: { target: invalid.targets[0].id } },
        invalid,
      ).valid,
    ).toBe(false);
    expect(isValidDisplayCoordinate([-74, 40.68])).toBe(true);
    expect(isValidDisplayCoordinate([40.68, -74])).toBe(false);
    expect(isValidDisplayCoordinate([Number.NaN, 40.68])).toBe(false);
    expect(isValidDisplayCoordinate([-74, 40.68, 1])).toBe(false);
  });
});

describe("coordinated frontend state and regressions", () => {
  it("preserves selection, highlight, layer choices and camera request during scenario changes", () => {
    let state = createInitialState(snapshot);
    state = appReducer(state, {
      type: "select_basin",
      id: snapshot.basins[2].id,
    });
    state = appReducer(state, { type: "highlight", ids: [id] });
    state = appReducer(state, { type: "fly_to", targetId: "red_hook" });
    state = appReducer(state, {
      type: "set_layers",
      visibility: { buildings: false },
    });
    const changed = applyUIAction(
      state,
      { name: "set_scenario", arguments: { name: "extreme_2080" } },
      snapshot,
    );
    expect(changed.scenarioId).toBe("extreme_2080");
    expect(changed.selectedBasinId).toBe(state.selectedBasinId);
    expect(changed.highlightedIds).toEqual(state.highlightedIds);
    expect(changed.layers).toEqual(state.layers);
    expect(changed.cameraRequest).toEqual(state.cameraRequest);
    expect(snapshot.basins[2].priorities[changed.scenarioId]).toBe(
      snapshot.basins[2].priorities.extreme_2080,
    );
  });

  it("changes each layer independently and preserves a hidden basin selection", () => {
    const initial = createInitialState(snapshot);
    const noBuildings = appReducer(initial, {
      type: "set_layers",
      visibility: { buildings: false },
    });
    expect(noBuildings.layers).toEqual({ ...initial.layers, buildings: false });
    const noFloods = appReducer(noBuildings, {
      type: "set_layers",
      visibility: { floodZones: false },
    });
    expect(noFloods.layers.basins).toBe(true);
    expect(noFloods.layers.complaints).toBe(true);
    const noBasins = appReducer(noFloods, {
      type: "set_layers",
      visibility: { basins: false },
    });
    expect(noBasins.selectedBasinId).toBe(initial.selectedBasinId);
    const restored = appReducer(noBasins, {
      type: "set_layers",
      visibility: { basins: true },
    });
    expect(restored.selectedBasinId).toBe(initial.selectedBasinId);
    expect(restored.layers.floodZones).toBe(false);
  });

  it("rejects invalid direct selections/highlights atomically and permits clearing", () => {
    const initial = createInitialState(snapshot);
    expect(appReducer(initial, { type: "select_basin", id: "unknown" })).toBe(
      initial,
    );
    expect(
      appReducer(initial, { type: "highlight", ids: [id, "unknown"] }),
    ).toBe(initial);
    expect(
      appReducer(initial, { type: "highlight", ids: new Array<string>(1) }),
    ).toBe(initial);
    expect(appReducer(initial, { type: "fly_to", targetId: "unknown" })).toBe(
      initial,
    );
    const highlighted = appReducer(initial, { type: "highlight", ids: [id] });
    expect(
      appReducer(highlighted, { type: "highlight", ids: [] }).highlightedIds,
    ).toEqual([]);
    expect(
      appReducer(highlighted, { type: "select_basin", id: null })
        .selectedBasinId,
    ).toBeNull();
  });

  it("reconciles genuine dataset replacement while retaining valid user choices", () => {
    let state = createInitialState(snapshot);
    state = appReducer(state, { type: "select_basin", id });
    state = appReducer(state, {
      type: "set_scenario",
      scenarioId: "extreme_2080",
    });
    state = appReducer(state, {
      type: "set_layers",
      visibility: { complaints: false },
    });
    state = appReducer(state, {
      type: "highlight",
      ids: [id, snapshot.basins[1].id],
    });
    state = appReducer(state, { type: "fly_to", targetId: id });
    const refreshed = appReducer(state, {
      type: "replace_snapshot",
      snapshot: structuredClone(snapshot),
    });
    expect(refreshed.scenarioId).toBe(state.scenarioId);
    expect(refreshed.layers).toEqual(state.layers);
    expect(refreshed.selectedBasinId).toBe(state.selectedBasinId);
    expect(refreshed.cameraRequest).toEqual(state.cameraRequest);

    const replacement = structuredClone(snapshot);
    replacement.basins = replacement.basins.filter((basin) => basin.id !== id);
    const reconciled = appReducer(state, {
      type: "replace_snapshot",
      snapshot: replacement,
    });
    expect(reconciled.selectedBasinId).toBeNull();
    expect(reconciled.highlightedIds).toEqual([snapshot.basins[1].id]);
    expect(reconciled.cameraRequest).toEqual(
      createInitialState(replacement).cameraRequest,
    );
    expect(reconciled.scenarioId).toBe("extreme_2080");
    expect(reconciled.layers.complaints).toBe(false);
  });

  it("queues repeat explicit navigation without silently selecting or resetting layers", () => {
    const initial = createInitialState(snapshot);
    const once = appReducer(initial, { type: "fly_to", targetId: "gowanus" });
    const twice = appReducer(once, { type: "fly_to", targetId: "gowanus" });
    expect(twice.cameraRequest.nonce).toBe(once.cameraRequest.nonce + 1);
    expect(twice.cameraRequest.targetId).toBe("gowanus");
    expect(twice.selectedBasinId).toBe(initial.selectedBasinId);
    expect(twice.layers).toEqual(initial.layers);
  });
});
