import { describe, expect, it, vi } from "vitest";
import { ContextualClient } from "../backend/contextualClient";
import type { ContextRequest } from "../contextual/contracts";
const context: ContextRequest = {
  kind: "station",
  id: "subway_station:F21",
  state_version: "one",
  view_scope: "overview",
  water_view: "normal",
};
const result = {
  id: "a".repeat(32),
  context_key: "b".repeat(64),
  context,
  subject: {
    id: context.id,
    station_id: context.id,
    geometry: {
      type: "Point" as const,
      coordinates: [-73.995, 40.68] as [number, number],
    },
  },
  transcript: "Current interior water is unknown.",
  original_transcript: "Current interior water is unknown.",
  source: "model",
  language: "en",
  evidence: [],
  actions: [{ type: "set_view", view_scope: "overview" }],
  limitations: ["Schematic geometry."],
  created_at: "2026-10-16T20:00:00Z",
  expires_at: "2026-10-16T20:10:00Z",
  error: null,
  translation: { configured: ["en", "es"], available: ["en"], verified: false },
  audio: { ready: false, url: null },
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
describe("bounded contextual client", () => {
  it("uses only the same-origin explicit route with omitted credentials and no automatic retry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(result));
    const client = new ContextualClient(fetcher);
    expect(
      (await client.agent("Explain this station.", context, "en", true)).source,
    ).toBe("model");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/v1/context/agent");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      prompt: "Explain this station.",
      context,
      language: "en",
      use_model: true,
    });
  });
  it("rejects response identity drift, arbitrary actions and oversized bodies", async () => {
    for (const value of [
      { ...result, context: { ...context, id: "subway_station:F22" } },
      { ...result, actions: [{ type: "eval", code: "untrusted" }] },
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(value));
      await expect(
        new ContextualClient(fetcher).agent("Explain", context, "en", false),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("a", {
        headers: {
          "content-type": "application/json",
          "content-length": "600000",
        },
      }),
    );
    await expect(
      new ContextualClient(fetcher).agent("Explain", context, "en", false),
    ).rejects.toThrow("size limit");
  });
  it("rejects an English response for an explicitly requested Spanish agent or briefing", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json(result));
    const client = new ContextualClient(fetcher);
    await expect(
      client.agent("Explica", context, "es", true),
    ).rejects.toThrow();
    await expect(client.briefing(context, "es", true)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("prepares speech only on explicit audio call and returns binary from its exact id", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ready: true }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([73, 68, 51]), {
          headers: { "content-type": "audio/mpeg" },
        }),
      );
    const client = new ContextualClient(fetcher);
    const audio = await client.audio({
      ...result,
      source: "model",
      language: "en",
      actions: [],
      translation: { configured: ["en"], available: ["en"], verified: false },
      audio: { ready: false, url: null },
    });
    expect(audio.size).toBe(3);
    expect(
      fetcher.mock.calls.map(([url, init]) => [url, init?.method]),
    ).toEqual([
      [`/api/v1/context/briefings/${result.id}/audio`, "POST"],
      [`/api/v1/context/briefings/${result.id}/audio`, "GET"],
    ]);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({
      user_intent: true,
    });
  });
});
