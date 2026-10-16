// @vitest-environment jsdom
// Camera/owner lifecycle with MapLibre/WebGL replaced, not browser acceptance.
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react/pure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SwaleMap, { type SwaleMapProps } from "../map/SwaleMap";
import { DEMO_SNAPSHOT } from "../data/fixtures/demo";
import type { InfrastructureMapState } from "../infrastructure/contracts";

const renderer = vi.hoisted(() => ({
  maps: [] as Record<string, unknown>[],
  overlays: [] as Record<string, unknown>[],
}));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  AttributionControl: class {},
  Map: class {
    canvas = document.createElement("canvas");
    handlers = new Map<string, () => void>();
    camera = {
      center: [-73.99, 40.68],
      zoom: 16.25,
      pitch: 47,
      bearing: -19,
      padding: { left: 20, right: 30, top: 40, bottom: 50 },
    };
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      for (const key of [
        "center",
        "zoom",
        "pitch",
        "bearing",
        "padding",
      ] as const)
        if (options[key] !== undefined)
          Object.assign(this.camera, { [key]: options[key] });
      renderer.maps.push(this as unknown as Record<string, unknown>);
    }
    getCanvas = () => this.canvas;
    getContainer = () => this.options.container;
    getCenter = () => ({
      lng: this.camera.center[0],
      lat: this.camera.center[1],
    });
    getZoom = () => this.camera.zoom;
    getPitch = () => this.camera.pitch;
    getBearing = () => this.camera.bearing;
    getPadding = () => this.camera.padding;
    getBounds = () => ({
      getWest: () => -74.01,
      getSouth: () => 40.67,
      getEast: () => -73.98,
      getNorth: () => 40.69,
    });
    on = vi.fn();
    once = (event: string, handler: () => void) => {
      this.handlers.set(event, handler);
    };
    addControl = vi.fn();
    loaded = () => true;
    isStyleLoaded = () => true;
    setPadding = vi.fn();
    setLayoutProperty = vi.fn();
    resize = vi.fn();
    stop = vi.fn();
    remove = vi.fn();
    flyTo = vi.fn((options: Record<string, unknown>) => {
      Object.assign(this.camera, options);
    });
    easeTo = vi.fn((options: Record<string, unknown>) => {
      Object.assign(this.camera, options);
    });
    fitBounds = vi.fn();
  },
}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "/test-worker.mjs",
}));
vi.mock("@deck.gl/maplibre", () => ({
  MapLibreOverlay: class {
    setProps = vi.fn();
    finalize = vi.fn();
    constructor() {
      renderer.overlays.push(this as unknown as Record<string, unknown>);
    }
  },
}));
vi.mock("../map/spriteFallbacks", () => ({
  installLocalBasemapGlyphs: () => ({ dispose: vi.fn(), updateTheme: vi.fn() }),
}));
vi.mock("../map/presentation", async (original) => ({
  ...(await original<typeof import("../map/presentation")>()),
  applyArchitecturalStyle: vi.fn(() => ({
    buildingLayerId: "buildings",
    labelLayerId: "labels",
  })),
  prefersReducedMotion: () => true,
}));

beforeEach(() => {
  renderer.maps.length = 0;
  renderer.overlays.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const detail: InfrastructureMapState = {
  stationId: "F21",
  mode: "xray",
  verticalExaggeration: 2,
  visible: { structure: true, routes: true, platforms: true, entrances: true },
  selectedPrimitiveId: null,
  chunk: {
    stationId: "F21",
    metadata: {
      modelVintage: "Source fixture",
      referencePolicy: "Surface relative",
      schematic: true,
    },
    primitives: [
      {
        id: "platform:F21",
        stationId: "F21",
        kind: "platform",
        sourceIds: ["S3:F21"],
        assumption: "Schematic",
        polygon: [
          [-73.995, 40.68, -12],
          [-73.9949, 40.68, -12],
          [-73.9949, 40.6801, -12],
          [-73.995, 40.68, -12],
        ],
        height: 0.6,
      },
    ],
  },
};
function props(): SwaleMapProps {
  return {
    snapshot: DEMO_SNAPSHOT,
    theme: "light",
    scenarioId: "moderate_current",
    layers: {
      basins: true,
      complaints: true,
      floodZones: true,
      buildings: true,
    },
    selectedBasinId: null,
    highlightedIds: [],
    cameraRequest: null,
    onSelectBasin: vi.fn(),
  };
}
type MockMap = {
  options: { maxZoom: number; maxPitch: number };
  handlers: Map<string, () => void>;
  camera: Record<string, unknown>;
  flyTo: ReturnType<typeof vi.fn>;
  easeTo: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  canvas: HTMLCanvasElement;
};
function map() {
  return renderer.maps[0] as unknown as MockMap;
}

describe("infrastructure uses the original map and camera owner", () => {
  it("explores geometry without TransitData, retains camera through theme changes, and restores the captured camera on return", async () => {
    const base = props();
    const view = render(createElement(SwaleMap, base));
    await act(async () => {
      map().handlers.get("load")!();
    });
    const previous = structuredClone(map().camera);
    const active: SwaleMapProps = {
      ...base,
      infrastructure: detail,
      infrastructureCamera: {
        kind: "explore",
        stationId: "F21",
        position: [-73.995, 40.68],
        nonce: 1,
      },
    };
    view.rerender(createElement(SwaleMap, active));
    await waitFor(() => expect(map().fitBounds).toHaveBeenCalled());
    expect(map().options.maxZoom).toBe(22);
    expect(map().options.maxPitch).toBe(70);
    expect(map().flyTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ zoom: 20.5, duration: 0 }),
    );
    expect(map().fitBounds).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({
        maxZoom: 20.5,
        absolutePadding: true,
        duration: 0,
      }),
    );
    const cameraCalls =
      map().flyTo.mock.calls.length + map().fitBounds.mock.calls.length;
    view.rerender(createElement(SwaleMap, { ...active, theme: "dark" }));
    expect(
      map().flyTo.mock.calls.length + map().fitBounds.mock.calls.length,
    ).toBe(cameraCalls);
    expect(renderer.maps).toHaveLength(1);
    expect(renderer.overlays).toHaveLength(1);
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructureCamera: { kind: "return", nonce: 2 },
      }),
    );
    expect(map().easeTo).toHaveBeenLastCalledWith({
      ...previous,
      duration: 0,
      essential: false,
    });
    expect(renderer.maps).toHaveLength(1);
    expect(map().remove).not.toHaveBeenCalled();
  });
  it("fits entrances without TransitData and retains the original return view after switching detail stations", async () => {
    const base = props(),
      view = render(createElement(SwaleMap, base));
    await act(async () => {
      map().handlers.get("load")!();
    });
    const previous = structuredClone(map().camera);
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructure: detail,
        infrastructureCamera: {
          kind: "explore",
          stationId: "F21",
          position: [-73.995, 40.68],
          nonce: 1,
        },
      }),
    );
    await waitFor(() => expect(map().fitBounds).toHaveBeenCalled());
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructure: detail,
        infrastructureCamera: {
          kind: "fit_entrances",
          positions: [
            [-73.995, 40.68],
            [-73.994, 40.681],
          ],
          nonce: 2,
        },
      }),
    );
    expect(map().fitBounds).toHaveBeenLastCalledWith(
      [
        [-73.995, 40.68],
        [-73.994, 40.681],
      ],
      expect.objectContaining({ maxZoom: 21.5 }),
    );
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructure: { ...detail, stationId: "F22", chunk: null },
        infrastructureCamera: {
          kind: "explore",
          stationId: "F22",
          position: [-73.996, 40.674],
          nonce: 3,
        },
      }),
    );
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructureCamera: { kind: "return", nonce: 4 },
      }),
    );
    expect(map().easeTo).toHaveBeenLastCalledWith({
      ...previous,
      duration: 0,
      essential: false,
    });
    view.unmount();
    expect(map().remove).toHaveBeenCalledOnce();
    expect(renderer.overlays[0].finalize).toHaveBeenCalledOnce();
  });

  it("recreates only on explicit context-loss retry, retains the current detail camera and still returns to the original view", async () => {
    const base = props(),
      view = render(createElement(SwaleMap, base));
    await act(async () => {
      map().handlers.get("load")!();
    });
    const original = structuredClone(map().camera);
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructure: detail,
        infrastructureCamera: {
          kind: "explore",
          stationId: "F21",
          position: [-73.995, 40.68],
          nonce: 1,
        },
      }),
    );
    await waitFor(() => expect(map().fitBounds).toHaveBeenCalled());
    Object.assign(map().camera, {
      center: [-73.9948, 40.6802],
      zoom: 21.2,
      bearing: 36,
      pitch: 62,
    });
    const current = structuredClone(map().camera);
    fireEvent(
      map().canvas,
      new Event("webglcontextlost", { cancelable: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
    expect(renderer.maps).toHaveLength(2);
    const recovered = renderer.maps[1] as unknown as MockMap;
    expect(recovered.options).toEqual(
      expect.objectContaining({
        center: current.center,
        zoom: current.zoom,
        bearing: current.bearing,
        pitch: current.pitch,
        padding: current.padding,
      }),
    );
    await act(async () => {
      recovered.handlers.get("load")!();
    });
    expect(recovered.flyTo).not.toHaveBeenCalled();
    expect(recovered.fitBounds).not.toHaveBeenCalled();
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructureCamera: { kind: "return", nonce: 2 },
      }),
    );
    expect(recovered.easeTo).toHaveBeenLastCalledWith({
      ...original,
      duration: 0,
      essential: false,
    });
    expect(map().remove).toHaveBeenCalledOnce();
    expect(renderer.overlays[0].finalize).toHaveBeenCalledOnce();
  });
});
