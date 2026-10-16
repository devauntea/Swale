import { describe, expect, it } from "vitest";
import { CARRY_DURATION, CARRY_STAGES, carryFrame } from "../contextual/carry";
describe("coherent bounded hand carry", () => {
  const start = { x: 900, y: 700 },
    target = { x: 500, y: 350 };
  it("reaches, grips and lifts before continuous transport, then releases after lowering", () => {
    let elapsed = 0;
    const phases = CARRY_STAGES.map(([phase, duration]) => {
      const frame = carryFrame(elapsed + duration / 2, start, target);
      elapsed += duration;
      expect(frame.phase).toBe(phase);
      return frame;
    });
    expect(phases[0].position).toEqual(start);
    expect(phases[2].position.y).toBeLessThan(start.y);
    expect(phases[3].grip).toBe(true);
    expect(phases[4].grip).toBe(true);
    expect(phases[5].grip).toBe(true);
    expect(phases[6].position).toEqual(target);
    expect(phases[7].hand).toBe(0);
    expect(carryFrame(CARRY_DURATION, start, target)).toMatchObject({
      phase: "explaining",
      position: target,
      hand: 0,
      grip: false,
    });
  });
  it("has no jumps across attached phase boundaries and waits rather than dropping at an unsettled target", () => {
    let elapsed = 0;
    for (const [, duration] of CARRY_STAGES) {
      elapsed += duration;
      const before = carryFrame(elapsed - 0.01, start, target),
        after = carryFrame(elapsed + 0.01, start, target);
      expect(
        Math.hypot(
          before.position.x - after.position.x,
          before.position.y - after.position.y,
        ),
      ).toBeLessThan(0.01);
    }
    expect(
      carryFrame(CARRY_DURATION + 1000, start, target, false),
    ).toMatchObject({
      phase: "carrying",
      hand: 1,
      grip: true,
      position: { x: target.x, y: target.y - 28 },
    });
  });
  it("can retarget from the actual rendered position without a dock teleport", () => {
    const midway = carryFrame(900, start, target).position;
    expect(carryFrame(0, midway, { x: 700, y: 400 }).position).toEqual(midway);
  });
});
