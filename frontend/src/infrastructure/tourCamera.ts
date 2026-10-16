import type { EntranceDetailGeometry } from "./entranceGeometry";

export type TourViewpoint = "entrance" | "stairwell" | "landing" | "platform";
export interface TourCamera {
  position: [number, number];
  elevation: number;
  bearing: number;
  zoom: number;
  pitch: number;
}
const bearingDegrees = (value: number) =>
  ((((value + 180) % 360) + 360) % 360) - 180;

/**
 * Constrained inspection views of actual selected template components.
 * Local +Y runs from the open street approach down/up the first flight.
 * Bearing must face +Y: adding 175 degrees puts the eye beyond the flight
 * looking back out to the street, with stairs behind/under the camera.
 * These close oblique views deliberately retain the predecessor's useful
 * scale and stay below the problematic near-horizontal 78-degree capture.
 * They are a schematic model tour, not surveyed eye-level navigation.
 */
export function modelTourCamera(
  detail: EntranceDetailGeometry,
  viewpoint: TourViewpoint,
  verticalExaggeration = 1,
): TourCamera | null {
  if (
    !Number.isFinite(verticalExaggeration) ||
    verticalExaggeration < 1 ||
    verticalExaggeration > 5 ||
    !Number.isFinite(detail.orientationDeg)
  )
    return null;
  const entrance = detail.components.find(
    (component) => component.kind === "entrance",
  );
  const firstFlight = detail.components.find(
    (component) => component.kind === "flight",
  );
  const component =
    viewpoint === "stairwell"
      ? firstFlight
      : detail.components.find((component) => component.kind === viewpoint);
  if (!component || !component.position.every(Number.isFinite)) return null;
  let position = [...component.position] as [number, number, number];
  if (viewpoint === "entrance" && entrance && firstFlight) {
    // Aim into the entrance opening, not just at the flat street threshold.
    // The eye remains on the open approach side of the schematic enclosure.
    position = entrance.position.map(
      (value, index) => value + (firstFlight.position[index] - value) * 0.42,
    ) as [number, number, number];
  }
  const presentation =
    viewpoint === "entrance"
      ? { zoom: 21.8, pitch: 65, sideAngle: 15 }
      : viewpoint === "stairwell"
        ? { zoom: 22, pitch: 68, sideAngle: 12 }
        : viewpoint === "landing"
          ? { zoom: 22, pitch: 62, sideAngle: 32 }
          : { zoom: 22, pitch: 64, sideAngle: 28 };
  return {
    position: [position[0], position[1]],
    elevation: position[2] * verticalExaggeration,
    bearing: bearingDegrees(detail.orientationDeg + presentation.sideAngle),
    zoom: presentation.zoom,
    pitch: presentation.pitch,
  };
}
