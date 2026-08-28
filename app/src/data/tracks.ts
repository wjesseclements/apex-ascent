/**
 * The track registry. Tracks are imported straight from the repo's `tracks/`
 * directory at build time (approved: no copies, one source of truth).
 */
import trackA from '../../../tracks/track_a.json';
import trackAMirror from '../../../tracks/track_a_mirror.json';
import trackB from '../../../tracks/track_b.json';
import { buildTrack, parseTrackData, type Track } from '../engine/track';

const RAW: Record<string, unknown> = {
  track_a: trackA,
  track_a_mirror: trackAMirror,
  track_b: trackB,
};
const cache = new Map<string, Track>();

export const TRACK_IDS = Object.keys(RAW);

export function getTrack(trackId: string): Track {
  const hit = cache.get(trackId);
  if (hit) return hit;
  const raw = RAW[trackId];
  if (raw === undefined)
    throw new Error(`unknown track "${trackId}"; known: ${TRACK_IDS.join(', ')}`);
  const track = buildTrack(parseTrackData(raw));
  cache.set(trackId, track);
  return track;
}
