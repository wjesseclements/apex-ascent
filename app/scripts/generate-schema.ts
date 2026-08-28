/**
 * Write (or check) trajectory.schema.json at the repo root from the Zod schema.
 *   node scripts/generate-schema.ts          # write
 *   node scripts/generate-schema.ts --check  # exit 1 if the committed file is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { trajectoryJsonSchema } from '../src/engine/schema.ts';

const out = resolve(import.meta.dirname, '../../trajectory.schema.json');
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/wjesseclements/apex-ascent/trajectory.schema.json',
  title: 'apex-ascent trajectory',
  description:
    'GENERATED from app/src/engine/schema.ts by `npm run schema:generate` — do not edit.',
  ...trajectoryJsonSchema(),
};
const text = JSON.stringify(schema, null, 2) + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* missing counts as stale */
  }
  if (current !== text) {
    console.error(`trajectory.schema.json is stale; run \`npm run schema:generate\``);
    process.exit(1);
  }
  console.log('trajectory.schema.json is up to date');
} else {
  writeFileSync(out, text);
  console.log(`wrote ${out}`);
}
