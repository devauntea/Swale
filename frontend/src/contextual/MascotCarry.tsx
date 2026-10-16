import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  SwaleMascot,
  type MascotExpression,
} from "../components/assistant/SwaleMascot";
import {
  CARRY_DURATION,
  carryFrame,
  type CarryPhase,
  type CarryPoint,
  type ProjectedMascotTarget,
} from "./carry";
import "./contextual.css";

export type { CarryPhase, CarryPoint, ProjectedMascotTarget } from "./carry";
interface Props {
  selectionKey: string | null;
  target: ProjectedMascotTarget | null;
  dock: CarryPoint;
  interrupted?: number;
  movementEnabled: boolean;
  onPhaseChange?: (phase: CarryPhase) => void;
  expression?: MascotExpression;
}
export function MascotCarry(p: Props) {
  const current = useRef(p);
  const { onPhaseChange } = p;
  useLayoutEffect(() => {
    current.current = p;
  });
  const position = useRef(p.dock);
  const lastInterruption = useRef(p.interrupted);
  const lastSelection = useRef(p.selectionKey);
  const manualStopped = useRef(false);
  const startedSelection = useRef(false);
  const sequenceActive = useRef(false);
  const projectionPending =
    p.selectionKey !== null && p.target?.key !== p.selectionKey;
  const targetValid =
    p.selectionKey !== null &&
    p.target?.key === p.selectionKey &&
    p.target.visible;
  const [frame, setFrame] = useState(() =>
    carryFrame(CARRY_DURATION, p.dock, p.dock),
  );
  const [docked, setDocked] = useState(true);
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    const from = { ...position.current };
    const started = performance.now();
    let pausedAt: number | null = null;
    let waited = 0;
    if (p.selectionKey !== lastSelection.current) {
      manualStopped.current = false;
      startedSelection.current = false;
    } else if (p.interrupted !== lastInterruption.current)
      manualStopped.current = true;
    lastSelection.current = p.selectionKey;
    lastInterruption.current = p.interrupted;
    const manualInterrupt = manualStopped.current;
    const animateSelection = targetValid && !startedSelection.current;
    if (targetValid) startedSelection.current = true;
    sequenceActive.current = true;
    const draw = (now: number) => {
      if (cancelled) return;
      const props = current.current;
      if (
        props.selectionKey !== null &&
        props.target?.key !== props.selectionKey
      ) {
        // A new selection can precede its map projection by a render. Preserve
        // the actual current position; this is not an offscreen destination.
        setFrame(
          carryFrame(CARRY_DURATION, position.current, position.current),
        );
        sequenceActive.current = false;
        return;
      }
      const valid =
        props.selectionKey !== null &&
        props.target?.key === props.selectionKey &&
        props.target.visible;
      const target = valid ? props.target! : props.dock;
      const staticView =
        reduced ||
        !props.movementEnabled ||
        !valid ||
        manualInterrupt ||
        !animateSelection;
      const elapsed = staticView ? CARRY_DURATION : now - started - waited;
      // Do not release until the latest projected target is visible and camera settled.
      const awaiting =
        !staticView && valid && props.target!.moving && elapsed >= 1260;
      if (awaiting && pausedAt === null) pausedAt = now;
      if (!awaiting && pausedAt !== null) {
        waited += now - pausedAt;
        pausedAt = null;
      }
      const time = awaiting
        ? 1259
        : staticView
          ? CARRY_DURATION
          : now - started - waited;
      const next = carryFrame(
        time,
        from,
        target,
        staticView || !props.target?.moving,
      );
      position.current = next.position;
      setFrame(next);
      setDocked(!valid);
      // Keep anchors current after settling without continuously rerendering.
      if (time < CARRY_DURATION || awaiting) raf = requestAnimationFrame(draw);
      else sequenceActive.current = false;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      sequenceActive.current = false;
    };
  }, [
    p.selectionKey,
    p.interrupted,
    p.movementEnabled,
    reduced,
    targetValid,
    projectionPending,
  ]);
  useEffect(() => {
    if (
      projectionPending ||
      frame.phase !== "explaining" ||
      sequenceActive.current
    )
      return;
    const valid =
      p.selectionKey !== null &&
      p.target?.key === p.selectionKey &&
      p.target.visible;
    const next = valid ? p.target! : p.dock;
    position.current = next;
    setFrame((previous) => ({ ...previous, position: next }));
    setDocked(!valid);
  }, [p.target, p.dock, p.selectionKey, frame.phase, projectionPending]);
  useEffect(() => {
    onPhaseChange?.(frame.phase);
  }, [frame.phase, onPhaseChange]);
  return (
    <div
      className="mascot-travel"
      data-phase={frame.phase}
      data-docked={docked}
      aria-hidden="true"
      style={{
        transform: `translate3d(${frame.position.x - 44}px, ${frame.position.y - 52}px, 0)`,
      }}
    >
      <div className="mascot-carried-character">
        <SwaleMascot
          carryHandle
          expression={
            frame.phase === "explaining" && !docked
              ? p.expression === "processing" ||
                p.expression === "error" ||
                p.expression === "speaking"
                ? p.expression
                : "highlighting"
              : "idle"
          }
        />
      </div>
      <svg
        className="mascot-carry-hand"
        viewBox="0 0 88 112"
        style={{
          opacity: projectionPending ? 0 : frame.hand,
          transform: `translate(${(1 - frame.hand) * -24}px,${(1 - frame.hand) * -30}px) rotate(${frame.grip ? -8 : 3}deg)`,
        }}
      >
        <path
          d={
            frame.grip
              ? "M8 17 28 15c0 12 7 25 17 34l9 7c7-5 15-5 21-1 7 5 6 12-1 17l-6 4c4 6 1 13-6 14-7 2-15-4-20-8L28 71c-9-7-10-17-14-26L6 28Z"
              : "M8 17 28 15c1 12 7 24 17 34l8 5 4-23c1-7 9-8 11-1l-1 23 10-12c5-6 12-2 9 5L74 66c1 9-4 17-11 21-7 3-14-1-20-6L28 71c-9-7-10-17-14-26L6 28Z"
          }
          fill="var(--surface)"
          stroke="var(--text-secondary)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {frame.grip ? (
          <>
            <path
              d="M46 69c4-8 10-12 17-11 8 1 10 7 5 12l-8 7c-4 3-9 2-11-1"
              fill="var(--surface-elevated)"
              stroke="var(--text-secondary)"
              strokeWidth="2.5"
            />
            <path
              d="M56 79c4-4 9-4 13-1M50 84c4-3 8-3 12 0"
              stroke="var(--text-secondary)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        ) : (
          <path
            d="m58 55 8 4m-23 5 10 10M25 48l9 12"
            stroke="var(--text-secondary)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
        <path
          d="M4 8 29 6l3 13-26 3Z"
          fill="var(--accent)"
          stroke="var(--text-secondary)"
          strokeWidth="2"
        />
      </svg>
      {docked && p.selectionKey && (
        <span className="mascot-docked-caption">
          Selection explanation in assistant
        </span>
      )}
    </div>
  );
}
