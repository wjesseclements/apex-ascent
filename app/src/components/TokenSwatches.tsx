/** Color tokens on display. Names map 1:1 to the @theme block in index.css. */
const COLOR_TOKENS = [
  { name: 'bg', className: 'bg-bg' },
  { name: 'surface', className: 'bg-surface' },
  { name: 'surface-raised', className: 'bg-surface-raised' },
  { name: 'border', className: 'bg-border' },
  { name: 'muted', className: 'bg-muted' },
  { name: 'text', className: 'bg-text' },
  { name: 'accent', className: 'bg-accent' },
  { name: 'throttle', className: 'bg-throttle' },
  { name: 'brake', className: 'bg-brake' },
  { name: 'lateral', className: 'bg-lateral' },
] as const;

export function TokenSwatches() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="design tokens">
      {COLOR_TOKENS.map((token) => (
        <li key={token.name} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`size-8 shrink-0 rounded-md border border-border ${token.className}`}
          />
          <code className="font-mono text-xs text-muted">--color-{token.name}</code>
        </li>
      ))}
    </ul>
  );
}
