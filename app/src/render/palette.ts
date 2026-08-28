/**
 * Canvas colors come from the same design tokens as the DOM (index.css @theme).
 * Read once per loop start from the root element's computed style; the
 * fallbacks equal the token values so headless tests draw the same picture.
 */
export interface Palette {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly throttle: string;
  readonly brake: string;
  readonly lateral: string;
}

const FALLBACK: Palette = {
  bg: '#0b0d12',
  surface: '#141821',
  surfaceRaised: '#1c2130',
  border: '#2a3142',
  text: '#e8ecf3',
  muted: '#8b95a8',
  accent: '#ff4d1f',
  throttle: '#37d67a',
  brake: '#ff3b5c',
  lateral: '#4da3ff',
};

const TOKEN: Record<keyof Palette, string> = {
  bg: '--color-bg',
  surface: '--color-surface',
  surfaceRaised: '--color-surface-raised',
  border: '--color-border',
  text: '--color-text',
  muted: '--color-muted',
  accent: '--color-accent',
  throttle: '--color-throttle',
  brake: '--color-brake',
  lateral: '--color-lateral',
};

export function readPalette(
  root: Element | null = typeof document === 'undefined' ? null : document.documentElement,
): Palette {
  if (!root) return FALLBACK;
  const style = getComputedStyle(root);
  const out: Record<string, string> = {};
  for (const key of Object.keys(TOKEN) as (keyof Palette)[]) {
    const v = style.getPropertyValue(TOKEN[key]).trim();
    out[key] = v || FALLBACK[key];
  }
  return out as unknown as Palette;
}
