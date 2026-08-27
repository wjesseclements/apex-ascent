# TUNING_LOG.md — apex-ascent

Running log of training runs and what changed between them. Every entry has a
run id (reconstructible from `trainer/runs/<run_id>/` on the machine that made
it), the config deviation it tests, and the TensorBoard evidence. Hypotheses
are stated before the run, verdicts after. Started in Slice 4 with the
baseline so the "before" is on record.

Reference points:
- apex-evolve GA champion, Track A, grip 20, seed 42: **18.83 s** best lap
  (seed 43: 18.17 s). 13.63 s is the no-grip-limit champion — not comparable.
- Scripted reference driver (`--policy scripted`): 25.70 s / 24.82 s (Track A),
  29.15 s / 28.30 s (Track B). Deliberately timid.
- Baselines (Track A, 60 s): `random` dithers ~16 m, never crashes;
  `random-throttle` crashes 5/5 within seconds.

## Open hypotheses (queue for Slice 6)

1. **γ = 0.99 is a ~1.7 s horizon at 60 Hz.** Braking for a corner has to start
   2–3 s out at 25 m/s. Test γ ∈ {0.995, 0.997} against the baseline.
2. **Action repeat k ∈ {2, 4}** (SPEC §4.2 sanctioned ablation) if 60 Hz credit
   assignment proves hard.
3. **Reward scale / VecNormalize** only if value-loss dominates.

---

## Slice 4 — baseline (defaults)

**Run:** `slice4-baseline-s0` — Track A, seed 0, all SB3 defaults (γ 0.99,
n_steps 2048, batch 64, 10 epochs, lr 3e-4, [64, 64] MLP), 8 subproc envs,
checkpoints every 50k. Session 1: `--steps 3000000` (3,014,656 after rollout
rounding, 433 s wall-clock, ~7.0k steps/s steady). Session 2: `--resume
--steps 5000000` (3,014,656 → 5,013,504 steps, 297 s, ~6.8k steps/s). ~12 min total for 5M steps.

**Hypothesis:** none — this is the "before". Expected the untrained policy to
dither (mean drive ≈ 0, Slice 3 finding) for a while.

**Deterministic eval ladder (Track A, 60 s episode, mean action):**

| checkpoint | outcome | distance | laps (times) | mean drive |
|---|---|---|---|---|
| 50k | crash @ 6.3 s | 70 m | 0 | +0.46 |
| 100k | crash @ 11.1 s | 217 m | 0 | +0.66 |
| 250k | clean | 1511 m | 3 (18.47, 17.08, 17.08) | +0.81 |
| 500k | clean | 1530 m | 3 (18.18, 16.92, 16.87) | +0.93 |
| 1M | clean | 1572 m | 3 (17.73, 16.35, 16.32) | +0.98 |
| 2M | clean | 1548 m | 3 (17.93, 16.58, 16.58) | +0.96 |
| 3.01M | clean | 1577 m | 3 (17.67, 16.25, 16.28) | +0.96 |
| 5.01M | clean | 1579 m | 3 (17.73, 16.25, 16.18) | +0.94 |

Track B (never trained on), checkpoint 3.01M: crash at 256 m (11 s).
Checkpoint 5.01M: crash at 271 m (11.6 s). No improvement with more Track A training, as expected.

**Observations:**
- The dithering phase was short: by 82k steps mean episode distance was 93 m
  with 100 % crashes — it learned "throttle" before "steer".
- First clean laps between 100k and 250k steps; after ~1M the flying lap sits
  at ~16.3 s and stops improving — **already under the GA's 18.83 s** (with
  the caveat that our centre-point crash rule is ~0.9 m friendlier per side).
- Mean drive climbs to +0.96: the policy is nearly flat-out and lifting rather
  than braking. Whether it *trail-brakes* is the Slice 7 g-g question; a
  16 s lap at 440 m is 27.5 m/s average on a 30 m/s car, so it is lifting for
  corners at most lightly.
- Generalization to Track B fails at the first left-hander sequence — Track A
  is all right-handers. Expected; recorded honestly.
- **Exploration is collapsing:** `train/entropy_loss` climbs monotonically
  from −2.8 to +2.4 over 5M steps (the action Gaussian's σ shrinking), and the
  rollout crash rate oscillates 0 → 1 → 0 while the deterministic eval stays
  clean — the *stochastic* rollout policy occasionally samples itself into the
  wall, then the update over-corrects. Both are Slice 6 material (`ent_coef`,
  or accept it: the deterministic policy is what we evaluate and ship).
- Resume continuity: the TensorBoard curves run straight through the 3.01M
  boundary (`docs/media/slice4-tensorboard-rollout.png`), and
  `progress_until_3014656.csv` preserves session 1's rows.

**Reproducibility check:** a second run with seed 0 to 100k steps
(`slice4-repro-s0`) produced **bit-identical weights** (max |Δ| = 0.0) and an
identical deterministic eval to the baseline's 100k checkpoint, with 8
subprocess envs. Single-machine claim only (SPEC §9).

**Verdict:** baseline is strong enough that Slice 6's job is generalization
and the trail-braking question, not "learn to lap". γ hypothesis stays queued
but is no longer expected to matter for Track A lap time.
