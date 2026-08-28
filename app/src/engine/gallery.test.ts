import {
  GALLERY_SCHEMA_VERSION,
  findEntry,
  galleryJsonSchema,
  parseGalleryManifest,
} from './gallery';

function valid(): Record<string, unknown> {
  return {
    schemaVersion: GALLERY_SCHEMA_VERSION,
    runId: 'e7',
    title: 'E7',
    description: '',
    physicsConfigHash: 'fc40dfb0b2c9',
    config: { gamma: 0.995, steps: 20004864, tracks: 'track_a' },
    tracks: ['track_a', 'track_b'],
    checkpoints: [
      {
        step: 8000000,
        label: '8M · generalist',
        note: 'laps everything',
        entries: [
          {
            trackId: 'track_a',
            file: 'e7-8000000-track_a.trajectory.json',
            crashed: false,
            laps: 3,
            bestLapSec: 16.02,
            lapTimesSec: [17.37, 16.02, 16.02],
            distanceM: 1590,
            sampleHz: 30,
          },
          {
            trackId: 'track_b',
            file: 'e7-8000000-track_b.trajectory.json',
            crashed: false,
            laps: 3,
            bestLapSec: 18.98,
            lapTimesSec: [20.57, 18.98, 19.02],
            distanceM: 1500,
            sampleHz: 30,
          },
        ],
      },
      {
        step: 13000000,
        label: '13M',
        note: '',
        entries: [
          {
            trackId: 'track_b',
            file: 'x.json',
            crashed: true,
            laps: 0,
            bestLapSec: null,
            lapTimesSec: [],
            distanceM: 301,
            sampleHz: 30,
          },
        ],
      },
    ],
    createdAt: '2026-08-28T00:00:00+00:00',
  };
}

describe('parseGalleryManifest', () => {
  it('accepts a valid manifest and finds entries', () => {
    const r = parseGalleryManifest(valid());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(findEntry(r.manifest.checkpoints[0]!, 'track_b')?.bestLapSec).toBe(18.98);
    expect(findEntry(r.manifest.checkpoints[1]!, 'track_a')).toBeUndefined();
  });
  it('rejects unknown versions, paths in file names, unknown tracks and duplicate steps', () => {
    expect(parseGalleryManifest({ ...valid(), schemaVersion: 2 }).ok).toBe(false);
    const m = valid();
    (m.checkpoints as { entries: { file: string }[] }[])[0]!.entries[0]!.file =
      '../../etc/passwd.json';
    expect(parseGalleryManifest(m).ok).toBe(false);
    const m2 = valid();
    (m2.checkpoints as { entries: { trackId: string }[] }[])[0]!.entries[0]!.trackId = 'track_zz';
    const r2 = parseGalleryManifest(m2);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/listed in tracks/);
    const m3 = valid();
    (m3.checkpoints as { step: number }[])[1]!.step = 8000000;
    const r3 = parseGalleryManifest(m3);
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error).toMatch(/unique/);
  });
  it('exports a JSON Schema', () => {
    const js = galleryJsonSchema() as { properties: Record<string, unknown> };
    expect(Object.keys(js.properties)).toContain('checkpoints');
  });
});
