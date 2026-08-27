# SLICES.md — apex-ascent

Each slice ends deployable/runnable with a demo checklist the human verifies
with human eyes before the next slice begins. Claude Code proposes a concrete
plan at the start of each slice and waits for approval (checkpoint a), works
autonomously, then stops at the demo (checkpoint c).

Slices are ordered so something watchable exists as early as possible.

---

## Slice 1 — Bootstrap: repo, scaffolds, CI, deploy

Claude Code does ALL of this itself (git init, `gh repo create`, push, ruleset
via `gh api`, CI, dependabot, PR template) except the one flagged human step.

- Monorepo scaffold: `trainer/` (uv project, pytest wired, placeholder test),
  `app/` (Vite React TS strict, Tailwind, tokens, ESLint engine-purity rule,
  one passing Vitest test), `tracks/` (empty + README stub), root docs in place.
- CI with two required jobs (trainer, app); ruleset: PR + green CI to merge.
- App shows a styled placeholder page (design tokens visible, not default Vite).

**Demo checklist:** repo exists on GitHub with protection active · CI green on
main · `uv run pytest` and `npm run test` pass locally · HUMAN STEP: link repo
in Vercel dashboard (Root Directory = `app`) · placeholder page live on Vercel.

## Slice 2 — Sim core (pure Python): car + traction circle + track

- Port track JSON format; copy Track A and Track B from apex-evolve repo.
- Car model, traction-circle physics, raycasts, centerline progress metric.
- Property sweeps over real geometry (SPEC §10 minimum set) + golden
  scripted-driver pin with tolerance.

**Demo checklist:** matplotlib debug plot of Track A with a scripted driver's
path and ray fan (static image is fine) · property tests visibly cover both
tracks · human eyeballs the geometry (coordinate conventions right, track
matches apex-evolve's shape).

## Slice 3 — Gymnasium env

- Observation vector, action space, reward, episode rules per SPEC §§3–5.
- `check_env` passes; reward-magnitude sanity tests; random + scripted agent
  episode stats printed by a small CLI.

**Demo checklist:** `uv run evaluate --policy scripted` completes laps and
reports plausible lap times · random policy crashes fast (sanity) · obs ranges
property-tested.

## Slice 4 — PPO training loop + checkpoints + TensorBoard

- SB3 PPO wired, vectorized envs, run dirs, checkpoint/resume, seeding,
  `train`/`evaluate` CLIs per SPEC §6.
- SB3 smoke test in CI. First real training runs happen here.

**Demo checklist:** a short run (~10–15 min) shows reward clearly increasing
in TensorBoard · resume provably continues (curve continuity across restart) ·
same seed twice → same eval trajectory · agent progress visibly better than
random (full laps NOT required yet).

## Slice 5 — Trajectory export + app Replay v1  ← first watchable moment

- Trajectory schema finalized (Zod + generated JSON Schema + Python export +
  cross-validation test in CI).
- App: track render, car render, transport (play/pause/scrub/speed), HUD
  (speed, lap clock), file/trajectory picker. f1-telemetry-replay engine
  rules apply.

**Demo checklist:** load an exported trajectory and watch the current agent
drive in the browser · scrub/speed controls behave · schema round-trip test
green · deployed on Vercel.

## Slice 6 — Train to competence (iteration slice)

- Goal: repeatable clean laps on Track A at deterministic eval. Overnight runs
  expected here. Hyperparameter/reward changes only with TensorBoard evidence,
  logged in a running TUNING_LOG.md.
- Track B generalization evaluated and recorded (honestly, either way).

**Demo checklist:** eval: ≥ 9/10 clean laps on Track A · lap time reported
against the GA's 18.83 s reference (informal, either way is fine) · TUNING_LOG
tells the story of what mattered.

## Slice 7 — Checkpoint gallery + traction-circle widget

- Multi-trajectory loading; ghost cars (array rule pays off); checkpoint
  switcher; per-checkpoint lap-time strip ("drunk → competent → fast").
- g-g diagram widget (a_long vs a_lat inside the grip circle) synced to
  replay — the trail-braking evidence, on screen.

**Demo checklist:** flip between ≥ 4 checkpoints of one run · ghosts render
simultaneously · g-g dot rides the circle edge through corners if (and only
if) the agent actually trail-brakes.

## Slice 8 — Live driving (ONNX in the browser)

- TS port of the sim core; Python↔TS golden parity test at SPEC §9 tolerances
  (GATE: live mode ships only if parity holds).
- ONNX export of the policy; onnxruntime-web inference driving the TS sim at
  60 fps; track picker.

**Demo checklist:** parity test green with tolerances stated · trained brain
drives live in-browser on Track A and Track B · behavior visually matches the
replay of the same checkpoint.

## Slice 9 — Findings + polish

- FINDINGS.md (apex-evolve style): trail-braking answer with evidence,
  training cost, informal GA comparison, surprises.
- README with two-command reproduction; UI polish pass; blog-support assets
  (clean screenshots/clips).

**Demo checklist:** stranger-clones-repo test (human plays the stranger) ·
FINDINGS reviewed · site presentable end-to-end.

---

Renumbering rule (learned the hard way): if a slice splits, it becomes Na/Nb —
existing slice numbers never shift.
