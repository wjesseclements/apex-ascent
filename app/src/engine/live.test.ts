import { getTrack } from '../data/tracks';
import {
  createSession,
  isDone,
  observeSession,
  sessionSnapshot,
  sessionTrajectory,
  tickSession,
} from './live';
import { parseTrajectory } from './schema';
import { DEFAULT_PHYSICS, DEFAULT_RAYS } from './sim/config';
import { observe } from './sim/observation';
import { reset, sense } from './sim/world';
import { ggMetrics } from './gg';

const cfg = {
  track: getTrack('track_a'),
  physics: DEFAULT_PHYSICS,
  rays: DEFAULT_RAYS,
  physicsConfigHash: 'fc40dfb0b2c9',
  policyLabel: 'test',
  maxTicks: 3600,
};

describe('live session', () => {
  it('starts at the reset state with sample 0 recorded and the env observation', () => {
    const s = createSession(cfg);
    expect(s.rec.t).toEqual([0]);
    expect(sessionSnapshot(s)).toMatchObject({
      t: 0,
      x: 0,
      y: 0,
      speed: 2,
      lap: 1,
      lapClock: 0,
      crashed: false,
      index: 0,
    });
    const w = reset(cfg.track, cfg.physics);
    expect(observeSession(s)).toEqual(
      observe(sense(cfg.track, w, cfg.rays), 2, 0, { steer: 0, drive: 0 }, cfg.physics, cfg.rays),
    );
  });
  it('full throttle straight ahead crashes at the first corner; recording is a valid trajectory', () => {
    const s = createSession(cfg);
    let ticks = 0;
    while (!isDone(s)) {
      tickSession(s, { steer: 0, drive: 5 }); // clamped to 1
      ticks++;
    }
    expect(s.world.crashed).toBe(true);
    expect(ticks).toBeGreaterThan(200);
    tickSession(s, { steer: 0, drive: 1 }); // no-op once done
    expect(s.rec.t.length).toBe(ticks + 1);
    const tr = sessionTrajectory(s, '2026-08-28T00:00:00+00:00');
    const parsed = parseTrajectory(tr);
    expect(parsed.ok).toBe(true);
    expect(tr.meta.crashed).toBe(true);
    expect(tr.samples.drive[1]).toBe(1);
    expect(tr.samples.t[ticks]).toBeCloseTo(ticks / 60, 12);
    expect(sessionSnapshot(s).crashed).toBe(true);
    expect(ggMetrics(tr).brakingShare).toBe(0);
  });
  it('truncates at maxTicks and records laps', () => {
    // a gentle right arc keeps it on the 80 m straight briefly; use a short session
    const s = createSession({ ...cfg, maxTicks: 30 });
    for (let i = 0; i < 100; i++) tickSession(s, { steer: 0, drive: 0.5 });
    expect(isDone(s)).toBe(true);
    expect(s.world.tick).toBe(30);
    expect(s.world.crashed).toBe(false);
    const tr = sessionTrajectory(s, 'x');
    expect(tr.meta.sampleCount).toBe(31);
    expect(tr.laps).toEqual([]);
  });
});
