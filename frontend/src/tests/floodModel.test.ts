import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOOD_INPUTS,
  FLOOD_MODEL_LABEL,
  FLOOD_MODEL_VERSION,
  cubicMetresToLitres,
  feetToMetres,
  floodStageAtVolume,
  floodVolumeAtStage,
  inchesToMetres,
  litresToCubicMetres,
  metresToFeet,
  metresToInches,
  sampleFloodFrame,
  simulateFloodScenario,
  validateFloodInputs,
  type FloodGeometry,
  type FloodInputs,
  type FloodTrajectory,
} from "../infrastructure/floodModel";

const geometry: FloodGeometry = {
  stationId: "F21",
  entranceId: "source-entrance-example",
  version: "test-geometry-v1",
  streetReferenceM: 0,
  entranceCompartmentId: "stairwell",
  drainageCompartmentId: "landing",
  compartments: [
    {
      id: "stairwell",
      kind: "stairwell",
      floorPatches: [
        { floorM: -2, areaM2: 2 },
        { floorM: -1, areaM2: 2 },
        { floorM: 0, areaM2: 2 },
      ],
      maxStageM: 0.8,
    },
    {
      id: "landing",
      kind: "landing",
      floorPatches: [{ floorM: -2, areaM2: 8 }],
      maxStageM: -0.2,
    },
    {
      id: "platform",
      kind: "platform",
      floorPatches: [{ floorM: -2, areaM2: 20 }],
      maxStageM: -0.2,
    },
  ],
  connections: [
    {
      id: "stair-landing",
      from: "stairwell",
      to: "landing",
      crestM: -2,
      capacityLps: 20,
      enabled: true,
    },
    {
      id: "landing-platform",
      from: "landing",
      to: "platform",
      crestM: -1.7,
      capacityLps: 12,
      enabled: true,
    },
  ],
};
const inputs = (change: Partial<FloodInputs> = {}): FloodInputs => ({
  ...DEFAULT_FLOOD_INPUTS,
  ...change,
});
const finalFrame = (result: FloodTrajectory) => result.frames.at(-1)!;
function expectConservation(result: FloodTrajectory) {
  for (const frame of result.frames) {
    const { initialM3, suppliedM3, storedM3, drainedM3, overflowM3 } =
      frame.ledger;
    const toleranceM3 = 1e-8 + (initialM3 + suppliedM3) * 1e-10;
    expect(Math.abs(frame.ledger.balanceErrorM3)).toBeLessThan(toleranceM3);
    expect(
      Math.abs(initialM3 + suppliedM3 - storedM3 - drainedM3 - overflowM3),
    ).toBeLessThan(toleranceM3);
    for (const compartment of frame.compartments) {
      expect(compartment.volumeM3).toBeGreaterThanOrEqual(0);
      expect(compartment.volumeM3).toBeLessThanOrEqual(compartment.capacityM3);
      expect(Number.isFinite(compartment.stageM)).toBe(true);
    }
  }
}

describe("local illustrative station storage model", () => {
  it("reproduces the documented toy-compartment ledger without station claims", () => {
    const toy: FloodGeometry = {
      ...geometry,
      stationId: "NUMERICAL_EXAMPLE",
      entranceId: "ILLUSTRATIVE",
      version: "equation-example-v1",
      entranceCompartmentId: "test-storage",
      drainageCompartmentId: "test-storage",
      compartments: [
        {
          id: "test-storage",
          kind: "landing",
          floorPatches: [{ floorM: -1, areaM2: 2 }],
          maxStageM: 0.8,
        },
      ],
      connections: [],
    };
    const frame = finalFrame(
      simulateFloodScenario(toy, inputs({ durationS: 60 })),
    );
    expect(frame.ledger.suppliedM3).toBeCloseTo(1.2, 12);
    expect(frame.ledger.drainedM3).toBeCloseTo(0.12, 12);
    expect(frame.ledger.storedM3).toBeCloseTo(1.08, 12);
    expect(frame.ledger.overflowM3).toBe(0);
    expect(frame.compartments[0].stageM).toBeCloseTo(-0.46, 12);
    expect(frame.compartments[0].depthM).toBeCloseTo(0.54, 12);
  });

  it("uses stepped tread storage and an exact piecewise inverse", () => {
    const stairs = geometry.compartments[0];
    expect(floodVolumeAtStage(stairs, -0.5)).toBe(4);
    expect(floodVolumeAtStage(stairs, -2)).toBe(0);
    for (const stageM of [-2, -1.8, -1, -0.5, 0, 0.35, 0.8]) {
      expect(
        floodStageAtVolume(stairs, floodVolumeAtStage(stairs, stageM)),
      ).toBeCloseTo(stageM, 12);
    }
    expect(
      floodStageAtVolume(
        { ...stairs, floorPatches: [...stairs.floorPatches].reverse() },
        4,
      ),
    ).toBe(-0.5);
  });

  it("keeps zero input at zero while labelling hypothetical water explicitly", () => {
    const result = simulateFloodScenario(
      geometry,
      inputs({ inflowCapacityLps: 0 }),
    );
    expect(finalFrame(result).ledger).toEqual({
      initialM3: 0,
      suppliedM3: 0,
      drainedM3: 0,
      overflowM3: 0,
      storedM3: 0,
      balanceErrorM3: 0,
    });
    expect(result.source).toBe("HYPOTHETICAL USER INPUT");
    expect(result.designation).toBe("SCENARIO / ILLUSTRATIVE");
    expect(result.label).toBe(FLOOD_MODEL_LABEL);
    expectConservation(result);
  });

  it("requires water to exceed the barrier including its exact threshold", () => {
    for (const streetDepthM of [0, 0.09, 0.1]) {
      expect(
        finalFrame(
          simulateFloodScenario(
            geometry,
            inputs({ streetDepthM, barrierHeightM: 0.1, durationS: 10 }),
          ),
        ).ledger.suppliedM3,
      ).toBe(0);
    }
    expect(
      finalFrame(
        simulateFloodScenario(
          geometry,
          inputs({ streetDepthM: 0.1001, barrierHeightM: 0.1, durationS: 10 }),
        ),
      ).ledger.suppliedM3,
    ).toBeGreaterThan(0);
  });

  it("supplies water locally and conserves storage, drainage and internal transfers", () => {
    const result = simulateFloodScenario(geometry, inputs());
    const frame = finalFrame(result);
    expect(frame.ledger.suppliedM3).toBeGreaterThan(0);
    expect(frame.ledger.drainedM3).toBeGreaterThan(0);
    for (const compartment of frame.compartments)
      expect(compartment.volumeM3).toBeGreaterThan(0);
    expectConservation(result);
  });

  it("never removes more water than exists", () => {
    const result = simulateFloodScenario(
      geometry,
      inputs({ inflowCapacityLps: 0, drainageCapacityLps: 100, durationS: 5 }),
      { initialVolumesM3: { landing: 0.03 } },
    );
    expect(finalFrame(result).ledger.drainedM3).toBeCloseTo(0.03, 12);
    expect(finalFrame(result).ledger.storedM3).toBe(0);
    expectConservation(result);
  });

  it("keeps closed and disconnected spaces unfilled", () => {
    const result = simulateFloodScenario(
      {
        ...geometry,
        connections: geometry.connections.map((item) => ({
          ...item,
          enabled: false,
        })),
      },
      inputs(),
    );
    expect(finalFrame(result).compartments[0].volumeM3).toBeGreaterThan(0);
    expect(
      finalFrame(result)
        .compartments.slice(1)
        .map((item) => item.volumeM3),
    ).toEqual([0, 0]);
    expect(
      result.frames
        .flatMap((frame) => frame.transfers)
        .every((item) => item.rateLps === 0),
    ).toBe(true);
    expectConservation(result);
  });

  it("respects connection crests and prevents equalization overshoot", () => {
    const twoRooms: FloodGeometry = {
      ...geometry,
      entranceCompartmentId: "from",
      drainageCompartmentId: "to",
      compartments: ["from", "to"].map((id) => ({
        id,
        kind: "landing",
        floorPatches: [{ floorM: 0, areaM2: 1 }],
        maxStageM: 2,
      })),
      connections: [
        {
          id: "link",
          from: "from",
          to: "to",
          crestM: 0.7,
          capacityLps: 100,
          enabled: true,
        },
      ],
    };
    const testInputs = inputs({
      inflowCapacityLps: 0,
      drainageCapacityLps: 0,
      durationS: 20,
    });
    const crestResult = simulateFloodScenario(twoRooms, testInputs, {
      initialVolumesM3: { from: 1 },
    });
    expect(finalFrame(crestResult).compartments[0].volumeM3).toBeCloseTo(
      0.7,
      8,
    );
    expect(finalFrame(crestResult).compartments[1].volumeM3).toBeCloseTo(
      0.3,
      8,
    );
    const equalResult = simulateFloodScenario(
      { ...twoRooms, connections: [{ ...twoRooms.connections[0], crestM: 0 }] },
      testInputs,
      { initialVolumesM3: { from: 1 } },
    );
    for (const frame of equalResult.frames)
      expect(frame.compartments[0].stageM).toBeGreaterThanOrEqual(
        frame.compartments[1].stageM,
      );
    expect(finalFrame(equalResult).compartments[0].volumeM3).toBeCloseTo(
      0.5,
      10,
    );
    expect(finalFrame(equalResult).compartments[1].volumeM3).toBeCloseTo(
      0.5,
      10,
    );
    expectConservation(crestResult);
    expectConservation(equalResult);
  });

  it("does not transfer street ponding uphill into an elevated platform", () => {
    const elevated: FloodGeometry = {
      ...geometry,
      stationId: "F22",
      entranceCompartmentId: "street",
      drainageCompartmentId: "street",
      compartments: [
        {
          id: "street",
          kind: "stairwell",
          floorPatches: [{ floorM: 0, areaM2: 2 }],
          maxStageM: 0.8,
        },
        {
          id: "elevated",
          kind: "platform",
          floorPatches: [{ floorM: 6, areaM2: 20 }],
          maxStageM: 8,
        },
      ],
      connections: [
        {
          id: "up",
          from: "street",
          to: "elevated",
          crestM: 0,
          capacityLps: 100,
          enabled: true,
        },
      ],
      unsupportedConnections: [
        "Actual elevated access continuation is unresolved.",
      ],
    };
    const result = simulateFloodScenario(
      elevated,
      inputs({ drainageCapacityLps: 0 }),
    );
    expect(finalFrame(result).compartments[0].volumeM3).toBeGreaterThan(0);
    expect(finalFrame(result).compartments[1].volumeM3).toBe(0);
    expect(result.unsupportedConnections).toEqual(
      elevated.unsupportedConnections,
    );
    expectConservation(result);
  });

  it("does not inject into an upward entrance above the street head", () => {
    const upward: FloodGeometry = {
      ...geometry,
      entranceCompartmentId: "upward",
      drainageCompartmentId: "upward",
      compartments: [
        {
          id: "upward",
          kind: "stairwell",
          floorPatches: [{ floorM: 0.5, areaM2: 2 }],
          maxStageM: 1,
        },
      ],
      connections: [],
    };
    const result = simulateFloodScenario(
      upward,
      inputs({ streetDepthM: 0.35 }),
    );
    expect(finalFrame(result).ledger.suppliedM3).toBe(0);
    expectConservation(result);
  });

  it("records overflow instead of silently dropping water", () => {
    const tiny: FloodGeometry = {
      ...geometry,
      entranceCompartmentId: "tiny",
      drainageCompartmentId: "tiny",
      compartments: [
        {
          id: "tiny",
          kind: "stairwell",
          floorPatches: [{ floorM: -1, areaM2: 1 }],
          maxStageM: -0.9,
        },
      ],
      connections: [],
    };
    const result = simulateFloodScenario(
      tiny,
      inputs({ inflowCapacityLps: 100, drainageCapacityLps: 0, durationS: 10 }),
    );
    expect(finalFrame(result).ledger.suppliedM3).toBeCloseTo(1, 12);
    expect(finalFrame(result).ledger.storedM3).toBeCloseTo(0.1, 12);
    expect(finalFrame(result).ledger.overflowM3).toBeCloseTo(0.9, 12);
    expectConservation(result);
  });

  it("is deterministic and scrubs stored frames independent of playback/exaggeration", () => {
    const before = structuredClone(geometry);
    const first = simulateFloodScenario(geometry, inputs({ durationS: 10.25 }));
    const second = simulateFloodScenario(
      geometry,
      inputs({ durationS: 10.25 }),
    );
    expect(first).toEqual(second);
    expect(geometry).toEqual(before);
    expect(first.modelVersion).toBe(FLOOD_MODEL_VERSION);
    expect(first.geometryVersion).toBe(geometry.version);
    expect(first.stationId).toBe("F21");
    expect(first.entranceId).toBe(geometry.entranceId);
    expect(first.frames.at(-1)?.timeS).toBe(10.25);
    expect(sampleFloodFrame(first, 5.75)).toBe(first.frames[5]);
    expect(sampleFloodFrame(first, -1)).toBe(first.frames[0]);
    expect(sampleFloodFrame(first, 100)).toBe(first.frames.at(-1));
    expect(() => sampleFloodFrame(first, NaN)).toThrow();
    for (const timeS of [10, 0, 3, 7, 1]) sampleFloodFrame(first, timeS);
    expect(first).toEqual(second);
  });

  it("agrees under timestep refinement within the documented software tolerance", () => {
    const coarse = simulateFloodScenario(geometry, inputs());
    const refined = simulateFloodScenario(geometry, inputs(), {
      timeStepS: 0.5,
    });
    finalFrame(coarse).compartments.forEach((compartment, index) => {
      const refinedVolume = finalFrame(refined).compartments[index].volumeM3;
      expect(
        Math.abs(compartment.volumeM3 - refinedVolume),
      ).toBeLessThanOrEqual(Math.max(0.02, refinedVolume * 0.02));
    });
    expectConservation(refined);
  });

  it("rejects invalid, unbounded and unknown parameters instead of clipping them", () => {
    for (const change of [
      { streetDepthM: -0.1 },
      { streetDepthM: 2.01 },
      { barrierHeightM: Infinity },
      { inflowCapacityLps: 101 },
      { drainageCapacityLps: NaN },
      { durationS: 1801 },
      { durationS: 0 },
    ]) {
      expect(() => simulateFloodScenario(geometry, inputs(change))).toThrow();
    }
    expect(() =>
      validateFloodInputs({ ...inputs(), unknown: 1 } as FloodInputs),
    ).toThrow();
    expect(() =>
      simulateFloodScenario(geometry, inputs(), {
        initialVolumesM3: { unknown: 1 },
      }),
    ).toThrow();
    expect(() =>
      simulateFloodScenario(geometry, inputs(), {
        initialVolumesM3: { landing: -1 },
      }),
    ).toThrow();
    expect(() =>
      simulateFloodScenario(
        {
          ...geometry,
          connections: [{ ...geometry.connections[0], to: "unresolved" }],
        },
        inputs(),
      ),
    ).toThrow();
  });

  it("bounds refinement work and returns independent station/input results", () => {
    const longest = simulateFloodScenario(
      geometry,
      inputs({ durationS: 1800 }),
      { timeStepS: 0.5 },
    );
    expect(longest.frames).toHaveLength(3601);
    const dry = simulateFloodScenario(
      {
        ...geometry,
        stationId: "R32",
        entranceId: "different-source-entrance",
      },
      inputs({ streetDepthM: 0 }),
    );
    expect(dry.stationId).toBe("R32");
    expect(dry.entranceId).toBe("different-source-entrance");
    expect(finalFrame(dry).ledger.storedM3).toBe(0);
    expect(finalFrame(longest).ledger.suppliedM3).toBeGreaterThan(0);
  });

  it("converts displayed litres, feet and inches explicitly", () => {
    expect(cubicMetresToLitres(1)).toBe(1000);
    expect(litresToCubicMetres(1000)).toBe(1);
    expect(feetToMetres(1)).toBe(0.3048);
    expect(inchesToMetres(1)).toBe(0.0254);
    expect(metresToFeet(0.3048)).toBe(1);
    expect(metresToInches(0.0254)).toBe(1);
    expect(metresToInches(inchesToMetres(3.5))).toBeCloseTo(3.5, 12);
  });
});
