import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import manifestJson from '../../public/gallery/e7/manifest.json';
import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import { parseGalleryManifest } from '../engine/gallery';
import { selectPrimary, useTransport } from '../store/transport';
import { Gallery } from './Gallery';
import { LapStrip } from './LapStrip';

const manifest = (() => {
  const r = parseGalleryManifest(manifestJson);
  if (!r.ok) throw new Error(r.error);
  return r.manifest;
})();

beforeEach(() => {
  useTransport.setState({ cars: [], focusIndex: 0, track: null, loadError: null });
  // Serve the manifest, and for trajectory files a copy of the scripted run stamped
  // with the checkpoint step and track parsed from the filename.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json'))
        return { ok: true, status: 200, json: async () => manifestJson };
      const m = /-(\d+)-([a-z_]+)\.trajectory\.json$/.exec(url);
      const meta = {
        ...scripted.meta,
        checkpointStep: Number(m?.[1] ?? 0),
        trackId: m?.[2] ?? 'track_a',
      };
      return { ok: true, status: 200, json: async () => ({ ...scripted, meta }) };
    }),
  );
});

describe('Gallery', () => {
  it('loads the landing state: E7 on Track A, 8M focused, 13M ghost', async () => {
    render(<Gallery />);
    expect(await screen.findByRole('tablist', { name: 'track' })).toBeInTheDocument();
    await act(async () => {});
    expect(useTransport.getState().cars.map((c) => c.label)).toEqual([
      '8M · generalist · track_a',
      '13M · specialist · track_a',
    ]);
    expect(
      screen.getByRole('button', { name: /focus 8M · generalist on track_a/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /ghost 8M · generalist on track_a/ })).toBeDisabled();
  });
  it('switching the track tab lists that track and focus loads it', async () => {
    render(<Gallery />);
    await screen.findByRole('tablist', { name: 'track' });
    await userEvent.click(screen.getByRole('tab', { name: 'track_b' }));
    expect(screen.getByText(/crash @ 263 m/)).toBeInTheDocument(); // 6M on B
    await userEvent.click(screen.getByRole('button', { name: /focus 8M · generalist on track_b/ }));
    expect(selectPrimary(useTransport.getState())?.label).toBe('8M · generalist · track_b');
  });
  it('shows an error when the manifest cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    render(<Gallery />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTP 404/);
  });
});

describe('LapStrip', () => {
  it('draws a point per clean checkpoint, a cross per crash, and picks on click', async () => {
    const onPick = vi.fn();
    render(
      <LapStrip manifest={manifest} trackId="track_a" focusStep={8_000_000} onPick={onPick} />,
    );
    expect(
      screen.getByRole('img', { name: /best lap per checkpoint on track_a/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /50k · first steps: crash/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /13M · specialist: 15.800/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /13M · specialist: 15.800/ }));
    expect(onPick).toHaveBeenCalledWith(13_000_000);
  });
  it('renders nothing for a track with no entries', () => {
    const { container } = render(
      <LapStrip manifest={manifest} trackId="nope" focusStep={null} onPick={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
