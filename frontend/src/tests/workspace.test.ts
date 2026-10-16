// @vitest-environment jsdom
// Isolated DOM unit tests. No browser, WebGL, preview URL or resource access.
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react/pure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/App";
import { LocalFixtureProvider } from "../data/providers/LocalFixtureProvider";
import type { ProviderRefreshResult } from "../types";

const map = vi.hoisted(() => ({ fail: false }));
vi.mock("../map/SwaleMap", () => ({
  default: (props: Record<string, unknown>) => {
    if (map.fail) throw new Error("Map module render failure");
    return createElement("div", {
      "data-testid": "map-double",
      "data-theme": props.theme,
      "data-scenario": props.scenarioId,
      "data-selection": props.selectedBasinId,
      "data-highlights": JSON.stringify(props.highlightedIds),
      "data-camera": JSON.stringify(props.cameraRequest),
      "data-layers": JSON.stringify(props.layers),
    });
  },
}));

beforeEach(() => {
  map.fail = false;
  document.documentElement.dataset.theme = "light";
  localStorage.clear();
  // jsdom has no layout/scroll implementation; this does not test scrolling.
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openWorkspace() {
  render(createElement(App), { reactStrictMode: true });
  return screen.findByTestId("map-double");
}

describe("workspace DOM behavior (map renderer replaced)", () => {
  it("moves focus into sources, closes with Escape and returns focus to its trigger", async () => {
    await openWorkspace();
    const trigger = screen.getByRole("button", {
      name: "Data sources and demonstration settings",
    });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close data sources" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(
      screen.queryByRole("heading", { name: "Sources & freshness" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("ignores an older refresh result after provider settings change", async () => {
    await openWorkspace();
    const oldResult = await new LocalFixtureProvider().refresh();
    let finish!: (result: ProviderRefreshResult) => void;
    vi.spyOn(LocalFixtureProvider.prototype, "refresh").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Refresh workspace/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Data sources and demonstration settings",
      }),
    );
    fireEvent.change(screen.getByLabelText("Forecast example"), {
      target: { value: "stale" },
    });
    await screen.findByText("STALE example · source times retained");
    await act(async () => {
      finish(oldResult);
    });
    expect(
      screen.getByText("STALE example · source times retained"),
    ).toBeTruthy();
    expect(screen.queryByText(oldResult.message)).toBeNull();
  });

  it("preserves map state and assistant history across theme and panel changes", async () => {
    const renderer = await openWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Extreme2080/ }));
    const before = ["selection", "scenario", "layers", "camera"].map((key) =>
      renderer.getAttribute(`data-${key}`),
    );
    vi.useFakeTimers();
    const launcher = screen.getByRole("button", {
      name: "Open Swale assistant",
    });
    launcher.focus();
    fireEvent.click(launcher);
    const input = screen.getByRole("textbox", {
      name: "Ask the demonstration assistant",
    });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Is this drain blocked?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Preparing local example…")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    const log = screen.getByRole("log");
    expect(within(log).getByText("Is this drain blocked?")).toBeTruthy();
    const history = log.textContent;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).toBe(launcher);
    fireEvent.click(screen.getByRole("button", { name: "Dark mode" }));
    expect(renderer.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("swale.theme")).toBe("dark");
    fireEvent.click(launcher);
    expect(screen.getByRole("log").textContent).toBe(history);
    expect(
      ["selection", "scenario", "layers", "camera"].map((key) =>
        renderer.getAttribute(`data-${key}`),
      ),
    ).toEqual(before);
  });

  it("reveals selected basin details when an assistant result is selected", async () => {
    await openWorkspace();
    vi.useFakeTimers();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Swale assistant" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Priorities in Red Hook/ }),
    );
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    const result = within(screen.getByRole("log")).getAllByRole("button")[0];
    const id = result.textContent!.match(/SYNTHETIC-[A-Z]+-\d+/)![0];
    fireEvent.click(result);
    expect(
      screen
        .getByRole("button", { name: "Open Swale assistant" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      within(
        screen.getByRole("complementary", { name: "Selected basin inspector" }),
      ).getByRole("heading", { name: id }),
    ).toBeTruthy();
  });

  it("exposes mobile controls state and closes them with Escape", async () => {
    await openWorkspace();
    const trigger = screen.getByRole("button", { name: "Planning controls" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(
      screen.getByRole("complementary", { name: "Planning controls" }),
      { key: "Escape" },
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("opens controls above a closed assistant and returns focus after queue selection", async () => {
    await openWorkspace();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Swale assistant" }),
    );
    const trigger = screen.getByRole("button", { name: "Planning controls" });
    fireEvent.click(trigger);
    expect(
      screen
        .getByRole("button", { name: "Open Swale assistant" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    const queue = within(
      screen.getByRole("complementary", { name: "Planning controls" }),
    ).getAllByRole("button", { name: /^Select SYNTHETIC-/ })[0];
    queue.focus();
    fireEvent.click(queue);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("retains the workspace when the lazy map component throws", async () => {
    map.fail = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(createElement(App));
    await screen.findByText("City map unavailable");
    expect(
      screen.getByRole("complementary", { name: "Planning controls" }),
    ).toBeTruthy();
    expect(screen.getByText("MAP UNAVAILABLE")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Swale assistant" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Ask the demonstration assistant" }),
    ).toBeTruthy();
    expect(errors).toHaveBeenCalled();
  });
});
