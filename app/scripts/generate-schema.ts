/**
 * Write (or check) trajectory.schema.json at the repo root from the Zod schema.
 *   node scripts/generate-schema.ts          # write
 *   node scripts/generate-schema.ts --check  # exit 1 if the committed file is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { galleryJsonSchema } from '../src/engine/gallery.ts';
import { trajectoryJsonSchema } from '../src/engine/schema.ts';

const SCHEMAS = [
  {
    file: 'trajectory.schema.json',
    title: 'apex-ascent trajectory',
    source: 'app/src/engine/schema.ts',
    body: trajectoryJsonSchema,
  },
  {
    file: 'gallery.schema.json',
    title: 'apex-ascent checkpoint gallery manifest',
    source: 'app/src/engine/gallery.ts',
    body: galleryJsonSchema,
  },
];

const check = process.argv.includes('--check');
let stale = false;
for (const { file, title, source, body } of SCHEMAS) {
  const out = resolve(import.meta.dirname, '../../', file);
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://github.com/wjesseclements/apex-ascent/${file}`,
    title,
    description: `GENERATED from ${source} by \`npm run schema:generate\` — do not edit.`,
    ...body(),
  };
  const text = JSON.stringify(schema, null, 2) + '\n';
  if (check) {
    let current = '';
    try {
      current = readFileSync(out, 'utf8');
    } catch {
      /* missing counts as stale */
    }
    if (current !== text) {
      console.error(`${file} is stale; run \`npm run schema:generate\``);
      stale = true;
    } else {
      console.log(`${file} is up to date`);
    }
  } else {
    writeFileSync(out, text);
    console.log(`wrote ${out}`);
  }
}
if (stale) process.exit(1);
