// @vitest-environment jsdom
// Fake-clock lifecycle tests; physical calculation validation lives in floodModel.test.ts.
import { act, cleanup, renderHook } from "@testing-library/react/pure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFloodPlayback } from "../infrastructure/useFloodPlayback";
import {
  DEFAULT_FLOOD_INPUTS,
  sampleFloodFrame,
  type FloodGeometry,
} from "../infrastructure/floodModel";

const geometry: FloodGeometry = {
  stationId: "F21",
  entranceId: "test-entrance",
  version: "test-geometry-v1",
  streetReferenceM: 0,
  entranceCompartmentId: "stairwell",
  drainageCompartmentId: "stairwell",
  compartments: [
    {
      id: "stairwell",
      kind: "stairwell",
      floorPatches: [{ floorM: -2, areaM2: 4 }],
      maxStageM: 1,
    },
  ],
  connections: [],
};
let hidden = false;
beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(document, "hidden");
});
function setup() {
  return renderHook(
    ({ shape, active }: { shape: FloodGeometry | null; active: boolean }) =>
      useFloodPlayback(shape, active),
    { initialProps: { shape: geometry as FloodGeometry | null, active: true } },
  );
}

describe("explicit deterministic flood playback lifecycle", () => {
  it("does not calculate or start a timer until explicit Run, including opening and scrubbing", () => {
    const { result } = setup();
    expect(result.current.trajectory).toBeNull();
    expect(result.current.frame).toBeNull();
    expect(result.current.showScenario).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      result.current.open();
      result.current.scrub(20);
    });
    expect(result.current.showScenario).toBe(true);
    expect(result.current.trajectory).toBeNull();
    expect(result.current.timeS).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.play());
    expect(result.current.trajectory?.stationId).toBe("F21");
    expect(result.current.trajectory?.source).toBe("HYPOTHETICAL USER INPUT");
    expect(result.current.playing).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("pause, scrub, playback speed and comparison sample one unchanged trajectory", () => {
    const { result } = setup();
    act(() => result.current.play());
    const trajectory = result.current.trajectory!;
    const bytes = JSON.stringify(trajectory);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.timeS).toBeCloseTo(30, 8);
    act(() => result.current.pause());
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.timeS).toBeCloseTo(30, 8);
    act(() => result.current.scrub(120));
    const target = result.current.frame;
    expect(target).toEqual(sampleFloodFrame(trajectory, 120));
    act(() => result.current.setSpeed(60));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.timeS).toBeCloseTo(180, 8);
    act(() => result.current.compare(true));
    expect(result.current.compareBaseline).toBe(true);
    expect(result.current.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      result.current.compare(false);
      result.current.scrub(120);
      result.current.setSpeed(1);
    });
    expect(result.current.frame).toEqual(target);
    expect(result.current.trajectory).toBe(trajectory);
    expect(JSON.stringify(trajectory)).toBe(bytes);
    act(() => result.current.setSpeed(5));
    expect(result.current.speed).toBe(1);
  });

  it("input edits invalidate prior results and Reset removes all computed water", () => {
    const { result } = setup();
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.frame!.ledger.suppliedM3).toBeGreaterThan(0);
    act(() => result.current.setInput("streetDepthM", 0.5));
    expect(result.current.inputs.streetDepthM).toBe(0.5);
    expect(result.current.trajectory).toBeNull();
    expect(result.current.frame).toBeNull();
    expect(result.current.playing).toBe(false);
    expect(result.current.timeS).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.play());
    expect(result.current.trajectory!.inputs.streetDepthM).toBe(0.5);
    act(() => result.current.reset());
    expect(result.current.trajectory).toBeNull();
    expect(result.current.frame).toBeNull();
    expect(result.current.timeS).toBe(0);
    expect(result.current.compareBaseline).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["station", { ...geometry, stationId: "F22" }],
    ["entrance", { ...geometry, entranceId: "another-entrance" }],
    ["geometry version", { ...geometry, version: "test-geometry-v2" }],
  ])("cancels old results when the %s identity changes", (_name, next) => {
    const { result, rerender } = setup();
    act(() => result.current.setInput("streetDepthM", 0.8));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(1000));
    rerender({ shape: next, active: true });
    expect(result.current.inputs).toEqual(DEFAULT_FLOOD_INPUTS);
    expect(result.current.trajectory).toBeNull();
    expect(result.current.frame).toBeNull();
    expect(result.current.showScenario).toBe(false);
    expect(result.current.timeS).toBe(0);
    expect(result.current.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.play());
    expect(result.current.trajectory?.stationId).toBe(next.stationId);
    expect(result.current.trajectory?.entranceId).toBe(next.entranceId);
    expect(result.current.trajectory?.geometryVersion).toBe(next.version);
  });

  it("pauses when hidden, prevents hidden starts, and removes the timer/listener on exit and unmount", () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const { result, rerender, unmount } = setup();
    const visibilityHandler = add.mock.calls.find(
      ([type]) => type === "visibilitychange",
    )![1];
    act(() => result.current.play());
    act(() => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const paused = result.current.timeS;
    act(() => {
      result.current.play();
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.playing).toBe(false);
    expect(result.current.timeS).toBe(paused);
    act(() => {
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.playing).toBe(false);
    act(() => result.current.play());
    rerender({ shape: geometry, active: false });
    expect(result.current.trajectory).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    rerender({ shape: geometry, active: true });
    act(() => result.current.play());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("visibilitychange", visibilityHandler);
  });

  it("stops at duration, clamps finite scrubs, and does not change the trajectory when returning to evidence", () => {
    const { result } = setup();
    act(() => result.current.setInput("durationS", 10));
    act(() => result.current.play());
    const trajectory = result.current.trajectory;
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.timeS).toBe(10);
    expect(result.current.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.scrub(-20));
    expect(result.current.timeS).toBe(0);
    act(() => result.current.scrub(9999));
    expect(result.current.timeS).toBe(10);
    act(() => result.current.scrub(Number.NaN));
    expect(result.current.timeS).toBe(10);
    act(() => result.current.evidence());
    expect(result.current.showScenario).toBe(false);
    expect(result.current.trajectory).toBe(trajectory);
    act(() => result.current.play());
    expect(result.current.timeS).toBe(0);
  });

  it("fails closed on invalid bounds or missing geometry without leaving running timers", () => {
    const { result, rerender } = setup();
    act(() => result.current.setInput("streetDepthM", 3));
    act(() => result.current.play());
    expect(result.current.error).toMatch(/streetDepthM.*within 0–2/);
    expect(result.current.trajectory).toBeNull();
    expect(result.current.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.setInput("streetDepthM", Number.NaN));
    act(() => result.current.play());
    expect(result.current.error).toMatch(/finite/);
    rerender({ shape: null, active: true });
    act(() => result.current.play());
    expect(result.current.trajectory).toBeNull();
    expect(result.current.error).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });
});
