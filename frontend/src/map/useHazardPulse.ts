import { useEffect, useState } from "react";
import {
  HAZARD_ANIMATION_STORAGE_KEY,
  HAZARD_PULSE_PERIOD_MS,
} from "./hazards";

export function useHazardMotionPreference(): [
  boolean,
  (paused: boolean) => void,
] {
  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem(HAZARD_ANIMATION_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  return [
    paused,
    (next) => {
      setPaused(next);
      try {
        localStorage.setItem(HAZARD_ANIMATION_STORAGE_KEY, String(next));
      } catch {
        /* The current session remains usable when storage is unavailable. */
      }
    },
  ];
}

/** One bounded clock, with no animation work in hidden/reduced-motion states. */
export function useHazardPulse(enabled: boolean): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      if (document.hidden || media?.matches) {
        setPhase(0);
        return;
      }
      const start = performance.now();
      timer = setInterval(
        () =>
          setPhase(
            ((performance.now() - start) % HAZARD_PULSE_PERIOD_MS) /
              HAZARD_PULSE_PERIOD_MS,
          ),
        100,
      );
    };
    update();
    document.addEventListener("visibilitychange", update);
    media?.addEventListener("change", update);
    return () => {
      if (timer !== undefined) clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      media?.removeEventListener("change", update);
    };
  }, [enabled]);
  return enabled ? phase : 0;
}
