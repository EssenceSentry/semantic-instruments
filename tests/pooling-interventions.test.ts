import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { poolFeatures, forwardRow } from '../src/core/math';
import { operationKey, CACHE_VERSION } from '../src/core/cache';
import type {
  FeatureDefinition,
  GraphNode,
  Manifest,
  Matrix,
  MatrixRef,
  Query,
} from '../src/core/types';

// Family a: four positive and two negative phrases. Family b: two positive, one negative.
const queries: Query[] = [
  { id: 'a1', text: 'a1', family: 'a', polarity: 'positive' },
  { id: 'a2', text: 'a2', family: 'a', polarity: 'positive' },
  { id: 'a3', text: 'a3', family: 'a', polarity: 'positive' },
  { id: 'a4', text: 'a4', family: 'a', polarity: 'positive' },
  { id: 'an1', text: 'an1', family: 'a', polarity: 'negative' },
  { id: 'an2', text: 'an2', family: 'a', polarity: 'negative' },
  { id: 'b1', text: 'b1', family: 'b', polarity: 'positive' },
  { id: 'b2', text: 'b2', family: 'b', polarity: 'positive' },
  { id: 'bn1', text: 'bn1', family: 'b', polarity: 'negative' },
];
// Heterogeneous saved temperatures, plus every non-LSE reducer.
const defs: FeatureDefinition[] = [
  { name: 'a+ lse', kind: 'lse', family: 'a', polarity: 'positive', temperature: 0.1 },
  { name: 'a- lse', kind: 'lse', family: 'a', polarity: 'negative', temperature: 1 },
  { name: 'b+ lse', kind: 'lse', family: 'b', polarity: 'positive', temperature: 0.5 },
  { name: 'a+ lse default', kind: 'lse', family: 'a', polarity: 'positive' },
  { name: 'a+ max', kind: 'max', family: 'a', polarity: 'positive' },
  { name: 'a+ second', kind: 'second', family: 'a', polarity: 'positive' },
  { name: 'a+ gap', kind: 'gap', family: 'a', polarity: 'positive' },
  { name: 'a margin', kind: 'margin', family: 'a' },
  { name: 'a gate', kind: 'gate', family: 'a' },
  { name: 'b+ max', kind: 'max', family: 'b', polarity: 'positive' },
  { name: 'group margin', kind: 'groupMargin', polarity: null },
];
const col = (name: string) => defs.findIndex((d) => d.name === name);
const LSE = new Set(defs.flatMap((d, j) => (d.kind === 'lse' ? [j] : [])));
const scores: Matrix = {
  rows: 3,
  cols: queries.length,
  data: Float32Array.from([
    // Heterogeneous similarities.
    0.31, 0.27, 0.22, 0.18, 0.12, 0.2, 0.25, 0.14, 0.09,
    // Equal similarities inside every pool.
    0.3, 0.3, 0.3, 0.3, 0.1, 0.1, 0.2, 0.2, 0.05,
    // Negative-dominated row.
    0.05, 0.02, 0.08, 0.01, 0.4, 0.35, 0.11, 0.13, 0.3,
  ]),
};
const at = (m: Matrix, i: number, j: number) => m.data[i * m.cols + j];
const sim = (i: number, id: string) => at(scores, i, queries.findIndex((q) => q.id === id));
// Direct, unshifted definition in double precision, independent of lse().
const smooth = (xs: number[], tau: number) =>
  tau * Math.log(xs.reduce((a, x) => a + Math.exp(x / tau), 0));
const close = (a: number, b: number, tol = 2e-6, label = '') =>
  assert.ok(Math.abs(a - b) <= tol, `${label} ${a} vs ${b} (|Δ| ${Math.abs(a - b)})`);

test('Count-neutral LSE adds exactly τ·log(N/k) to the ordinary pool of the survivors', () => {
  const disabled = ['a1', 'a3'];
  const plain = poolFeatures(scores, queries, defs, disabled, null, [], false),
    neutral = poolFeatures(scores, queries, defs, disabled, null, [], true);
  for (let i = 0; i < scores.rows; i++) {
    const survivors = ['a2', 'a4'].map((id) => sim(i, id));
    for (const [name, tau] of [
      ['a+ lse', 0.1],
      ['a+ lse default', 1],
    ] as const) {
      const ordinary = smooth(survivors, tau),
        corrected = ordinary + tau * Math.log(4 / 2);
      close(at(plain, i, col(name)), ordinary, 2e-6, 'plain ' + name);
      close(at(neutral, i, col(name)), corrected, 2e-6, 'neutral ' + name);
      // Same value as replacing each removed phrase with the survivors' mean exp(s/τ).
      const meanExp = survivors.reduce((a, s) => a + Math.exp(s / tau), 0) / survivors.length;
      close(corrected, tau * Math.log(4 * meanExp), 1e-12, 'replacement identity ' + name);
    }
  }
});

test('Equal similarities keep the original LSE for any number of count-neutral removals', () => {
  const baseline = poolFeatures(scores, queries, defs);
  const expected = 0.3 + 0.1 * Math.log(4);
  close(at(baseline, 1, col('a+ lse')), expected, 2e-6, 'baseline');
  for (const disabled of [['a1'], ['a1', 'a2'], ['a2', 'a3', 'a4'], ['a4', 'a1', 'a3']]) {
    const neutral = poolFeatures(scores, queries, defs, disabled, null, [], true),
      plain = poolFeatures(scores, queries, defs, disabled, null, [], false),
      k = 4 - disabled.length;
    for (const [name, tau] of [
      ['a+ lse', 0.1],
      ['a+ lse default', 1],
    ] as const) {
      close(at(neutral, 1, col(name)), at(baseline, 1, col(name)), 2e-6, 'invariant ' + name);
      close(at(plain, 1, col(name)), 0.3 + tau * Math.log(k), 2e-6, 'shrinks ' + name);
    }
  }
});

test('Without removals every saved temperature reproduces the baseline bit for bit', () => {
  const defaults = poolFeatures(scores, queries, defs),
    off = poolFeatures(scores, queries, defs, [], null, [], false),
    on = poolFeatures(scores, queries, defs, [], null, [], true),
    unknown = poolFeatures(scores, queries, defs, ['not-a-phrase'], null, [], true);
  assert.deepEqual(off.data, defaults.data);
  assert.deepEqual(on.data, defaults.data);
  assert.deepEqual(unknown.data, defaults.data);
  // Each LSE definition uses its own saved τ (undefined falls back to 1).
  const pools: Record<string, [string[], number]> = {
    'a+ lse': [['a1', 'a2', 'a3', 'a4'], 0.1],
    'a- lse': [['an1', 'an2'], 1],
    'b+ lse': [['b1', 'b2'], 0.5],
    'a+ lse default': [['a1', 'a2', 'a3', 'a4'], 1],
  };
  for (let i = 0; i < scores.rows; i++)
    for (const [name, [ids, tau]] of Object.entries(pools))
      close(at(defaults, i, col(name)), smooth(ids.map((id) => sim(i, id)), tau), 2e-6, name);
});

test('An explicit temperature overrides every LSE definition and nothing else', () => {
  const baseline = poolFeatures(scores, queries, defs),
    override = poolFeatures(scores, queries, defs, [], 0.25),
    neutral = poolFeatures(scores, queries, defs, ['a2'], 0.25, [], true),
    plain = poolFeatures(scores, queries, defs, ['a2'], 0.25, [], false);
  for (let i = 0; i < scores.rows; i++) {
    for (let j = 0; j < defs.length; j++)
      if (!LSE.has(j)) assert.equal(at(override, i, j), at(baseline, i, j), defs[j].name);
    const all = ['a1', 'a2', 'a3', 'a4'].map((id) => sim(i, id));
    close(at(override, i, col('a+ lse')), smooth(all, 0.25), 2e-6);
    close(at(override, i, col('a+ lse default')), smooth(all, 0.25), 2e-6);
    close(at(override, i, col('a- lse')), smooth([sim(i, 'an1'), sim(i, 'an2')], 0.25), 2e-6);
    close(at(override, i, col('b+ lse')), smooth([sim(i, 'b1'), sim(i, 'b2')], 0.25), 2e-6);
    // The correction uses the effective (overridden) temperature.
    close(
      at(neutral, i, col('a+ lse')) - at(plain, i, col('a+ lse')),
      0.25 * Math.log(4 / 3),
      2e-6,
      'override correction',
    );
  }
});

test('Removing a whole pool keeps the documented finite zero convention', () => {
  for (const countNeutral of [false, true]) {
    const m = poolFeatures(
      scores,
      queries,
      defs,
      ['a1', 'a2', 'a3', 'a4'],
      null,
      [],
      countNeutral,
    );
    assert.ok(m.data.every(Number.isFinite), 'finite output');
    for (let i = 0; i < scores.rows; i++) {
      assert.equal(at(m, i, col('a+ lse')), 0);
      assert.equal(at(m, i, col('a+ lse default')), 0);
      assert.equal(at(m, i, col('a+ max')), 0);
      assert.equal(at(m, i, col('a gate')), 0);
    }
  }
});

test('Count neutrality changes only the smooth pool that lost phrases', () => {
  const plain = poolFeatures(scores, queries, defs, ['a1'], null, [], false),
    neutral = poolFeatures(scores, queries, defs, ['a1'], null, [], true),
    baseline = poolFeatures(scores, queries, defs);
  const touched = new Set([col('a+ lse'), col('a+ lse default')]);
  for (let i = 0; i < scores.rows; i++)
    for (let j = 0; j < defs.length; j++) {
      // max, second, gap, margin, gate and group margin keep their current semantics.
      if (!touched.has(j)) assert.equal(at(neutral, i, j), at(plain, i, j), defs[j].name);
      // Other families and the opposite polarity are untouched by the removal.
      if (['a- lse', 'b+ lse', 'b+ max'].includes(defs[j].name))
        assert.equal(at(neutral, i, j), at(baseline, i, j), defs[j].name);
    }
  // Zeroed families stay exactly zero.
  const zeroed = poolFeatures(scores, queries, defs, ['a1'], null, ['a'], true);
  for (let i = 0; i < scores.rows; i++)
    defs.forEach((d, j) => d.family === 'a' && assert.equal(at(zeroed, i, j), 0, d.name));
});

test('Pooling never mutates its inputs', () => {
  const data = Float32Array.from(scores.data),
    q = structuredClone(queries),
    f = structuredClone(defs),
    disabled = ['a3', 'b1'],
    zero = ['b'];
  poolFeatures(scores, queries, defs, disabled, 0.4, zero, true);
  poolFeatures(scores, queries, defs, disabled, null, zero, true);
  assert.deepEqual(scores.data, data);
  assert.deepEqual(queries, q);
  assert.deepEqual(defs, f);
  assert.deepEqual(disabled, ['a3', 'b1']);
  assert.deepEqual(zero, ['b']);
});

test('The frozen graph sees the corrected pool and nothing else', () => {
  const weight = defs.map((_, j) => (j % 3 === 0 ? 1.5 : -0.7) + 0.1 * j);
  const nodes: GraphNode[] = [
    { id: 'logit', op: 'dense', inputs: ['features'], weight: [weight], bias: [-0.2] },
    { id: 'probability', op: 'sigmoid', inputs: ['logit'] },
  ];
  const run = (m: Matrix, i: number) =>
    forwardRow(nodes, { features: m.data.subarray(i * m.cols, (i + 1) * m.cols) });
  const baseline = poolFeatures(scores, queries, defs),
    plain = poolFeatures(scores, queries, defs, ['a1'], null, [], false),
    neutral = poolFeatures(scores, queries, defs, ['a1'], null, [], true);
  const delta = weight[col('a+ lse')] * 0.1 * Math.log(4 / 3) +
    weight[col('a+ lse default')] * 1 * Math.log(4 / 3);
  for (let i = 0; i < scores.rows; i++) {
    const p = run(plain, i),
      n = run(neutral, i);
    // A linear layer passes the exact correction through: Δlogit = Σ w_j τ_j log(N/k).
    close(n.logit[0] - p.logit[0], delta, 1e-5, 'logit shift');
    assert.ok(n.probability[0] !== p.probability[0]);
  }
  // With equal similarities count-neutral removal reproduces the unablated prediction.
  const b = run(baseline, 1),
    n = run(neutral, 1),
    p = run(plain, 1);
  close(n.probability[0], b.probability[0], 1e-6, 'equal-similarity prediction');
  assert.ok(Math.abs(p.probability[0] - b.probability[0]) > 1e-3);
});

test('Cache keys separate count-neutral replays and the math revision', async () => {
  assert.notEqual(CACHE_VERSION, 'instruments-ux-3');
  const payload = {
    similarities: 's',
    queries,
    definitions: defs,
    disabled: ['a1'],
    temperature: null,
    zeroFamilies: [],
    output: 'f',
  };
  const on = await operationKey('features', { ...payload, countNeutral: true }, ['h']),
    off = await operationKey('features', { ...payload, countNeutral: false }, ['h']);
  assert.notEqual(on, off);
});

const load = (folder: string, ref: MatrixRef): Matrix => {
  const buf = gunzipSync(readFileSync('public/data/' + folder + '/' + ref.url));
  return {
    rows: ref.rows,
    cols: ref.cols,
    data: new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
  };
};
test('On bundled data one removal shifts only matching LSE features by τ·log(N/(N−1))', () => {
  let checked = 0;
  for (const folder of ['collection', 'paired']) {
    const d = JSON.parse(
      readFileSync('public/data/' + folder + '/manifest.json', 'utf8'),
    ) as Manifest;
    for (const bank of d.queries ?? []) {
      const features = d.featureDefinitions?.[bank.id];
      if (!features) continue;
      const full = load(folder, d.representations.find((r) => r.id === bank.similarities)!.matrix),
        rows = Math.min(40, full.rows),
        sims: Matrix = { rows, cols: full.cols, data: full.data.slice(0, rows * full.cols) };
      const removed = bank.items[0],
        n = bank.items.filter(
          (q) => q.family === removed.family && q.polarity === removed.polarity,
        ).length;
      const baseline = poolFeatures(sims, bank.items, features),
        plain = poolFeatures(sims, bank.items, features, [removed.id], null, [], false),
        neutral = poolFeatures(sims, bank.items, features, [removed.id], null, [], true);
      assert.deepEqual(
        poolFeatures(sims, bank.items, features, [], null, [], true).data,
        baseline.data,
      );
      features.forEach((def, j) => {
        const affected =
          def.kind === 'lse' &&
          def.family === removed.family &&
          (def.polarity ?? 'positive') === removed.polarity &&
          n > 1;
        if (affected) checked++;
        for (let i = 0; i < rows; i++) {
          const diff = at(neutral, i, j) - at(plain, i, j);
          if (!affected) assert.equal(diff, 0, folder + ' ' + def.name);
          else
            close(
              diff,
              (def.temperature ?? 1) * Math.log(n / (n - 1)),
              5e-6,
              folder + ' ' + def.name,
            );
        }
      });
    }
  }
  assert.ok(checked > 0, 'bundled data exercised at least one corrected LSE feature');
});
