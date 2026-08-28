/** Human-readable numbers for the HUD. */

/** "16.183" under a minute, "1:05.123" above. Negative or non-finite → "—". */
export function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  const s = rest.toFixed(3).padStart(minutes > 0 ? 6 : 1, '0');
  return minutes > 0 ? `${minutes}:${s}` : s;
}

/** m/s → km/h, rounded to an integer. */
export function formatSpeedKmh(mps: number): string {
  return `${Math.round(mps * 3.6)}`;
}

/** Playback multiplier: "0.25×", "1×", "4×". */
export function formatSpeedMult(mult: number): string {
  return `${Number(mult.toFixed(2))}×`;
}
