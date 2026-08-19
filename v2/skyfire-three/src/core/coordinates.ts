import type {
  DigitalTurnInput,
  LegacyPoint2D,
  PlanarDirection,
  TurnIntent,
  WorldPoint3D
} from './contracts';

export const TAU = Math.PI * 2;
export const WORLD_UP = Object.freeze({ x: 0, y: 1, z: 0 } as const);

/** Fixed screen-up direction for the map-stable (world-up) camera. */
export const WORLD_UP_CAMERA_SCREEN_UP = Object.freeze({ x: 0, y: 0, z: -1 } as const);

const COINCIDENT_POINT_EPSILON = 1e-9;

export function clampTurnIntent(intent: TurnIntent): TurnIntent {
  return Math.max(-1, Math.min(1, intent));
}

/** A/left is -1, D/right is +1, and opposing inputs cancel. */
export function turnIntentFromDigital(input: DigitalTurnInput): TurnIntent {
  return Number(input.right) - Number(input.left);
}

/** Normalize an angle to [-PI, PI). */
export function normalizeHeading(heading: number): number {
  const normalized = ((heading + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return Object.is(normalized, -0) ? 0 : normalized;
}

/** Signed shortest rotation from one heading to another. */
export function shortestHeadingDelta(from: number, to: number): number {
  return normalizeHeading(to - from);
}

export function integrateHeading(
  heading: number,
  turnIntent: TurnIntent,
  turnRateRadiansPerSecond: number,
  deltaSeconds: number
): number {
  return normalizeHeading(
    heading + clampTurnIntent(turnIntent) * turnRateRadiansPerSecond * Math.max(0, deltaSeconds)
  );
}

/** Legacy Canvas x/y becomes Three.js x/z; altitude is the Three.js y axis. */
export function legacyPointToWorld(point: LegacyPoint2D, altitude: number): WorldPoint3D {
  return { x: point.x, y: altitude, z: point.y };
}

export function worldPointToLegacy(point: WorldPoint3D): LegacyPoint2D {
  return { x: point.x, y: point.z };
}

/** heading=0 faces +X. Positive headings turn toward +Z. */
export function forwardFromHeading(heading: number): PlanarDirection {
  return { x: Math.cos(heading), z: Math.sin(heading) };
}

/**
 * Three.js positive Y rotation sends local +X toward -Z. The formal model
 * convention therefore renders simulation heading with the opposite yaw.
 */
export function modelYawFromHeading(heading: number): number {
  return -normalizeHeading(heading);
}

/** World-space nose direction for a model whose local nose points along +X. */
export function modelForwardFromYaw(yaw: number): PlanarDirection {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

export function moveAlongHeading(
  position: WorldPoint3D,
  heading: number,
  distance: number
): WorldPoint3D {
  const forward = forwardFromHeading(heading);
  return {
    x: position.x + forward.x * distance,
    y: position.y,
    z: position.z + forward.z * distance
  };
}

/**
 * Heading from the current point to a target on the combat plane.
 * Coincident points preserve the supplied heading to avoid an arbitrary snap.
 */
export function headingToTarget(
  from: WorldPoint3D,
  target: WorldPoint3D,
  coincidentHeading = 0
): number {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  if (Math.hypot(dx, dz) <= COINCIDENT_POINT_EPSILON) return normalizeHeading(coincidentHeading);
  return normalizeHeading(Math.atan2(dz, dx));
}

export function planarDot(a: PlanarDirection, b: PlanarDirection): number {
  return a.x * b.x + a.z * b.z;
}

