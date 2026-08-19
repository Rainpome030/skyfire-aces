/** A position in the legacy Canvas 2D simulation. */
export interface LegacyPoint2D {
  x: number;
  y: number;
}

/**
 * A position in the Three.js world.
 *
 * The horizontal combat plane is XZ. Y is physical altitude only.
 */
export interface WorldPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface PlanarDirection {
  x: number;
  z: number;
}

/** Digital steering keys before they are reduced to an analog turn intent. */
export interface DigitalTurnInput {
  left: boolean;
  right: boolean;
}

/**
 * Normalized steering intent. Runtime callers must keep this in [-1, 1].
 * Negative turns left; positive turns right.
 */
export type TurnIntent = number;

/** Renderer-independent aircraft motion state shared by simulation adapters. */
export interface AircraftKinematics {
  position: WorldPoint3D;
  heading: number;
  speed: number;
  bank: number;
}

export type CameraMode = 'world-up' | 'heading-up';

/**
 * Coordinate invariants for the formal v2 implementation.
 * These are compatibility rules, not tunable gameplay values.
 */
export const COORDINATE_CONTRACT = Object.freeze({
  legacyHorizontalX: 'world.x',
  legacyHorizontalY: 'world.z',
  altitudeAxis: 'world.y',
  zeroHeadingAxis: '+world.x',
  positiveHeadingTurn: 'right',
  negativeHeadingTurn: 'left',
  modelNoseAxis: '+local.x',
  worldUpAxis: '+world.y',
  mapNorthAxis: '-world.z'
} as const);

