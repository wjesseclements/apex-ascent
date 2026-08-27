import { TAU, wrapAngle } from './angle';

describe('wrapAngle', () => {
  it('is the identity inside (-π, π]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(1)).toBe(1);
    expect(wrapAngle(-1)).toBe(-1);
    expect(wrapAngle(Math.PI)).toBe(Math.PI);
  });

  it('maps the excluded endpoint -π to +π (SPEC §3.3 half-open interval)', () => {
    expect(wrapAngle(-Math.PI)).toBe(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBe(Math.PI);
    expect(wrapAngle(3 * Math.PI)).toBe(Math.PI);
  });

  it('removes whole turns', () => {
    expect(wrapAngle(TAU)).toBe(0);
    expect(wrapAngle(-TAU)).toBe(0);
    expect(wrapAngle(1 + 5 * TAU)).toBeCloseTo(1, 12);
    expect(wrapAngle(-1 - 5 * TAU)).toBeCloseTo(-1, 12);
  });

  it('property sweep: result is in (-π, π] and preserves direction', () => {
    // Deterministic sweep, no Math.random: 4001 samples across ±100 turns.
    for (let i = -2000; i <= 2000; i++) {
      const theta = (i / 2000) * 100 * TAU + i * 1e-3;
      const a = wrapAngle(theta);
      expect(a).toBeGreaterThan(-Math.PI);
      expect(a).toBeLessThanOrEqual(Math.PI);
      expect(Math.cos(a)).toBeCloseTo(Math.cos(theta), 9);
      expect(Math.sin(a)).toBeCloseTo(Math.sin(theta), 9);
    }
  });
});
