import { describe, expect, it, vi } from "vitest";
import type {
  BackendBasin,
  BackendCollectionState,
  BackendData,
  BackendFeature,
  BackendIncident,
} from "../backend/contracts";
import {
  boundedPulsingIds,
  hazardPresentation,
  MAX_PULSING_HAZARDS,
} from "../map/hazards";
import {
  backendMapLayers,
  hazardIcon,
  hazardMarkers,
} from "../map/backendHazardLayers";

const now = Date.parse("2026-10-16T18:00:00Z");
function report(
  id = "incident:test",
  category = "catch_basin_clogged",
): BackendIncident {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [-73.99, 40.68] },
    properties: {
      layer: "incidents",
      knowledge_type: "reported",
      category,
      category_label: "Source category",
      reported_at: "2026-10-16T17:00:00Z",
      closed_at: null,
      source_status: "Open",
      address: null,
      verification: {
        status: "unverified",
        knowledge_type: "reported",
        basis: null,
        rule: null,
        text: null,
        at: null,
      },
      linked_basin: {
        id: "catch_basin:nearby",
        distance_ft: 25,
        method: "nearest",
        knowledge_type: "inferred",
      },
      source: {
        id: "source:test",
        dataset: "test",
        record_id: id,
        url: null,
        updated_at: null,
      },
      ingested_at: "2026-10-16T17:30:00Z",
    },
  };
}
function collection<T extends BackendFeature>(
  features: T[] = [],
): BackendCollectionState<T> {
  return {
    features,
    status: "ready",
    error: null,
    partial: false,
    stale: false,
    generatedAt: "2026-10-16T17:30:00Z",
    filters: {},
    pages: 1,
    sources: [
      {
        id: "source:test",
        dataset_updated_at: null,
        last_ingested_at: "2026-10-16T17:30:00Z",
        fetched_at: "2026-10-16T17:15:00Z",
        stale: false,
      },
    ],
  };
}

describe("source-qualified hazard semantics", () => {
  it("never promotes observed inventory or an inferred nearby link to an obstruction", () => {
    const basin: BackendBasin = {
      type: "Feature",
      id: "catch_basin:nearby",
      geometry: report().geometry,
      properties: {
        layer: "catch_basins",
        knowledge_type: "observed",
        unitid: "nearby",
        area_ids: [],
        state_plane: null,
        source: report().properties.source,
        ingested_at: "2026-10-16T17:30:00Z",
      },
    };
    expect(hazardPresentation(basin, collection(), now)).toMatchObject({
      state: "inventory",
      pulseEligible: false,
    });
    expect(hazardPresentation(report(), collection(), now)).toMatchObject({
      state: "active_report",
      kind: "drain",
      pulseEligible: true,
    });
    expect(hazardPresentation(report(), collection(), now).label).toContain(
      "unverified",
    );
  });
  it("keeps administrative closure and dated field findings static without claiming cleaning", () => {
    const closed = report();
    closed.properties.closed_at = "2026-10-16T17:20:00Z";
    const presentation = hazardPresentation(closed, collection(), now);
    expect(presentation.state).toBe("historical");
    expect(presentation.pulseEligible).toBe(false);
    expect(presentation.label).toContain("does not establish cleaning");
    const finding = report();
    finding.properties.verification = {
      ...finding.properties.verification,
      status: "agency_found_obstruction",
      knowledge_type: "observed",
      at: "2026-10-16T17:20:00Z",
    };
    expect(hazardPresentation(finding, collection(), now)).toMatchObject({
      state: "dated_finding",
      pulseEligible: false,
    });
    expect(hazardPresentation(finding, collection(), now).label).toContain(
      "current condition unknown",
    );
  });
  it("fails static for uncertain status, freshness, future/missing clocks and unrelated categories", () => {
    const f = report();
    f.properties.source_status = null;
    expect(hazardPresentation(f, collection(), now).pulseEligible).toBe(false);
    for (const fetched_at of [
      null,
      "2026-10-14T18:00:00Z",
      "2026-10-17T18:00:00Z",
    ]) {
      const c = collection();
      c.sources[0].fetched_at = fetched_at;
      expect(hazardPresentation(report(), c, now).pulseEligible).toBe(false);
    }
    const c = collection();
    c.sources[0].stale = true;
    expect(hazardPresentation(report(), c, now).pulseEligible).toBe(false);
    const old = report();
    old.properties.reported_at = "2025-01-01T00:00:00Z";
    expect(hazardPresentation(old, collection(), now)).toMatchObject({
      state: "historical",
      pulseEligible: false,
    });
    expect(
      hazardPresentation(report("other", "street_flooding"), collection(), now)
        .pulseEligible,
    ).toBe(false);
  });
  it("uses the 311 badge for complaints at valid points across themes", () => {
    const drain = report(),
      pothole = report("incident:pothole", "pothole");
    const d = hazardMarkers([drain], collection(), null, 17, now)[0];
    const p = hazardMarkers([pothole], collection(), null, 17, now)[0];
    expect(hazardIcon(d, "light", false).url).toBe(
      hazardIcon(p, "light", false).url,
    );
    expect(hazardIcon(d, "light", false).url).toBe(
      "/markers/complaint-311.svg",
    );
    const invalid = report();
    invalid.geometry = null;
    expect(hazardMarkers([invalid], collection(), null, 17, now)).toEqual([]);
    expect(hazardIcon(d, "dark", true).url).toBe(
      hazardIcon(d, "dark", false).url,
    );
  });
  it("bounds simultaneous pulses, separates nearby halos and prioritizes selection", () => {
    const reports = Array.from({ length: 40 }, (_, i) => {
      const r = report(`incident:${i}`);
      r.geometry!.coordinates = [-73.99 + i * 0.002, 40.68];
      return r;
    });
    const ids = boundedPulsingIds(reports, collection(), "incident:39", now);
    expect(ids.size).toBe(MAX_PULSING_HAZARDS);
    expect(ids.has("incident:39")).toBe(true);
    for (const r of reports) r.geometry!.coordinates = [-73.99, 40.68];
    expect([
      ...boundedPulsingIds(reports, collection(), "incident:39", now),
    ]).toEqual(["incident:39"]);
  });
  it("groups dense markers without inventing a location or hiding selected identity", () => {
    const reports = Array.from({ length: 20 }, (_, i) =>
      report(`incident:${i}`),
    );
    const markers = hazardMarkers(
      reports,
      collection(),
      "incident:19",
      13,
      now,
    );
    expect(markers).toHaveLength(2);
    expect(markers.map((marker) => marker.count).sort((a, b) => a - b)).toEqual(
      [1, 19],
    );
    expect(
      markers.some(
        (marker) => marker.feature.id === "incident:19" && marker.count === 1,
      ),
    ).toBe(true);
    expect(
      markers.every((marker) =>
        reports.some((report) => report === marker.feature),
      ),
    ).toBe(true);
    expect(markers.reduce((count, marker) => count + marker.count, 0)).toBe(
      reports.length,
    );
    expect(hazardMarkers(reports, collection(), null, 17.99, now)).toHaveLength(
      1,
    );
    expect(hazardMarkers(reports, collection(), null, 18, now)).toHaveLength(
      reports.length,
    );
  });
  it("keeps icons pickable with halos static, and preserves full opaque source IDs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const r = report("incident:opaque:α%25");
      const data: BackendData = {
        health: null,
        layers: [],
        sources: [],
        metadataStatus: "ready",
        metadataError: null,
        basins: collection<BackendBasin>(),
        incidents: collection([r]),
      };
      const picked = vi.fn(),
        tooltip = vi.fn();
      const result = backendMapLayers(
        data,
        { basins: true, complaints: true },
        r.id,
        "light",
        undefined,
        picked,
        tooltip,
        0,
        17,
      );
      const icon = result.find(
        (layer) => layer.id === "swale-backend-incident",
      )!;
      const datum = [...(icon.props.data as Iterable<unknown>)][0];
      (icon.props.onClick as Function)({ object: datum });
      expect(picked).toHaveBeenCalledWith("incident", r.id);
      (icon.props.onHover as Function)({ object: datum, x: 1, y: 2 });
      expect(tooltip.mock.calls[0][0].context).toContain(
        "association is inferred",
      );
      expect(icon.props.pickable).toBe(true);
      const halo = result.find((layer) =>
        layer.id.endsWith("incident-report-halos"),
      )!;
      expect(halo.props.pickable).toBe(false);
      expect([...(halo.props.data as Iterable<unknown>)]).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
