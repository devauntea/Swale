import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  DEFAULT_FLOOD_INPUTS,
  sampleFloodFrame,
  simulateFloodScenario,
  type FloodGeometry,
  type FloodInputs,
  type FloodTrajectory,
} from "./floodModel";

/** Playback samples an immutable fixed-step trajectory; frame timing never integrates water. */
export function useFloodPlayback(
  geometry: FloodGeometry | null,
  active: boolean,
) {
  const [inputs, setInputs] = useState<FloodInputs>({
    ...DEFAULT_FLOOD_INPUTS,
  });
  const [trajectory, setTrajectory] = useState<FloodTrajectory | null>(null);
  const [timeS, setTimeS] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [showScenario, setShowScenario] = useState(false);
  const [compareBaseline, setCompareBaseline] = useState(false);
  const [error, setError] = useState("");
  const identity = geometry
    ? `${geometry.stationId}/${geometry.entranceId}/${geometry.version}`
    : "";
  const [resultIdentity, setResultIdentity] = useState("");
  const valid = active && identity === resultIdentity;
  const current = valid ? trajectory : null;
  const currentCursor = useEffectEvent(() => timeS);

  useEffect(() => {
    setInputs({ ...DEFAULT_FLOOD_INPUTS });
    setTrajectory(null);
    setTimeS(0);
    setPlaying(false);
    setShowScenario(false);
    setCompareBaseline(false);
    setError("");
    setResultIdentity(identity);
  }, [identity]);

  useEffect(() => {
    if (!active) setPlaying(false);
  }, [active]);

  useEffect(() => {
    const hide = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  useEffect(() => {
    if (!playing || !active || !current || !showScenario || document.hidden)
      return;
    const started = performance.now();
    const initial = currentCursor();
    const timer = window.setInterval(() => {
      const next = Math.min(
        current.inputs.durationS,
        initial + ((performance.now() - started) / 1000) * speed,
      );
      setTimeS(next);
      if (next >= current.inputs.durationS) setPlaying(false);
    }, 100);
    return () => window.clearInterval(timer);
    // The starting cursor is captured for each play/pause/speed change.
    // timeS intentionally does not restart this clock.
  }, [playing, active, current, showScenario, speed]);

  const frame = useMemo(
    () => (current ? sampleFloodFrame(current, timeS) : null),
    [current, timeS],
  );
  const reset = () => {
    setPlaying(false);
    setTrajectory(null);
    setTimeS(0);
    setCompareBaseline(false);
    setError("");
  };
  return {
    inputs,
    trajectory: current,
    frame,
    timeS: current ? timeS : 0,
    playing: valid && playing,
    speed,
    showScenario: valid && showScenario,
    compareBaseline,
    error,
    setInput: (key: keyof FloodInputs, value: number) => {
      reset();
      setInputs((previous) => ({ ...previous, [key]: value }));
    },
    open: () => {
      setShowScenario(true);
      setCompareBaseline(false);
    },
    snapshot: (requestedTime?: number) => {
      if (!geometry || !active) return;
      try {
        const next = current ?? simulateFloodScenario(geometry, inputs);
        setTrajectory(next);
        setResultIdentity(identity);
        setTimeS(
          Math.max(0, Math.min(next.inputs.durationS, requestedTime ?? timeS)),
        );
        setPlaying(false);
        setShowScenario(true);
        setCompareBaseline(false);
        setError("");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Local calculation failed.",
        );
      }
    },
    evidence: () => {
      setPlaying(false);
      setShowScenario(false);
    },
    play: () => {
      if (!geometry || !active || document.hidden) return;
      try {
        const next = current ?? simulateFloodScenario(geometry, inputs);
        setTrajectory(next);
        setResultIdentity(identity);
        if (timeS >= inputs.durationS) setTimeS(0);
        setShowScenario(true);
        setCompareBaseline(false);
        setPlaying(true);
        setError("");
      } catch (cause) {
        setPlaying(false);
        setError(
          cause instanceof Error ? cause.message : "Local calculation failed.",
        );
      }
    },
    pause: () => setPlaying(false),
    reset,
    scrub: (value: number) => {
      setPlaying(false);
      if (current && Number.isFinite(value))
        setTimeS(Math.max(0, Math.min(current.inputs.durationS, value)));
    },
    setSpeed: (value: number) => {
      if ([1, 30, 60].includes(value)) setSpeed(value);
    },
    compare: (baseline: boolean) => {
      setPlaying(false);
      setCompareBaseline(baseline);
    },
  };
}

export type FloodPlayback = ReturnType<typeof useFloodPlayback>;
