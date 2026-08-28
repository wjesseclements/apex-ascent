import manifestJson from '../../public/gallery/e7/manifest.json';
import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import crash from '../../public/trajectories/ppo-5m-track_b-before.trajectory.json';
import { parseGalleryManifest } from '../engine/gallery';
import { selectPrimary, useTransport } from '../store/transport';
import {
  checkpointLabel,
  fetchManifest,
  focusCheckpoint,
  galleryRef,
  ghostCheckpoint,
  loadLanding,
} from './loadGallery';

const manifest = (() => {
  const r = parseGalleryManifest(manifestJson);
  if (!r.ok) throw new Error(r.error);
  return r.manifest;
})();

/** Serve the committed manifest and stand-in trajectories from the app origin. */
function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/gallery/e7/manifest.json')
      return { ok: true, status: 200, json: async () => manifestJson };
    if (url.startsWith('/gallery/e7/') && url.includes('track_b'))
      return { ok: true, status: 200, json: async () => crash };
    if (url.startsWith('/gallery/e7/'))
      return { ok: true, status: 200, json: async () => scripted };
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => useTransport.setState({ cars: [], focusIndex: 0, track: null, loadError: null }));

describe('loadGallery', () => {
  it('the committed E7 manifest is valid and has the flip', () => {
    expect(manifest.runId).toBe('e7-gamma0995-20m');
    expect(manifest.tracks).toEqual(['track_a', 'track_b', 'track_a_mirror']);
    expect(checkpointLabel(manifest, 8_000_000)).toMatch(/generalist/);
    expect(checkpointLabel(manifest, 13_000_000)).toMatch(/specialist/);
    expect(checkpointLabel(manifest, 42)).toBe('42');
  });
  it('fetches the manifest from the app origin and refuses unknown galleries', async () => {
    const f = stubFetch();
    const m = await fetchManifest(galleryRef('e7'));
    expect(m.checkpoints.length).toBe(10);
    expect(f).toHaveBeenCalledWith('/gallery/e7/manifest.json');
    expect(() => galleryRef('nope')).toThrow(/unknown gallery/);
  });
  it('focus loads a checkpoint as the primary; ghost adds; a missing track entry is an error', async () => {
    stubFetch();
    const ref = galleryRef('e7');
    await focusCheckpoint(manifest, ref, 8_000_000, 'track_a');
    expect(selectPrimary(useTransport.getState())?.label).toBe('8M · generalist · track_a');
    await ghostCheckpoint(manifest, ref, 13_000_000, 'track_a');
    expect(useTransport.getState().cars.map((c) => c.label)).toEqual([
      '8M · generalist · track_a',
      '13M · specialist · track_a',
    ]);
    await ghostCheckpoint(manifest, ref, 50_000, 'track_b'); // 50k was not evaluated on B
    expect(useTransport.getState().loadError).toMatch(/not evaluated on track_b/);
    expect(useTransport.getState().cars).toHaveLength(2);
  });
  it('a ghost from another track is refused by the store guard', async () => {
    stubFetch();
    const ref = galleryRef('e7');
    await focusCheckpoint(manifest, ref, 8_000_000, 'track_a');
    await ghostCheckpoint(manifest, ref, 8_000_000, 'track_b');
    expect(useTransport.getState().loadError).toMatch(/ghost is on track_b/);
    expect(useTransport.getState().cars).toHaveLength(1);
  });
  it('loadLanding focuses one and ghosts the rest; HTTP failures are reported', async () => {
    stubFetch();
    const m = await loadLanding(galleryRef('e7'), 'track_a', 8_000_000, [13_000_000, 2_000_000]);
    expect(m.runId).toBe('e7-gamma0995-20m');
    expect(useTransport.getState().cars).toHaveLength(3);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    await expect(fetchManifest(galleryRef('e7'))).rejects.toThrow(/HTTP 500/);
  });
});
