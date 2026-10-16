import type { ContextSnapshot } from "../contextual/contracts";
import type { FloodFrame, FloodInputs } from "../infrastructure/floodModel";
import { FLOOD_MODEL_VERSION } from "../infrastructure/floodModel";

/** Cache identity only; the server treats this as a hypothetical client snapshot. */
export function snapshotFingerprint(value: unknown): string {
  let hash = 2166136261;
  for (const character of JSON.stringify(value))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `local-${(hash >>> 0).toString(16)}`;
}
export function contextSnapshot(
  stationId: string,
  entranceId: string,
  inputs: FloodInputs,
  frame: FloodFrame | null,
): ContextSnapshot {
  const results: Record<string, number> = {};
  if (frame) {
    for (const [key, value] of Object.entries(frame.ledger))
      results[key] = value;
    frame.compartments.forEach((compartment, index) => {
      results[`compartment${index}VolumeM3`] = compartment.volumeM3;
      results[`compartment${index}DepthM`] = compartment.depthM;
    });
  }
  const snapshot = {
    station_id: `subway_station:${stationId}`,
    entrance_id: `model_entrance:${entranceId}`,
    scenario_id: "local-entrance-what-if",
    model_version: FLOOD_MODEL_VERSION,
    elapsed_seconds: frame?.timeS ?? 0,
    inputs: { ...inputs },
    results,
  };
  return { ...snapshot, fingerprint: snapshotFingerprint(snapshot) };
}
