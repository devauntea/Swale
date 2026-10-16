// @vitest-environment jsdom
// Camera/owner lifecycle with MapLibre/WebGL replaced, not browser acceptance.
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import {
  parseInfrastructureChunk,
  parseInfrastructureManifest,
} from "../infrastructure/contracts";
import { parseEntranceCatalog } from "../infrastructure/entranceCatalog";
import { buildEntranceDetail } from "../infrastructure/entranceGeometry";
import {
  DEFAULT_FLOOD_INPUTS,
  simulateFloodScenario,
} from "../infrastructure/floodModel";

const renderer = vi.hoisted(() => ({
  maps: [] as Record<string, unknown>[],
  overlays: [] as Record<string, unknown>[],
  resizeCallbacks: [] as (() => void)[],
  resizeDisconnects: [] as ReturnType<typeof vi.fn>[],
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
      elevation: 0,
      padding: { left: 20, right: 30, top: 40, bottom: 50 },
    };
    centerClampedToGround = true;
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      for (const key of [
        "center",
        "zoom",
        "pitch",
        "bearing",
        "elevation",
        "padding",
      ] as const)
        if (options[key] !== undefined)
          Object.assign(this.camera, { [key]: options[key] });
      if (typeof options.centerClampedToGround === "boolean")
        this.centerClampedToGround = options.centerClampedToGround;
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
    getCenterElevation = () => this.camera.elevation;
    setCenterElevation = vi.fn((value: number) => {
      this.camera.elevation = value;
    });
    getCenterClampedToGround = () => this.centerClampedToGround;
    setCenterClampedToGround = vi.fn((value: boolean) => {
      this.centerClampedToGround = value;
    });
    getBounds = () => ({
      getWest: () => -74.01,
      getSouth: () => 40.67,
      getEast: () => -73.98,
      getNorth: () => 40.69,
    });
    project = vi.fn(() => ({ x: 850, y: 555 }));
    isMoving = () => false;
    on = vi.fn();
    off = vi.fn();
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
      // MapLibre 6.14 ignores elevation in easeTo; the explicit setter owns it.
      const cameraOptions = { ...options };
      delete cameraOptions.elevation;
      Object.assign(this.camera, cameraOptions);
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
  renderer.resizeCallbacks.length = 0;
  renderer.resizeDisconnects.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        renderer.resizeCallbacks.push(callback);
        renderer.resizeDisconnects.push(this.disconnect);
      }
      observe() {}
      unobserve() {}
      disconnect = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  centerClampedToGround: boolean;
  setCenterClampedToGround: ReturnType<typeof vi.fn>;
  setCenterElevation: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  easeTo: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  project: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  canvas: HTMLCanvasElement;
};
function map() {
  return renderer.maps[0] as unknown as MockMap;
}

describe("infrastructure uses the original map and camera owner", () => {
  it("projects only after map readiness and repositions around resized or hidden UI without changing map coordinates or camera", async () => {
    let panelBottom = 563;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.classList.contains("map-canvas"))
          return new DOMRect(0, 0, 1636, 896);
        if (this.classList.contains("viewing-modes"))
          return new DOMRect(352, 82, 470, panelBottom - 82);
        return new DOMRect();
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (frame: number) =>
      window.clearTimeout(frame),
    );
    const onMascotProjection = vi.fn();
    const target = {
      key: "model_entrance:source-row",
      position: [-73.995, 40.68] as [number, number],
      label: "Selected source entrance",
    };
    const view = render(
      createElement(
        "main",
        { className: "workspace" },
        createElement("section", { className: "viewing-modes" }),
        createElement(SwaleMap, {
          ...props(),
          mascotTarget: target,
          onMascotProjection,
        }),
      ),
    );
    expect(onMascotProjection).not.toHaveBeenCalled();
    expect(map().project).not.toHaveBeenCalled();
    await act(async () => map().handlers.get("load")!());
    expect(onMascotProjection).toHaveBeenLastCalledWith({
      key: target.key,
      label: target.label,
      x: 946,
      y: 490,
      visible: true,
      moving: false,
    });
    panelBottom = 300;
    act(() => renderer.resizeCallbacks.forEach((callback) => callback()));
    await waitFor(() =>
      expect(onMascotProjection.mock.calls.at(-1)?.[0].x).toBe(850),
    );
    panelBottom = 563;
    act(() => renderer.resizeCallbacks.forEach((callback) => callback()));
    await waitFor(() =>
      expect(onMascotProjection.mock.calls.at(-1)?.[0].x).toBe(946),
    );
    act(() => {
      view.container.querySelector<HTMLElement>(".viewing-modes")!.hidden =
        true;
    });
    await waitFor(() =>
      expect(onMascotProjection.mock.calls.at(-1)?.[0].x).toBe(850),
    );
    for (const [position] of map().project.mock.calls)
      expect(position).toEqual(target.position);
    expect(map().flyTo).not.toHaveBeenCalled();
    expect(map().easeTo).not.toHaveBeenCalled();
    view.unmount();
    for (const disconnect of renderer.resizeDisconnects)
      expect(disconnect).toHaveBeenCalledOnce();
  });
  it("rejects retained detail pick/hover callbacks after entrance changes, hiding, and scenario comparison/evidence changes", async () => {
    const read = (path: string): unknown =>
      JSON.parse(
        readFileSync(
          resolve(process.cwd(), "public/infrastructure", path),
          "utf8",
        ),
      );
    const manifest = parseInfrastructureManifest(read("index.json"));
    const catalog = parseEntranceCatalog(read("entrance-details.json"));
    const station = manifest.stations.find((item) => item.id === "F21")!;
    const chunk = parseInfrastructureChunk(read("stations/F21.json"), "F21");
    const sources = catalog.entrances.filter(
      (item) => item.gtfsStopId === "F21" && item.type === "Stair",
    );
    const first = buildEntranceDetail(station, chunk, sources[0])!;
    const second = buildEntranceDetail(station, chunk, sources[1])!;
    const active = { ...detail, chunk, entranceDetail: first };
    const pick = vi.fn();
    const base = { ...props(), onSelectInfrastructure: pick };
    const view = render(
      createElement(SwaleMap, { ...base, infrastructure: active }),
    );
    await act(async () => {
      map().handlers.get("load")!();
    });
    type LayerProps = {
      id: string;
      props: {
        data: { componentId: string }[];
        onHover: (value: unknown) => unknown;
        onClick: (value: unknown) => unknown;
      };
    };
    const layer = (id: string) => {
      const calls = (renderer.overlays[0].setProps as ReturnType<typeof vi.fn>)
        .mock.calls;
      const latest = calls.at(-1)?.[0] as { layers: LayerProps[] } | undefined;
      return latest?.layers.find((item) => item.id === id)?.props;
    };
    await waitFor(() =>
      expect(layer("swale-entrance-detail-treads")).toBeTruthy(),
    );
    const oldTread = layer("swale-entrance-detail-treads")!;
    const treadInfo = { object: oldTread.data[0], x: 10, y: 20 };
    act(() => {
      oldTread.onHover(treadInfo);
      oldTread.onClick(treadInfo);
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(pick).toHaveBeenCalledOnce();
    pick.mockClear();
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructure: { ...active, entranceDetail: second },
      }),
    );
    act(() => {
      oldTread.onHover(treadInfo);
      oldTread.onClick(treadInfo);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(pick).not.toHaveBeenCalled();

    const trajectory = simulateFloodScenario(first.floodGeometry, {
      ...DEFAULT_FLOOD_INPUTS,
      durationS: 60,
    });
    const scenario = {
      inputs: trajectory.inputs,
      frame: trajectory.frames.at(-1)!,
    };
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructure: { ...active, entranceScenario: scenario },
      }),
    );
    const oldWater = layer("swale-entrance-scenario-water")!;
    expect(oldWater).toBeTruthy();
    const waterInfo = { object: oldWater.data[0], x: 10, y: 20 };
    act(() => oldWater.onHover(waterInfo));
    expect(screen.getByRole("tooltip").textContent).toContain("HYPOTHETICAL");
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructure: {
          ...active,
          entranceScenario: { ...scenario, compareBaseline: true },
        },
      }),
    );
    act(() => oldWater.onHover(waterInfo));
    expect(screen.queryByRole("tooltip")).toBeNull();
    view.rerender(createElement(SwaleMap, { ...base, infrastructure: active }));
    act(() => oldWater.onHover(waterInfo));
    expect(screen.queryByRole("tooltip")).toBeNull();
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructure: {
          ...active,
          visible: { ...active.visible, entrances: false },
        },
      }),
    );
    act(() => {
      oldTread.onHover(treadInfo);
      oldTread.onClick(treadInfo);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(pick).not.toHaveBeenCalled();
    expect(renderer.maps).toHaveLength(1);
    expect(renderer.overlays).toHaveLength(1);
  });
  it("uses negative entrance-camera elevation without clamping and restores the original elevation/clamp on return", async () => {
    const base = props();
    const view = render(createElement(SwaleMap, base));
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
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructure: detail,
        infrastructureCamera: {
          kind: "entrance_detail",
          position: [-73.9949, 40.6801],
          elevation: -3.5,
          bearing: 175,
          zoom: 22,
          pitch: 57,
          nonce: 2,
        },
      }),
    );
    expect(map().setCenterClampedToGround).toHaveBeenLastCalledWith(false);
    expect(map().setCenterElevation).toHaveBeenLastCalledWith(-3.5);
    expect(map().easeTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        elevation: -3.5,
        zoom: 22,
        pitch: 57,
        duration: 0,
      }),
    );
    expect(map().camera.elevation).toBe(-3.5);
    expect(map().centerClampedToGround).toBe(false);
    view.rerender(
      createElement(SwaleMap, {
        ...base,
        infrastructureCamera: { kind: "return", nonce: 3 },
      }),
    );
    expect(map().setCenterClampedToGround).toHaveBeenLastCalledWith(true);
    expect(map().setCenterElevation).toHaveBeenLastCalledWith(
      original.elevation,
    );
    expect(map().camera.elevation).toBe(original.elevation);
    expect(map().centerClampedToGround).toBe(true);
    expect(map().easeTo).toHaveBeenLastCalledWith({
      ...original,
      duration: 0,
      essential: false,
    });
    expect(renderer.maps).toHaveLength(1);
    expect(renderer.overlays).toHaveLength(1);
  });
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
