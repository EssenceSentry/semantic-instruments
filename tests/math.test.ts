import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  poolFeatures,
  forwardRow,
  metrics,
  aggregate,
  poissonBinomial,
  supportedCount,
  lse,
  cosine,
  neighbors,
} from '../src/core/math';
import { validateManifest, template } from '../src/core/dataset';
import type { Manifest, Matrix, MatrixRef, Item } from '../src/core/types';
const load = (folder: string, ref: MatrixRef): Matrix => {
  const buf = gunzipSync(readFileSync('public/data/' + folder + '/' + ref.url));
  return {
    rows: ref.rows,
    cols: ref.cols,
    data: new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
  };
};
const sample = (m: Matrix, indices: number[]) => ({
  rows: indices.length,
  cols: m.cols,
  data: Float32Array.from(
    indices.flatMap((i) => Array.from(m.data.subarray(i * m.cols, (i + 1) * m.cols))),
  ),
});
test('Native query-feature recipe agrees with independent browser reduction on both modalities', () => {
  for (const folder of ['collection', 'paired']) {
    const d = JSON.parse(
      readFileSync('public/data/' + folder + '/manifest.json', 'utf8'),
    ) as Manifest;
    validateManifest(d);
    for (const bank of d.queries!) {
      const sims = load(folder, d.representations.find((r) => r.id === bank.similarities)!.matrix),
        expected = load(folder, d.representations.find((r) => r.id === bank.features)!.matrix);
      const ids = Array.from({ length: 73 }, (_, i) => Math.floor((i * (sims.rows - 1)) / 72));
      const result = poolFeatures(sample(sims, ids), bank.items, d.featureDefinitions![bank.id]);
      const truth = sample(expected, ids);
      let max = 0;
      result.data.forEach((v, i) => (max = Math.max(max, Math.abs(v - truth.data[i]))));
      assert.ok(max < 2e-5, folder + ' ' + bank.id + ' feature max error ' + max);
    }
  }
});
test('Exported graph reproduces native probabilities and intermediate activations', () => {
  for (const folder of ['collection', 'paired']) {
    const d = JSON.parse(
      readFileSync('public/data/' + folder + '/manifest.json', 'utf8'),
    ) as Manifest;
    const matrices = new Map(d.representations.map((r) => [r.id, load(folder, r.matrix)]));
    for (const index of [0, 18, 92, 413, 1200]) {
      const inputs = Object.fromEntries(
        d.model!.inputs.map((id) => {
          const m = matrices.get(id)!;
          return [id, m.data.subarray(index * m.cols, (index + 1) * m.cols)];
        }),
      );
      const values = forwardRow(d.model!.nodes, inputs);
      for (const rep of d.representations.filter((r) => values[r.id])) {
        const expected = matrices.get(rep.id)!;
        values[rep.id].forEach((v, j) =>
          assert.ok(Math.abs(v - expected.data[index * expected.cols + j]) < 4e-5, rep.id),
        );
      }
    }
  }
});
test('Strict gate rejects ties while preserving the signed margin', () => {
  const queries = [
    { id: 'a', text: 'a', family: 'x', polarity: 'positive' as const },
    { id: 'b', text: 'b', family: 'x', polarity: 'negative' as const },
  ];
  const m = poolFeatures(
    { rows: 3, cols: 2, data: Float32Array.from([0.7, 0.7, 0.8, 0.5, 0.2, 0.6]) },
    queries,
    [
      { name: 'gate', kind: 'gate', family: 'x' },
      { name: 'margin', kind: 'margin', family: 'x' },
    ],
  );
  assert.equal(m.data[0], 0);
  assert.equal(m.data[1], 0);
  assert.ok(Math.abs(m.data[2] - 0.8) < 1e-6);
  assert.equal(m.data[4], 0);
  assert.ok(m.data[5] < 0);
});
test('LSE exposes multiplicity and approaches max as temperature tends to zero', () => {
  assert.ok(Math.abs(lse([0.4, 0.4], 0.25) - (0.4 + 0.25 * Math.log(2))) < 1e-12);
  assert.ok(Math.abs(lse([0.2, 0.6], 1e-4) - 0.6) < 1e-10);
});
test('Top-k summaries use actual support without zero padding', () => {
  assert.equal(aggregate([0.9, 0.7], 'topk', 20), 0.8);
  assert.equal(aggregate([0.9, 0.7, NaN], 'topk', 20), 0.8);
  assert.ok(Number.isNaN(aggregate([], 'mean')));
  assert.equal(aggregate([0.9, 0.8, 0, 0], 'topk', 2), 0.8500000000000001);
});
test('Supported count matches exhaustive independent outcome probabilities', () => {
  const m = poissonBinomial([0.8, 0.6]);
  assert.ok(Math.abs(m[0] - 0.08) < 1e-12);
  assert.ok(Math.abs(m[1] - 0.44) < 1e-12);
  assert.ok(Math.abs(m[2] - 0.48) < 1e-12);
  assert.equal(supportedCount([0.8, 0.6], 0.9), 1);
  assert.equal(supportedCount([0.8, 0.6], 0.95), 0);
});
test('Average precision groups ties, avoiding order-dependent performance', () => {
  const items: Item[] = [
    { id: 'a', label: 1 },
    { id: 'b', label: 0 },
    { id: 'c', label: 1 },
  ];
  const result = metrics([0.8, 0.8, 0.2], items, 0.8);
  assert.equal(result.tp, 1);
  assert.equal(result.fp, 1);
  assert.equal(result.ap, 0.5 * 0.5 + (0.5 * 2) / 3);
});
test('Exact neighbors use original vectors independent of viewing projection', () => {
  const m = { rows: 3, cols: 3, data: Float32Array.from([1, 0, 0, 0.9, 0.1, 0, 0, 1, 0]) };
  assert.equal(neighbors(m, 0, 1)[0].index, 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
});
test('Minimal portable dataset validates and rejects duplicate identities and mismatched rows', () => {
  const d = template();
  validateManifest(d);
  const bad = structuredClone(d);
  bad.items[1].id = bad.items[0].id;
  assert.throws(() => validateManifest(bad), /unique/);
  const bad2 = structuredClone(d);
  bad2.representations[0].matrix.rows--;
  assert.throws(() => validateManifest(bad2), /rows/);
});
test('Import accepts HTTPS media but rejects credentials, unsafe schemes, and matrix traversal', () => {
  const d = template();
  d.items[0].media = 'https://example.com/private.png';
  assert.equal(validateManifest(d).items[0].media, 'https://example.com/private.png');
  for (const bad of [
    'javascript:alert(1)',
    'http://example.com/test.jpg',
    'https://user:pass@example.com/image.jpg',
  ]) {
    d.items[0].media = bad;
    assert.throws(() => validateManifest(d), /Media/);
  }
  delete d.items[0].media;
  d.representations[0].matrix.url = '../outside';
  assert.throws(() => validateManifest(d), /relative/);
});
