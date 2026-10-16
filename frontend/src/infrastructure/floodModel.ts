/** Local hypothetical storage demonstrator; never an operational water measurement. */
export const FLOOD_MODEL_VERSION = "swale-entrance-storage-v1";
export const FLOOD_MODEL_LABEL =
  "Illustrative what-if model — not calibrated station flooding.";
export const FLOOD_INPUT_BOUNDS = {
  streetDepthM: { min: 0, max: 2 },
  barrierHeightM: { min: 0, max: 2 },
  inflowCapacityLps: { min: 0, max: 100 },
  drainageCapacityLps: { min: 0, max: 100 },
  durationS: { min: 1, max: 1800 },
} as const;
export const DEFAULT_FLOOD_INPUTS: Readonly<FloodInputs> = Object.freeze({
  streetDepthM: 0.35,
  barrierHeightM: 0.1,
  inflowCapacityLps: 20,
  drainageCapacityLps: 2,
  durationS: 600,
});
export const FLOOD_INPUT_UNITS = {
  streetDepthM: "m",
  barrierHeightM: "m",
  inflowCapacityLps: "L/s",
  drainageCapacityLps: "L/s",
  durationS: "s",
} as const;

export interface FloodInputs {
  streetDepthM: number;
  barrierHeightM: number;
  inflowCapacityLps: number;
  drainageCapacityLps: number;
  durationS: number;
}
export interface FloodFloorPatch {
  floorM: number;
  areaM2: number;
}
export interface FloodCompartment {
  id: string;
  kind: "stairwell" | "landing" | "platform";
  floorPatches: readonly FloodFloorPatch[];
  maxStageM: number;
}
export interface FloodConnection {
  id: string;
  from: string;
  to: string;
  crestM: number;
  capacityLps: number;
  enabled: boolean;
}
export interface FloodGeometry {
  stationId: string;
  entranceId: string;
  version: string;
  streetReferenceM: number;
  entranceCompartmentId: string;
  drainageCompartmentId: string;
  compartments: readonly FloodCompartment[];
  connections: readonly FloodConnection[];
  warnings?: readonly string[];
  unsupportedConnections?: readonly string[];
}
export interface FloodCompartmentState {
  id: string;
  kind: FloodCompartment["kind"];
  volumeM3: number;
  stageM: number;
  depthM: number;
  capacityM3: number;
}
export interface FloodLedger {
  initialM3: number;
  suppliedM3: number;
  drainedM3: number;
  overflowM3: number;
  storedM3: number;
  balanceErrorM3: number;
}
export interface FloodFrame {
  timeS: number;
  compartments: FloodCompartmentState[];
  ledger: FloodLedger;
  boundaryInflowLps: number;
  transfers: { id: string; from: string; to: string; rateLps: number }[];
}
export interface FloodTrajectory {
  modelVersion: typeof FLOOD_MODEL_VERSION;
  label: typeof FLOOD_MODEL_LABEL;
  geometryVersion: string;
  stationId: string;
  entranceId: string;
  source: "HYPOTHETICAL USER INPUT";
  designation: "SCENARIO / ILLUSTRATIVE";
  inputs: FloodInputs;
  inputUnits: typeof FLOOD_INPUT_UNITS;
  initialVolumesM3: Record<string, number>;
  timeStepS: 0.5 | 1;
  frames: FloodFrame[];
  warnings: string[];
  unsupportedConnections: string[];
}
export interface FloodSimulationOptions {
  /** Only refinement tests need 0.5 s. Rendering never controls the integrator. */
  timeStepS?: 0.5 | 1;
  initialVolumesM3?: Readonly<Record<string, number>>;
}

export const cubicMetresToLitres = (value: number): number => value * 1000;
export const litresToCubicMetres = (value: number): number => value / 1000;
export const metresToFeet = (value: number): number => value / 0.3048;
export const feetToMetres = (value: number): number => value * 0.3048;
export const metresToInches = (value: number): number => value / 0.0254;
export const inchesToMetres = (value: number): number => value * 0.0254;

interface PreparedCompartment extends FloodCompartment {
  floorPatches: FloodFloorPatch[];
  capacityM3: number;
}
const HEAD_RAMP_M = 0.1;
const clip = (value: number, lower: number, upper: number) =>
  Math.max(lower, Math.min(upper, value));

function bounded(
  value: number,
  min: number,
  max: number,
  name: string,
): number {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`${name} must be finite and within ${min}–${max}.`);
  return value;
}
function identity(value: string, name: string): string {
  if (typeof value !== "string" || !value.length || value.length > 200)
    throw new Error(`Invalid ${name}.`);
  return value;
}

/** Exact stepped stage-storage relation; each tread contributes separately. */
export function floodVolumeAtStage(
  compartment: FloodCompartment,
  stageM: number,
): number {
  if (!Number.isFinite(stageM)) throw new Error("Stage must be finite.");
  return compartment.floorPatches.reduce(
    (volume, patch) =>
      volume + patch.areaM2 * Math.max(0, stageM - patch.floorM),
    0,
  );
}

function stageFromSortedPatches(
  patches: readonly FloodFloorPatch[],
  volumeM3: number,
): number {
  let areaM2 = 0;
  let stageM = patches[0].floorM;
  let remainingM3 = volumeM3;
  for (const patch of patches) {
    const intervalVolumeM3 = areaM2 * (patch.floorM - stageM);
    if (remainingM3 <= intervalVolumeM3 && areaM2 > 0)
      return stageM + remainingM3 / areaM2;
    remainingM3 -= intervalVolumeM3;
    areaM2 += patch.areaM2;
    stageM = patch.floorM;
  }
  return stageM + remainingM3 / areaM2;
}

export function floodStageAtVolume(
  compartment: FloodCompartment,
  volumeM3: number,
): number {
  bounded(volumeM3, 0, 1_000_000, "Volume");
  if (!compartment.floorPatches.length)
    throw new Error("Stage-storage requires floor patches.");
  return stageFromSortedPatches(
    [...compartment.floorPatches].sort((a, b) => a.floorM - b.floorM),
    volumeM3,
  );
}

function prepareGeometry(geometry: FloodGeometry): PreparedCompartment[] {
  identity(geometry.stationId, "station identity");
  identity(geometry.entranceId, "entrance identity");
  identity(geometry.version, "geometry version");
  bounded(geometry.streetReferenceM, -100, 100, "Street reference");
  if (
    !Array.isArray(geometry.compartments) ||
    geometry.compartments.length < 1 ||
    geometry.compartments.length > 3 ||
    !Array.isArray(geometry.connections) ||
    geometry.connections.length > 3
  )
    throw new Error("Only one to three local compartments are supported.");
  const ids = new Set<string>();
  const compartments = geometry.compartments.map((compartment) => {
    identity(compartment.id, "compartment identity");
    if (ids.has(compartment.id)) throw new Error("Duplicate compartment ID.");
    ids.add(compartment.id);
    if (!["stairwell", "landing", "platform"].includes(compartment.kind))
      throw new Error("Unsupported compartment kind.");
    if (
      !Array.isArray(compartment.floorPatches) ||
      !compartment.floorPatches.length ||
      compartment.floorPatches.length > 256
    )
      throw new Error("Invalid floor patch count.");
    const floorPatches = compartment.floorPatches
      .map((patch: FloodFloorPatch) => ({
        floorM: bounded(patch.floorM, -100, 100, "Floor elevation"),
        areaM2: bounded(patch.areaM2, 0.001, 2000, "Floor area"),
      }))
      .sort((a: FloodFloorPatch, b: FloodFloorPatch) => a.floorM - b.floorM);
    const maxStageM = bounded(
      compartment.maxStageM,
      floorPatches[0].floorM,
      100,
      "Maximum storage stage",
    );
    const prepared = { ...compartment, maxStageM, floorPatches };
    const capacityM3 = bounded(
      floodVolumeAtStage(prepared, maxStageM),
      0.000001,
      100_000,
      "Compartment capacity",
    );
    return { ...prepared, capacityM3 };
  });
  if (
    !ids.has(geometry.entranceCompartmentId) ||
    !ids.has(geometry.drainageCompartmentId)
  )
    throw new Error("Entrance and drainage must refer to local compartments.");
  const connectionIds = new Set<string>();
  for (const connection of geometry.connections) {
    identity(connection.id, "connection identity");
    if (
      connectionIds.has(connection.id) ||
      !ids.has(connection.from) ||
      !ids.has(connection.to) ||
      connection.from === connection.to ||
      typeof connection.enabled !== "boolean"
    )
      throw new Error("Invalid or unresolved compartment connection.");
    connectionIds.add(connection.id);
    bounded(connection.crestM, -100, 100, "Connection crest");
    bounded(connection.capacityLps, 0, 100, "Connection capacity");
  }
  return compartments;
}

export function validateFloodInputs(inputs: FloodInputs): FloodInputs {
  if (!inputs || typeof inputs !== "object")
    throw new Error("Hypothetical inputs are required.");
  const keys = Object.keys(FLOOD_INPUT_BOUNDS) as (keyof FloodInputs)[];
  if (
    Object.keys(inputs).length !== keys.length ||
    Object.keys(inputs).some((key) => !keys.includes(key as keyof FloodInputs))
  )
    throw new Error("Unknown or missing hypothetical input.");
  const result = { ...inputs };
  for (const key of keys) {
    const bound = FLOOD_INPUT_BOUNDS[key];
    bounded(inputs[key], bound.min, bound.max, key);
  }
  return result;
}

/** Fixed-step local calculation. No clock, fetch, renderer or live data is read. */
export function simulateFloodScenario(
  geometry: FloodGeometry,
  rawInputs: FloodInputs,
  options: FloodSimulationOptions = {},
): FloodTrajectory {
  const inputs = validateFloodInputs(rawInputs);
  const compartments = prepareGeometry(geometry);
  const timeStepS = options.timeStepS ?? 1;
  if (timeStepS !== 0.5 && timeStepS !== 1)
    throw new Error(
      "Only fixed 1 s or refinement 0.5 s timesteps are supported.",
    );
  const byId = new Map(compartments.map((item) => [item.id, item]));
  const volumes = new Map(compartments.map((item) => [item.id, 0]));
  for (const [id, value] of Object.entries(options.initialVolumesM3 ?? {})) {
    const compartment = byId.get(id);
    if (!compartment)
      throw new Error("Initial water has an unknown compartment.");
    volumes.set(
      id,
      bounded(value, 0, compartment.capacityM3, "Initial water storage"),
    );
  }
  const initialVolumesM3 = Object.fromEntries(volumes);
  const totalStored = () => [...volumes.values()].reduce((a, b) => a + b, 0);
  const initialM3 = totalStored();
  let suppliedM3 = 0;
  let drainedM3 = 0;
  let overflowM3 = 0;
  const stage = (id: string, volume = volumes.get(id)!) =>
    stageFromSortedPatches(byId.get(id)!.floorPatches, volume);
  const addWater = (id: string, amountM3: number) => {
    const nextVolume = volumes.get(id)! + amountM3;
    const capacityM3 = byId.get(id)!.capacityM3;
    overflowM3 += Math.max(0, nextVolume - capacityM3);
    volumes.set(id, Math.min(capacityM3, nextVolume));
  };
  const makeFrame = (
    timeS: number,
    boundaryInflowLps: number,
    transfers: FloodFrame["transfers"],
  ): FloodFrame => {
    const storedM3 = totalStored();
    return {
      timeS,
      compartments: compartments.map((compartment) => {
        const volumeM3 = volumes.get(compartment.id)!;
        const stageM = stage(compartment.id);
        return {
          id: compartment.id,
          kind: compartment.kind,
          volumeM3,
          stageM,
          depthM: Math.max(0, stageM - compartment.floorPatches[0].floorM),
          capacityM3: compartment.capacityM3,
        };
      }),
      ledger: {
        initialM3,
        suppliedM3,
        drainedM3,
        overflowM3,
        storedM3,
        balanceErrorM3:
          initialM3 + suppliedM3 - storedM3 - drainedM3 - overflowM3,
      },
      boundaryInflowLps,
      transfers,
    };
  };
  const frames: FloodFrame[] = [makeFrame(0, 0, [])];
  const streetStageM = geometry.streetReferenceM + inputs.streetDepthM;
  const entranceCrestM = geometry.streetReferenceM + inputs.barrierHeightM;
  const entrance = byId.get(geometry.entranceCompartmentId)!;
  const maximumBoundaryStorageM3 = floodVolumeAtStage(entrance, streetStageM);
  for (let step = 1; step <= Math.ceil(inputs.durationS / timeStepS); step++) {
    const timeS = Math.min(inputs.durationS, step * timeStepS);
    const dt = timeS - frames[frames.length - 1].timeS;
    const boundaryHeadM =
      streetStageM -
      Math.max(entranceCrestM, stage(geometry.entranceCompartmentId));
    const boundaryVolumeM3 = Math.min(
      litresToCubicMetres(inputs.inflowCapacityLps) *
        clip(boundaryHeadM / HEAD_RAMP_M, 0, 1) *
        dt,
      Math.max(0, maximumBoundaryStorageM3 - volumes.get(entrance.id)!),
    );
    suppliedM3 += boundaryVolumeM3;
    addWater(entrance.id, boundaryVolumeM3);
    const transfers: FloodFrame["transfers"] = [];
    for (const connection of geometry.connections) {
      const fromVolume = volumes.get(connection.from)!;
      const toVolume = volumes.get(connection.to)!;
      const fromStage = stage(connection.from);
      const toStage = stage(connection.to);
      const headM = fromStage - Math.max(connection.crestM, toStage);
      let amountM3 = 0;
      if (connection.enabled && headM > 0) {
        const aboveCrestM3 = Math.max(
          0,
          fromVolume -
            floodVolumeAtStage(byId.get(connection.from)!, connection.crestM),
        );
        amountM3 = Math.min(
          aboveCrestM3,
          litresToCubicMetres(connection.capacityLps) *
            clip(headM / HEAD_RAMP_M, 0, 1) *
            dt,
        );
        // Equalization bounds eliminate discrete-step uphill overshoot.
        if (
          stage(connection.from, fromVolume - amountM3) <
          stage(connection.to, toVolume + amountM3)
        ) {
          let low = 0;
          let high = amountM3;
          for (let iteration = 0; iteration < 40; iteration++) {
            const middle = (low + high) / 2;
            if (
              stage(connection.from, fromVolume - middle) >=
              stage(connection.to, toVolume + middle)
            )
              low = middle;
            else high = middle;
          }
          amountM3 = low;
        }
      }
      volumes.set(connection.from, fromVolume - amountM3);
      addWater(connection.to, amountM3);
      transfers.push({
        id: connection.id,
        from: connection.from,
        to: connection.to,
        rateLps: cubicMetresToLitres(amountM3 / dt),
      });
    }
    const drainageM3 = Math.min(
      volumes.get(geometry.drainageCompartmentId)!,
      litresToCubicMetres(inputs.drainageCapacityLps) * dt,
    );
    volumes.set(
      geometry.drainageCompartmentId,
      volumes.get(geometry.drainageCompartmentId)! - drainageM3,
    );
    drainedM3 += drainageM3;
    frames.push(
      makeFrame(timeS, cubicMetresToLitres(boundaryVolumeM3 / dt), transfers),
    );
  }
  return {
    modelVersion: FLOOD_MODEL_VERSION,
    label: FLOOD_MODEL_LABEL,
    geometryVersion: geometry.version,
    stationId: geometry.stationId,
    entranceId: geometry.entranceId,
    source: "HYPOTHETICAL USER INPUT",
    designation: "SCENARIO / ILLUSTRATIVE",
    inputs,
    inputUnits: FLOOD_INPUT_UNITS,
    initialVolumesM3,
    timeStepS,
    frames,
    warnings: [
      "Dimensions, storage, barriers, inflow and removal are illustrative assumptions, not station measurements.",
      "The fixed street stage is an external hypothetical boundary; this does not solve station hydraulics.",
      ...(geometry.warnings ?? []),
    ],
    unsupportedConnections: [...(geometry.unsupportedConnections ?? [])],
  };
}

/** Scrubbing reads a computed frame; it never advances the physical calculation. */
export function sampleFloodFrame(
  trajectory: FloodTrajectory,
  requestedTimeS: number,
): FloodFrame {
  if (!Number.isFinite(requestedTimeS))
    throw new Error("Hypothetical elapsed time must be finite.");
  const timeS = clip(requestedTimeS, 0, trajectory.inputs.durationS);
  let low = 0;
  let high = trajectory.frames.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (trajectory.frames[middle].timeS <= timeS) low = middle;
    else high = middle - 1;
  }
  return trajectory.frames[low];
}
