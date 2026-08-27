import { TokenSwatches } from './components/TokenSwatches';

const BOOTSTRAP_ITEMS = [
  { label: 'trainer/ — uv project, pytest, ruff', done: true },
  { label: 'app/ — Vite, React 18, TS strict, Vitest, ESLint purity rule', done: true },
  { label: 'CI — trainer · app · verify, required on main', done: true },
  { label: 'Deployed on Vercel — human step, pending', done: false },
] as const;

export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-[0.2em] text-accent uppercase">
          apex-ascent · slice 1
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          A PPO agent learns to drive.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Traction-circle physics, a 2D track, and a browser where you can watch the policy go from
          drunk to competent to fast — checkpoint by checkpoint.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-muted uppercase">
          Bootstrap status
        </h2>
        <ul className="flex flex-col gap-2">
          {BOOTSTRAP_ITEMS.map((item) => (
            <li key={item.label} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${item.done ? 'bg-throttle' : 'bg-border'}`}
              />
              <span className="text-sm">{item.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm text-muted">
          Next: the sim core (Slice 2). First watchable moment: replay (Slice 5).
        </p>
      </section>

      <section className="rounded-lg border border-border bg-surface-raised p-6">
        <h2 className="mb-4 font-mono text-xs tracking-[0.2em] text-muted uppercase">
          Design tokens
        </h2>
        <TokenSwatches />
      </section>

      <footer className="flex items-center gap-4 text-sm text-muted">
        <a
          className="underline decoration-border underline-offset-4 transition-colors hover:text-text"
          href="https://github.com/wjesseclements/apex-ascent"
        >
          github.com/wjesseclements/apex-ascent
        </a>
        <span aria-hidden="true">·</span>
        <span>
          successor to{' '}
          <a
            className="underline decoration-border underline-offset-4 transition-colors hover:text-text"
            href="https://github.com/wjesseclements/apex-evolve"
          >
            apex-evolve
          </a>
        </span>
      </footer>
    </main>
  );
}
