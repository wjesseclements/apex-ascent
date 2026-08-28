/**
 * onnxruntime-web behind a tiny interface.
 *
 * The runtime is NOT bundled: `public/ort/` holds `ort.wasm.min.mjs` and the
 * WASM (copied from node_modules on postinstall) and is imported at runtime
 * from the app's own origin, only when live mode starts. Bundling it would
 * add ~14 MB of WASM assets to every deploy and Vite would emit the WebGPU
 * variant too; the app fetches nothing from a CDN. Single-threaded, so no
 * cross-origin-isolation headers are needed.
 */
import type { InferenceSession as OrtSession, Tensor as OrtTensor } from 'onnxruntime-web';
import type { Action } from '../engine/sim/car';

export interface LivePolicy {
  readonly label: string;
  act(obs: Float32Array): Promise<Action>;
}

interface OrtModule {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  InferenceSession: typeof OrtSession;
  Tensor: typeof OrtTensor;
}

export const ORT_BASE = '/ort/';
let ortPromise: Promise<OrtModule> | null = null;

function loadOrt(): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = import(/* @vite-ignore */ `${ORT_BASE}ort.wasm.min.mjs`).then((m: OrtModule) => {
      m.env.wasm.wasmPaths = ORT_BASE;
      m.env.wasm.numThreads = 1;
      return m;
    });
    ortPromise.catch(() => {
      ortPromise = null;
    });
  }
  return ortPromise;
}

export async function loadOrtPolicy(url: string, label: string): Promise<LivePolicy> {
  const ort = await loadOrt();
  const session = await ort.InferenceSession.create(url, { executionProviders: ['wasm'] });
  return {
    label,
    async act(obs: Float32Array): Promise<Action> {
      const out = await session.run({ obs: new ort.Tensor('float32', obs, [1, obs.length]) });
      const data = out['action']!.data as Float32Array;
      return { steer: data[0]!, drive: data[1]! };
    },
  };
}
