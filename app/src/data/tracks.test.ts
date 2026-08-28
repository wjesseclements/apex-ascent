import { TRACK_IDS, getTrack } from './tracks';

describe('track registry', () => {
  it('knows both tracks and caches them', () => {
    expect(TRACK_IDS).toEqual(['track_a', 'track_b']);
    expect(getTrack('track_a')).toBe(getTrack('track_a'));
    expect(getTrack('track_b').totalLength).toBeCloseTo(509.057, 3);
  });
  it('rejects unknown ids', () => {
    expect(() => getTrack('nope')).toThrow(/unknown track "nope"; known: track_a, track_b/);
  });
});
