export type CarryPhase =
  | "docked"
  | "reaching"
  | "gripping"
  | "lifting"
  | "carrying"
  | "aligning"
  | "lowering"
  | "releasing"
  | "settling"
  | "explaining";
export interface CarryPoint {
  x: number;
  y: number;
}
export interface ProjectedMascotTarget extends CarryPoint {
  key: string;
  label: string;
  visible: boolean;
  moving: boolean;
}
export const CARRY_STAGES = [
  ["reaching", 220],
  ["gripping", 180],
  ["lifting", 180],
  ["carrying", 680],
  ["aligning", 150],
  ["lowering", 220],
  ["releasing", 180],
  ["settling", 160],
] as const;
export const CARRY_DURATION = CARRY_STAGES.reduce(
  (sum, [, duration]) => sum + duration,
  0,
);
const smooth = (p: number) => {
  const t = Math.max(0, Math.min(1, p));
  return t * t * (3 - 2 * t);
};
const mix = (a: CarryPoint, b: CarryPoint, p: number): CarryPoint => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
});

/** One continuous attachment frame for hand and character; no independent travel. */
export function carryFrame(
  elapsed: number,
  from: CarryPoint,
  destination: CarryPoint,
  ready = true,
): { phase: CarryPhase; position: CarryPoint; hand: number; grip: boolean } {
  let cursor = 0;
  let phase: CarryPhase = "explaining";
  let fraction = 1;
  for (const [stage, duration] of CARRY_STAGES) {
    if (elapsed < cursor + duration) {
      phase = stage;
      fraction = smooth((elapsed - cursor) / duration);
      break;
    }
    cursor += duration;
  }
  const lifted = { x: from.x, y: from.y - 44 };
  const above = { x: destination.x, y: destination.y - 28 };
  if (phase === "reaching")
    return { phase, position: from, hand: fraction, grip: false };
  if (phase === "gripping")
    return { phase, position: from, hand: 1, grip: fraction >= 0.5 };
  if (phase === "lifting")
    return {
      phase,
      position: mix(from, lifted, fraction),
      hand: 1,
      grip: true,
    };
  if (phase === "carrying")
    return {
      phase,
      position: mix(lifted, above, fraction),
      hand: 1,
      grip: true,
    };
  if (!ready)
    return { phase: "carrying", position: above, hand: 1, grip: true };
  if (phase === "aligning")
    return { phase, position: above, hand: 1, grip: true };
  if (phase === "lowering")
    return {
      phase,
      position: mix(above, destination, fraction),
      hand: 1,
      grip: true,
    };
  if (phase === "releasing")
    return {
      phase,
      position: destination,
      hand: 1 - fraction,
      grip: fraction < 0.45,
    };
  if (phase === "settling")
    return {
      phase,
      position: {
        ...destination,
        y: destination.y - Math.sin(fraction * Math.PI) * 2,
      },
      hand: 0,
      grip: false,
    };
  return { phase: "explaining", position: destination, hand: 0, grip: false };
}
