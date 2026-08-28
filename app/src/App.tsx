import { CarList } from './components/CarList';
import { Gallery } from './components/Gallery';
import { Hud } from './components/Hud';
import { TrajectoryPicker } from './components/TrajectoryPicker';
import { Transport } from './components/Transport';
import { TrackCanvas } from './render/TrackCanvas';

export function App({ autoload = true }: { autoload?: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-accent uppercase">
            apex-ascent · replay
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Watch the policy drive.</h1>
        </div>
        <a
          className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-text"
          href="https://github.com/wjesseclements/apex-ascent"
        >
          github.com/wjesseclements/apex-ascent
        </a>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3">
          <div className="aspect-[4/3] w-full">
            <TrackCanvas />
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <Transport />
          </div>
        </div>
        <aside className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-4">
          <Hud />
          <CarList />
          <Gallery autoload={autoload} />
          <TrajectoryPicker />
        </aside>
      </div>
      <p className="text-xs text-muted">
        Space toggles play. Trail colour: <span className="text-throttle">throttle</span> ·{' '}
        <span className="text-brake">brake</span> · coast.
      </p>
    </main>
  );
}
