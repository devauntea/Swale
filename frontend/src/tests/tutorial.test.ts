// @vitest-environment jsdom
import { createElement, useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react/pure";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tutorial } from "../tutorial/Tutorial";
import {
  readProgress,
  saveProgress,
  steps,
  TOUR_KEY,
  TOUR_VERSION,
} from "../tutorial/model";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
function mount() {
  const show = vi.fn(() => "Local UI action only"),
    end = vi.fn();
  function Harness() {
    const [active, setActive] = useState(false);
    return createElement(Tutorial, {
      active,
      onStart: () => setActive(true),
      onEnd: (restore) => {
        end(restore);
        setActive(false);
      },
      onShow: show,
    });
  }
  render(createElement(Harness));
  return { show, end };
}
describe("guided tutorial", () => {
  it("dismisses invitation without starting and keeps entry available", () => {
    mount();
    fireEvent.click(screen.getByText("Maybe Later"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(readProgress().dismissed).toBe(true);
    expect(screen.getByText("How to Use Swale")).toBeTruthy();
  });
  it("walks all ten steps, supports back and optional practice, completes without automatic actions", () => {
    const { show, end } = mount();
    fireEvent.click(screen.getByText("Take the Tour"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    for (let i = 1; i < steps.length; i++)
      fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(show).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByRole("heading", { name: steps[8].title })).toBeTruthy();
    fireEvent.click(screen.getByText("Show Me"));
    expect(show).toHaveBeenCalledWith("briefing");
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    fireEvent.click(screen.getByText("Finish Tour"));
    expect(end).toHaveBeenCalledWith(false);
    expect(readProgress().completed).toBe(true);
  });
  it("closes with Escape, resumes saved step, restarts, and skips with restoration", () => {
    const { end } = mount();
    fireEvent.click(screen.getByText("Take the Tour"));
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(end).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText("How to Use Swale"));
    fireEvent.click(screen.getByText("Resume tour"));
    expect(screen.getByRole("heading", { name: steps[1].title })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close tutorial"));
    fireEvent.click(screen.getByText("How to Use Swale"));
    fireEvent.click(screen.getByText("Restart tour"));
    expect(screen.getByRole("heading", { name: steps[0].title })).toBeTruthy();
    fireEvent.click(screen.getByText("Skip Tour"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("rejects stale, malformed and out-of-range saved steps", () => {
    for (const value of [
      "bad",
      JSON.stringify({
        version: 0,
        step: 2,
        dismissed: true,
        completed: false,
      }),
      JSON.stringify({
        version: TOUR_VERSION,
        step: 99,
        dismissed: true,
        completed: false,
      }),
    ]) {
      localStorage.setItem(TOUR_KEY, value);
      expect(readProgress().step).toBe(0);
    }
  });
  it("survives unavailable storage and absent anchors", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() =>
      saveProgress({
        version: TOUR_VERSION,
        step: 2,
        dismissed: true,
        completed: false,
      }),
    ).not.toThrow();
    mount();
    fireEvent.click(screen.getByText("Take the Tour"));
    expect(screen.getByText(/This control is hidden/)).toBeTruthy();
    fireEvent.click(screen.getByText("Retry highlight"));
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
