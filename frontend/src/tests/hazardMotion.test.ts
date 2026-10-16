// @vitest-environment jsdom
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react/pure";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useHazardMotionPreference,
  useHazardPulse,
} from "../map/useHazardPulse";
import { HAZARD_ANIMATION_STORAGE_KEY } from "../map/hazards";
import { HazardMotionControl } from "../components/controls/HazardMotionControl";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("hazard motion ownership and accessibility", () => {
  it("persists pause state and exposes the correct usable button state", () => {
    const onChange = vi.fn();
    render(createElement(HazardMotionControl, { paused: false, onChange }));
    const button = screen.getByRole("button", {
      name: "Pause hazard animation",
    });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith(true);
    const hook = renderHook(useHazardMotionPreference);
    act(() => hook.result.current[1](true));
    expect(localStorage.getItem(HAZARD_ANIMATION_STORAGE_KEY)).toBe("true");
    hook.unmount();
    expect(renderHook(useHazardMotionPreference).result.current[0]).toBe(true);
  });
  it("owns one bounded interval and cleans it on pause and unmount", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const hook = renderHook(({ enabled }) => useHazardPulse(enabled), {
      initialProps: { enabled: true },
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(100));
    expect(hook.result.current).toBeGreaterThan(0);
    hook.rerender({ enabled: false });
    expect(hook.result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    hook.rerender({ enabled: true });
    expect(vi.getTimerCount()).toBe(1);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("creates no animation clock while hidden or reduced-motion is requested", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const hidden = renderHook(() => useHazardPulse(true));
    expect(vi.getTimerCount()).toBe(0);
    hidden.unmount();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const reduced = renderHook(() => useHazardPulse(true));
    expect(reduced.result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    reduced.unmount();
    vi.unstubAllGlobals();
  });
});
