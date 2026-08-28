/** Port of `sim/world.py`: one car on one track; crash = center leaves the surface. */
import { isInsideTrack } from './containment';
import { stepCar, type Action, type CarState } from './car';
import type { PhysicsConfig, RayConfig } from './config';
import { rayOffsets } from './config';
import { initialProgress, lapsCompleted, updateProgress, type ProgressState } from './progress';
import { castFan, type RayHit } from './raycast';
import { wrapAngle } from '../angle';
import type { Track } from '../track';

export interface WorldState {
  readonly car: CarState;
  readonly progress: ProgressState;
  readonly tick: number;
  readonly crashed: boolean;
  readonly laps: number;
  readonly lapTimes: readonly number[];
  readonly lapStartTick: number;
}

export interface StepTelemetry {
  readonly aLong: number;
  readonly aLat: number;
  readonly deltaS: number;
  readonly lapCompleted: boolean;
}

export function resetAt(
  track: Track,
  x: number,
  y: number,
  heading: number,
  speed: number,
): WorldState {
  const car = { x, y, heading: wrapAngle(heading), speed: Math.max(0, speed) };
  return {
    car,
    progress: initialProgress(track, [x, y]),
    tick: 0,
    crashed: false,
    laps: 0,
    lapTimes: [],
    lapStartTick: 0,
  };
}

export function reset(track: Track, physics: PhysicsConfig): WorldState {
  return resetAt(track, track.start.x, track.start.y, track.start.heading, physics.start_speed);
}

export function step(
  track: Track,
  state: WorldState,
  action: Action,
  physics: PhysicsConfig,
): [WorldState, StepTelemetry] {
  if (state.crashed) throw new Error('cannot step a crashed world; reset it');
  const result = stepCar(state.car, action, physics);
  const car = result.state;
  const position: [number, number] = [car.x, car.y];
  const inside = isInsideTrack(track, position, state.progress.segment);
  const [progress, deltaS] = updateProgress(track, state.progress, position);
  const tick = state.tick + 1;
  const laps = lapsCompleted(progress.s, track);
  let lapTimes = state.lapTimes;
  let lapStartTick = state.lapStartTick;
  const lapCompleted = laps > lapTimes.length;
  if (lapCompleted) {
    lapTimes = [...lapTimes, (tick - lapStartTick) * physics.dt];
    lapStartTick = tick;
  }
  return [
    { car, progress, tick, crashed: !inside.inside, laps, lapTimes, lapStartTick },
    { aLong: result.aLong, aLat: result.aLat, deltaS, lapCompleted },
  ];
}

export function sense(track: Track, state: WorldState, rays: RayConfig): RayHit[] {
  return castFan(
    track,
    [state.car.x, state.car.y],
    state.car.heading,
    rayOffsets(rays),
    rays.max_length,
    state.progress.segment,
  );
}
