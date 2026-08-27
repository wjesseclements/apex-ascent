# CLAUDE.md — apex-ascent

PPO agent learns to drive a 2D track (Python trainer) + browser viewer app
(React/TS). SPEC.md holds the detail; SLICES.md holds the plan; this file
holds the law.

## Stack

- `trainer/`: Python 3.11+, uv, Gymnasium, Stable-Baselines3 (PPO),
  TensorBoard, pytest. CPU only.
- `app/`: Vite + React 19 + TypeScript strict, Zustand, Tailwind + CSS vars,
  Canvas 2D, Zod, Vitest + React Testing Library, ESLint + Prettier.
- Shared: `tracks/*.json`; trajectory JSON schema (Zod is the source of truth,
  generated JSON Schema validated by Python tests).

## Commands

- Trainer: `cd trainer && uv run pytest` · `uv run train --steps N [--resume runs/<id>]`
  · `uv run evaluate runs/<id> [--checkpoint N]` · `uv run tensorboard`
- App: `cd app && npm run dev | typecheck | lint | test -- --run | build`
- CI must run all of the above (tests/lint/typecheck/build) on every PR.

## Workflow (non-negotiable)

1. Work in slices per SLICES.md. Autonomous WITHIN a slice: implement, test,
   open PRs, merge your own PRs when CI is green.
2. STOP and wait for the human at exactly three points:
   (a) slice plan approval before starting a slice,
   (b) any spec ambiguity or contradiction — ask, don't guess,
   (c) slice demo sign-off before the next slice begins.
3. Every PR description includes a plain-English summary a non-specialist can
   review async. Conventional commits. Squash merge, linear history.
4. Never weaken, skip, or delete a failing test to make CI green. If a test is
   wrong, say so in the PR and fix the test with justification.
5. RL concepts get a one-or-two-sentence plain-English explanation in PR
   descriptions the first time they appear (the human is new to RL).

## Architecture rules — trainer

1. **Sim core is pure and headless**: `trainer/sim/` imports neither Gymnasium
   nor SB3 nor anything IO. Physics, geometry, progress, raycasts live there,
   fully unit-tested. The Gymnasium env wraps it.
2. **One typed config module**; no magic numbers anywhere. Reward constants,
   physics constants, PPO deviations from SB3 defaults — all in config, each
   with a one-line reason. Config snapshot serialized into every run dir.
3. **Fixed dt = 1/60.** No variable timestep, no wall-clock in the sim.
4. **Coordinate conventions** are locked in SPEC §3.3. State them in one
   module docstring; everything imports understanding from there.
5. **Every entry point takes --seed**; numpy/torch/env/SB3 all seeded from it;
   seed recorded in run metadata. Evaluation is deterministic and pinned.
6. **Runs are reconstructible**: `runs/<run_id>/` contains config snapshot,
   checkpoints, TensorBoard events, eval trajectories. Nothing about a run
   lives only in a terminal scrollback.

## Architecture rules — app (inherited from f1-telemetry-replay; they work)

1. **One clock, in a ref, never in React/store state.** A single
   requestAnimationFrame loop owns the live clock. Store holds only discrete
   transport state. HUD reads interpolated snapshots at ≤30fps. Never setState
   per animation frame; never subscribe the canvas to per-frame updates.
2. **`cars` is always an array.** Never branch on car count. (This is what
   makes checkpoint ghosts free.)
3. **Uniform-time samples, O(1) lookup** via `index = t / dt`. No scanning.
4. **`app/src/engine/` is pure and headless** — no React/DOM/canvas imports;
   enforced by ESLint `no-restricted-imports`; all geometry/time/interpolation
   logic there, unit-tested.
5. **The Zod schema is the single contract.** App validates every loaded
   trajectory; unknown schemaVersion → clear error, never a guess.

## Testing philosophy (ported from apex-evolve; it caught 3 bugs there)

1. Property/invariant sweeps over REAL track geometry, not just toy examples.
   Minimum set: traction budget never exceeded; progress monotonic modulo
   wrap; out-of-bounds ⇔ terminated; observations within documented ranges.
2. Golden pins with stated tolerances as tripwires (scripted-driver trajectory
   for the sim; pinned eval trajectory for a committed checkpoint). Tolerances
   are named constants with a comment explaining why exact equality is wrong.
3. When physics/reward changes under existing tests: old pins move to explicit
   legacy configs. Never deleted, never silently regenerated.
4. Python↔TS parity test (live-mode slice only): same initial state + action
   tape → trajectories within SPEC §9 tolerances.

## Repo & delivery

- GitHub `wjesseclements/apex-ascent`, public. `gh` CLI is authenticated —
  create the repo, push, configure branch protection as a ruleset via
  `gh api` (require PR + green `verify` check before merge to main).
- CI: GitHub Actions, two jobs (trainer, app), both required.
- Dependabot + PR template + .gitignore set up in bootstrap.
- Vercel deploys `app/` via Git integration. Linking the repo in the Vercel
  dashboard (Root Directory = `app`) is a HUMAN step — request it in the
  bootstrap demo checklist, don't attempt it.
- Track JSONs: copy from the public apex-evolve repo
  (github.com/wjesseclements/apex-evolve) during the sim slice; document the
  format in `tracks/README.md`.
