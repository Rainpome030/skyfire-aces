import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TARGETING_CONFIG,
  evaluateTarget,
  forwardAlignment,
  normalizedLockProgress,
  selectBestTarget
} from '../src/core/targeting';

const shooter = { position: { x: 0, y: 3500, z: 0 }, heading: 0 };

function target(id: string, x: number, z: number, y = 3500) {
  return { id, position: { x, y, z }, enemy: true };
}

describe('formal v2 targeting contract', () => {
  it('uses the same forward cone for lock and gun solution checks', () => {
    const forward = evaluateTarget(shooter, target('forward', 400, 0));
    const side = evaluateTarget(shooter, target('side', 250, 260));

    expect(forward.lockEligible).toBe(true);
    expect(forward.gunSolution).toBe(true);
    expect(side.lockEligible).toBe(false);
    expect(side.gunSolution).toBe(false);
    expect(forwardAlignment(shooter, forward.target)).toBeCloseTo(1, 12);
  });

  it('selects the nearest forward target using deterministic score ordering', () => {
    const selected = selectBestTarget(shooter, [
      target('far', 800, 10),
      target('near', 320, 45),
      target('side', 260, 260)
    ]);

    expect(selected?.target.id).toBe('near');
    expect(selected?.range).toBeCloseTo(Math.hypot(320, 45));
  });

  it('rejects targets outside the altitude window without changing planar heading semantics', () => {
    const evaluation = evaluateTarget(shooter, target('high', 300, 0, 3900), {
      ...DEFAULT_TARGETING_CONFIG,
      altitudeWindow: 250
    });

    expect(evaluation.altitudeDelta).toBe(400);
    expect(evaluation.lockEligible).toBe(false);
    expect(evaluation.gunSolution).toBe(false);
    expect(evaluation.angle).toBeCloseTo(0);
  });

  it('clamps lock progress to the visible 0% to 100% range', () => {
    expect(normalizedLockProgress(-1, 0.85)).toBe(0);
    expect(normalizedLockProgress(0.425, 0.85)).toBeCloseTo(0.5);
    expect(normalizedLockProgress(4, 0.85)).toBe(1);
  });
});
