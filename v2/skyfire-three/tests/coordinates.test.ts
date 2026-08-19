import { describe, expect, it } from 'vitest';
import {
  WORLD_UP,
  WORLD_UP_CAMERA_SCREEN_UP,
  forwardFromHeading,
  headingToTarget,
  integrateHeading,
  legacyPointToWorld,
  modelForwardFromYaw,
  modelYawFromHeading,
  moveAlongHeading,
  planarDot,
  shortestHeadingDelta,
  turnIntentFromDigital,
  worldPointToLegacy
} from '../src/core/coordinates';

const EPSILON = 1e-10;

describe('formal v2 coordinate contract', () => {
  it('maps legacy x/y to world x/z without changing the combat plane', () => {
    const world = legacyPointToWorld({ x: 125, y: -48 }, 3500);

    expect(world).toEqual({ x: 125, y: 3500, z: -48 });
    expect(worldPointToLegacy(world)).toEqual({ x: 125, y: -48 });
  });

  it('keeps physical up and map-stable screen up explicit and orthogonal', () => {
    expect(WORLD_UP).toEqual({ x: 0, y: 1, z: 0 });
    expect(WORLD_UP_CAMERA_SCREEN_UP).toEqual({ x: 0, y: 0, z: -1 });
  });

  it('maps A/left to a negative turn and D/right to a positive turn', () => {
    const left = turnIntentFromDigital({ left: true, right: false });
    const right = turnIntentFromDigital({ left: false, right: true });

    expect(left).toBe(-1);
    expect(right).toBe(1);
    expect(turnIntentFromDigital({ left: true, right: true })).toBe(0);
    expect(integrateHeading(0, left, 1, 0.25)).toBeCloseTo(-0.25);
    expect(integrateHeading(0, right, 1, 0.25)).toBeCloseTo(0.25);
  });

  it('uses the same heading for movement and model nose direction', () => {
    const headings = [0, Math.PI / 6, Math.PI / 2, -Math.PI / 2, Math.PI - 0.01];

    for (const heading of headings) {
      const movement = forwardFromHeading(heading);
      const modelNose = modelForwardFromYaw(modelYawFromHeading(heading));
      const moved = moveAlongHeading({ x: 3, y: 20, z: -4 }, heading, 10);

      expect(modelNose.x).toBeCloseTo(movement.x, 12);
      expect(modelNose.z).toBeCloseTo(movement.z, 12);
      expect(moved.x - 3).toBeCloseTo(movement.x * 10, 12);
      expect(moved.z + 4).toBeCloseTo(movement.z * 10, 12);
      expect(moved.y).toBe(20);
    }
  });

  it('computes a heading from the current point toward every target quadrant', () => {
    const from = { x: 12, y: 8, z: -7 };
    const targets = [
      { x: 42, y: 8, z: -7 },
      { x: 12, y: 40, z: 23 },
      { x: -18, y: 2, z: -7 },
      { x: 12, y: 0, z: -37 },
      { x: -20, y: 100, z: 25 }
    ];

    for (const target of targets) {
      const heading = headingToTarget(from, target);
      const forward = forwardFromHeading(heading);
      const dx = target.x - from.x;
      const dz = target.z - from.z;
      const distance = Math.hypot(dx, dz);
      const targetDirection = { x: dx / distance, z: dz / distance };

      expect(planarDot(forward, targetDirection)).toBeGreaterThan(1 - EPSILON);
      expect(shortestHeadingDelta(heading, headingToTarget(from, target))).toBeCloseTo(0, 12);
    }
  });

  it('does not snap when current and target positions coincide', () => {
    const current = { x: 5, y: 20, z: 9 };
    expect(headingToTarget(current, current, -0.7)).toBeCloseTo(-0.7);
  });
});

