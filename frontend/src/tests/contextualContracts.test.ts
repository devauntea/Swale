import { describe, expect, it } from "vitest";
import {
  contextIdentity,
  parseContextAction,
  parseContextReply,
  parseContextRequest,
  sameContext,
  type ContextReply,
  type ContextRequest,
} from "../contextual/contracts";
import { isApprovedBackendRequest } from "../backend/routes";
const context: ContextRequest = {
  kind: "station",
  id: "subway_station:F21",
  state_version: "selection-1",
  view_scope: "overview",
  water_view: "normal",
  snapshot: {
    station_id: "subway_station:F21",
    entrance_id: "model_entrance:row-one",
    scenario_id: "local-example",
    model_version: "storage-v1",
    elapsed_seconds: 600,
    fingerprint: "station-example-600",
    inputs: { ponding_m: 0.5, removal_lps: 2 },
    results: { landing_m: 0.2 },
  },
};
function result(): ContextReply {
  return {
    id: "a".repeat(32),
    context_key: "b".repeat(64),
    context,
    subject: {
      id: context.id,
      station_id: context.id,
      geometry: { type: "Point", coordinates: [-73.995, 40.68] },
    },
    transcript:
      "Current interior water is unknown. The selected 600 second snapshot is hypothetical.",
    original_transcript:
      "Current interior water is unknown. The selected 600 second snapshot is hypothetical.",
    language: "en",
    source: "template",
    actions: [],
    evidence: [
      {
        id: "e1",
        subject_id: context.id,
        source_id: "local-example",
        type: "SCENARIO",
        url: null,
        source_time: null,
        fetched_at: null,
        stale: null,
        text: "Client hypothetical scenario, not observed water.",
      },
    ],
    limitations: ["Not calibrated flooding."],
    created_at: "2026-10-16T20:00:00Z",
    expires_at: "2099-10-16T20:10:00Z",
    error: null,
    translation: {
      configured: ["en", "es"],
      available: ["en"],
      verified: false,
    },
    audio: { ready: false, url: null },
  };
}

describe("contextual request and action boundary", () => {
  it("keeps a hypothetical snapshot and normalized backend nulls without relying on property order", () => {
    const reversed = {
      ...context,
      station_id: null,
      snapshot: {
        ...context.snapshot,
        inputs: { removal_lps: 2, ponding_m: 0.5 },
      },
    };
    expect(sameContext(context, parseContextRequest(reversed))).toBe(true);
    expect(contextIdentity(context)).not.toBe(
      contextIdentity({ ...context, water_view: "flood_simulation" }),
    );
    expect(
      parseContextReply({ ...result(), context: reversed }, context).context,
    ).toEqual(parseContextRequest(context));
  });
  it("rejects snapshots for a stale subject or incompatible seek and unsafe audio URLs", () => {
    expect(() =>
      parseContextReply(result(), { ...context, id: "subway_station:F22" }),
    ).toThrow();
    expect(() =>
      parseContextReply(result(), {
        ...context,
        snapshot: { ...context.snapshot!, elapsed_seconds: 601 },
      }),
    ).toThrow();
    expect(() =>
      parseContextReply(
        {
          ...result(),
          audio: { ready: true, url: "https://outside.invalid/audio" },
        },
        context,
      ),
    ).toThrow();
    expect(() =>
      parseContextRequest({
        ...context,
        run_id: "backend-run-is-not-local-scenario",
      }),
    ).toThrow();
  });
  it("permits the exact local model provenance document while rejecting arbitrary local links", () => {
    const reply = result();
    expect(
      parseContextReply({
        ...reply,
        evidence: [{ ...reply.evidence[0], url: "/infrastructure/index.json" }],
      }).evidence[0].url,
    ).toBe("/infrastructure/index.json");
    expect(() =>
      parseContextReply({
        ...reply,
        evidence: [{ ...reply.evidence[0], url: "/api/v1/admin/reset" }],
      }),
    ).toThrow();
  });
  it("rejects unrelated subject geometry/evidence and missing original English instead of silently accepting drift", () => {
    const reply = result();
    expect(() =>
      parseContextReply({
        ...reply,
        subject: { ...reply.subject, id: "subway_station:F22" },
      }),
    ).toThrow();
    expect(() =>
      parseContextReply({
        ...reply,
        evidence: [{ ...reply.evidence[0], subject_id: "subway_station:F22" }],
      }),
    ).toThrow();
    expect(() =>
      parseContextReply({
        ...reply,
        subject: {
          ...reply.subject,
          geometry: { type: "Point", coordinates: [500, 100] },
        },
      }),
    ).toThrow();
    expect(() =>
      parseContextReply({
        ...reply,
        original_transcript: undefined,
        language: "es",
      }),
    ).toThrow();
  });
  it.each([
    { type: "eval", code: "arbitrary code" },
    {
      type: "fly_to",
      target_id: "subway_station:F21",
      coordinates: [-74, 40.6],
    },
    { type: "set_layers", layers: { privateService: true } },
    { type: "seek_simulation", elapsed_seconds: 1801 },
    {
      type: "highlight",
      ids: Array.from({ length: 21 }, (_, i) => `basin:${i}`),
    },
    { type: "select_station", station_id: "javascript:alert(1)" },
  ])("fails closed for unsupported action %j", (action) =>
    expect(() => parseContextAction(action)).toThrow(),
  );
  it("admits bounded navigation commands without accepting source text as authority", () => {
    expect(
      parseContextAction({
        type: "set_view",
        view_scope: "station_exploration",
      }),
    ).toEqual({ type: "set_view", view_scope: "station_exploration" });
    expect(parseContextAction({ type: "highlight", ids: [] })).toEqual({
      type: "highlight",
      ids: [],
    });
    expect(() =>
      parseContextReply({
        ...result(),
        actions: [{ type: "shell", command: "anything" }],
      }),
    ).toThrow();
  });
  it("admits only exact contextual routes/methods without widening legacy mutation access", () => {
    for (const path of [
      "/api/v1/context/agent",
      "/api/v1/context/briefings",
      `/api/v1/context/briefings/${"a".repeat(32)}/translations`,
      `/api/v1/context/briefings/${"a".repeat(32)}/audio`,
    ])
      expect(isApprovedBackendRequest("POST", path)).toBe(true);
    for (const [method, path] of [
      ["POST", "/api/v1/briefings"],
      ["DELETE", `/api/v1/context/briefings/${"a".repeat(32)}`],
      ["POST", "/api/v1/context/agent?use_model=true"],
      ["POST", "/api/v1/context/agent/"],
      ["GET", "/api/v1/context/agent"],
      ["POST", "/api/v1/admin/reset"],
    ])
      expect(isApprovedBackendRequest(method, path)).toBe(false);
  });
});
