import { SAMPLE_COLUMNS, SCHEMA_VERSION, parseTrajectory, trajectoryJsonSchema } from './schema';

function valid(n = 3): Record<string, unknown> {
  const col = (v: number) => Array.from({ length: n }, () => v);
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      runId: 'baseline',
      checkpointStep: null,
      policy: 'scripted',
      trackId: 'track_a',
      physicsConfigHash: 'abcdef012345',
      seed: 0,
      dt: 1 / 60,
      createdAt: '2026-08-28T00:00:00+00:00',
      sampleCount: n,
      crashed: false,
    },
    laps: [{ lapTimeSec: 25.7, startStep: 0 }],
    samples: {
      t: Array.from({ length: n }, (_, i) => i / 60),
      x: col(0),
      y: col(0),
      heading: col(0),
      speed: col(2),
      steer: col(0),
      drive: col(0.5),
      aLong: col(0),
      aLat: col(0),
    },
  };
}

describe('parseTrajectory', () => {
  it('accepts a well-formed trajectory', () => {
    const r = parseTrajectory(valid());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.trajectory.meta.trackId).toBe('track_a');
  });

  it('rejects unknown schema versions with a specific message (never guesses)', () => {
    const raw = valid();
    (raw.meta as { schemaVersion: number }).schemaVersion = 2;
    const r = parseTrajectory(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unsupported trajectory schemaVersion 2.*version 1/);
    expect(parseTrajectory(null).ok).toBe(false);
    expect(parseTrajectory({ meta: {} }).ok).toBe(false);
  });

  it('rejects column length mismatches', () => {
    const raw = valid();
    (raw.samples as Record<string, number[]>).speed = [1, 2];
    const r = parseTrajectory(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sampleCount/);
  });

  it('rejects out-of-range controls and headings, and bad lap indices', () => {
    for (const [col, value] of [
      ['steer', 1.5],
      ['drive', -2],
      ['heading', Math.PI + 0.1],
      ['speed', -1],
    ] as const) {
      const raw = valid();
      (raw.samples as Record<string, number[]>)[col] = [value, 0, 0];
      expect(parseTrajectory(raw).ok, col).toBe(false);
    }
    const raw = valid();
    raw.laps = [{ lapTimeSec: 1, startStep: 99 }];
    const r = parseTrajectory(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/startStep/);
  });

  it('exports a JSON Schema with every sample column', () => {
    const js = trajectoryJsonSchema() as {
      properties: { samples: { properties: Record<string, unknown> } };
    };
    expect(Object.keys(js.properties.samples.properties)).toEqual([...SAMPLE_COLUMNS]);
  });
});
