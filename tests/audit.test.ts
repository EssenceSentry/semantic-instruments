import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPosterior,
  partitionRanks,
  summarizeAudit,
  nextAuditBatch,
  sampleMeanInterval,
} from '../src/core/audit';
import { ensureMeasures, primaryScore, probabilityScore } from '../src/core/capabilities';
import { validateManifest, template } from '../src/core/dataset';
import type { Dataset } from '../src/core/types';
test('Rank bands partition identities exactly and successive batches never repeat', () => {
  const ids = Array.from({ length: 47 }, (_, i) => 'id-' + i),
    cells = partitionRanks(ids, 5);
  assert.deepEqual(cells.flat(), ids);
  assert.ok(cells.every((c) => c.length === 9 || c.length === 10));
  const first = nextAuditBatch(cells, [], 4, 42),
    batches = [{ band: 4, ids: first, positives: 4, time: 'test' }];
  const second = nextAuditBatch(cells, batches, 4, 43);
  assert.equal(second.length, 1);
  assert.equal(new Set([...first, ...second]).size, 10);
  const summary = summarizeAudit(cells, batches);
  assert.equal(summary[4].observed, 9);
  assert.equal(summary[4].positives, 4);
  assert.throws(() => summarizeAudit(cells, [...batches, ...batches]), /twice/);
  assert.throws(() => summarizeAudit(cells, [{ ...batches[0], positives: 10 }]), /Invalid/);
  assert.throws(
    () => summarizeAudit(cells, [{ ...batches[0], ids: ['outside'] }]),
    /Invalid|outside/,
  );
});
test('A complete count-only audit collapses posterior uncertainty without individual labels', () => {
  const cells = partitionRanks(
    Array.from({ length: 20 }, (_, i) => '' + i),
    2,
  );
  const batches = [
    { band: 0, ids: cells[0], positives: 9, time: 'a' },
    { band: 1, ids: cells[1], positives: 3, time: 'b' },
  ];
  const result = auditPosterior(summarizeAudit(cells, batches), 0.8, 400);
  assert.deepEqual(
    result.endpoints.map((x) => [x.low, x.high]),
    [
      [0.9, 0.9],
      [0.6, 0.6],
    ],
  );
  assert.ok(result.cutoffs.every((x) => x === 10));
  assert.deepEqual(result.cutoffInterval, [10, 10]);
  assert.equal(result.lowerBoundCutoff, 10);
});
test('Monte Carlo mean agrees with analytic posterior-predictive finite-population mean', () => {
  const ids = Array.from({ length: 100 }, (_, i) => '' + i);
  const result = auditPosterior([{ ids, observed: 10, positives: 8 }], 0.9, 12000, 1, 1, 741);
  const expected = (8 + (90 * 9) / 12) / 100;
  assert.ok(Math.abs(result.endpoints[0].mean - expected) < 0.006);
  assert.ok(result.endpoints[0].low < expected && result.endpoints[0].high > expected);
});
test('Finite population mean interval has correct census and small-sample behavior', () => {
  assert.equal(sampleMeanInterval([2, 4, 6], 3).se, 0);
  assert.equal(sampleMeanInterval([2, 4, 6], 3).estimate, 4);
  assert.ok(Number.isNaN(sampleMeanInterval([2], 10).se));
  const r = sampleMeanInterval([2, 4], 10);
  assert.ok(Math.abs(r.se - Math.sqrt(0.8)) < 1e-12);
});
test('Vectors without labels or predictions gain a quantity, never a probability', () => {
  const manifest = template();
  manifest.items = manifest.items
    .slice(0, 2)
    .map((i) => ({ ...i, label: null, scores: undefined }));
  manifest.representations = [
    { id: 'v', name: 'State', kind: 'custom', dimensions: 2, matrix: { rows: 2, cols: 2 } },
  ];
  const d: Dataset = {
    manifest,
    matrices: new Map([['v', { rows: 2, cols: 2, data: Float32Array.from([3, 4, -5, 12]) }]]),
    positions: new Map(),
    baseUrl: '',
    imported: true,
  };
  ensureMeasures(d);
  assert.equal(primaryScore(manifest), 'vector_norm');
  assert.equal(manifest.items[1].scores?.vector_norm, 13);
  assert.equal(probabilityScore(manifest), false);
  validateManifest(manifest);
});

test('General vector graphs validate widths instead of imposing a binary scalar output', () => {
  const m = template();
  m.representations = [
    {
      id: 'x',
      name: 'Input',
      kind: 'custom',
      dimensions: 2,
      matrix: { rows: m.items.length, cols: 2 },
    },
    {
      id: 'y',
      name: 'Output',
      kind: 'custom',
      dimensions: 2,
      matrix: { rows: m.items.length, cols: 2 },
    },
  ];
  m.model = {
    id: 'linear-map',
    kind: 'vector',
    inputs: ['x'],
    output: 'y',
    nodes: [
      {
        id: 'y',
        op: 'dense',
        inputs: ['x'],
        weight: [
          [2, 0],
          [0, -1],
        ],
        bias: [0, 1],
      },
    ],
  };
  validateManifest(m);
  m.model.nodes[0].weight = [[2, 0]];
  m.model.nodes[0].bias = [0];
  assert.throws(() => validateManifest(m), /width/);
});
