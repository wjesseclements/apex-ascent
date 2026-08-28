// Copy onnxruntime-web's WASM runtime into public/ort so the app serves it from
// its own origin (no CDN: the app fetches only from itself). Runs on postinstall.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const src = resolve('node_modules/onnxruntime-web/dist');
const dst = resolve('public/ort');
mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (/^(ort-wasm-simd-threaded\.(wasm|mjs)|ort\.wasm\.min\.mjs)$/.test(f)) {
    copyFileSync(resolve(src, f), resolve(dst, f));
    n++;
  }
}
console.log(`copied ${n} onnxruntime-web runtime files to public/ort`);
