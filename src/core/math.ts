import type { Matrix, FeatureDefinition, Query, GraphNode, Item } from './types';
export const sigmoid = (x: number) =>
  x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const mean = (xs: ArrayLike<number>) =>
  xs.length ? Array.from(xs).reduce((a, b) => a + b, 0) / xs.length : NaN;
export function row(m: Matrix, i: number) {
  return m.data.subarray(i * m.cols, (i + 1) * m.cols);
}
export function lse(xs: number[], temperature: number) {
  if (!xs.length) return NaN;
  const m = Math.max(...xs);
  return temperature <= 0
    ? m
    : m + temperature * Math.log(xs.reduce((a, x) => a + Math.exp((x - m) / temperature), 0));
}
export function poolFeatures(
  scores: Matrix,
  queries: Query[],
  defs: FeatureDefinition[],
  disabled: string[] = [],
  temperature: number | null = null,
  zeroFamilies: string[] = [],
  countNeutral = false,
): Matrix {
  const excluded = new Set(disabled),
    zero = new Set(zeroFamilies),
    groups = new Map<string, { positive: number[]; negative: number[] }>(),
    totals = new Map<string, { positive: number; negative: number }>();
  queries.forEach((q, i) => {
    if (!groups.has(q.family)) {
      groups.set(q.family, { positive: [], negative: [] });
      totals.set(q.family, { positive: 0, negative: 0 });
    }
    totals.get(q.family)![q.polarity]++;
    if (!excluded.has(q.id)) groups.get(q.family)![q.polarity].push(i);
  });
  const out = new Float32Array(scores.rows * defs.length);
  for (let i = 0; i < scores.rows; i++) {
    const s = row(scores, i);
    const values = new Map<string, { positive: number[]; negative: number[] }>();
    for (const [family, index] of groups)
      values.set(family, {
        positive: index.positive.map((j) => s[j]).sort((a, b) => b - a),
        negative: index.negative.map((j) => s[j]).sort((a, b) => b - a),
      });
    defs.forEach((def, j) => {
      if (def.family && zero.has(def.family)) {
        out[i * defs.length + j] = 0;
        return;
      }
      if (def.kind === 'groupMargin') {
        const p = [...values.values()].flatMap((v) => v.positive),
          n = [...values.values()].flatMap((v) => v.negative);
        out[i * defs.length + j] =
          (p.length ? Math.max(...p) : 0) - (n.length ? Math.max(...n) : 0);
        return;
      }
      const v = values.get(def.family!)!,
        p = v.positive[0] ?? 0,
        n = v.negative[0] ?? 0,
        side = v[def.polarity ?? 'positive'];
      let x = 0;
      if (def.kind === 'max') x = side[0] ?? 0;
      if (def.kind === 'second') x = side[1] ?? side[0] ?? 0;
      if (def.kind === 'gap') x = (side[0] ?? 0) - (side[1] ?? side[0] ?? 0);
      if (def.kind === 'margin') x = p - n;
      if (def.kind === 'gate') x = p > n ? p : 0;
      if (def.kind === 'lse') {
        const tau = temperature ?? def.temperature ?? 1,
          total = totals.get(def.family!)![def.polarity ?? 'positive'];
        // Count-neutral removal adds τ·log(N/k) for k of N original phrases, as if each removed
        // phrase were replaced by the mean exponentiated score of the survivors. k = N adds 0.
        x = side.length
          ? lse(side, tau) + (countNeutral && tau > 0 ? tau * Math.log(total / side.length) : 0)
          : 0;
      }
      out[i * defs.length + j] = x;
    });
  }
  return { rows: scores.rows, cols: defs.length, data: out };
}
export function forwardRow(
  nodes: GraphNode[],
  inputs: Record<string, ArrayLike<number>>,
): Record<string, number[]> {
  const values: Record<string, number[]> = {};
  for (const [id, x] of Object.entries(inputs)) values[id] = Array.from(x);
  for (const n of nodes) {
    const xs = n.inputs.map((k) => values[k]);
    let y: number[];
    if (n.op === 'normalize') y = xs[0].map((v, j) => (v - n.mean![j]) / n.scale![j]);
    else if (n.op === 'dense')
      y = n.weight!.map((w, i) => {
        const z = w.reduce((a, v, j) => a + v * xs[0][j], n.bias![i]);
        return n.activation === 'relu'
          ? Math.max(0, z)
          : n.activation === 'tanh'
            ? Math.tanh(z)
            : z;
      });
    else if (n.op === 'concat') y = xs.flat();
    else if (n.op === 'sigmoid') y = xs[0].map(sigmoid);
    else
      y = xs[0].map((_, i) => xs.reduce((a, x) => a + x[i], 0) / (n.op === 'mean' ? xs.length : 1));
    values[n.id] = y;
  }
  return values;
}
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>) {
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export function neighbors(
  m: Matrix,
  index: number,
  k = 8,
  metric: 'cosine' | 'euclidean' = 'cosine',
  candidates?: number[],
) {
  const target = row(m, index);
  return (candidates ?? Array.from({ length: m.rows }, (_, i) => i))
    .map((i) => {
      const a = row(m, i);
      let score = 0;
      if (metric === 'cosine') score = cosine(target, a);
      else {
        for (let j = 0; j < a.length; j++) score -= (a[j] - target[j]) ** 2;
      }
      return { index: i, score };
    })
    .filter((x) => x.index !== index)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, k);
}
export function ranking(scores: ArrayLike<number>, items: Item[]) {
  return Array.from(scores, (_, i) => i)
    .filter((i) => Number.isFinite(scores[i]))
    .sort((a, b) => scores[b] - scores[a] || items[a].id.localeCompare(items[b].id));
}
export function metrics(
  scores: ArrayLike<number>,
  items: Item[],
  threshold = 0.5,
  indices?: number[],
) {
  const use = (indices ?? items.map((_, i) => i)).filter(
    (i) => (items[i].label === 0 || items[i].label === 1) && Number.isFinite(scores[i]),
  );
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (const i of use) {
    if (scores[i] >= threshold) {
      if (items[i].label === 1) tp++;
      else fp++;
    } else {
      if (items[i].label === 1) fn++;
      else tn++;
    }
  }
  const order = use.sort((a, b) => scores[b] - scores[a] || items[a].id.localeCompare(items[b].id));
  let positives = tp + fn,
    seen = 0,
    ap = 0,
    lastRecall = 0;
  const pr: { precision: number; recall: number; threshold: number; k: number }[] = [];
  for (let k = 0; k < order.length; k++) {
    seen += items[order[k]].label ?? 0;
    if (k === order.length - 1 || scores[order[k + 1]] !== scores[order[k]]) {
      const recall = positives ? seen / positives : 0,
        precision = seen / (k + 1);
      ap += (recall - lastRecall) * precision;
      lastRecall = recall;
      pr.push({ precision, recall, threshold: scores[order[k]], k: k + 1 });
    }
  }
  return {
    tp,
    fp,
    tn,
    fn,
    n: use.length,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: positives ? tp / positives : null,
    ap: positives ? ap : null,
    prevalence: use.length ? positives / use.length : 0,
    pr,
  };
}
export type Reducer = 'max' | 'mean' | 'topk' | 'sum' | 'rate' | 'supported';
export function poissonBinomial(probs: number[]) {
  const mass = new Float64Array(probs.length + 1);
  mass[0] = 1;
  probs.forEach((p, i) => {
    p = clamp(p);
    for (let k = i + 1; k >= 0; k--) mass[k] = mass[k] * (1 - p) + (k ? mass[k - 1] * p : 0);
  });
  return mass;
}
export function supportedCount(probs: number[], confidence = 0.95) {
  const mass = poissonBinomial(probs);
  let tail = 1,
    best = 0;
  for (let k = 1; k <= probs.length; k++) {
    tail -= mass[k - 1];
    if (tail + 1e-12 >= confidence) best = k;
    else break;
  }
  return best;
}
export function aggregate(
  probs: number[],
  method: Reducer,
  k = 20,
  threshold = 0.5,
  confidence = 0.95,
) {
  const valid = probs.filter(Number.isFinite).sort((a, b) => b - a);
  if (!valid.length) return NaN;
  if (method === 'max') return valid[0];
  if (method === 'mean') return mean(valid);
  if (method === 'topk') return mean(valid.slice(0, k));
  if (method === 'sum') return valid.reduce((a, b) => a + b, 0);
  if (method === 'rate') return valid.filter((p) => p >= threshold).length / valid.length;
  return supportedCount(valid, confidence);
}
export function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(xs: T[], random: () => number) {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function wilson(success: number, n: number, z = 1.959963984540054) {
  if (!n) return [0, 1];
  const p = success / n,
    d = 1 + (z * z) / n,
    c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
}
export function normal(random: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
}
export function gamma(shape: number, random: () => number): number {
  if (shape < 1) return gamma(shape + 1, random) * random() ** (1 / shape);
  const d = shape - 1 / 3,
    c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(random),
      v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const u = random();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))
      return d * v;
  }
}
export function beta(a: number, b: number, random: () => number) {
  const x = gamma(a, random);
  return x / (x + gamma(b, random));
}
export function quantile(values: number[], q: number) {
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.round(clamp(q) * (s.length - 1))] ?? NaN;
}
export function standardized(matrix: Matrix): Matrix {
  const mean = new Float64Array(matrix.cols),
    scale = new Float64Array(matrix.cols);
  for (let i = 0; i < matrix.rows; i++)
    for (let j = 0; j < matrix.cols; j++) mean[j] += matrix.data[i * matrix.cols + j] / matrix.rows;
  for (let i = 0; i < matrix.rows; i++)
    for (let j = 0; j < matrix.cols; j++)
      scale[j] += (matrix.data[i * matrix.cols + j] - mean[j]) ** 2 / matrix.rows;
  const data = new Float32Array(matrix.data.length);
  for (let i = 0; i < matrix.rows; i++)
    for (let j = 0; j < matrix.cols; j++)
      data[i * matrix.cols + j] =
        (matrix.data[i * matrix.cols + j] - mean[j]) / Math.max(1e-7, Math.sqrt(scale[j]));
  return { ...matrix, data };
}
