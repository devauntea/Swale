import { describe, expect, it } from "vitest";
import {
  visibleMascotAnchor,
  MASCOT_SCREEN_EXTENTS,
} from "../contextual/screenAnchor";

const viewport = { left: 0, top: 0, right: 1636, bottom: 896 };
describe("map-projected mascot avoids actual UI in screen space", () => {
  it("retains the exact projection whenever its full attached artwork fits", () => {
    const point = { x: 850, y: 490 };
    expect(visibleMascotAnchor(point, viewport, [])).toEqual(point);
  });
  it("moves beside the actual tour panel when the hand would be behind its edge", () => {
    const point = { x: 850, y: 490 };
    const panel = { left: 352, top: 82, right: 822, bottom: 563 };
    const anchor = visibleMascotAnchor(point, viewport, [panel])!;
    expect(anchor).toEqual({ x: 946, y: 490 });
    expect(anchor.x - MASCOT_SCREEN_EXTENTS.left).toBeGreaterThan(
      panel.right + 8,
    );
    expect(point).toEqual({ x: 850, y: 490 });
  });
  it("tries the other side before vertical alternatives and keeps the full hand onscreen", () => {
    const point = { x: 900, y: 430 };
    const rightPanel = { left: 930, top: 80, right: 1200, bottom: 700 };
    expect(visibleMascotAnchor(point, viewport, [rightPanel])).toEqual({
      x: 804,
      y: 430,
    });
    const compact = { left: 0, top: 0, right: 1000, bottom: 727 };
    expect(visibleMascotAnchor({ x: 950, y: 400 }, compact, [])).toEqual({
      x: 854,
      y: 400,
    });
  });
  it("re-evaluates after a panel expands, using a bounded vertical alternative", () => {
    const point = { x: 500, y: 400 };
    const short = { left: 300, top: 70, right: 700, bottom: 300 };
    const tall = { ...short, bottom: 380 };
    expect(visibleMascotAnchor(point, viewport, [short])).toEqual(point);
    expect(visibleMascotAnchor(point, viewport, [tall])).toEqual({
      x: 500,
      y: 496,
    });
  });
  it("docks when every nearby location is obstructed or the subject is offscreen", () => {
    expect(
      visibleMascotAnchor({ x: 850, y: 490 }, viewport, [viewport]),
    ).toBeNull();
    expect(visibleMascotAnchor({ x: -1, y: 400 }, viewport, [])).toBeNull();
    expect(
      visibleMascotAnchor({ x: Number.NaN, y: 400 }, viewport, []),
    ).toBeNull();
    expect(
      visibleMascotAnchor({ x: 850, y: 490 }, { ...viewport, right: 0 }, []),
    ).toBeNull();
  });
});
