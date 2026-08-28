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

## Observation from the Slice 5 replay (supervisor, 2026-08-28)

Watching the PPO@5M trail on Track A: the agent holds the throttle essentially
flat (drive ≈ +1 for almost the whole lap, mean +0.94) and manages grip through
**line choice alone** — unlike the GA champion, which lifted and coasted into
corners (76 % full throttle / 23 % coast on seed 42). That sharpens the Slice 7
g-g question: is the agent riding the traction circle's edge on the lateral
axis only (pure cornering), or trading braking for turning (trail-braking)?
The `aLong`/`aLat` columns are already exported; the widget will show it.

## Evaluation protocol (Slice 6, approved)

- **Headline lap time:** deterministic eval, no jitter — same checkpoint +
  seed + track ⇒ identical trajectory.
- **Clean-lap rate:** `evaluate … --episodes 10 --jitter` — each episode's
  start is perturbed (speed ±1 m/s, lateral ±1.5 m, heading ±5°, seeded), and
  the rate is clean laps ÷ laps attempted (completed + the one in progress at
  a crash). On a deterministic env this is the only way "9/10" means anything.
- Bug found while adding jitter: a start slightly *behind* the line projected
  to arc ≈ L and "completed" a 0.02 s lap on tick one. Fixed in
  `progress.initial_progress` (start arc taken in (−L/2, L/2]). Pins unchanged.

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

---

## Slice 6 — E5 (zero-cost part): what did the A-only baseline learn?

**Run:** `slice4-baseline-s0` @ 5.01M, evaluated on tracks it never saw.

| eval track | deterministic | 10 jittered episodes |
|---|---|---|
| track_a (trained) | 3 laps, best 16.18 s | 30/30 clean, 0 crashes, best 16.15 s |
| track_a_mirror (A as left-handers) | crash at **264 m** (11.5 s) | 0/10 clean, 10/10 crash, 264 m |
| track_b | crash at 271 m (11.6 s) | 0/10 clean, 10/10 crash, 271 m |

**Verdict:** the failure on Track B is not "memorized Track A" — the mirror
image of the *same* circuit fails at the same point, the first left-hand
corner. The policy learned **right-handers only**: Track A contains no
left-hander of any radius, so `steer < 0` at speed was never rewarded. Any
generalization experiment must add left-handers to the training
distribution (E5a: A + mirror; E5b: A + B, the labelled upper bound).

## Slice 6 — experiment plan (hypotheses written before the runs)

All runs: 5M steps, 8 subproc envs, checkpoints every 50k, seed 0 unless
stated; the Slice 4 baseline config except for the one named change.
Evaluation: the table from `uv run python -m apex_trainer.debug.summarize_runs`
— latest checkpoint, each track, deterministic best lap + 10 jittered episodes.

| id | change | hypothesis | success looks like |
|---|---|---|---|
| E1 | seeds 1, 2 (config unchanged) | Slice 4's result is the config, not the seed | all seeds: 30/30 clean on A under jitter, best lap within ~0.5 s of 16.2 s |
| E2 | γ 0.99 → 0.995 | a ~3.3 s horizon lets it brake *for* corners rather than react | best lap improves beyond E1's seed spread, or brake usage appears |
| E3 | ent_coef 0 → 0.01 | keeping exploration alive avoids the σ collapse and the 0↔1 rollout crash-rate oscillation | smoother rollout crash rate, no lap-time cost |
| E4 | train with start jitter | robustness at the start line, maybe small lap-time cost | jittered clean-lap rate unchanged (already 30/30) — so "no cost" is the win |
| E5a | tracks = A + A-mirror | left-handers in the distribution ⇒ Track B becomes drivable | laps on B; A lap time within seed spread |
| E5b | tracks = A + B (labelled upper bound) | ceiling for "how good can B get with this budget" | clean laps on B; reported as trained-on-B, never as generalization |

Stop rule: a change that is not outside E1's seed-to-seed spread is "no
effect" and is not extended. The winner gets one ~20M overnight run.

## E1 — repeatability across seeds (result)

Runs: `e1-baseline-s1` (751 s), `e1-baseline-s2` (762 s), config identical to
`slice4-baseline-s0`.

| run | steps | track_a det | track_a jitter×10 | track_a_mirror det | track_a_mirror jitter×10 | track_b det | track_b jitter×10 |
|---|---|---|---|---|---|---|---|
| slice4-baseline-s0 | 5.01M | 3 laps, best 16.18 s | 30/30 clean, 0/10 crash, best 16.15 s | crash @ 264 m | 0/10 clean, 10/10 crash | crash @ 271 m | 0/10 clean, 10/10 crash |
| e1-baseline-s1 | 5.01M | 3 laps, best 16.15 s | 30/30 clean, 0/10 crash, best 16.15 s | 3 laps, best 16.60 s | 30/30 clean, 0/10 crash, best 16.58 s | crash @ 194 m | 0/10 clean, 10/10 crash |
| e1-baseline-s2 | 5.01M | 3 laps, best 16.02 s | 30/30 clean, 0/10 crash, best 16.02 s | crash @ 234 m | 0/10 clean, 10/10 crash | crash @ 254 m | 0/10 clean, 10/10 crash |

**Verdict on repeatability:** the Track A result is the config, not the seed —
three seeds, 90/90 clean jittered laps, best laps 16.02 / 16.15 / 16.18 s
(spread 0.16 s). That is the *seed-to-seed spread* the stop rule uses.

**Correction to the E5 zero-cost verdict above:** "learned right-handers
only" was too strong. Seed 1 drives the mirrored circuit cleanly (30/30, best
16.60 s — 0.45 s slower than its Track A lap) without ever having seen a
left-hander; seeds 0 and 2 crash at the first one. Whether a policy's
steering generalizes across handedness is **seed-dependent** with this
config — which is itself a finding for FINDINGS.md: the observation (rays +
speed + a_lat + previous action) contains the information, and some runs
learn a symmetric enough mapping to use it. None of the three laps Track B
(crashes at 194–271 m), so B needs more than handedness.

## E2–E5b — results (all 5.01M steps, seed 0, ~12 min each)

| run | steps | track_a det | track_a jitter×10 | track_a_mirror det | track_a_mirror jitter×10 | track_b det | track_b jitter×10 |
|---|---|---|---|---|---|---|---|
| e2-gamma0995 | 5.01M | 3 laps, best 15.93 s | 30/30 clean, 0/10 crash, best 15.90 s | crash @ 270 m | 6/16 clean, 10/10 crash, best 16.48 s | crash @ 306 m | 18/22 clean, 4/10 crash, best 18.83 s |
| e3-entcoef001 | 5.01M | 3 laps, best 16.25 s | 30/30 clean, 0/10 crash, best 16.23 s | crash @ 274 m | 4/14 clean, 10/10 crash, best 18.17 s | crash @ 272 m | 0/10 clean, 10/10 crash |
| e4-trainjitter | 5.01M | crash @ 660 m | 10/20 clean, 10/10 crash, best 17.63 s | crash @ 261 m | 0/10 clean, 10/10 crash | crash @ 199 m | 0/10 clean, 10/10 crash |
| e5a-a-plus-mirror | 5.01M | 3 laps, best 15.93 s | 30/30 clean, 0/10 crash, best 15.90 s | 3 laps, best 16.37 s | 30/30 clean, 0/10 crash, best 16.32 s | crash @ 210 m | 0/10 clean, 10/10 crash |
| e5b-a-plus-b | 5.01M | crash @ 602 m | 10/20 clean, 10/10 crash, best 17.80 s | crash @ 704 m | 10/20 clean, 10/10 crash, best 17.75 s | 3 laps, best 18.13 s | 30/30 clean, 0/10 crash, best 18.10 s |

Reference (E1 seed spread on Track A): best lap 16.02–16.18 s, 30/30 clean.

**E2 γ = 0.995 — positive, on two axes.** Track A best lap **15.93 s**
(0.09 s beyond the best seed; small but outside the spread), and — unexpected —
the only single-track run that partially generalizes to Track B: deterministic
start crashes at 306 m, but under start jitter **18/22 clean laps, 4/10
crashes, best 18.83 s**. The longer horizon changes *what* the policy learns
about corners, not just how fast it goes. Note how fragile the deterministic
number is here: one fixed start crashes, most jittered starts lap.

**E3 ent_coef = 0.01 — no effect** on Track A (16.25 s, within spread), no
generalization. Entropy stayed higher, as intended, but nothing downstream
changed. Not extended.

**E4 training with start jitter — negative at this budget, for an
instructive reason.** Track A deterministic eval crashes at 660 m; jittered
10/20 clean. The curve does NOT lag: rollout distance reaches 1569 m by 851k
steps, same as the baseline — then destabilizes after ~3.3M (rollout crash
rate 0.5–0.75 over the final rollouts, distance falling to ~1100 m). The
*final* checkpoint is a bad one; see the checkpoint sweep below. Lesson for
the competence pick: choose a checkpoint by evaluation across checkpoints,
not "latest".

**E5a tracks = A + mirror — positive.** Track A **15.93 s** (same as E2),
mirror 30/30 clean at 16.37 s; but Track B still crashes at 210 m. So
left-handers were the *first* missing ingredient, not the last — Track B's
corner sequence (its tighter, longer combinations) is a second one.

**E5b tracks = A + B (labelled upper bound) — B is learnable:** 30/30 clean on
B, best **18.13 s** — but Track A regresses (deterministic crash at 602 m,
10/20 jittered). Two circuits compete for a [64, 64] network in 5M steps.
Reported as trained-on-B, never as generalization.

**Follow-up 1 (E6):** γ 0.995 + A + mirror — the two positives combined —
5M steps, before choosing the overnight config.

### E4 checkpoint sweep (Track A; deterministic | 5 jittered episodes)

| ckpt | deterministic | jittered |
|---|---|---|
| 0.5M | 3 laps, 16.85 s | 15/15 clean |
| 1.0M | crash @ 264 m | 0/5 clean |
| 1.5M | 3 laps, 16.35 s | 15/15 clean |
| 2.0M | 3 laps, 16.38 s | 15/15 clean |
| 2.5M | crash @ 658 m | 8/13 clean |
| 3.0M | 3 laps, 16.35 s | 15/15 clean |
| 3.5M | crash @ 95 m | 2/7 clean |
| 4.0M | **3 laps, 16.17 s** | **15/15 clean** |
| 4.5M | 3 laps, 16.37 s | 15/15 clean |
| 5.0M | crash @ 1100 m | 7/12 clean |
| 5.01M (final) | crash @ 660 m | 5/10 clean |

The policy alternates between excellent and crashing from one 500k window to
the next: the Slice 4 "stochastic rollout crash-rate oscillation" is not
cosmetic — under jittered training it reaches the deterministic policy. Two
consequences adopted from here on: (1) the competence checkpoint is chosen by
a **checkpoint sweep under jitter** (`uv run python -m
apex_trainer.debug.select_checkpoint`), never "latest"; (2) the 20M overnight
run is judged the same way. Whether the oscillation itself can be damped
(smaller learning rate late, larger batch) is a queued hypothesis, not a
Slice 6 deliverable.

### Checkpoint sweeps on the two positive runs (jitter, every 500k)

- **E5a (A + mirror) on Track A:** best checkpoint 3.5M — 100 % clean, **15.83 s**
  (final 5.01M: 15.92 s). Every sampled checkpoint from 1M on is 100 % clean:
  the two-track run is *more* stable than E4, not less.
- **E2 (γ 0.995, A only) on Track B:** best checkpoint **3.5M — 100 % clean
  (5/5 episodes, 0 crashes), best 18.93 s**; 1M, 2M and 4.5M also 100 %; the
  final 5.01M is the outlier at 4/10 crashes. So the headline "partial
  generalization" above was a checkpoint-selection artefact: **a policy trained
  only on Track A, with γ = 0.995, drives Track B cleanly.** Full row for that
  checkpoint:

| E2 γ=0.995 @ 3.50M | deterministic | 10 jittered episodes |
|---|---|---|
| track_a | 3 laps, best 16.15 s | 30/30 clean, 0/10 crash, best 16.13 s |
| track_a_mirror | 3 laps, best 16.60 s | 30/30 clean, 0/10 crash, best 16.58 s |
| track_b | 3 laps, best 18.93 s | 30/30 clean, 0/10 crash, best 18.93 s |

This is the Slice 6 generalization result FINDINGS.md should lead with —
train-on-A-only, as approved — with E5a/E5b as the labelled secondary rows.
Why γ and not the track mix? A 3.3 s horizon values "slow down before the
corner you cannot see the exit of" over "gain 0.4 m this tick", and that
policy is track-agnostic; the mirror mix teaches left-handers but nothing
about unfamiliar corner *sequences*.

## E6 — γ 0.995 + A + mirror (follow-up 1, result)

| track | deterministic @5.01M | jittered ×10 | best checkpoint (sweep) |
|---|---|---|---|
| track_a | 3 laps, 16.52 s | 30/30 clean, 16.50 s | 4.0M: 16.42 s |
| track_a_mirror | 3 laps, 16.62 s | 30/30 clean, 16.60 s | — |
| track_b | crash @ 203 m | 3/13 clean, 10/10 crash | only 0.5M laps it (19.63 s); 4.5M–5M crash |

**Verdict: the combination is worse than either part.** Track A 0.6 s slower
than E2/E5a, and the Track B generalization that E2 shows at 3.5M is gone
(only the very early 0.5M checkpoint laps B). Adding the mirror track to the
γ 0.995 run spends capacity on left-handers it would otherwise have spent on
the corner-approach behaviour that transfers. Not extended.

## Decision: the overnight config is E2 (γ 0.995, Track A only)

By the approved criteria (clean-lap rate under jitter, then best lap) E2 and
E5a tie on Track A: 100 % both, 15.90 vs 15.83 s — a 0.07 s gap inside the
0.16 s seed spread, i.e. "no effect" by the stop rule. The tiebreaker is
what the rest of the project needs: E2 is the only configuration whose
policy drives all three tracks cleanly from Track-A-only training. **E7:**
`e7-gamma0995-20m` — γ 0.995, seed 0, 20M steps (4× the budget) — judged by
checkpoint sweep, not the final checkpoint. Provisional competence checkpoint
until E7 is evaluated: **E2 @ 3.5M**.

## E7 — the overnight run: γ 0.995, Track A only, 20M steps (result)

`e7-gamma0995-20m`: 20,004,864 steps in 2,880 s (48 min at ~7k steps/s).
Checkpoint sweeps every 1M under jitter (top rows):

Track A (3 episodes):

| ckpt | clean rate | crashes/3 | best lap | track |
|---|---|---|---|---|
| 13.00M | 100% | 0 | 15.80 s | track_a |
| 11.00M | 100% | 0 | 15.82 s | track_a |
| 16.00M | 100% | 0 | 15.83 s | track_a |
| 17.00M | 100% | 0 | 15.85 s | track_a |
| 6.00M | 100% | 0 | 15.87 s | track_a |
| 12.00M | 100% | 0 | 15.88 s | track_a |


Track B (5 episodes):

| ckpt | clean rate | crashes/5 | best lap | track |
|---|---|---|---|---|
| 8.00M | 100% | 0 | 18.97 s | track_b |
| 2.00M | 100% | 0 | 19.15 s | track_b |
| 1.00M | 100% | 0 | 19.15 s | track_b |
| 19.00M | 100% | 0 | 19.43 s | track_b |
| 20.00M | 100% | 0 | 19.48 s | track_b |
| 18.00M | 100% | 0 | 19.48 s | track_b |


Candidates on all three tracks (deterministic / 10 jittered episodes):

| E7 ckpt | track_a det / jitter×10 | track_a_mirror det / jitter×10 | track_b det / jitter×10 |
|---|---|---|---|
| 6M | 15.87s / 30/30 clean, 0 crash, 15.87s | crash@264m / 0/10 clean, 10 crash | crash@263m / 0/10 clean, 10 crash |
| 8M | 16.02s / 30/30 clean, 0 crash, 16.00s | 16.72s / 30/30 clean, 0 crash, 16.70s | 18.98s / 30/30 clean, 0 crash, 18.97s |
| 11M | 15.82s / 30/30 clean, 0 crash, 15.82s | 16.53s / 30/30 clean, 0 crash, 16.52s | crash@708m / 0/10 clean, 10 crash |
| 13M | 15.80s / 30/30 clean, 0 crash, 15.80s | crash@710m / 1/11 clean, 10 crash, 18.20s | crash@301m / 0/10 clean, 10 crash |
| 16M | 15.83s / 30/30 clean, 0 crash, 15.83s | crash@260m / 0/10 clean, 10 crash | crash@201m / 0/10 clean, 10 crash |

**Findings:**
- **4× the budget bought 0.10 s on Track A** (15.80 s @ 13M vs 15.90 s @ 5M) —
  inside the 0.16 s seed spread. By the stop rule that is "no effect": the
  5M-step policy was already at this configuration's ceiling for Track A.
- **Generalization is a property of *some* checkpoints, not of the run.**
  Track B is driven cleanly by 1M, 2M, 8M and 18–20M, and crashed at by 6M,
  11M, 13M and 16M; the fastest Track A checkpoints are the non-generalizing
  ones. Speed on A and transfer to B trade off along training, with no
  monotone trend. Selecting by evaluation on the target is not optional.

**Competence checkpoint (chosen): E7 @ 8M — the generalist.** Track A
16.02 s, mirrored A 16.72 s, Track B 18.98 s, 30/30 clean under jitter on
all three. It costs 0.22 s on Track A versus the specialist (E7 @ 13M,
15.80 s, crashes on both unseen tracks). One checkpoint that drives every
track honestly is worth more to the app, the gallery and the write-up than
a fifth of a second on the training track; the specialist is recorded here
and stays available for FINDINGS. (Decision flagged to the supervisor at the
Slice 6 demo.)

**Slice 6 verdict against SLICES.md:** repeatable clean laps on Track A — yes,
across three seeds and every configuration except E4's unstable checkpoints,
at 15.8–16.2 s versus the GA's 18.83 s reference (with the friendlier
centre-point crash rule caveat). Track B, recorded honestly: **from Track-A-
only training, a γ = 0.995 policy laps Track B cleanly (18.98 s)** — provided
the checkpoint is chosen by evaluation; the γ = 0.99 baseline never does.

---

## Slice 7 — the g-g survey: does PPO trail-brake? (first reading)

Metrics as defined in `app/src/engine/gg.ts` (approved thresholds: trail-braking
tick = a_long < −2 m/s² and |a_lat| > 4; power-on cornering = a_long > 0 and
|a_lat| > 12; grip used = mean |a| / A). **`a_long` excludes drag** — it is the
traction-scaled commanded longitudinal acceleration; drag (0.3/s, ≈ 9 m/s² at
30 m/s) is applied afterwards as a speed decay outside the grip budget, so a
lift reads as 0 and only a real brake command reads negative. Table computed
over the committed gallery files (deterministic episodes, sample 0 excluded):

| checkpoint | track | result | grip used | braking ticks | trail-braking ticks | power-on cornering | brake events | peak |a_lat| | min a_long |
|---|---|---|---|---|---|---|---|---|---|
| 0.05M | track_a | crash | 28% | 0.0% | 0.0% | 0% | 0 | 0.6 | 3.7 |
| 0.1M | track_a | crash | 63% | 0.0% | 0.0% | 34% | 0 | 19.0 | 4.6 |
| 0.25M | track_a | 17.10 s | 80% | 0.0% | 0.0% | 57% | 0 | 20.0 | 1.3 |
| 1M | track_a | 16.33 s | 86% | 0.0% | 0.0% | 63% | 0 | 19.9 | 2.4 |
| 2M | track_a | 16.15 s | 88% | 0.0% | 0.0% | 67% | 0 | 19.8 | 2.9 |
| 8M | track_a | 16.02 s | 88% | 0.0% | 0.0% | 68% | 0 | 19.9 | 1.5 |
| 13M | track_a | 15.80 s | 88% | 0.0% | 0.0% | 69% | 0 | 19.8 | 2.5 |
| 20M | track_a | 16.07 s | 89% | 0.0% | 0.0% | 70% | 0 | 19.9 | 2.2 |
| 8M | track_a_mirror | 16.72 s | 82% | 0.0% | 0.0% | 51% | 0 | 20.0 | 1.0 |
| 13M | track_a_mirror | crash | 84% | 0.0% | 0.0% | 55% | 0 | 19.9 | 1.6 |
| 2M | track_b | 19.15 s | 84% | 0.0% | 0.0% | 51% | 0 | 19.9 | 2.1 |
| 6M | track_b | crash | 79% | 0.0% | 0.0% | 46% | 0 | 20.0 | 1.0 |
| 8M | track_b | 18.98 s | 81% | 0.0% | 0.0% | 47% | 0 | 20.0 | 1.1 |
| 11M | track_b | crash | 80% | 0.0% | 0.0% | 46% | 0 | 20.0 | 0.9 |
| 13M | track_b | crash | 81% | 0.0% | 0.0% | 51% | 0 | 19.9 | 1.6 |
| 20M | track_b | 19.58 s | 77% | 0.0% | 0.0% | 42% | 0 | 20.0 | 0.2 |
| scripted | track_a | 24.82 s | 50% | 5.0% | 1.3% | 24% | 58 | 20.0 | -11.1 |
| ppo@5013504 | track_b | crash | 80% | 0.0% | 0.0% | 49% | 0 | 20.0 | 0.5 |

**Reading:**
- **No PPO checkpoint brakes. Ever.** 0 braking ticks, 0 brake events on
  every checkpoint of E7 on every track, and on the Slice 4 baseline. The
  scripted driver, for contrast, brakes 58 times per run (5 % of ticks, 1.3 %
  trail-braking by the same definition, peak −11 m/s²).
- **It does not even lift to zero.** The minimum commanded a_long across a
  full 60 s episode is +0.2 … +4.6 m/s² (drive ≥ 0.02 … 0.4). The policy
  slows for corners by *asking* for less throttle while the traction circle
  scales that request down further under lateral load, and drag does the
  actual decelerating. In this car model drag is a 9 m/s² "brake" that costs
  no grip — and the agent found it.
- **Grip used climbs with training** (28 % → 63 % → 80 % → 86–89 % on Track A)
  while peak |a_lat| pins at 19.8–20.0 m/s² from 100k steps on: the policy
  learned to ride the circle's edge laterally within the first 100k steps and
  spent the rest of training on line and throttle modulation (power-on
  cornering share 34 % → 70 %).
- On the unseen tracks the same signature holds (grip 77–84 %, no braking);
  the crashes are line errors, not grip errors.

**Verdict for the headline question (to be finalized in FINDINGS.md):** under
this physics (brake ≤ A, drag 0.3/s) and this reward (Δs), PPO does **not**
discover trail-braking — it discovers that braking is never worth the grip
when drag decelerates for free. That is a finding about the environment as
much as the algorithm, and it is the honest answer. A follow-up that would
make the question bite: lower drag (so slowing requires braking) — queued as
a Slice 9 discussion item, not built.

---

## Slice 8a — the low-drag experiment (physics-change discipline)

**Hypothesis (written before the runs):** under the default drag (0.3/s ≈ 9 m/s²
at top speed) no policy ever braked, because drag slowed the car for free.
With `LOW_DRAG_PHYSICS` (drag 0.05/s ≈ 1.5 m/s²) slowing for a corner
*requires* the brakes, so a γ 0.995 policy should discover braking — and, if
it is worth the grip, trail-braking. `NO_DRAG_PHYSICS` is the limit case.
Runs: E8a seeds 0 and 1 (low-drag), E8b seed 0 (no-drag); 5M steps each,
Track A only. The SPEC car stays the default; these presets hash differently.

**E8a seed 0 (low-drag, γ 0.995, 5M) — result.** Checkpoint sweep on Track A:
100 % clean under jitter from 2M on, best lap **15.17 s @ 5.01M** (the
low-drag car is faster: drag no longer bleeds speed on the straights).
The g-g survey (deterministic episodes, thresholds as in Slice 7):

| ckpt | best lap | grip | braking ticks | trail-braking ticks | brake events | min a_long | mean drive |
|---|---|---|---|---|---|---|---|
| 1M | 15.73 s | 91 % | 32.3 % | 13.8 % | 30 | −10.5 | +0.32 |
| 3M | 15.35 s | 91 % | 27.8 % | 17.7 % | 20 | −20.0 | +0.51 |
| 5M | 15.17 s | 91 % | 22.2 % | 14.0 % | 27 | −19.2 | +0.56 |

**Reading:** with the free brake removed, the same algorithm, reward and
network **brake on a quarter of all ticks and trail-brake on about one tick in
seven** — braking hard (peak −20 m/s², the whole budget) while carrying more
than 4 m/s² of lateral load. Braking events per lap ≈ 10 (three laps in 60 s),
i.e. roughly one per corner. Grip utilisation 91 %: the policy rides the
circle in *both* halves now. The Slice 7 "no braking" result was an
environment property; the trail-braking question is answered **yes** as soon
as the environment makes braking worth the grip. Seed 1 and the no-drag
limit follow; the headline is confirmed only if seed 1 agrees.

**E8a seed 1 (low-drag, γ 0.995, 5M) — confirms.** Sweep: 100 % clean from 2M
(best 15.22 s @ 2M). g-g survey:

| ckpt | best lap | grip | braking ticks | trail-braking ticks | brake events | min a_long | mean drive |
|---|---|---|---|---|---|---|---|
| 1M | 15.63 s | 87 % | 22.4 % | 16.2 % | 176 | −12.1 | +0.37 |
| 3M | 15.28 s | 90 % | 32.1 % | 21.0 % | 33 | −19.2 | +0.41 |
| 5.01M | crash @ — | 65 % | 4.0 % | 0.0 % | 1 | −1.0 | +0.79 |

Both seeds brake and trail-brake at every good checkpoint (16–21 % of ticks
for seed 1, 14–18 % for seed 0; ~10 brake events per lap once the jittery
early braking of 1M settles). Seed 1's *final* checkpoint is a degraded one
(crashes, has stopped braking) — the checkpoint-instability pattern from
Slice 6 again, and the reason the competence pick is always a sweep. The
headline is confirmed across seeds: **under low drag, PPO discovers
trail-braking.** The no-drag limit (E8b) follows.
