import { HUD_INTERVAL_MS, getSnapshot, publish, resetBus, subscribe } from './snapshotBus';
import type { CarSnapshot } from '../engine/trajectory';

const snap = (t: number): CarSnapshot => ({
  t,
  x: 0,
  y: 0,
  heading: 0,
  speed: 0,
  steer: 0,
  drive: 0,
  aLong: 0,
  aLat: 0,
  index: 0,
  lap: 1,
  lapClock: t,
  crashed: false,
});

beforeEach(() => resetBus());

describe('snapshot bus', () => {
  it('always stores the latest snapshot but notifies at most every HUD interval', () => {
    const calls: number[] = [];
    subscribe(() => calls.push(getSnapshot()!.t));
    publish(snap(1), 0, true);
    publish(snap(2), 5);
    publish(snap(3), 10);
    expect(getSnapshot()!.t).toBe(3);
    expect(calls).toEqual([1]);
    publish(snap(4), HUD_INTERVAL_MS + 1);
    expect(calls).toEqual([1, 4]);
  });
  it('unsubscribe stops notifications', () => {
    let n = 0;
    const off = subscribe(() => n++);
    publish(snap(1), 0, true);
    off();
    publish(snap(2), 1000, true);
    expect(n).toBe(1);
  });
});
