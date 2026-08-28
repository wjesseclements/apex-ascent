/**
 * The one place the reduced-motion preference is read. It turns AUTOPLAY off —
 * a replay that starts moving on load is ambient motion nobody asked for —
 * while play/pause/seek keep working. Defaults to `false` where `matchMedia`
 * is missing (jsdom, tests).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
