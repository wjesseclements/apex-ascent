import { useTransport } from '../store/transport';

/** The cars on the clock: focus one, drop a ghost. */
export function CarList() {
  const cars = useTransport((s) => s.cars);
  const focusIndex = useTransport((s) => s.focusIndex);
  const { setFocus, removeCar } = useTransport.getState();
  if (cars.length === 0) return null;
  return (
    <section aria-label="cars" className="flex flex-col gap-1">
      <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">Cars</h2>
      <ul className="flex flex-col gap-1">
        {cars.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 text-sm">
            <button
              type="button"
              aria-pressed={i === focusIndex}
              onClick={() => setFocus(i)}
              className={`flex-1 truncate rounded-md border px-2 py-1 text-left ${
                i === focusIndex
                  ? 'border-accent text-text'
                  : 'border-border text-muted hover:border-muted'
              }`}
            >
              {c.label}
            </button>
            {cars.length > 1 && (
              <button
                type="button"
                aria-label={`remove ${c.label}`}
                onClick={() => removeCar(c.id)}
                className="rounded-md border border-border px-2 py-1 text-muted hover:border-brake hover:text-brake"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
