import { describe, expect, it } from "vitest";
import { runDemoAssistant } from "../app/demoAssistant";
import {
  applyUIAction,
  createInitialState,
  validateUIAction,
} from "../app/state";
import { DEMO_SNAPSHOT } from "../data/fixtures/demo";
import { LocalFixtureProvider } from "../data/providers/LocalFixtureProvider";
import type { DemoAssistantReply, DemoSnapshot } from "../types";

const snapshot = DEMO_SNAPSHOT;
const id = snapshot.basins[0].id;

function checkGroundedReply(reply: DemoAssistantReply, data = snapshot) {
  expect(reply.text).toMatch(/^DEMO\b/);
  const known = new Set(data.basins.map((basin) => basin.id));
  for (const mentioned of reply.text.match(/SYNTHETIC-[A-Z0-9-]+/g) ?? []) {
    expect(known.has(mentioned)).toBe(true);
  }
  for (const resultId of reply.basinIds ?? [])
    expect(known.has(resultId)).toBe(true);
  for (const action of reply.actions) {
    expect(["set_scenario", "set_layers", "highlight", "fly_to"]).toContain(
      action.name,
    );
    expect(validateUIAction(action, data).valid).toBe(true);
  }
}

function run(prompt: string, data: DemoSnapshot = snapshot) {
  return runDemoAssistant(prompt, data, createInitialState(data));
}

describe("the five required scripted assistant demonstrations", () => {
  it("shows only available Red Hook examples and discloses the requested coverage limit", () => {
    const result = run(
      "Top 10 basins to inspect in Red Hook before tomorrow's rain",
    );
    checkGroundedReply(result);
    expect(result.status).toBe("complete");
    const expectedIds = snapshot.rankedBasinIds.moderate_current.filter(
      (basinId) =>
        snapshot.basins.find((basin) => basin.id === basinId)?.focusArea ===
        "Red Hook",
    );
    expect(result.basinIds).toEqual(expectedIds);
    expect(result.text).toContain(String(expectedIds.length));
    expect(result.text).toMatch(/synthetic|fixture/i);
    expect(result.text).toMatch(/tomorrow|weather|forecast/i);
    let state = createInitialState(snapshot);
    for (const action of result.actions)
      state = applyUIAction(state, action, snapshot);
    expect(state.highlightedIds).toEqual(expectedIds);
    expect(state.cameraRequest.targetId).toBe("red_hook");
    expect(state.layers.basins).toBe(true);
  });

  it("explains the selected stored example with traceable values and exact uncertainty wording", () => {
    const result = run(`Why is basin ${id} ranked high?`);
    checkGroundedReply(result);
    expect(result.status).toBe("complete");
    expect(result.basinIds).toEqual([id]);
    const priority = snapshot.basins[0].priorities.moderate_current;
    expect(result.text).toContain(String(priority.score));
    for (const factor of priority.factors)
      expect(result.text).toContain(
        `${factor.contributionPoints} score points`,
      );
    expect(result.text).toContain(
      "Inspection priority (heuristic, not validated)",
    );
    expect(result.text).toMatch(/does not prove blockage|cannot establish/i);
    expect(result.text).toMatch(/no scoring calculation|no.*backend query/i);
  });

  it("switches to the exact extreme scenario and highlights available predefined results", () => {
    const result = run("Switch to the extreme scenario and show the top 20");
    checkGroundedReply(result);
    expect(result.status).toBe("complete");
    expect(result.basinIds).toEqual(snapshot.rankedBasinIds.extreme_2080);
    expect(result.text).toContain(
      String(snapshot.rankedBasinIds.extreme_2080.length),
    );
    expect(result.text).toMatch(/both.*rainfall.*sea.level/i);
    expect(result.text).toMatch(/available|rather than inventing/i);
    const initial = createInitialState(snapshot);
    const state = result.actions.reduce(
      (current, action) => applyUIAction(current, action, snapshot),
      initial,
    );
    expect(state.scenarioId).toBe("extreme_2080");
    expect(state.highlightedIds).toEqual(snapshot.rankedBasinIds.extreme_2080);
    expect(state.cameraRequest).toEqual(initial.cameraRequest);
    expect(state.selectedBasinId).toBe(initial.selectedBasinId);
  });

  it("shows existing recent Gowanus complaint examples using approved UI commands only", () => {
    const result = run("Show recent flooding complaints near Gowanus");
    checkGroundedReply(result);
    const count = snapshot.complaints.filter(
      (complaint) => complaint.recent && complaint.focusArea === "Gowanus",
    ).length;
    expect(result.text).toContain(`${count} synthetic recent complaint`);
    expect(result.text).toMatch(/not live|authored fixtures/i);
    expect(result.text).toMatch(/not.*evidence|not.*caused/i);
    const initial = createInitialState(snapshot);
    const state = result.actions.reduce(
      (current, action) => applyUIAction(current, action, snapshot),
      initial,
    );
    expect(state.layers.complaints).toBe(true);
    expect(state.cameraRequest.targetId).toBe("gowanus");
  });

  it("answers the blockage question without claiming inspection knowledge or moving the map", () => {
    const result = run("Is this drain blocked?");
    checkGroundedReply(result);
    expect(result.text).toMatch(/cannot establish whether.*blocked/i);
    expect(result.text).toMatch(/not observations|not.*inspection results/i);
    expect(result.actions).toEqual([]);
  });
});

describe("assistant limitations and identity safety", () => {
  it.each([
    "Tell me the actual rainfall forecast tomorrow",
    "Run SQL against the production database",
    "Evacuate everyone in this neighborhood",
    "Tell me how to open and clean this drain",
    "Why is basin CB-NOT-LOADED ranked high?",
    "Highlight SYNTHETIC-NOT-LOADED",
    "Why is basin SYNTHETIC-RH-01-extra ranked high?",
    "Highlight SYNTHETIC-RH-01-extra",
  ])("discloses unsupported request without actions: %s", (prompt) => {
    const result = run(prompt);
    checkGroundedReply(result);
    expect(result.status).toBe("unsupported");
    expect(result.actions).toEqual([]);
  });

  it("handles empty or excessive input as a local error without affecting map state", () => {
    for (const prompt of ["", " ".repeat(3), "x".repeat(2001)]) {
      const result = run(prompt);
      checkGroundedReply(result);
      expect(result.status).toBe("error");
      expect(result.actions).toEqual([]);
    }
  });

  it("highlights only the current selected fixture and accepts exact IDs case insensitively", () => {
    const state = createInitialState(snapshot);
    state.selectedBasinId = snapshot.basins[2].id;
    const selected = runDemoAssistant(
      "Highlight the selected basin",
      snapshot,
      state,
    );
    checkGroundedReply(selected);
    expect(selected.basinIds).toEqual([state.selectedBasinId]);
    const byId = run(`Highlight ${id.toLowerCase()}`);
    checkGroundedReply(byId);
    expect(byId.basinIds).toEqual([id]);
  });

  it("keeps empty fixtures honest rather than inventing requested records", async () => {
    const empty = await new LocalFixtureProvider({ mode: "empty" }).load();
    const result = run(
      "Top 10 basins to inspect in Red Hook before tomorrow's rain",
      empty,
    );
    checkGroundedReply(result, empty);
    expect(result.status).toBe("unsupported");
    expect(result.basinIds ?? []).toEqual([]);
    expect(result.actions).toEqual([]);
  });

  it("does not mutate fixture scores or provenance during scripted responses", () => {
    const before = JSON.stringify(snapshot);
    for (const prompt of [
      `Why is basin ${id} ranked high?`,
      "Switch to the extreme scenario and show the top 20",
      "Show recent flooding complaints near Gowanus",
      "Is this drain blocked?",
    ])
      checkGroundedReply(run(prompt));
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
