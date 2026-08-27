# SPEC.md — apex-ascent

A PPO agent learns to drive a 2D track under traction-circle physics, paired with a
polished browser app where you watch its progress: replaying saved laps, flipping
between training checkpoints to see it improve, and eventually watching the exported
brain drive live in-browser.

Successor to apex-evolve (genetic algorithm, TypeScript). The GA project is a
reference point for the eventual blog post, **not a constraint on any design
decision here**. Where this spec borrows from it, the reason is stated.

## 1. Goal & thesis

- Learning goal: configure, diagnose, and interpret the standard RL stack
  (Gymnasium + Stable-Baselines3 PPO + TensorBoard) — not reimplement PPO.
- Product goal: a portfolio-quality app in the spirit of apex-evolve and
  f1-telemetry-replay, where the training story is *visible*.
- Headline research question for the writeup: **does PPO discover
  trail-braking** under traction-circle physics?
- Secondary (blog dessert, zero architectural weight): informal comparison
  against the GA champion (lap times, line shape, training cost).

## 2. Repo layout & contract

Monorepo, two halves, one border:

```
apex-ascent/
├── trainer/          # Python: sim, Gymnasium env, PPO, checkpoints, export
├── app/              # Vite + React + TS: replay viewer, gallery, live mode
├── tracks/           # Track JSON files (shared; single source of truth)
├── SPEC.md  CLAUDE.md  SLICES.md
└── .github/          # CI, ruleset config, PR template, dependabot
```

- The **trajectory JSON schema** is the border between trainer and app.
  Defined once as a Zod schema in `app/` (TS type via `z.infer`); the Python
  exporter emits it; the app validates on load. A JSON Schema file generated
  from the Zod schema lives in the repo root and the Python side validates
  against it in tests, so drift is caught in CI, not at runtime.
- Track JSONs are copied from the apex-evolve repo (same format) so existing
  tracks work day one. Format is documented in `tracks/README.md` when ported.

## 3. Environment: the simulated world

### 3.1 Car model
- 2D kinematic car, same family as apex-evolve's arcade model: position,
  heading, forward speed, steering angle → heading rate, throttle/brake →
  longitudinal acceleration.
- Fixed timestep **dt = 1/60 s**. No variable dt anywhere.

### 3.2 Physics: traction circle (the only physics)
- Braking/acceleration and cornering share one grip budget:
  `a_long² + a_lat² ≤ A²`, with **A = 20 m/s²** (matches the GA's lateral cap
  so speeds are in a familiar range).
- When the commanded combination exceeds the budget, the sim scales the
  acceleration vector back onto the circle (documented, tested behavior — no
  silent clipping of one axis before the other).
- This makes trail-braking (braking while turning, trading one for the other)
  physically optimal. That is the point.

### 3.3 Track & progress
- Tracks: closed 2D circuits defined by centerline + width (apex-evolve JSON
  format). Training track = the GA's 440 m track ("Track A"); generalization
  track = "Track B".
- Progress metric: arc-length position along the centerline (projection),
  monotonic per lap, wraps at start/finish. Identical in spirit to the GA's
  fitness metric.
- **Coordinate conventions (locked, stated once, never revisited):**
  x right, y up, heading in radians counterclockwise from +x, angles wrapped
  to (-π, π], track arc-length s in meters from the start line, distances in
  meters, speeds in m/s. The app's canvas layer owns the y-flip for screen
  space; the trainer never thinks about screens.

### 3.4 Episodes
- Start: on the start line, centered, heading along track, small speed (2 m/s)
  to avoid a degenerate standing start.
- Termination (failure): any part of car center leaves track bounds → crash.
- Termination (success): completing a lap does NOT end the episode; the agent
  keeps driving (multi-lap episodes teach sustained pace). Lap times are
  logged per lap.
- Truncation: fixed step limit per episode, `max_steps = 3600` (60 sim-seconds),
  tunable in config.

## 4. Observations & actions (designed for learning, not GA parity)

### 4.1 Observation vector — v0 (typed config; every element documented)
| # | Signal | Normalization |
|---|--------|---------------|
| 1–12 | 12 raycast distances to track edge, fanned −90°…+90° | / max_ray_length → [0, 1] |
| 13 | forward speed | / v_max → ~[0, 1] |
| 14 | lateral speed (slip proxy) | / v_max → ~[−1, 1] |
| 15–16 | previous action (steer, throttle) | already [−1, 1] |

- Rationale: more rays than the GA's 8 inputs = better track vision; lateral
  speed gives the slip information trail-braking needs; previous action gives
  PPO short-term memory without recurrence.
- Any change to this vector is a config version bump, not an edit.

### 4.2 Action space
- `Box(2)`, both in [−1, 1]:
  - `steer`: −1 full left … +1 full right (mapped to steering-rate or angle —
    engineer's call, documented in code, consistent with car model).
  - `drive`: +1 full throttle … −1 full brake (single axis; the traction
    circle arbitrates).
- Agent acts **every physics tick (60 Hz)** in v0. An action-repeat ablation
  (hold each action k ticks, k ∈ {2, 4}) is a sanctioned experiment if 60 Hz
  credit assignment proves hard — clearly labeled as a separate config.

## 5. Reward (all constants in typed config)

| Component | Value (v0) | Why |
|---|---|---|
| Progress delta | `+ Δs` (meters gained along centerline this step) | Dense signal, mirrors GA fitness |
| Crash | `− 10` terminal | Death must outweigh short-term greed |
| Time | none explicit | Discounting + progress-per-step already price time |
| Lap bonus | none in v0 | GA testing found it redundant; revisit only with evidence |

- Expected magnitude sanity check in tests: a competent lap ≈ +440 total
  progress reward; a step at 25 m/s ≈ +0.42. Reward scaling documented.
- Reward hacking watch: the progress projection must not reward corner-cutting
  through walls (crash terminates first) or oscillating across the projection
  (progress is via monotonic wrapped arc-length — property-tested).

## 6. Training workflow

- **Stack:** Python 3.11+, `uv` for env/deps, Gymnasium, Stable-Baselines3
  (PPO, MlpPolicy), TensorBoard, pytest.
- **Compute: CPU only.** Networks are tiny; use SB3 vectorized envs
  (`SubprocVecEnv` or `DummyVecEnv`, benchmark both, n_envs 8–16).
- **Variable-length runs are a first-class feature**, not an afterthought:
  - `uv run train --steps 500000` → trains, checkpoints every
    `checkpoint_interval` steps (default 50k), TensorBoard logs throughout.
  - `uv run train --steps 2000000 --resume runs/<run_id>` → continues from
    the latest checkpoint of that run. Short daytime runs and overnight runs
    are the same command with different numbers.
  - Every run gets a run_id directory: config snapshot (full, serialized),
    checkpoints, TensorBoard events, eval trajectories. A run is
    reconstructible from its directory alone.
- **Evaluation:** `uv run evaluate runs/<run_id> --checkpoint <n>` runs the
  deterministic policy (no exploration noise) for N episodes on named tracks,
  reports lap times / crash rate, and exports trajectory JSON.
- **PPO hyperparameters:** start from SB3 defaults, deviations recorded in
  config with a one-line reason each. Tuning is Slice work with TensorBoard
  evidence, not folklore.

## 7. Trajectory JSON schema (the contract)

One trajectory = one evaluation episode. Shape (finalized in its slice):

```
{
  meta: { schemaVersion, runId, checkpointStep, trackId, physicsConfigHash,
          seed, dt, createdAt },
  laps:  [ { lapTimeSec, startStep } ],
  samples: [ { t, x, y, heading, speed, steer, drive,
               aLong, aLat } ]   // uniform dt, index = t / dt, O(1) lookup
}
```

- Uniform-time samples → O(1) lookup by index (f1-telemetry-replay rule).
- `aLong`/`aLat` are included so the app can render the traction-circle
  utilization widget — the visual proof of trail-braking.
- Schema versioned; app refuses unknown versions with a clear message.

## 8. The app

Vite + React 18 + TypeScript (strict), Zustand (transport state only),
Tailwind + CSS design tokens, Canvas 2D, Zod, Vitest + RTL. Architecture
rules inherited from f1-telemetry-replay are law (see CLAUDE.md).

Feature ladder (maps to slices):
1. **Replay v1:** load trajectory JSON, draw track + car, transport controls
   (play/pause/scrub/speed), HUD (speed, lap clock, current lap).
2. **Checkpoint gallery:** load several trajectories from one run; flip
   between checkpoints or draw ghosts simultaneously (cars is always an
   array); per-checkpoint lap-time strip showing improvement.
3. **Traction-circle widget:** live g-g diagram (a_long vs a_lat dot inside
   the grip circle) synced to replay — the trail-braking visual.
4. **Live driving:** trained policy exported to ONNX, run in-browser via
   onnxruntime-web, driving a TS port of the sim at 60 fps. Requires the
   parity work in §9.

## 9. Parity & determinism (honesty section)

- **Python↔TS sim parity (needed for live mode only):** golden trajectory
  test — identical initial state + recorded action sequence fed to both sims
  must produce trajectories within stated tolerances (position ≤ 1 cm at
  every step over a full lap; tolerance is a named constant with a comment
  explaining float divergence across languages). This test gates the live-
  driving slice; before that slice, the TS sim doesn't exist and no parity
  claim is made.
- **Seeding:** every entry point takes `--seed`; numpy, torch, env resets,
  and SB3 all seeded from it; seed recorded in run metadata.
- **Determinism claims, stated precisely:**
  - Evaluation: deterministic — same checkpoint + seed + track → identical
    trajectory. Pinned in tests.
  - Training: seeded and single-machine-reproducible in practice on CPU with
    torch deterministic algorithms + fixed thread count; NOT claimed
    bit-identical across machines/library versions. The README says exactly
    this. We test what's testable and don't claim what isn't.

## 10. Testing philosophy (ported from apex-evolve, it caught 3 bugs there)

- **Property/invariant sweeps over real track geometry**, not just toy
  examples: traction budget never exceeded (∀ steps: a_long² + a_lat² ≤ A² +
  ε); progress monotonic modulo wrap for any on-track forward path; car
  outside bounds ⇔ episode terminated; observation components always within
  documented ranges; energy/speed sanity (no acceleration from nothing).
- **Golden pins with tolerances** as tripwires: pinned eval trajectory for a
  fixed checkpoint artifact committed to the repo (tiny file); pinned scripted
  -driver trajectory for the sim alone.
- **When physics or reward changes under existing tests:** old pins move to
  explicit legacy configs — never deleted, never silently regenerated.
- Gymnasium `check_env` passes; SB3 smoke test (100 steps) in CI.
- App: engine purity enforced by ESLint `no-restricted-imports`; engine unit
  tests; schema round-trip tests.

## 11. Out of scope (v1)

- Custom PPO implementation, recurrent policies, other algorithms (SAC etc.)
- Multi-agent racing, opponents, collisions between cars
- Track editor; mobile-first layout (desktop-first, don't break mobile)
- GPU training; hyperparameter search frameworks (Optuna etc.)
- The formal GA comparability contract from early planning — explicitly dead.

## 12. Definition of done

- PPO trains to repeatable clean laps on Track A; results on Track B reported
  honestly whichever way they go.
- The trail-braking question answered with evidence (g-g diagram, brake/steer
  traces) — either answer is a finding.
- App live on Vercel with replay, gallery, traction widget; live driving mode
  if the parity gate passes.
- FINDINGS.md in the style of apex-evolve's, including the informal GA
  comparison and what PPO cost vs the GA in wall-clock and samples.
- A stranger can clone the repo and reproduce an evaluation with two commands.
