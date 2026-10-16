// @vitest-environment jsdom
// These verify data semantics and keyboard behavior; no map/browser acceptance.
import { createElement, useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react/pure";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BackendBasin,
  BackendCollectionState,
  BackendData,
  BackendFeature,
  BackendIncident,
  BackendSourceInfo,
} from "../backend/contracts";
import {
  BackendInspector,
  BackendLegend,
  BackendSidebar,
  BackendSourcesPanel,
} from "../components/backend/BackendPanels";

afterEach(cleanup);

const source: BackendSourceInfo = {
  id: "test-source",
  name: "Test snapshot source",
  publisher: "Test publisher",
  dataset: "test-dataset",
  url: "https://example.org/source",
  cadence: "Snapshot only",
  time_semantics: "Source update and snapshot fetch are separate.",
  known_limitations: ["Test records have limited bounding-box coverage."],
  dataset_updated_at: "2026-01-01T00:00:00Z",
  fetched_at: "2026-01-03T00:00:00Z",
  last_ingested_at: "2026-01-04T00:00:00Z",
  stale: true,
};
const basin: BackendBasin = {
  type: "Feature",
  id: "catch_basin:opaque/slash:% full ID",
  geometry: { type: "Point", coordinates: [-74, 40.68] },
  properties: {
    layer: "catch_basins",
    knowledge_type: "observed",
    unitid: "test-unit",
    area_ids: ["BK0601"],
    state_plane: { x_ft: 0, y_ft: 0, crs: "EPSG:2263" },
    source: {
      id: source.id,
      dataset: source.dataset,
      record_id: "original-test-record",
      url: source.url,
      updated_at: "2026-01-02T00:00:00Z",
    },
    ingested_at: "2026-01-05T00:00:00Z",
  },
};
const incident: BackendIncident = {
  type: "Feature",
  id: "incident:opaque-report",
  geometry: null,
  properties: {
    layer: "incidents",
    knowledge_type: "reported",
    category: "catch_basin_other",
    category_label: "Original report category",
    source_status: null,
    address: null,
    reported_at: "2026-01-06T00:00:00Z",
    closed_at: null,
    source: { ...basin.properties.source, url: "javascript:alert(1)" },
    ingested_at: basin.properties.ingested_at,
    verification: {
      status: "agency_found_obstruction",
      knowledge_type: "observed",
      basis: "dep_311_resolution",
      rule: "test-rule",
      text: "<img src=x onerror=alert(1)> Original source resolution.",
      at: "2026-01-07T00:00:00Z",
    },
    linked_basin: {
      id: basin.id,
      distance_ft: 0,
      method: "test-nearest",
      knowledge_type: "inferred",
    },
    source_fields: {
      agency: "TEST",
      complaint_type: "Original type",
      descriptor: 0,
    },
  },
};

function collection<F extends BackendFeature>(
  features: F[],
): BackendCollectionState<F> {
  return {
    features,
    status: features.length ? "ready" : "empty",
    error: null,
    partial: false,
    stale: true,
    generatedAt: "2026-01-08T00:00:00Z",
    sources: [source],
    filters: { since: "2026-01-01T00:00:00Z", until: "2026-10-16T00:00:00Z" },
    pages: 1,
  };
}
function data(): BackendData {
  return {
    health: {
      api_version: "1.0",
      status: "degraded",
      build: "test-build",
      db: { status: "ok", mode: "embedded" },
      sources: [source],
      integrations: { bedrock: false },
    },
    layers: [],
    sources: [source],
    metadataStatus: "ready",
    metadataError: null,
    basins: collection([basin]),
    incidents: collection([incident]),
  };
}
const layers = {
  basins: true,
  complaints: true,
  buildings: true,
  floodZones: false,
};

describe("backend record semantics and source rendering", () => {
  it("separates report, agency finding and inferred association while retaining zero/null and exact timestamps", () => {
    const view = render(
      createElement(BackendInspector, {
        detail: {
          kind: "incident",
          id: incident.id,
          status: "ready",
          feature: incident,
          error: null,
        },
        data: data(),
        onRetryDetail: vi.fn(),
        onClose: vi.fn(),
        onFocus: vi.fn(),
      }),
    );
    expect(screen.getByText("REPORTED / HISTORICAL")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "OBSERVED AGENCY FINDING" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "INFERRED BASIN ASSOCIATION" }),
    ).toBeTruthy();
    expect(screen.getByText("0 ft")).toBeTruthy();
    expect(
      screen.getByText(/Location unavailable · off-map record/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Focus on selected backend record",
      }),
    ).toBeNull();
    expect(
      screen.getByText(incident.properties.verification.text!),
    ).toBeTruthy();
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("a")).toBeNull();
    for (const stamp of [
      source.dataset_updated_at,
      source.fetched_at,
      source.last_ingested_at,
      basin.properties.source.updated_at,
      basin.properties.ingested_at,
      incident.properties.reported_at,
      incident.properties.verification.at,
      data().incidents.generatedAt,
    ])
      expect(screen.getAllByText(stamp!).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("renders observed inventory without scores or a present-condition conclusion", () => {
    render(
      createElement(BackendInspector, {
        detail: {
          kind: "basin",
          id: basin.id,
          status: "ready",
          feature: basin,
          error: null,
        },
        data: data(),
        onRetryDetail: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(screen.getByRole("heading", { name: basin.id })).toBeTruthy();
    expect(screen.getByText("OBSERVED / STATIC INVENTORY")).toBeTruthy();
    expect(
      screen.getByText(/does not establish present condition/),
    ).toBeTruthy();
    expect(screen.getByText("0 ft / 0 ft · EPSG:2263")).toBeTruthy();
    expect(screen.queryByText("/ 100")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Open original source record" })
        .getAttribute("href"),
    ).toBe(source.url);
  });

  it("keeps detail errors visible and retryable without manufacturing a record", () => {
    const retry = vi.fn();
    render(
      createElement(BackendInspector, {
        detail: {
          kind: "basin",
          id: "missing-full-id",
          status: "error",
          feature: null,
          error: "Record not found in snapshot.",
        },
        data: data(),
        onRetryDetail: retry,
        onClose: vi.fn(),
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain("Record not found");
    fireEvent.click(screen.getByRole("button", { name: "Retry record" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByText("OBSERVED / STATIC INVENTORY")).toBeNull();
  });
});

describe("backend panels and keyboard state", () => {
  it("labels retained partial stale subsets and preserves the full ID through selection and detail lookup", () => {
    const current = data();
    current.basins = {
      ...current.basins,
      status: "error",
      error: "Local backend unavailable",
      partial: true,
    };
    const select = vi.fn();
    render(
      createElement(BackendSidebar, {
        modeSelector: createElement("span", null, "Mode control"),
        data: current,
        layers,
        onLayer: vi.fn(),
        onSelect: select,
        onRefresh: vi.fn(),
        onSources: vi.fn(),
      }),
    );
    expect(screen.getByText(/Backend health: DEGRADED/)).toBeTruthy();
    expect(screen.getByText(/PARTIAL \/ TRUNCATED SUBSET/)).toBeTruthy();
    expect(screen.getByText(/Last loaded subset retained/)).toBeTruthy();
    expect(screen.getByText(/1 location unavailable \/ off map/)).toBeTruthy();
    expect(screen.getByText(/unavailable in this snapshot view/)).toBeTruthy();
    expect(
      screen
        .getByRole("switch", { name: "Catch basin inventory" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp("catch_basin:opaque") }),
    );
    expect(select).toHaveBeenLastCalledWith("basin", basin.id);
    fireEvent.click(screen.getByText("Open a known full record ID"));
    const fullId = " incident:raw/% ID ";
    fireEvent.change(screen.getByLabelText("Record type"), {
      target: { value: "incident" },
    });
    fireEvent.change(screen.getByLabelText("Full opaque ID"), {
      target: { value: fullId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open record" }));
    expect(select).toHaveBeenLastCalledWith("incident", fullId);
  });

  it("pins backend metadata recovery in Sources and returns keyboard focus after Escape", () => {
    const current = data();
    current.metadataStatus = "error";
    current.metadataError = "Backend stopped. No fixture substitution.";
    const retry = vi.fn();
    function SourcesHarness() {
      const [open, setOpen] = useState(false);
      return createElement(
        "div",
        null,
        createElement(
          "button",
          { onClick: () => setOpen(true) },
          "Open sources",
        ),
        open &&
          createElement(BackendSourcesPanel, {
            data: current,
            onRefresh: retry,
            onClose: () => setOpen(false),
          }),
      );
    }
    render(createElement(SourcesHarness));
    const trigger = screen.getByRole("button", { name: "Open sources" });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole("button", { name: "Close backend sources" });
    expect(document.activeElement).toBe(close);
    const error = screen.getByRole("alert");
    expect(error.closest(".sources-scroll")).toBeNull();
    expect(error.closest(".backend-pinned-status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry backend" }));
    expect(retry).toHaveBeenCalledOnce();
    close.focus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(
      screen.queryByRole("heading", { name: "Backend sources & freshness" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("uses inventory/report/stale symbols without exposing fixture priority bands", () => {
    render(createElement(BackendLegend, { data: data(), layers }));
    expect(screen.getByText("Observed inventory · no condition")).toBeTruthy();
    expect(
      screen.getByText("Reported incidents · not current proof"),
    ).toBeTruthy();
    expect(screen.getByText("Dimmed: stale source snapshot")).toBeTruthy();
    expect(screen.queryByText(/Inspection priority/)).toBeNull();
    const toggle = screen.getByRole("button", { name: "SNAPSHOT MAP LEGEND" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Observed inventory · no condition")).toBeNull();
  });
});
