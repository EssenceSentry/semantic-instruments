import { beginActivity, endActivity, progressActivity } from './activity';
let counter = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
export const engineStats = { hits: 0, calculations: 0, saved: 0, storageFailed: false };
const labels: Record<string, string> = {
  load: 'Preparing numerical engine',
  graph: 'Replaying the model',
  project: 'Projecting vectors',
  pca: 'Finding principal components',
  cosine: 'Computing query similarities',
  features: 'Recomputing feature operators',
  supported: 'Calculating supported counts',
  audit: 'Drawing the audit posterior',
  neighbors: 'Finding nearest neighbors',
  numeric: 'Repeating the sampling experiment',
  reference: 'Calculating uncertainty',
  trainProbe: 'Training the toy model',
  clear: 'Clearing cached calculations',
};
worker.onmessage = ({ data }) => {
  const p = pending.get(data.id);
  if (!p) return;
  if (data.progress) {
    progressActivity(data.id, data.progress.label, data.progress.fraction);
    return;
  }
  pending.delete(data.id);
  endActivity(data.id);
  if (data.ok) {
    if (data.result.cached) engineStats.hits++;
    else if (data.result.computed) engineStats.calculations++;
    if (data.result.saved) engineStats.saved++;
    if (data.result.storageFailed) engineStats.storageFailed = true;
    p.resolve(data.result);
  } else p.reject(new Error(data.error));
};
worker.onerror = (event) => {
  for (const [id, p] of pending) {
    endActivity(id);
    p.reject(new Error(event.message));
  }
  pending.clear();
};
export function compute<T = any>(type: string, payload: unknown): Promise<T> {
  const id = ++counter;
  beginActivity(id, labels[type] ?? 'Calculating');
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}
