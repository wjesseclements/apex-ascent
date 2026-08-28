import { CarList } from './components/CarList';
import { Gallery } from './components/Gallery';
import { GgWidget } from './components/GgWidget';
import { LivePanel } from './components/LivePanel';
import { Hud } from './components/Hud';
import { TrajectoryPicker } from './components/TrajectoryPicker';
import { Transport } from './components/Transport';
import { LiveCanvas } from './render/LiveCanvas';
import { TrackCanvas } from './render/TrackCanvas';
import { useEffect } from 'react';
import { applyDeepLink, parseDeepLink } from './data/deepLink';
import { useLive } from './store/live';

export function App({ autoload = true }: { autoload?: boolean }) {
  const mode = useLive((s) => s.mode);
  const setMode = useLive.getState().setMode;
  const link =
    typeof window !== 'undefined' ? parseDeepLink(window.location.search) : parseDeepLink('');
  useEffect(() => {
    if (autoload) applyDeepLink(link);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the URL is read once on mount
  }, [autoload]);
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-accent uppercase">
            apex-ascent · replay
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Watch the policy drive.</h1>
        </div>
        <div className="flex items-center gap-3">
          <div role="tablist" aria-label="mode" className="flex gap-1">
            {(['replay', 'live'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-md border px-3 py-1 font-mono text-xs ${mode === m ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:border-muted'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <a
            className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-text"
            href="https://github.com/wjesseclements/apex-ascent"
          >
            github.com/wjesseclements/apex-ascent
          </a>
        </div>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3">
          <div className="aspect-[4/3] w-full">
            {mode === 'live' ? <LiveCanvas /> : <TrackCanvas />}
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            {mode === 'live' ? <LivePanel /> : <Transport />}
          </div>
        </div>
        <aside className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-4">
          <Hud />
          <GgWidget />
          <CarList />
          {/* a live deep link must not have the gallery's landing state overwrite the live car */}
          <Gallery autoload={autoload && link.mode !== 'live'} initialPreset={link.preset} />
          <TrajectoryPicker />
        </aside>
      </div>
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          {mode === 'live'
            ? 'Live: the ONNX policy drives the TypeScript sim at 60 Hz in your browser.'
            : 'Replay: Space toggles play. Trail colour: throttle green · brake red · coast grey.'}
        </span>
        <a
          className="underline decoration-border underline-offset-4 hover:text-text"
          href="https://github.com/wjesseclements/apex-ascent/blob/main/FINDINGS.md"
        >
          FINDINGS
        </a>
        <a
          className="underline decoration-border underline-offset-4 hover:text-text"
          href="https://github.com/wjesseclements/apex-ascent/blob/main/TUNING_LOG.md"
        >
          TUNING_LOG
        </a>
        <span>Deep links: ?preset=flip · ?mode=live&amp;model=e8a-lowdrag-5m&amp;autostart=1</span>
      </footer>
    </main>
  );
}
