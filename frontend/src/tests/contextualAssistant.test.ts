// @vitest-environment jsdom
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react/pure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContextualAssistantPanel,
  type ContextualAssistantProps,
} from "../contextual/ContextualAssistantPanel";
import { ContextualClient } from "../backend/contextualClient";
import type { ContextReply, ContextRequest } from "../contextual/contracts";
const station = (id: string): ContextRequest => ({
  kind: "station",
  id: `subway_station:${id}`,
  state_version: `selection-${id}`,
  view_scope: "overview",
  water_view: "normal",
});
const response = (
  context: ContextRequest,
  transcript: string,
): ContextReply => ({
  id: "a".repeat(32),
  context_key: "b".repeat(64),
  context,
  subject: {
    id: context.id,
    station_id: context.id,
    geometry: { type: "Point", coordinates: [-73.995, 40.68] },
  },
  transcript,
  original_transcript: transcript,
  source: "template",
  language: "en",
  evidence: [],
  actions: [],
  limitations: ["Interior water is unknown."],
  created_at: "2026-10-16T20:00:00Z",
  expires_at: "2099-10-16T20:10:00Z",
  error: null,
  translation: { configured: ["en", "es"], available: ["en"], verified: false },
  audio: { ready: false, url: null },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.useFakeTimers();
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const props = (context: ContextRequest | null): ContextualAssistantProps => ({
  context,
  onAction: vi.fn(),
  autoCamera: true,
  onAutoCameraChange: vi.fn(),
  movementEnabled: true,
  onMovementChange: vi.fn(),
});
describe("selected context request, narration and lifecycle ownership", () => {
  it("forwards a related navigation series in one transaction rather than executing an intermediate stale state", async () => {
    const client = new ContextualClient();
    const actions = [
      { type: "select_station" as const, station_id: "subway_station:F21" },
      { type: "set_view" as const, view_scope: "station_exploration" as const },
    ];
    vi.spyOn(client, "agent").mockImplementation(async (_prompt, context) => ({
      ...response(context, "Selected station tour."),
      source: "model",
      actions,
    }));
    const onActions = vi.fn(),
      settings = props(station("F21"));
    render(
      createElement(ContextualAssistantPanel, {
        ...settings,
        onActions,
        client,
        open: true,
        onClose: vi.fn(),
      }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Explore Carroll Street in normal view." },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Send contextual message" }),
      ),
    );
    expect(onActions).toHaveBeenCalledWith(actions);
    expect(onActions).toHaveBeenCalledTimes(1);
    expect(settings.onAction).not.toHaveBeenCalled();
  });
  it("discovers device voices, speaks only a matching validated transcript on Play and cancels on locale change", async () => {
    const speech = {
      getVoices: vi.fn(() => [
        {
          name: "Local English",
          voiceURI: "local-en",
          lang: "en-US",
          localService: true,
          default: true,
        },
        {
          name: "Remote Spanish",
          voiceURI: "remote-es",
          lang: "es-ES",
          localService: false,
          default: false,
        },
      ]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      speak: vi.fn<(value: SpeechSynthesisUtterance) => void>(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    class Utterance {
      text: string;
      voice: SpeechSynthesisVoice | null = null;
      lang = "";
      onstart: (() => void) | null = null;
      onpause: (() => void) | null = null;
      onresume: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("speechSynthesis", speech);
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    const client = new ContextualClient();
    const transcript = `${"F21 hypothetical snapshot, not measured current water. ".repeat(12)}Final caveat: no safe route is established.`;
    vi.spyOn(client, "briefing").mockImplementation(async (context) =>
      response(context, transcript),
    );
    const remoteAudio = vi.spyOn(client, "audio");
    const view = render(
      createElement(ContextualAssistantPanel, {
        ...props(station("F21")),
        client,
        open: true,
        onClose: vi.fn(),
      }),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Generate selected briefing" }),
      ),
    );
    expect(speech.getVoices).toHaveBeenCalled();
    expect(speech.speak).not.toHaveBeenCalled();
    expect(
      screen.getByRole("option", { name: /Local English.*local device/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("option", { name: /Remote Spanish.*remote browser/ }),
    ).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Briefing voice" }), {
      target: { value: "local-en" },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Play briefing" })),
    );
    expect(remoteAudio).not.toHaveBeenCalled();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    const spoken: string[] = [];
    await act(async () => {
      let call = 0;
      while (call < speech.speak.mock.calls.length) {
        const utterance = speech.speak.mock.calls[
          call++
        ][0] as unknown as Utterance;
        spoken.push(utterance.text);
        utterance.onstart?.();
        utterance.onend?.();
      }
    });
    expect(spoken.join("")).toBe(transcript);
    expect(
      screen.getByRole("button", { name: "Replay briefing" }),
    ).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Replay briefing" })),
    );
    await act(async () =>
      (speech.speak.mock.calls.at(-1)![0] as unknown as Utterance).onstart?.(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause audio" }));
    expect(speech.pause).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Resume audio" }));
    expect(speech.resume).toHaveBeenCalledTimes(1);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Briefing language" }),
      { target: { value: "es" } },
    );
    expect(speech.cancel).toHaveBeenCalled();
    expect(
      screen.getByRole("option", {
        name: /Remote Spanish.*remote browser service/,
      }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Play briefing",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    view.unmount();
    expect(speech.removeEventListener).toHaveBeenCalledWith(
      "voiceschanged",
      expect.any(Function),
    );
  });
  it("never calls a provider automatically, rejects obsolete selection responses and does not autoplay", async () => {
    const a = deferred<ContextReply>(),
      b = deferred<ContextReply>();
    const client = new ContextualClient();
    const briefing = vi
      .spyOn(client, "briefing")
      .mockImplementation((context) =>
        context.id.endsWith("F21") ? a.promise : b.promise,
      );
    const audio = vi.spyOn(client, "audio");
    const agent = vi.spyOn(client, "agent");
    const view = render(
      createElement(ContextualAssistantPanel, {
        ...props(null),
        client,
        open: true,
        onClose: vi.fn(),
      }),
    );
    view.rerender(
      createElement(ContextualAssistantPanel, {
        ...props(station("F21")),
        client,
        open: true,
        onClose: vi.fn(),
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(301);
    });
    expect(briefing.mock.calls[0].slice(0, 3)).toEqual([
      station("F21"),
      "en",
      false,
    ]);
    const firstSignal = briefing.mock.calls[0][3]!;
    view.rerender(
      createElement(ContextualAssistantPanel, {
        ...props(station("F22")),
        client,
        open: true,
        onClose: vi.fn(),
      }),
    );
    expect(firstSignal.aborted).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(301);
      b.resolve(response(station("F22"), "F22 exact-context evidence."));
    });
    expect(screen.getByText("F22 exact-context evidence.")).toBeTruthy();
    await act(async () => {
      a.resolve(response(station("F21"), "Obsolete F21 response."));
    });
    expect(screen.queryByText("Obsolete F21 response.")).toBeNull();
    expect(audio).not.toHaveBeenCalled();
    expect(agent).not.toHaveBeenCalled();
  });
  it("replaces automatic selection templates without adding them to explicit conversation history", async () => {
    const client = new ContextualClient();
    vi.spyOn(client, "briefing").mockImplementation(async (context) => ({
      ...response(context, `${context.id} automatic evidence.`),
      id: context.id.endsWith("F21") ? "a".repeat(32) : "b".repeat(32),
    }));
    const view = render(
      createElement(ContextualAssistantPanel, {
        ...props(null),
        client,
        open: true,
        onClose: vi.fn(),
      }),
    );
    view.rerender(
      createElement(ContextualAssistantPanel, {
        ...props(station("F21")),
        client,
        open: true,
        onClose: vi.fn(),
      }),
    );
    await act(async () => vi.advanceTimersByTime(301));
    expect(
      screen.getByText("subway_station:F21 automatic evidence."),
    ).toBeTruthy();
    view.rerender(
      createElement(ContextualAssistantPanel, {
        ...props(station("F22")),
        client,
        open: true,
        onClose: vi.fn(),
      }),
    );
    await act(async () => vi.advanceTimersByTime(301));
    expect(
      screen.queryByText("subway_station:F21 automatic evidence."),
    ).toBeNull();
    expect(
      screen.getByText("subway_station:F22 automatic evidence."),
    ).toBeTruthy();
    expect(screen.getAllByText("CURRENT SELECTION")).toHaveLength(1);
  });
  it("submits genuine model requests only on Send and validates actions against the current context", async () => {
    const client = new ContextualClient();
    vi.spyOn(client, "briefing").mockImplementation(async (context) =>
      response(context, "Template evidence."),
    );
    const agent = vi
      .spyOn(client, "agent")
      .mockImplementation(async (_prompt, context) => ({
        ...response(context, "Guarded model evidence."),
        source: "model",
        actions: [
          { type: "set_view", view_scope: "station_exploration" },
          { type: "play_briefing" },
        ],
      }));
    const audio = vi.spyOn(client, "audio");
    const settings = props(station("F21"));
    render(
      createElement(ContextualAssistantPanel, {
        ...settings,
        client,
        open: true,
        onClose: vi.fn(),
      }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Explore this station" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Send contextual message" }),
      );
    });
    expect(agent).toHaveBeenCalledWith(
      "Explore this station",
      station("F21"),
      "en",
      true,
      expect.any(AbortSignal),
    );
    expect(settings.onAction).toHaveBeenCalledWith({
      type: "set_view",
      view_scope: "station_exploration",
    });
    expect(settings.onAction).toHaveBeenCalledTimes(1);
    expect(audio).not.toHaveBeenCalled();
    expect(screen.getByText("Guarded model evidence.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Play this briefing" }),
    ).toBeTruthy();
  });
  it("locale changes cancel a pending response and require translation before audio", async () => {
    const client = new ContextualClient();
    const pending = deferred<ContextReply>();
    const agent = vi.spyOn(client, "agent").mockReturnValue(pending.promise);
    const translate = vi.spyOn(client, "translate");
    render(
      createElement(ContextualAssistantPanel, {
        ...props(station("F21")),
        client,
        open: true,
        onClose: vi.fn(),
      }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Explain" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send contextual message" }),
    );
    const signal = agent.mock.calls[0][4]!;
    fireEvent.change(
      screen.getByRole("combobox", { name: "Briefing language" }),
      { target: { value: "es" } },
    );
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve(response(station("F21"), "Late English explanation.")),
    );
    expect(screen.queryByText("Late English explanation.")).toBeNull();
    expect(translate).not.toHaveBeenCalled();
  });
});
