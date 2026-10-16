// @vitest-environment jsdom
// DOM/hook integration only. Map geometry appearance and native keyboard behavior need browser QA.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react/pure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntranceExperience } from "../infrastructure/EntranceExperience";
import { useFloodPlayback } from "../infrastructure/useFloodPlayback";
import { buildEntranceDetail } from "../infrastructure/entranceGeometry";
import { parseEntranceCatalog } from "../infrastructure/entranceCatalog";
import {
  parseInfrastructureChunk,
  parseInfrastructureManifest,
} from "../infrastructure/contracts";

const asset = (path: string): unknown =>
  JSON.parse(
    readFileSync(resolve(process.cwd(), "public/infrastructure", path), "utf8"),
  );
const catalog = parseEntranceCatalog(asset("entrance-details.json"));
const manifest = parseInfrastructureManifest(asset("index.json"));
const sourceId = "row-y4aj-tepy-nbif";
interface HarnessProps {
  stationId?: string;
  entranceId?: string;
  sourceType?: string;
  status?: string;
  error?: string;
  empty?: boolean;
  active?: boolean;
}
const handlers = {
  onRetry: vi.fn(),
  onSelect: vi.fn(),
  onFocus: vi.fn(),
  onComponent: vi.fn(),
};
function Harness({
  stationId = "F21",
  entranceId = sourceId,
  sourceType,
  status = "ready",
  error = "",
  empty = false,
  active = true,
}: HarnessProps) {
  const station = manifest.stations.find((item) => item.id === stationId)!;
  const cached = catalog.entrances.find((item) => item.id === entranceId)!;
  const source = sourceType ? { ...cached, type: sourceType } : cached;
  const chunk = parseInfrastructureChunk(
    asset(`stations/${stationId}.json`),
    stationId,
  );
  const detail = empty ? null : buildEntranceDetail(station, chunk, source);
  const playback = useFloodPlayback(detail?.floodGeometry ?? null, active);
  // Match App's station-only key so changing an entrance preserves selector focus.
  return createElement(EntranceExperience, {
    key: station.id,
    station,
    entrances: empty ? [] : [source],
    selectedId: empty ? null : source.id,
    detail,
    status,
    error,
    ...handlers,
    selectedComponentId: null,
    playback,
    evidence: createElement(
      "div",
      null,
      createElement(
        "section",
        { className: "station-evidence-current" },
        "Existing current official evidence",
      ),
      createElement(
        "section",
        { className: "station-evidence-history" },
        "Existing historical exposure evidence",
      ),
    ),
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => false,
  });
  Object.values(handlers).forEach((handler) => handler.mockReset());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(document, "hidden");
});
const openScenario = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "What-if flood simulation" }),
  );
const run = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Run illustrative scenario" }),
  );

describe("entrance what-if controls and explicit evidence boundary", () => {
  it("resets A → B → A to Current evidence without remounting or moving source-selector focus", () => {
    const other = catalog.entrances.find(
      (item) =>
        item.gtfsStopId === "F21" &&
        item.type === "Stair" &&
        item.id !== sourceId,
    )!;
    const intervals = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const { rerender } = render(createElement(Harness));
    const selector = screen.getByRole("combobox", {
      name: "Source-linked entrance",
    });
    openScenario();
    run();
    const firstTimer = intervals.mock.results.at(-1)!.value;
    selector.focus();
    rerender(createElement(Harness, { entranceId: other.id }));
    expect(
      screen.getByRole("combobox", { name: "Source-linked entrance" }),
    ).toBe(selector);
    expect(document.activeElement).toBe(selector);
    expect((selector as HTMLSelectElement).value).toBe(other.id);
    expect(
      screen
        .getByRole("button", { name: "Current evidence" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("table")).toBeNull();
    expect(clearInterval).toHaveBeenCalledWith(firstTimer);
    openScenario();
    run();
    const secondTimer = intervals.mock.results.at(-1)!.value;
    selector.focus();
    rerender(createElement(Harness, { entranceId: sourceId }));
    expect(
      screen.getByRole("combobox", { name: "Source-linked entrance" }),
    ).toBe(selector);
    expect(document.activeElement).toBe(selector);
    expect((selector as HTMLSelectElement).value).toBe(sourceId);
    expect(
      screen
        .getByRole("button", { name: "Current evidence" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("table")).toBeNull();
    expect(clearInterval).toHaveBeenCalledWith(secondTimer);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("requires a deliberate view and Run before calculation, with source identity and bounded assumption labels", () => {
    const { container } = render(createElement(Harness));
    expect(screen.getByText("Existing current official evidence")).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    openScenario();
    expect(screen.getByText("HYPOTHETICAL · LOCAL CALCULATION")).toBeTruthy();
    expect(
      screen.getByText(
        "Illustrative what-if model — not calibrated station flooding.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/All defaults below are illustrative user assumptions/)
        .textContent,
    ).toContain(sourceId);
    for (const name of [
      "Assumed street ponding (m)",
      "Assumed threshold / barrier (m)",
      "Assumed inflow capacity (L/s)",
      "Assumed removal capacity (L/s)",
      "Scenario duration (s)",
    ]) {
      expect(screen.getByRole("spinbutton", { name })).toBeTruthy();
    }
    const depth = screen.getByRole("spinbutton", {
      name: "Assumed street ponding (m)",
    }) as HTMLInputElement;
    expect(depth.value).toBe("0.35");
    expect(depth.min).toBe("0");
    expect(depth.max).toBe("2");
    expect(screen.getByRole("slider").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("table")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(container.querySelector("[data-evidence-view]")).toBeNull();
    run();
    expect(
      screen.getByRole("table", {
        name: "Computed hypothetical storage · SI units",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Simulation time is separate from source\/feed time/),
    ).toBeTruthy();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("pause, scrub, speed and baseline/scenario controls preserve the computed trajectory", () => {
    render(createElement(Harness));
    openScenario();
    run();
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(vi.getTimerCount()).toBe(0);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(Number(slider.value)).toBeCloseTo(30, 8);
    fireEvent.change(slider, { target: { value: "200" } });
    const scenarioState = screen.getByRole("table").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Baseline geometry" }));
    expect(
      screen
        .getByRole("button", { name: "Baseline geometry" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("table").textContent).toBe(scenarioState);
    fireEvent.click(screen.getByRole("button", { name: "Scenario water" }));
    fireEvent.change(screen.getByLabelText("Playback speed"), {
      target: { value: "60" },
    });
    expect(screen.getByRole("table").textContent).toBe(scenarioState);
    fireEvent.click(screen.getByRole("button", { name: "Play / resume" }));
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(Number(slider.value)).toBeCloseTo(260, 8);
    fireEvent.change(slider, { target: { value: "200" } });
    expect(screen.getByRole("table").textContent).toBe(scenarioState);
    expect(screen.getByText(/not an observed dry station/)).toBeTruthy();
  });

  it("input changes invalidate results and reset/return preserves entrance identity with current evidence", () => {
    const { container } = render(createElement(Harness));
    openScenario();
    run();
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.change(
      screen.getByRole("spinbutton", {
        name: "Assumed removal capacity (L/s)",
      }),
      { target: { value: "4" } },
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("slider").hasAttribute("disabled")).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    run();
    fireEvent.click(screen.getByRole("button", { name: "Reset water" }));
    expect(screen.queryByRole("table")).toBeNull();
    run();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Reset and return to current evidence",
      }),
    );
    expect(
      screen
        .getByRole("button", { name: "Current evidence" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container.querySelector('[data-evidence-view="current"]'),
    ).toBeTruthy();
    expect(screen.getByText("Existing current official evidence")).toBeTruthy();
    expect(
      (screen.getByLabelText("Source-linked entrance") as HTMLSelectElement)
        .value,
    ).toBe(sourceId);
    expect(screen.queryByRole("table")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps source/type identity and routes stage/component controls to the existing owner", () => {
    render(createElement(Harness));
    expect(screen.getByText(/S4 \/ 2024 inventory/).textContent).toContain(
      sourceId,
    );
    fireEvent.change(screen.getByLabelText("Source-linked entrance"), {
      target: { value: sourceId },
    });
    expect(handlers.onSelect).toHaveBeenCalledWith(sourceId);
    for (const [name, stage] of [
      ["Station overview", "overview"],
      ["1 · Entrance", "entrance"],
      ["2 · Stairwell", "stairwell"],
      ["3 · Landing", "landing"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(handlers.onFocus).toHaveBeenCalledWith(stage);
    }
    const select = screen.getByLabelText(
      "Select detail component",
    ) as HTMLSelectElement;
    const component = select.options[1].value;
    fireEvent.change(select, { target: { value: component } });
    expect(handlers.onComponent).toHaveBeenCalledWith(component);
    fireEvent.click(screen.getByRole("button", { name: "Exposure & history" }));
    expect(
      screen
        .getByRole("button", { name: "Exposure & history" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not substitute stairs or enable a scenario for an elevator/unsupported source type", () => {
    render(createElement(Harness, { sourceType: "Elevator" }));
    expect(
      screen
        .getByRole("button", { name: "What-if flood simulation" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByText(/Detailed stairs are unavailable for this source type/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "Entrance inspection stages" }),
    ).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows bounded calculation failures and can recover after correcting an assumption", () => {
    render(createElement(Harness));
    openScenario();
    const depth = screen.getByRole("spinbutton", {
      name: "Assumed street ponding (m)",
    });
    fireEvent.change(depth, { target: { value: "3" } });
    run();
    expect(screen.getByRole("alert").textContent).toMatch(
      /streetDepthM.*within 0–2/,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.change(depth, { target: { value: "0.4" } });
    expect(screen.queryByRole("alert")).toBeNull();
    run();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("clears the old scenario and returns to current evidence when the keyed station changes", () => {
    const { rerender } = render(createElement(Harness));
    openScenario();
    run();
    act(() => vi.advanceTimersByTime(1000));
    rerender(
      createElement(Harness, {
        stationId: "F22",
        entranceId: "row-9vic.hxit~q3uv",
      }),
    );
    expect(
      screen
        .getByRole("button", { name: "Current evidence" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("table")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByText(/GTFS F22/)).toBeTruthy();
    openScenario();
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Run illustrative scenario" }),
    ).toBeTruthy();
  });

  it("retains honest loading/error/empty states and delegates retries", () => {
    const { rerender } = render(
      createElement(Harness, {
        status: "loading",
        error: "Asset HTTP 404",
        empty: true,
      }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Loading cached entrance types",
    );
    expect(screen.getByRole("alert").textContent).toContain("Asset HTTP 404");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry entrance inventory" }),
    );
    expect(handlers.onRetry).toHaveBeenCalledOnce();
    rerender(createElement(Harness, { empty: true }));
    expect(
      screen.getByText(
        "No matched source entrances are available for this station.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "What-if flood simulation" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
