# app

Browser half of apex-ascent: trajectory replay viewer, checkpoint gallery,
traction-circle widget, and (Slice 8) live in-browser driving.

Vite + React 19 + TypeScript strict · Zustand · Tailwind + CSS design tokens ·
Canvas 2D · Zod · Vitest + React Testing Library · ESLint + Prettier.

```
npm ci
npm run dev
npm run typecheck
npm run lint          # eslint + prettier --check
npm run test -- --run
npm run build
```

Architecture rules live in `../CLAUDE.md`. `src/engine/` is pure and headless —
enforced by ESLint and a ≥90 % per-file coverage gate, not convention.

Layout: `engine/` (schema, trajectory lookup, clock rule, camera, track
geometry — no React/DOM), `store/` (discrete transport state + the ≤30 Hz HUD
snapshot bus), `render/` (the one rAF loop and pure draw routines),
`components/` (HUD, transport, picker), `data/` (track registry importing
`../../tracks/*.json` at build time; committed samples in `public/trajectories/`).

`npm run schema:generate` regenerates `../trajectory.schema.json` and
`../gallery.schema.json` from the Zod schemas; `npm run lint` fails if they
are stale.

Live mode (`src/live/`, `src/engine/sim/`): the sim core ported from Python
(parity-tested against recorded action tapes at every tick), driven at a
fixed 60 Hz by ONNX policies in `public/models/` through onnxruntime-web.
The WASM runtime is copied into `public/ort/` on `npm install` (gitignored)
and loaded from the app's own origin only when live mode starts. Deep links:
`?mode=live&track=track_b&model=e7-13m&autostart=1`.
