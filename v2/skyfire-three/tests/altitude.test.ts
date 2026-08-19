import { describe, expect, it } from 'vitest';
import { isGroundTargetKind, visualAltitude } from '../src/core/altitude';

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
});

