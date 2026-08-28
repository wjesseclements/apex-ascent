/**
 * The trajectory JSON contract (SPEC §7) — the border between trainer and app.
 *
 * This Zod schema is the single source of truth. `trajectory.schema.json` at the
 * repo root is GENERATED from it (`npm run schema:generate`; CI fails if stale)
 * and the Python exporter's output is validated against that file in the
 * trainer's tests, so drift is caught in CI, not at runtime.
 *
 * Shape (approved: struct-of-arrays samples):
 *   meta     — provenance: run, checkpoint, policy, track, physics config hash, seed, dt
 *   laps     — one entry per completed lap
 *   samples  — equal-length columns; sample i is at t = i · dt exactly (uniform
 *              time ⇒ O(1) lookup by index; CLAUDE.md app rule 3). Sample 0 is the
 *              reset state with zero controls/accelerations.
 *
 * Coordinates: SPEC §3.3 world frame (x right, y up, meters, heading CCW from +x,
 * wrapped to (-π, π]). The canvas layer flips y for the screen; nothing here does.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

const finiteNumber = z.number().finite();
const column = z.array(finiteNumber);
const unitColumn = z.array(z.number().min(-1).max(1));

export const trajectoryMetaSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** Run directory name, or "baseline" for non-learned policies. */
  runId: z.string().min(1),
  /** Env steps of the evaluated checkpoint; null for scripted/random policies. */
  checkpointStep: z.number().int().nonnegative().nullable(),
  /** Policy label: "ppo@<steps>", "scripted", "random", "random-throttle". */
  policy: z.string().min(1),
  /** Track file stem under tracks/ (e.g. "track_a"). */
  trackId: z.string().regex(/^[a-z0-9_]+$/),
  /** First 12 hex chars of SHA-256 over the canonical env-config JSON. */
  physicsConfigHash: z.string().regex(/^[0-9a-f]{12}$/),
  seed: z.number().int(),
  /** Fixed timestep, seconds (1/60). */
  dt: z.number().positive(),
  /** ISO-8601 UTC timestamp of export. */
  createdAt: z.string().min(1),
  sampleCount: z.number().int().positive(),
  /** True if the episode ended in a crash (the last sample is the crash state). */
  crashed: z.boolean(),
});

export const lapSchema = z.object({
  lapTimeSec: z.number().positive(),
  /** Sample index at which this lap began (0 for the first lap). */
  startStep: z.number().int().nonnegative(),
});

export const samplesSchema = z.object({
  t: column,
  x: column,
  y: column,
  heading: z.array(z.number().gt(-Math.PI).lte(Math.PI)),
  speed: z.array(z.number().nonnegative()),
  steer: unitColumn,
  drive: unitColumn,
  aLong: column,
  aLat: column,
});

export const SAMPLE_COLUMNS = [
  't',
  'x',
  'y',
  'heading',
  'speed',
  'steer',
  'drive',
  'aLong',
  'aLat',
] as const;
export type SampleColumn = (typeof SAMPLE_COLUMNS)[number];

export const trajectorySchema = z
  .object({
    meta: trajectoryMetaSchema,
    laps: z.array(lapSchema),
    samples: samplesSchema,
  })
  .refine((tr) => SAMPLE_COLUMNS.every((c) => tr.samples[c].length === tr.meta.sampleCount), {
    message: 'every sample column must have exactly meta.sampleCount entries',
  })
  .refine((tr) => tr.laps.every((lap) => lap.startStep < tr.meta.sampleCount), {
    message: 'lap.startStep must index into samples',
  });

export type Trajectory = z.infer<typeof trajectorySchema>;
export type TrajectoryMeta = z.infer<typeof trajectoryMetaSchema>;
export type Lap = z.infer<typeof lapSchema>;
export type Samples = z.infer<typeof samplesSchema>;

export type ParseResult = { ok: true; trajectory: Trajectory } | { ok: false; error: string };

/**
 * Validate untrusted JSON. Unknown schema versions get a specific message
 * (CLAUDE.md app rule 5: never guess), everything else Zod's issue list.
 */
export function parseTrajectory(raw: unknown): ParseResult {
  const version =
    typeof raw === 'object' && raw !== null && 'meta' in raw
      ? (raw as { meta?: { schemaVersion?: unknown } }).meta?.schemaVersion
      : undefined;
  if (version !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `unsupported trajectory schemaVersion ${JSON.stringify(version)}; this app reads version ${SCHEMA_VERSION}`,
    };
  }
  const result = trajectorySchema.safeParse(raw);
  if (result.success) return { ok: true, trajectory: result.data };
  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error: `invalid trajectory: ${issues}` };
}

/** JSON Schema (draft 2020-12) for the contract; written to trajectory.schema.json. */
export function trajectoryJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(trajectorySchema, { target: 'draft-2020-12', io: 'input' });
}
