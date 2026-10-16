// Pure layer-prop and callback checks, not WebGL/rendering/browser acceptance.
import { describe, expect, it, vi } from "vitest";
import { transitMapLayers } from "../map/transitLayers";
import {
  emptyTransitCollection,
  emptyTransitData,
} from "../backend/useTransitData";
import type {
  TransitData,
  TransitStation,
  TransitEntrance,
  TransitExposure,
  TransitZone,
  TransitLayerVisibility,
} from "../backend/transitContracts";
const source = {
  id: "test-mta",
  dataset: null,
  record_id: "opaque",
  url: null,
  updated_at: null,
};
const station: TransitStation = {
  type: "Feature",
  id: "subway_station:TEST opaque:%",
  geometry: { type: "Point", coordinates: [-74.001, 40.69] },
  properties: {
    layer: "subway_stations",
    knowledge_type: "observed",
    gtfs_stop_id: "TEST",
    name: "Test station",
    routes: ["F"],
    line: null,
    structure: null,
    ada: 0,
    complex_id: null,
    source,
  },
};
const entrance: TransitEntrance = {
  type: "Feature",
  id: "subway_entrance:TEST:full-ID",
  geometry: { type: "Point", coordinates: [-74.0011, 40.6901] },
  properties: {
    layer: "subway_entrances",
    knowledge_type: "observed",
    station_id: station.id,
    station_name: "Test station",
    routes: ["F"],
    entrance_type: null,
    entry_allowed: true,
    exit_allowed: false,
    source,
  },
};
const exposure: TransitExposure = {
  type: "Feature",
  id: "station_exposure:TEST",
  geometry: station.geometry,
  properties: {
    layer: "station_flood_exposure",
    knowledge_type: "inferred",
    station_id: station.id,
    name: "Test station",
    routes: ["F"],
    rank: 1,
    score: 50,
    tier: "high",
    method_version: "station-exposure-v1",
    assessed_at: "2026-10-16T14:00:00Z",
    run_id: null,
    entrances: 1,
    factors: [],
    missing_factors: [],
    live: null,
    caveats: ["Not present flooding"],
  },
};
const zone: TransitZone = {
  type: "Feature",
  id: "zone:TEST⟨full⟩",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-74.002, 40.689],
        [-74.002, 40.691],
        [-74, 40.691],
        [-74.002, 40.689],
      ],
    ],
  },
  properties: {
    layer: "danger_zones",
    zone_type: "dep_mapped",
    knowledge_type: "predicted",
    level: "high",
    assumes: "NYC DEP Moderate2.13in/hr/current sea level",
    explanation: "Model geometry",
    evidence_ids: ["flood_map_feature:TEST"],
    entrance_count: 1,
    entrances: [
      {
        entrance_id: entrance.id,
        station_id: station.id,
        station_name: "Test station",
        routes: ["F"],
      },
    ],
  },
};
const visibility: TransitLayerVisibility = {
  stations: true,
  entrances: true,
  exposure: true,
  zones: true,
};
function data(): TransitData {
  return {
    ...emptyTransitData(),
    stations: {
      ...emptyTransitCollection<TransitStation>(),
      features: [station],
    },
    entrances: {
      ...emptyTransitCollection<TransitEntrance>(),
      features: [entrance],
    },
    exposures: {
      ...emptyTransitCollection<TransitExposure>(),
      features: [exposure],
    },
    zones: { ...emptyTransitCollection<TransitZone>(), features: [zone] },
  };
}
function layers(
  current = data(),
  visible = visibility,
  selected = {
    stationId: null as string | null,
    entranceId: null as string | null,
    zoneId: null as string | null,
  },
) {
  const pick = vi.fn(),
    tooltip = vi.fn();
  const result = transitMapLayers(
    current,
    visible,
    selected,
    "light",
    "test-label-layer",
    pick,
    tooltip,
  );
  const props = (id: string) => {
    const layer = result.find((layer) => layer.id === id);
    expect(layer).toBeTruthy();
    return layer!.props as unknown as Record<string, unknown>;
  };
  const call = (id: string, field: string, item: unknown) =>
    (props(id)[field] as (item: unknown) => unknown)(item);
  return { result, props, call, pick, tooltip };
}
describe("transit map layer contracts (no renderer)", () => {
  it("dims each stale collection independently without changing its source geometry or severity", () => {
    const current = data();
    current.stations.stale = true;
    current.entrances.stale = true;
    current.exposures.stale = true;
    current.zones.stale = true;
    const before = JSON.stringify(current);
    const { props } = layers(current);
    for (const id of [
      "swale-transit-stations",
      "swale-transit-entrances",
      "swale-transit-inferred-exposure",
      "swale-transit-inferred-exposure-context",
      "swale-transit-danger-zones",
      "swale-transit-derived-buffer-outline",
    ])
      expect(props(id).opacity).toBe(0.55);
    expect(JSON.stringify(current)).toBe(before);
    current.stations.stale = false;
    const independent = layers(current);
    expect(independent.props("swale-transit-stations").opacity).toBe(1);
    expect(independent.props("swale-transit-entrances").opacity).toBe(0.55);
  });
  it("retains canonical point/polygon geometry and leaves input features unchanged", () => {
    const current = data(),
      before = JSON.stringify(current);
    const { call, props } = layers(current);
    expect(call("swale-transit-stations", "getPosition", station)).toBe(
      station.geometry!.coordinates,
    );
    expect(call("swale-transit-entrances", "getPosition", entrance)).toBe(
      entrance.geometry!.coordinates,
    );
    const polygon = (
      props("swale-transit-danger-zones").data as {
        zone: TransitZone;
        polygon: number[][][];
      }[]
    )[0];
    expect(call("swale-transit-danger-zones", "getPolygon", polygon)).toBe(
      zone.geometry!.coordinates,
    );
    expect(polygon.zone).toBe(zone);
    expect(JSON.stringify(current)).toBe(before);
  });
  it("passes exact full IDs for station, entrance, exposure and zone picking", () => {
    const { call, pick, props } = layers();
    expect(call("swale-transit-stations", "onClick", { object: station })).toBe(
      true,
    );
    expect(pick).toHaveBeenLastCalledWith("station", station.id);
    expect(
      call("swale-transit-entrances", "onClick", { object: entrance }),
    ).toBe(true);
    expect(pick).toHaveBeenLastCalledWith("entrance", entrance.id);
    expect(
      call("swale-transit-inferred-exposure", "onClick", { object: exposure }),
    ).toBe(true);
    expect(pick).toHaveBeenLastCalledWith("station", station.id);
    const polygon = (props("swale-transit-danger-zones").data as unknown[])[0];
    expect(
      call("swale-transit-danger-zones", "onClick", { object: polygon }),
    ).toBe(true);
    expect(pick).toHaveBeenLastCalledWith("zone", zone.id);
    expect(call("swale-transit-stations", "onClick", { object: null })).toBe(
      false,
    );
  });
  it("keeps area exposure rings non-pickable until their station inventory is loaded", () => {
    const current = data();
    current.stations.features = [];
    const { props, call, pick } = layers(current);
    expect(props("swale-transit-inferred-exposure").data).toEqual([]);
    expect(props("swale-transit-inferred-exposure-context").data).toEqual([
      exposure,
    ]);
    expect(props("swale-transit-inferred-exposure-context").pickable).toBe(
      false,
    );
    expect(
      call("swale-transit-inferred-exposure-context", "onClick", {
        object: exposure,
      }),
    ).toBe(false);
    expect(pick).not.toHaveBeenCalled();
  });
  it("filters null/nonfinite points before deck accessors and omits null zone geometry", () => {
    const current = data();
    current.stations.features.push(
      { ...station, id: "null-station", geometry: null },
      {
        ...station,
        id: "invalid-station",
        geometry: { type: "Point", coordinates: [NaN, 40.69] },
      },
    );
    current.entrances.features.push(
      { ...entrance, id: "null-entrance", geometry: null },
      {
        ...entrance,
        id: "invalid-entrance",
        geometry: { type: "Point", coordinates: [-74, Infinity] },
      },
    );
    current.exposures.features.push(
      { ...exposure, id: "null-exposure", geometry: null },
      {
        ...exposure,
        id: "invalid-exposure",
        geometry: { type: "Point", coordinates: [181, 40] },
      },
    );
    current.zones.features.push({ ...zone, id: "null-zone", geometry: null });
    const { props } = layers(current);
    expect(props("swale-transit-stations").data).toEqual([station]);
    expect(props("swale-transit-entrances").data).toEqual([entrance]);
    expect(props("swale-transit-inferred-exposure").data).toEqual([exposure]);
    expect(props("swale-transit-danger-zones").data).toHaveLength(1);
  });
  it("applies independent visibility to every transit and derived-outline layer", () => {
    const { props } = layers(data(), {
      stations: false,
      entrances: true,
      exposure: false,
      zones: false,
    });
    expect(props("swale-transit-stations").visible).toBe(false);
    expect(props("swale-transit-entrances").visible).toBe(true);
    expect(props("swale-transit-inferred-exposure").visible).toBe(false);
    expect(props("swale-transit-inferred-exposure-context").visible).toBe(
      false,
    );
    expect(props("swale-transit-danger-zones").visible).toBe(false);
    expect(props("swale-transit-derived-buffer-outline").visible).toBe(false);
  });
  it("distinguishes high/moderate zone outlines and selection without altering source level values", () => {
    const moderate = {
      ...zone,
      id: "zone:moderate",
      properties: { ...zone.properties, level: "moderate" as const },
    };
    const current = data();
    current.zones.features.push(moderate);
    const { props, call } = layers(current, visibility, {
      stationId: station.id,
      entranceId: entrance.id,
      zoneId: moderate.id,
    });
    const records = props("swale-transit-danger-zones").data as {
      zone: TransitZone;
    }[];
    expect(
      call(
        "swale-transit-danger-zones",
        "getLineWidth",
        records.find((r) => r.zone === zone),
      ),
    ).toBe(2);
    expect(
      call(
        "swale-transit-danger-zones",
        "getLineWidth",
        records.find((r) => r.zone === moderate),
      ),
    ).toBe(4);
    const unselected = layers(current);
    expect(
      unselected.call(
        "swale-transit-danger-zones",
        "getLineWidth",
        records.find((r) => r.zone === moderate),
      ),
    ).toBe(1);
    expect(call("swale-transit-stations", "getRadius", station)).toBe(11);
    expect(call("swale-transit-entrances", "getRadius", entrance)).toBe(7);
    expect(moderate.properties.level).toBe("moderate");
  });
  it("labels measured-zone buffers as derived and carries canonical evidence through hover", () => {
    const current = data();
    const measured: TransitZone = {
      ...zone,
      id: "zone:measured",
      properties: {
        ...zone.properties,
        zone_type: "measured",
        knowledge_type: "observed",
        explanation: "250ft sensor buffer",
      },
    };
    current.zones.features = [measured];
    const { props, call, tooltip } = layers(current);
    const polygon = (props("swale-transit-danger-zones").data as unknown[])[0];
    call("swale-transit-danger-zones", "onHover", {
      object: polygon,
      x: 30,
      y: 40,
    });
    expect(tooltip).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: measured.id,
        context: "Derived 250 ft sensor buffer · not measured flood extent",
      }),
    );
    expect(
      (props("swale-transit-derived-buffer-outline").data as unknown[]).length,
    ).toBeGreaterThan(0);
    expect(props("swale-transit-derived-buffer-outline").pickable).toBe(false);
  });
});
