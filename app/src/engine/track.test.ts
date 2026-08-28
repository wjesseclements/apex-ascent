import fixture from './__fixtures__/track-geometry.python.json';
import trackA from '../../../tracks/track_a.json';
import trackB from '../../../tracks/track_b.json';
import { TrackFormatError, buildTrack, parseTrackData } from './track';

// Python↔TS parity for the drawn surface. Both sides run the same construction in
// IEEE doubles; 1e-9 m is a rounding budget at ~100 m coordinates, not slack.
const PARITY_TOL = 1e-9;

type Fixture = Record<
  string,
  {
    totalLength: number;
    segmentStart: number[];
    leftEdge: number[][];
    rightEdge: number[][];
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    start: { x: number; y: number; heading: number };
  }
>;
const python = fixture as Fixture;

describe.each([
  ['track_a', trackA],
  ['track_b', trackB],
])('buildTrack(%s) matches the Python sim', (name, raw) => {
  const track = buildTrack(parseTrackData(raw));
  const want = python[name]!;

  it('lengths, start pose and bounds', () => {
    expect(track.name).toBe(name);
    expect(track.totalLength).toBeCloseTo(want.totalLength, 9);
    expect(track.start).toEqual(want.start);
    expect(track.bounds.minX).toBeCloseTo(want.bounds.minX, 9);
    expect(track.bounds.maxY).toBeCloseTo(want.bounds.maxY, 9);
    expect(track.halfWidth).toBe(6);
  });

  it('every edge vertex and segment start', () => {
    expect(track.leftEdge.length).toBe(want.leftEdge.length);
    for (let i = 0; i < track.leftEdge.length; i++) {
      expect(Math.abs(track.leftEdge[i]![0] - want.leftEdge[i]![0]!)).toBeLessThan(PARITY_TOL);
      expect(Math.abs(track.leftEdge[i]![1] - want.leftEdge[i]![1]!)).toBeLessThan(PARITY_TOL);
      expect(Math.abs(track.rightEdge[i]![0] - want.rightEdge[i]![0]!)).toBeLessThan(PARITY_TOL);
      expect(Math.abs(track.rightEdge[i]![1] - want.rightEdge[i]![1]!)).toBeLessThan(PARITY_TOL);
      expect(Math.abs(track.segmentStart[i]! - want.segmentStart[i]!)).toBeLessThan(PARITY_TOL);
    }
  });
});

describe('parseTrackData / buildTrack rejections', () => {
  const ok = {
    name: 't',
    width: 2,
    centerline: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
  };
  it.each([
    [[], /not a JSON object/],
    [{ ...ok, name: '' }, /name/],
    [{ ...ok, width: 0 }, /width/],
    [{ ...ok, centerline: 'x' }, /must be an array/],
    [
      {
        ...ok,
        centerline: [
          [0, 0],
          [1, 0],
        ],
      },
      /at least 3/,
    ],
    [{ ...ok, centerline: [[0, 0], [1], [1, 1]] }, /centerline\[1\]/],
    [
      {
        ...ok,
        centerline: [
          [0, 0],
          [1, 'x'],
          [1, 1],
        ],
      },
      /finite/,
    ],
  ])('rejects %j', (raw, message) => {
    expect(() => parseTrackData(raw)).toThrow(message);
  });
  it('rejects duplicate points and hairpins', () => {
    expect(() =>
      buildTrack({
        name: 't',
        width: 2,
        centerline: [
          [0, 0],
          [10, 0],
          [10, 0],
          [10, 10],
        ],
      }),
    ).toThrow(TrackFormatError);
    expect(() =>
      buildTrack({
        name: 't',
        width: 2,
        centerline: [
          [0, 0],
          [10, 0],
          [0, 0.01],
          [-10, 5],
        ],
      }),
    ).toThrow(/too sharp/);
    expect(() =>
      buildTrack({
        name: 't',
        width: 2,
        centerline: [
          [0, 0],
          [1, 0],
        ],
      }),
    ).toThrow(/at least 3/);
  });
  it('square track edges are exact (CCW: left edge is inside)', () => {
    const t = buildTrack({
      name: 'sq',
      width: 10,
      centerline: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
    });
    expect(t.totalLength).toBe(400);
    expect(t.leftEdge[0]![0]).toBeCloseTo(5, 12);
    expect(t.leftEdge[0]![1]).toBeCloseTo(5, 12);
    expect(t.rightEdge[0]![0]).toBeCloseTo(-5, 12);
  });
});
