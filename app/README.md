# app

Browser half of apex-ascent: trajectory replay viewer, checkpoint gallery,
traction-circle widget, and (Slice 8) live in-browser driving.

Vite + React 18 + TypeScript strict · Zustand · Tailwind + CSS design tokens ·
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
enforced by ESLint, not convention.
