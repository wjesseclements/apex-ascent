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

`npm run schema:generate` regenerates `../trajectory.schema.json` from the Zod
schema; `npm run lint` fails if it is stale.
