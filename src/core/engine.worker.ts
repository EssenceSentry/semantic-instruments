import * as tf from '@tensorflow/tfjs-core';
import { setWasmPaths, setThreadsCount, getThreadsCount } from '@tensorflow/tfjs-backend-wasm';
import { poolFeatures, supportedCount, neighbors } from './math';
import { digest, operationKey, readCache, writeCache, clearCache } from './cache';
import { numericExperiment, referenceExperiment } from './experiments';
import { auditPosterior } from './audit';
import { appUrl } from './app-url';
import type { Matrix, GraphNode, FeatureDefinition, Query } from './types';
let ready: Promise<void> | null = null;
async function init() {
  if (!ready)
    ready = (async () => {
      setWasmPaths(appUrl('wasm/'));
      setThreadsCount(
        self.crossOriginIsolated ? Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4)) : 1,
      );
      await tf.setBackend('wasm');
      await tf.ready();
    })();
  await ready;
}
const matrices = new Map<string, Matrix>();
const hashes = new Map<string, string>();
const memory = new Map<string, any>();
let memoryBytes = 0;
let report = (label: string, fraction?: number) => {};
function byteSize(value: any): number {
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (Array.isArray(value)) return value.reduce((n, x) => n + byteSize(x), 0);
  if (value && typeof value === 'object')
    return Object.values(value).reduce<number>((n, x) => n + byteSize(x), 0);
  return typeof value === 'string' ? value.length * 2 : 8;
}
function remember(key: string, value: any) {
  if (memory.has(key)) return;
  const size = byteSize(value);
  if (size > 256 * 1024 * 1024) return;
  memory.set(key, value);
  memoryBytes += size;
  while (memoryBytes > 256 * 1024 * 1024 && memory.size > 1) {
    const first = memory.keys().next().value!;
    memoryBytes -= byteSize(memory.get(first));
    memory.delete(first);
  }
}
async function matrixHash(key: string) {
  if (!hashes.has(key)) {
    const m = matrices.get(key);
    if (!m) throw new Error('Missing representation: ' + key);
    hashes.set(key, m.rows + ':' + m.cols + ':' + (await digest(m.data)));
  }
  return hashes.get(key)!;
}
function restore(type: string, payload: any, result: any, key: string) {
  if (type === 'graph')
    for (const [id, m] of Object.entries(result.matrices)) {
      matrices.set(id, m as Matrix);
      hashes.set(id, key + ':' + id);
    }
  if (type === 'features' || type === 'cosine') {
    matrices.set(payload.output, result.matrix);
    hashes.set(payload.output, key);
  }
}
let queue = Promise.resolve();
function scoped<T>(fn: () => T): T {
  let result!: T;
  tf.tidy(() => {
    result = fn();
  });
  return result;
}
function tensor(m: Matrix) {
  return tf.tensor2d(m.data, [m.rows, m.cols]);
}
function toMatrix(t: tf.Tensor): Matrix {
  return { rows: t.shape[0], cols: t.shape[1] ?? 1, data: new Float32Array(t.dataSync()) };
}
async function graph(nodes: GraphNode[], inputs: string[], capture: string[]) {
  const result: Record<string, Matrix> = {};
  tf.tidy(() => {
    const values: Record<string, tf.Tensor2D> = {};
    for (const key of inputs) values[key] = tensor(matrices.get(key)!);
    for (const [step, n] of nodes.entries()) {
      report('Replaying model · layer ' + (step + 1) + ' / ' + nodes.length, step / nodes.length);
      const xs = n.inputs.map((k) => values[k]);
      let v: tf.Tensor;
      if (n.op === 'normalize')
        v = tf.div(tf.sub(xs[0], tf.tensor1d(n.mean!)), tf.tensor1d(n.scale!));
      else if (n.op === 'dense') {
        v = tf.add(tf.matMul(xs[0], tf.tensor2d(n.weight!), false, true), tf.tensor1d(n.bias!));
        if (n.activation === 'relu') v = tf.relu(v);
        if (n.activation === 'tanh') v = tf.tanh(v);
      } else if (n.op === 'concat') v = tf.concat(xs, 1);
      else if (n.op === 'sigmoid') v = tf.sigmoid(xs[0]);
      else {
        v = tf.addN(xs);
        if (n.op === 'mean') v = tf.div(v, xs.length);
      }
      values[n.id] = v as tf.Tensor2D;
      if (capture.includes(n.id)) result[n.id] = toMatrix(v);
    }
  });
  for (const [key, m] of Object.entries(result)) matrices.set(key, m);
  return result;
}
function project(input: Matrix, mean: number[], components: number[][]) {
  return scoped(() =>
    toMatrix(
      tf.matMul(tf.sub(tensor(input), tf.tensor1d(mean)), tf.tensor2d(components), false, true),
    ),
  );
}
function pca(input: Matrix) {
  return scoped(() => {
    const x = tensor(input),
      mu = tf.mean(x, 0),
      center = tf.sub(x, mu) as tf.Tensor2D,
      d = input.cols,
      k = Math.min(3, d, input.rows);
    const axes: tf.Tensor2D[] = [];
    for (let a = 0; a < k; a++) {
      let v = tf.tensor2d(
        Float32Array.from({ length: d }, (_, j) => Math.sin((j + 1) * (a + 2) * 1.618)),
        [d, 1],
      );
      for (let iter = 0; iter < 35; iter++) {
        if (iter % 5 === 0) report('Finding principal components', (a * 35 + iter) / (k * 35));
        // Apply the covariance operator without allocating a D × D matrix.
        let next = tf.matMul(center, tf.matMul(center, v), true, false);
        for (const prev of axes)
          next = tf.sub(next, tf.mul(prev, tf.sum(tf.mul(prev, next)))) as tf.Tensor2D;
        const normalized = tf.div(next, tf.maximum(tf.norm(next), 1e-12)) as tf.Tensor2D;
        v.dispose();
        if (next !== v) next.dispose();
        v = normalized;
      }
      axes.push(v);
    }
    const components = tf.transpose(tf.concat(axes, 1));
    const coordinates = tf.matMul(center, components, false, true);
    return {
      positions: toMatrix(coordinates),
      mean: Array.from(mu.dataSync()),
      components: components.arraySync() as number[][],
    };
  });
}
function trainProbe(input: Matrix, labels: (number | null)[], train: number[]) {
  return scoped(() => {
    const x = tensor(input),
      trainX = tf.gather(x, train),
      mu = tf.mean(trainX, 0),
      center = tf.sub(trainX, mu),
      scale = tf.maximum(tf.sqrt(tf.mean(tf.square(center), 0)), 1e-5),
      z = tf.div(center, scale) as tf.Tensor2D,
      y = tf.tensor2d(
        train.map((i) => labels[i]!),
        [train.length, 1],
      );
    let w = tf.zeros([input.cols, 1]) as tf.Tensor2D,
      b = tf.scalar(0);
    const losses: number[] = [];
    const learningRate = 0.08,
      penalty = 0.001,
      steps = 250;
    for (let step = 0; step < steps; step++) {
      const update = tf.tidy(() => {
        const logits = tf.add(tf.matMul(z, w), b),
          error = tf.sub(tf.sigmoid(logits), y),
          dw = tf.add(tf.div(tf.matMul(z, error, true, false), train.length), tf.mul(w, penalty));
        if (step % 5 === 0 || step === steps - 1)
          losses.push(
            tf
              .add(
                tf.mean(tf.sub(tf.softplus(logits), tf.mul(y, logits))),
                tf.mul(tf.sum(tf.square(w)), penalty / 2),
              )
              .dataSync()[0],
          );
        return {
          w: tf.sub(w, tf.mul(dw, learningRate)) as tf.Tensor2D,
          b: tf.sub(b, tf.mul(tf.mean(error), learningRate)) as tf.Scalar,
        };
      });
      w.dispose();
      b.dispose();
      w = update.w;
      b = update.b;
    }
    const standardized = tf.div(tf.sub(x, mu), scale) as tf.Tensor2D,
      logits = tf.add(tf.matMul(standardized, w), b),
      probabilities = tf.sigmoid(logits);
    return {
      mean: Array.from(mu.dataSync()),
      scale: Array.from(scale.dataSync()),
      weight: [Array.from(w.dataSync())],
      bias: [b.dataSync()[0]],
      standardized: toMatrix(standardized),
      probabilities: toMatrix(probabilities),
      losses,
      steps,
      learningRate,
      penalty,
    };
  });
}
self.onmessage = (event: MessageEvent) => {
  queue = queue.then(() => handle(event.data));
};
async function handle({ id, type, payload }: any) {
  const start = performance.now();
  try {
    report = (label, fraction) => self.postMessage({ id, progress: { label, fraction } });
    if (type === 'clear') {
      memory.clear();
      memoryBytes = 0;
      await clearCache();
      self.postMessage({ id, ok: true, result: {} });
      return;
    }
    let cacheKey = '';
    if (type !== 'load') {
      const dependencies: string[] =
        type === 'graph'
          ? payload.inputs
          : type === 'features'
            ? [payload.similarities]
            : type === 'cosine'
              ? [payload.input, payload.queries]
              : ['pca', 'project', 'trainProbe', 'neighbors'].includes(type)
                ? [payload.key]
                : [];
      cacheKey = await operationKey(type, payload, await Promise.all(dependencies.map(matrixHash)));
      const stored = memory.get(cacheKey) ?? (await readCache<any>('compute:' + cacheKey));
      if (stored) {
        remember(cacheKey, stored);
        restore(type, payload, stored, cacheKey);
        self.postMessage({
          id,
          ok: true,
          result: { ...stored, cached: true, elapsed: performance.now() - start },
        });
        return;
      }
    }
    if (!['audit', 'supported', 'neighbors', 'numeric', 'reference'].includes(type)) await init();
    let output: unknown;
    if (type === 'load') {
      matrices.clear();
      hashes.clear();
      for (const [key, m] of Object.entries(payload.matrices)) matrices.set(key, m as Matrix);
      output = { ready: true };
    } else if (type === 'neighbors')
      output = {
        neighbors: neighbors(
          matrices.get(payload.key)!,
          payload.index,
          8,
          payload.metric,
          payload.candidates,
        ),
      };
    else if (type === 'numeric')
      output = {
        values: numericExperiment(payload.values, payload.n, payload.seed, payload.policy),
      };
    else if (type === 'reference')
      output = {
        values: referenceExperiment(
          payload.cells,
          payload.labels,
          payload.observed,
          payload.priorA,
          payload.priorB,
          payload.round,
        ),
      };
    else if (type === 'graph')
      output = { matrices: await graph(payload.nodes, payload.inputs, payload.capture) };
    else if (type === 'project')
      output = { matrix: project(matrices.get(payload.key)!, payload.mean, payload.components) };
    else if (type === 'pca') output = pca(matrices.get(payload.key)!);
    else if (type === 'cosine')
      output = scoped(() => {
        const x = tensor(matrices.get(payload.input)!),
          q = tensor(matrices.get(payload.queries)!);
        const xn = tf.div(x, tf.maximum(tf.norm(x, 2, 1, true), 1e-12)),
          qn = tf.div(q, tf.maximum(tf.norm(q, 2, 1, true), 1e-12));
        const m = toMatrix(tf.matMul(xn, qn, false, true));
        matrices.set(payload.output, m);
        return { matrix: m };
      });
    else if (type === 'trainProbe')
      output = trainProbe(matrices.get(payload.key)!, payload.labels, payload.train);
    else if (type === 'audit')
      output = auditPosterior(
        payload.bands,
        payload.target,
        payload.draws,
        payload.alpha,
        payload.beta,
        payload.seed,
      );
    else if (type === 'supported')
      output = {
        counts: payload.collections.map((p: number[], i: number) => {
          report(
            'Calculating supported counts · ' + (i + 1) + ' / ' + payload.collections.length,
            i / payload.collections.length,
          );
          return supportedCount(p, payload.confidence);
        }),
      };
    else if (type === 'features') {
      const m = poolFeatures(
        matrices.get(payload.similarities)!,
        payload.queries as Query[],
        payload.definitions as FeatureDefinition[],
        payload.disabled,
        payload.temperature,
        payload.zeroFamilies,
        !!payload.countNeutral,
      );
      matrices.set(payload.output, m);
      output = { matrix: m };
    } else throw new Error('Unknown calculation');
    const result = {
      ...(output as object),
      elapsed: performance.now() - start,
      backend: tf.getBackend(),
      threads: ready ? getThreadsCount() : 0,
    };
    let saved = false;
    if (cacheKey) {
      restore(type, payload, result, cacheKey);
      remember(cacheKey, result);
      saved = await writeCache('compute:' + cacheKey, result);
    }
    self.postMessage({
      id,
      ok: true,
      result: { ...result, computed: !!cacheKey, saved, storageFailed: !!cacheKey && !saved },
    });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
