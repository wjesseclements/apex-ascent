/** Loading trajectories into the transport store: from a committed sample or a file. */
import { parseTrajectory } from '../engine/schema';
import { useTransport } from '../store/transport';
import { SAMPLES, SAMPLES_BASE_URL } from './samples';

export function loadRawTrajectory(raw: unknown, name: string): boolean {
  const r = parseTrajectory(raw);
  const s = useTransport.getState();
  if (r.ok) {
    s.setTrajectory(r.trajectory, name);
    return true;
  }
  s.setLoadError(`${name}: ${r.error}`);
  return false;
}

/** Fetch one of the committed samples (the app's only network access: its own origin). */
export async function loadSample(id: string): Promise<void> {
  const sample = SAMPLES.find((x) => x.id === id);
  if (!sample) throw new Error(`unknown sample ${id}`);
  const s = useTransport.getState();
  try {
    const res = await fetch(SAMPLES_BASE_URL + sample.file);
    if (!res.ok) {
      s.setLoadError(`${sample.label}: HTTP ${res.status}`);
      return;
    }
    loadRawTrajectory(await res.json(), sample.label);
  } catch (e) {
    s.setLoadError(`${sample.label}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function loadFile(file: File): Promise<void> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadRawTrajectory(JSON.parse(String(reader.result)), file.name);
      } catch (err) {
        useTransport
          .getState()
          .setLoadError(`${file.name}: ${err instanceof Error ? err.message : 'not JSON'}`);
      }
      resolve();
    };
    reader.onerror = () => {
      useTransport.getState().setLoadError(`${file.name}: could not read file`);
      resolve();
    };
    reader.readAsText(file);
  });
}
