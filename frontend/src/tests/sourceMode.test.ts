// @vitest-environment jsdom
// Workspace DOM regression with map/network doubles, not browser acceptance.
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
import { emptyBackendData } from "../backend/provider";

vi.mock("../map/SwaleMap", () => ({
  default: (props: Record<string, unknown>) =>
    createElement("div", {
      "data-testid": "mode-map-double",
      "data-backend": !!props.backend,
      "data-scenario": props.scenarioId,
      "data-selection": props.selectedBasinId,
      "data-camera": JSON.stringify(props.cameraRequest),
      "data-layers": JSON.stringify(props.layers),
    }),
}));
vi.mock("../backend/useBackendData", () => ({
  useBackendData: () => ({
    data: {
      ...emptyBackendData(),
      metadataStatus: "error",
      metadataError: "Local backend is disconnected.",
    },
    detail: {
      kind: null,
      id: null,
      feature: null,
      status: "idle",
      error: null,
    },
    refresh: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    retryDetail: vi.fn(),
  }),
}));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function open() {
  render(createElement(App), { reactStrictMode: true });
  return screen.findByTestId("mode-map-double");
}
function mode(value: "fixture" | "backend") {
  fireEvent.change(screen.getByRole("combobox", { name: "Data mode" }), {
    target: { value },
  });
}

describe("explicit data modes (isolated DOM)", () => {
  it("defaults to fixtures and preserves the mounted map, fixture scenario, layers and selection across a disconnected backend visit", async () => {
    const map = await open();
    expect(
      (screen.getByLabelText("Data mode") as HTMLSelectElement).value,
    ).toBe("fixture");
    fireEvent.click(screen.getByRole("button", { name: /Extreme2080/ }));
    fireEvent.click(screen.getByRole("switch", { name: "311 complaints" }));
    const prior = ["scenario", "selection", "camera", "layers"].map((key) =>
      map.getAttribute(`data-${key}`),
    );
    mode("backend");
    expect(screen.getByTestId("mode-map-double")).toBe(map);
    expect(map.getAttribute("data-backend")).toBe("true");
    expect(map.getAttribute("data-selection")).toBeNull();
    expect(map.getAttribute("data-camera")).toBe("null");
    const sidebar = screen.getByRole("complementary", {
      name: "Planning controls",
    });
    expect(
      within(sidebar).getByText("Local backend is disconnected."),
    ).toBeTruthy();
    expect(
      within(sidebar).getByText("Fixture data has not been substituted."),
    ).toBeTruthy();
    expect(
      within(sidebar).queryByRole("button", { name: /Extreme2080/ }),
    ).toBeNull();
    expect(within(sidebar).queryByText("EXAMPLE INSPECTION QUEUE")).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Data mode"));
    mode("fixture");
    expect(screen.getByTestId("mode-map-double")).toBe(map);
    expect(
      ["scenario", "selection", "camera", "layers"].map((key) =>
        map.getAttribute(`data-${key}`),
      ),
    ).toEqual(prior);
  });

  it("cancels a pending fixture command, disables backend script controls and retains fixture history", async () => {
    const map = await open();
    vi.useFakeTimers();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Swale assistant" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Switch to extreme/ }));
    mode("backend");
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    const suggestion = screen.getByRole("button", {
      name: /Switch to extreme/,
    }) as HTMLButtonElement;
    expect(suggestion.disabled).toBe(true);
    expect(
      (
        screen.getByLabelText(
          "Ask the demonstration assistant",
        ) as HTMLTextAreaElement
      ).readOnly,
    ).toBe(true);
    expect(screen.getByText(/Fixture history only/)).toBeTruthy();
    expect(
      within(screen.getByRole("log")).getByText(
        "Switch to the extreme scenario and show the top 20",
      ),
    ).toBeTruthy();
    mode("fixture");
    expect(map.getAttribute("data-scenario")).toBe("moderate_current");
    fireEvent.keyDown(
      screen.getByLabelText("Ask the demonstration assistant"),
      { key: "Escape" },
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open Swale assistant" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open Swale assistant" }),
    );
    expect(
      within(screen.getByRole("log")).getByText(
        "Switch to the extreme scenario and show the top 20",
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /Switch to extreme/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
