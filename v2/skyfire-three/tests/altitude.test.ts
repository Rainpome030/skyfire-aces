import { describe, expect, it } from 'vitest';
import { aircraftVisualScale, isGroundTargetKind, visualAltitude } from '../src/core/altitude';

describe('legacy entity visual altitude adapter', () => {
  it('keeps explicit altitude values authoritative', () => {
    expect(visualAltitude({ kind: 'fighter', altitude: 1200 })).toBe(1200);
    expect(visualAltitude({ kind: 'radar', altitude: 0 })).toBe(0);
  });

  it('keeps ground targets at sea level when altitude is absent', () => {
    expect(isGroundTargetKind('aa')).toBe(true);
    expect(visualAltitude({ kind: 'radar', id: 4 })).toBe(0);
  });

  it('assigns stable, readable air profiles to legacy enemies', () => {
    const first = visualAltitude({ kind: 'ace', id: 7 });
    const second = visualAltitude({ kind: 'ace', id: 7 });
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(5000);
    expect(visualAltitude({ kind: 'bomber', id: 7 })).toBeLessThan(first);
  });

  it('turns altitude into a bounded aircraft size cue', () => {
    expect(aircraftVisualScale(0)).toBeCloseTo(0.72);
    expect(aircraftVisualScale(3500)).toBeCloseTo(1);
    expect(aircraftVisualScale(7000)).toBeCloseTo(1.28);
    expect(aircraftVisualScale(99999)).toBeCloseTo(1.28);
    expect(aircraftVisualScale(undefined)).toBeCloseTo(1);
  });
});
