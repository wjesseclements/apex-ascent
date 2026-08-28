import { act, render } from '@testing-library/react';
import type { LivePolicy } from '../live/ortPolicy';
import { getSnapshot, resetBus } from '../store/snapshotBus';
import { useLive } from '../store/live';
import { selectTrajectory, useTransport } from '../store/transport';
import { LiveCanvas, MAX_TICKS_PER_FRAME } from './LiveCanvas';

/** A fake policy: full throttle, no steering — crashes at Track A's first corner. */
const straight: LivePolicy = { label: 'straight', act: async () => ({ steer: 0, drive: 1 }) };

let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  resetBus();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  useLive.setState({
    mode: 'live',
    trackId: 'track_a',
    modelId: 'e7-8m',
    runId: 0,
    status: 'idle',
    error: null,
    tickRate: 0,
  });
  useTransport.setState({ cars: [], focusIndex: 0, track: null });
});

async function runFrame(t: number) {
  const cb = frames.shift();
  expect(cb).toBeDefined();
  await act(async () => {
    await cb!(t);
    await Promise.resolve();
  });
}

describe('LiveCanvas', () => {
  it('does nothing until a run starts, then loads the policy and drives at a fixed dt', async () => {
    const loadPolicy = vi.fn(async () => straight);
    render(<LiveCanvas loadPolicy={loadPolicy} />);
    expect(loadPolicy).not.toHaveBeenCalled();
    await act(async () => useLive.getState().start());
    await act(async () => {
      await Promise.resolve();
    });
    expect(loadPolicy).toHaveBeenCalledWith('/models/e7-8m.onnx', 'E7 @ 8M · generalist');
    expect(useLive.getState().status).toBe('driving');
    expect(getSnapshot()?.t).toBe(0);
    expect(selectTrajectory(useTransport.getState())?.meta.policy).toMatch(/^live/); // HUD follows from tick 0
    // first frame establishes the clock; second frame 100 ms later runs MAX ticks (clamped)
    await runFrame(1000);
    await runFrame(1100);
    expect(getSnapshot()!.index).toBe(MAX_TICKS_PER_FRAME);
    expect(getSnapshot()!.t).toBeCloseTo(MAX_TICKS_PER_FRAME / 60, 12);
    // the 100 ms frame left 33 ms in the accumulator; a 16.7 ms frame then runs 3 ticks
    await runFrame(1116.7);
    expect(getSnapshot()!.index).toBe(MAX_TICKS_PER_FRAME + 3);
  });
  it('stops on crash, records the run into the transport store, and reports the status', async () => {
    render(<LiveCanvas loadPolicy={async () => straight} />);
    await act(async () => useLive.getState().start());
    await act(async () => {
      await Promise.resolve();
    });
    let t = 1000;
    for (let i = 0; i < 400 && frames.length; i++) {
      await runFrame(t);
      t += 100; // 4 ticks per frame
    }
    expect(useLive.getState().status).toBe('crashed');
    expect(getSnapshot()!.crashed).toBe(true);
    expect(frames).toHaveLength(0); // loop stopped
    const tr = selectTrajectory(useTransport.getState());
    expect(tr?.meta.crashed).toBe(true);
    expect(tr?.meta.policy).toMatch(/live · E7 @ 8M/);
    expect(tr?.samples.drive[1]).toBe(1);
  });
  it('reports a policy load failure', async () => {
    render(
      <LiveCanvas
        loadPolicy={async () => {
          throw new Error('no wasm');
        }}
      />,
    );
    await act(async () => useLive.getState().start());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(useLive.getState()).toMatchObject({ status: 'error', error: 'no wasm' });
  });
});
