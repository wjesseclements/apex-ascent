import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import manifestJson from '../../public/gallery/e7/manifest.json';
import manifestE8 from '../../public/gallery/e8/manifest.json';
import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import { PRESETS, findPreset } from '../data/presets';
import { useTransport } from '../store/transport';
import { Gallery } from './Gallery';

beforeEach(() => {
  useTransport.setState({ cars: [], focusIndex: 0, track: null, loadError: null });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json'))
        return {
          ok: true,
          status: 200,
          json: async () => (url.includes('/e8/') ? manifestE8 : manifestJson),
        };
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

const labels = () => useTransport.getState().cars.map((c) => c.label);

describe('presets and persistent ghosts', () => {
  it('registry: three presets, each pointing at real checkpoints', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['flip', 'ladder', 'brakes']);
    expect(findPreset('flip')?.trackId).toBe('track_b');
    expect(findPreset('nope')).toBeUndefined();
  });
  it('"Show the flip" loads Track B with 8M focused and 13M as a ghost', async () => {
    render(<Gallery />);
    await screen.findByRole('tablist', { name: 'track' });
    await userEvent.click(screen.getByRole('button', { name: 'Show the flip' }));
    await act(async () => {});
    expect(labels()).toEqual(['8M · generalist · track_b', '13M · specialist · track_b']);
    expect(screen.getByRole('tab', { name: 'track_b' })).toHaveAttribute('aria-selected', 'true');
  });
  it('a preset deep link is applied on mount', async () => {
    render(<Gallery initialPreset="brakes" />);
    expect(await screen.findByText(/LOW DRAG/)).toBeInTheDocument();
    await act(async () => {});
    expect(labels()).toEqual(['5M · brakes · track_a']);
  });
  it('ghost selection survives a track-tab switch when the ghost exists there', async () => {
    render(<Gallery />);
    await screen.findByRole('tablist', { name: 'track' });
    await act(async () => {});
    expect(labels()).toEqual(['8M · generalist · track_a', '13M · specialist · track_a']); // landing
    await userEvent.click(screen.getByRole('tab', { name: 'track_b' }));
    await act(async () => {});
    expect(labels()).toEqual(['8M · generalist · track_b', '13M · specialist · track_b']);
    await userEvent.click(screen.getByRole('tab', { name: 'track_a_mirror' }));
    await act(async () => {});
    expect(labels()).toEqual([
      '8M · generalist · track_a_mirror',
      '13M · specialist · track_a_mirror',
    ]);
  });
  it('toggling ghost off removes the car and forgets the step', async () => {
    render(<Gallery />);
    await screen.findByRole('tablist', { name: 'track' });
    await act(async () => {});
    const ghostBtn = screen.getByRole('button', { name: /ghost 13M · specialist on track_a/ });
    expect(ghostBtn).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(ghostBtn);
    expect(labels()).toEqual(['8M · generalist · track_a']);
    await userEvent.click(screen.getByRole('tab', { name: 'track_b' }));
    await act(async () => {});
    expect(labels()).toEqual(['8M · generalist · track_b']);
  });
});
