import { MAX_FRAME_DT_S, advanceClock, frameDelta } from './clock';

describe('frameDelta', () => {
  it('is 0 on the first frame and for non-positive or NaN intervals', () => {
    expect(frameDelta(null, 100)).toBe(0);
    expect(frameDelta(100, 100)).toBe(0);
    expect(frameDelta(200, 100)).toBe(0);
    expect(frameDelta(NaN, 100)).toBe(0);
  });
  it('converts ms to s and clamps a resumed background tab', () => {
    expect(frameDelta(0, 16)).toBeCloseTo(0.016, 12);
    expect(frameDelta(0, 60_000)).toBe(MAX_FRAME_DT_S);
  });
});

describe('advanceClock', () => {
  it('accumulates scaled deltas and wraps at the duration', () => {
    expect(advanceClock(1, 0.5, 2, 60)).toBe(2);
    expect(advanceClock(59.9, 0.2, 1, 60)).toBeCloseTo(0.1, 9);
    expect(advanceClock(0, 0.1, -1, 60)).toBeCloseTo(59.9, 9);
  });
});
