// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react/pure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MascotCarry } from "../contextual/MascotCarry";
import type { ProjectedMascotTarget } from "../contextual/carry";
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("mascot carry cancellation and map anchor lifecycle", () => {
  const dock = { x: 900, y: 700 };
  const target = (key: string, moving = false): ProjectedMascotTarget => ({
    key,
    x: key === "A" ? 500 : 650,
    y: 350,
    visible: true,
    label: key,
    moving,
  });
  it("waits for initial projection, shows one attached character, and retargets without queuing old drops", async () => {
    const phases = vi.fn();
    const view = render(
      createElement(MascotCarry, {
        selectionKey: "A",
        target: null,
        dock,
        movementEnabled: true,
        onPhaseChange: phases,
      }),
    );
    await act(async () => vi.advanceTimersByTime(20));
    expect(
      view.container
        .querySelector(".mascot-travel")
        ?.getAttribute("data-docked"),
    ).toBe("true");
    view.rerender(
      createElement(MascotCarry, {
        selectionKey: "A",
        target: target("A", true),
        dock,
        movementEnabled: true,
        onPhaseChange: phases,
      }),
    );
    await act(async () => vi.advanceTimersByTime(450));
    expect(
      view.container
        .querySelector(".mascot-travel")
        ?.getAttribute("data-phase"),
    ).toBe("lifting");
    const before = (
      view.container.querySelector(".mascot-travel") as HTMLElement
    ).style.transform;
    view.rerender(
      createElement(MascotCarry, {
        selectionKey: "B",
        target: target("B", true),
        dock,
        movementEnabled: true,
        onPhaseChange: phases,
      }),
    );
    await act(async () => vi.advanceTimersByTime(20));
    expect(
      (view.container.querySelector(".mascot-travel") as HTMLElement).style
        .transform,
    ).toBe(before);
    await act(async () => vi.advanceTimersByTime(3000));
    expect(
      view.container
        .querySelector(".mascot-travel")
        ?.getAttribute("data-phase"),
    ).toBe("carrying");
    expect(view.container.querySelectorAll(".swale-mascot")).toHaveLength(1);
    view.rerender(
      createElement(MascotCarry, {
        selectionKey: "B",
        target: target("B"),
        dock,
        movementEnabled: true,
        onPhaseChange: phases,
      }),
    );
    await act(async () => vi.advanceTimersByTime(900));
    expect(
      view.container
        .querySelector(".mascot-travel")
        ?.getAttribute("data-phase"),
    ).toBe("explaining");
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("honors the device reduced-motion preference even while the map is moving", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const view = render(
      createElement(MascotCarry, {
        selectionKey: "A",
        target: target("A", true),
        dock,
        movementEnabled: true,
      }),
    );
    await act(async () => vi.advanceTimersByTime(20));
    expect(
      view.container
        .querySelector(".mascot-travel")
        ?.getAttribute("data-phase"),
    ).toBe("explaining");
    expect(
      (view.container.querySelector(".mascot-carry-hand") as SVGElement).style
        .opacity,
    ).toBe("0");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("updates a returning visible anchor after resize without replaying pickup for the same selection", async () => {
    const view = render(
      createElement(MascotCarry, {
        selectionKey: "A",
        target: target("A"),
        dock,
        movementEnabled: true,
      }),
    );
    await act(async () => vi.advanceTimersByTime(2500));
    view.rerender(
      createElement(MascotCarry, {
        selectionKey: "A",
        target: { ...target("A"), visible: false },
        dock,
        movementEnabled: true,
      }),
    );
    await act(async () => vi.advanceTimersByTime(20));
    view.rerender(
      createElement(MascotCarry, {
        selectionKey: "A",
        target: target("A", true),
        dock,
        movementEnabled: true,
      }),
    );
    await act(async () => vi.advanceTimersByTime(20));
    expect(
      view.container
        .querySelector(".mascot-travel")
        ?.getAttribute("data-phase"),
    ).toBe("explaining");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("manual interruption and reduced motion settle without retaining a hand or restarting on camera updates", async () => {
    const view = render(
      createElement(MascotCarry, {
        selectionKey: "A",
        target: target("A", true),
        dock,
        movementEnabled: true,
        interrupted: 0,
      }),
    );
    await act(async () => vi.advanceTimersByTime(650));
    view.rerender(
      createElement(MascotCarry, {
        selectionKey: "A",
        target: target("A", true),
        dock,
        movementEnabled: true,
        interrupted: 1,
      }),
    );
    await act(async () => vi.advanceTimersByTime(20));
    expect(
      view.container
        .querySelector(".mascot-travel")
        ?.getAttribute("data-phase"),
    ).toBe("explaining");
    expect(
      (view.container.querySelector(".mascot-carry-hand") as SVGElement).style
        .opacity,
    ).toBe("0");
    view.rerender(
      createElement(MascotCarry, {
        selectionKey: "A",
        target: target("A"),
        dock,
        movementEnabled: true,
        interrupted: 1,
      }),
    );
    await act(async () => vi.advanceTimersByTime(2500));
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(
      createElement(MascotCarry, {
        selectionKey: "B",
        target: target("B", true),
        dock,
        movementEnabled: false,
        interrupted: 1,
      }),
    );
    await act(async () => vi.advanceTimersByTime(20));
    expect(
      view.container
        .querySelector(".mascot-travel")
        ?.getAttribute("data-phase"),
    ).toBe("explaining");
    expect(vi.getTimerCount()).toBe(0);
  });
});
