# apex-ascent

[![CI](https://github.com/wjesseclements/apex-ascent/actions/workflows/ci.yml/badge.svg)](https://github.com/wjesseclements/apex-ascent/actions/workflows/ci.yml)

A PPO agent learns to drive a 2D track under traction-circle physics, paired
with a browser app where you can watch it improve: replay saved laps, flip
between training checkpoints, and (eventually) watch the exported brain drive
live in the browser.

Successor to [apex-evolve](https://github.com/wjesseclements/apex-evolve)
(genetic algorithm, TypeScript). The headline question for the write-up:
**does PPO discover trail-braking?**

## Documents

- **[SPEC.md](SPEC.md)** — what we're building and why.
- **[SLICES.md](SLICES.md)** — the plan, slice by slice, each ending in a demo.
- **[CLAUDE.md](CLAUDE.md)** — the engineering rules.

## Layout

```
trainer/   Python: sim core, Gymnasium env, PPO (SB3), evaluation, export
app/       Vite + React + TS: replay viewer, checkpoint gallery, live mode
tracks/    Track JSON (shared; single source of truth)
.github/   CI, branch ruleset, PR template, Dependabot
```

The border between the halves is the trajectory JSON schema: defined once as
a Zod schema in `app/`, emitted by the Python exporter, cross-validated in CI.

## Commands

Trainer (`cd trainer`, needs [uv](https://docs.astral.sh/uv/)):

```
uv sync
uv run pytest
uv run evaluate --policy scripted             # baseline drivers: scripted | random | random-throttle
uv run train --steps N [--resume runs/<id>]   # Slice 4
uv run evaluate runs/<id> [--checkpoint N]    # Slice 4
uv run tensorboard                            # Slice 4
```

App (`cd app`, Node 24+):

```
npm ci
npm run dev
npm run typecheck && npm run lint && npm run test -- --run && npm run build
```

## CI and merging

Every PR runs two required jobs, `trainer` and `app`, plus a `verify` gate
that only passes when both do. `main` accepts squash merges through PRs only
(ruleset in `.github/rulesets/main.json`). The app deploys to Vercel from
`app/` on every merge.

## Reproducibility

Every `uv run train` leaves `trainer/runs/<run_id>/` with a full config
snapshot, metadata (seed, git sha, library versions, sessions), checkpoints,
TensorBoard events and eval summaries — a run is reconstructible from its
directory alone. `uv run tensorboard --logdir trainer/runs` to watch.

Evaluation is deterministic: same checkpoint + seed + track → identical
trajectory (pinned in tests). Training is seeded end-to-end and reproduces
bit-identically on one machine (verified: two seed-0 runs → identical weights);
it is **not** claimed bit-identical across machines or library versions. A
resumed run is not bit-identical to an uninterrupted one — resume restores
weights and the step counter, not mid-stream RNG state. See SPEC §9 and
`trainer/README.md`.

## Status

Slices 1–4 done: bootstrap, pure sim core (traction circle, tracks, raycasts,
progress), Gymnasium env `ApexDrive-v0` with baseline policies, PPO training
with reconstructible run directories, checkpoint/resume and TensorBoard. The
baseline agent laps Track A cleanly in ~16.3 s after ~1M steps
([TUNING_LOG.md](TUNING_LOG.md)). Next: trajectory export + the replay app
(Slice 5). See SLICES.md.

## License

MIT — see [LICENSE](LICENSE).
