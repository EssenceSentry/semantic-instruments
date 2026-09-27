import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  atlasBanks,
  atlasLayout,
  effectiveMode,
  explainFeature,
  featureDeltas,
  findNormalizers,
  normalizersDiffer,
  operatorLabel,
  standardizeRow,
  standardizeValue,
  strongestFeature,
} from '../src/core/feature-atlas';
import { forwardRow, poolFeatures, seeded } from '../src/core/math';
import type { FeatureDefinition, Manifest, Matrix, ModelGraph, Query } from '../src/core/types';

const collection = JSON.parse(
  readFileSync('public/data/collection/manifest.json', 'utf8'),
) as Manifest;
const paired = JSON.parse(readFileSync('public/data/paired/manifest.json', 'utf8')) as Manifest;
const colsFrom = (m: Manifest) => (id: string) =>
  m.representations.find((r) => r.id === id)?.dimensions;

const queries: Query[] = [
  { id: 'a1', text: 'alpha one', family: 'Alpha', polarity: 'positive' },
  { id: 'a2', text: 'alpha two', family: 'Alpha', polarity: 'positive' },
  { id: 'a3', text: 'alpha three', family: 'Alpha', polarity: 'positive' },
  { id: 'an', text: 'alpha lookalike', family: 'Alpha', polarity: 'negative' },
  { id: 'b1', text: 'beta one', family: 'Beta', polarity: 'positive' },
  { id: 'bn1', text: 'beta lookalike', family: 'Beta', polarity: 'negative' },
  { id: 'bn2', text: 'beta lookalike two', family: 'Beta', polarity: 'negative' },
];
const defs: FeatureDefinition[] = [
  { name: 'a max+', family: 'Alpha', kind: 'max', polarity: 'positive' },
  { name: 'a max-', family: 'Alpha', kind: 'max', polarity: 'negative' },
  { name: 'a margin', family: 'Alpha', kind: 'margin', polarity: null },
  { name: 'a gate', family: 'Alpha', kind: 'gate' },
  { name: 'a second+', family: 'Alpha', kind: 'second', polarity: 'positive' },
  { name: 'a gap+', family: 'Alpha', kind: 'gap', polarity: 'positive' },
  { name: 'a lse1', family: 'Alpha', kind: 'lse', polarity: 'positive', temperature: 1 },
  { name: 'a lse.25', family: 'Alpha', kind: 'lse', polarity: 'positive', temperature: 0.25 },
  { name: 'a lse?', family: 'Alpha', kind: 'lse', polarity: 'negative' },
  { name: 'b max+', family: 'Beta', kind: 'max', polarity: 'positive' },
  { name: 'b max+ again', family: 'Beta', kind: 'max', polarity: 'positive' },
  { name: 'b second-', family: 'Beta', kind: 'second', polarity: 'negative' },
  { name: 'b gap?', family: 'Beta', kind: 'gap' },
  { name: 'global', kind: 'groupMargin' },
];
const toyManifest = (extra: Partial<Manifest> = {}): Manifest => ({
  schemaVersion: 1,
  id: 'toy',
  title: 'Toy',
  items: [
    { id: 'r0', label: 1 },
    { id: 'r1', label: 0 },
  ],
  representations: [
    { id: 'sims', name: 'Similarities', kind: 'similarity', dimensions: 7, matrix: { rows: 2, cols: 7 } },
    { id: 'feats', name: 'Pooled', kind: 'features', dimensions: defs.length, matrix: { rows: 2, cols: defs.length } },
  ],
  queries: [
    { id: 'q', representation: 'emb', items: queries, vectors: { rows: 7, cols: 3 }, similarities: 'sims', features: 'feats' },
  ],
  featureDefinitions: { q: defs },
  ...extra,
});

test('metadata becomes family rows and operator columns without blanks or collisions', () => {
  const [bank] = atlasBanks(toyManifest());
  const layout = atlasLayout(bank);
  assert.equal(layout.flat, false);
  assert.deepEqual(
    layout.rows.map((r) => r.family),
    ['Alpha', 'Beta'],
  );
  assert.deepEqual(layout.global, [13]);
  // Every definition is placed exactly once.
  const placed = [...layout.rows.flatMap((r) => r.cells.filter((c) => c != null)), ...layout.global];
  assert.deepEqual(placed.slice().sort((a, b) => a! - b!), defs.map((_, j) => j));
  // Every column is used by at least one family.
  layout.columns.forEach((_, k) => assert.ok(layout.rows.some((r) => r.cells[k] != null)));
  // The duplicate Beta max+ has its own column instead of overwriting the first.
  const beta = layout.rows[1];
  const maxCols = layout.columns.map((c, k) => (c.key.startsWith('max|positive|') ? k : -1)).filter((k) => k >= 0);
  assert.equal(maxCols.length, 2);
  assert.deepEqual(maxCols.map((k) => beta.cells[k]), [9, 10]);
  assert.match(layout.columns[maxCols[1]].label, /#2/);
  // Kinds follow the canonical order and higher temperatures come first.
  const labels = layout.columns.map((c) => c.label);
  assert.ok(labels.indexOf('max +') < labels.indexOf('margin'));
  assert.ok(labels.indexOf('LSE τ1 +') < labels.indexOf('LSE τ0.25 +'));
  assert.equal(operatorLabel(defs[8]), 'LSE −');
});

test('the saved collection bank maps to 10 families × 12 operators plus one global feature', () => {
  const banks = atlasBanks(collection, colsFrom(collection));
  const bank = banks.find((b) => b.id === 'image')!;
  assert.ok(bank.definitions);
  const layout = atlasLayout(bank);
  assert.equal(layout.rows.length, 10);
  assert.equal(layout.columns.length, 12);
  assert.equal(layout.global.length, 1);
  assert.ok(layout.rows.every((r) => r.cells.every((c) => c != null)));
  assert.equal(new Set(layout.rows.flatMap((r) => r.cells)).size + layout.global.length, bank.width);
});

test('explanations reproduce poolFeatures exactly, including interventions', () => {
  const random = seeded(7);
  const sims = Float32Array.from({ length: 7 * 20 }, () => random() * 0.4 - 0.1);
  const matrix: Matrix = { rows: 20, cols: 7, data: sims };
  for (const options of [
    { disabled: [], temperature: null, zeroFamilies: [] },
    { disabled: ['a1', 'bn1'], temperature: 0.1, zeroFamilies: [], countNeutral: true },
    { disabled: ['a1', 'bn1'], temperature: null, zeroFamilies: [], countNeutral: true },
    { disabled: ['a1', 'bn1'], temperature: 0.1, zeroFamilies: [] },
    { disabled: ['an', 'b1'], temperature: null, zeroFamilies: ['Beta'] },
  ]) {
    const pooled = poolFeatures(
      matrix,
      queries,
      defs,
      options.disabled,
      options.temperature,
      options.zeroFamilies, options.countNeutral,
    );
    for (let i = 0; i < matrix.rows; i++)
      defs.forEach((def, j) => {
        const e = explainFeature(def, queries, sims.subarray(i * 7, i * 7 + 7), options);
        assert.ok(Math.abs(e.value - pooled.data[i * defs.length + j]) < 1e-6, def.name);
      });
  }
});

test('explanations quote absent metadata rather than inventing it', () => {
  const sims = [0.3, 0.2, 0.1, 0.25, 0.05, 0.4, 0.35];
  const lse = explainFeature(defs[8], queries, sims);
  assert.ok(lse.notes.some((n) => /Temperature is not recorded/.test(n)));
  const gap = explainFeature(defs[12], queries, sims);
  assert.ok(gap.notes.some((n) => /Polarity is not recorded/.test(n)));
  assert.equal(gap.value, 0); // Beta has one positive phrase.
  const orphan = explainFeature({ name: 'x', kind: 'max', polarity: 'positive' }, queries, sims);
  assert.equal(orphan.status, 'unavailable');
  assert.ok(Number.isNaN(orphan.value));
  const zeroed = explainFeature(defs[0], queries, sims, {
    disabled: [],
    temperature: null,
    zeroFamilies: ['Alpha'],
  });
  assert.equal(zeroed.status, 'zeroed');
  assert.equal(zeroed.value, 0);
  const margin = explainFeature(defs[2], queries, sims);
  assert.equal(margin.sets.length, 2);
  assert.equal(margin.sets[0].phrases[0].id, 'a1');
  assert.ok(Math.abs(margin.value - (0.3 - 0.25)) < 1e-12);
});

test('saved normalizers are matched directly and through concat offsets', () => {
  const model: ModelGraph = {
    id: 'm',
    output: 'out',
    inputs: ['feats', 'extra'],
    nodes: [
      { id: 'joined', op: 'concat', inputs: ['extra', 'feats'] },
      { id: 'viaConcat', op: 'normalize', inputs: ['joined'], mean: [9, 9, 1, 2, 3], scale: [1, 1, 2, 4, 8] },
      { id: 'direct', op: 'normalize', inputs: ['feats'], mean: [0, 1, 2], scale: [1, 2, 4] },
      { id: 'short', op: 'normalize', inputs: ['feats'], mean: [0], scale: [1] },
      { id: 'other', op: 'normalize', inputs: ['extra'], mean: [0, 0], scale: [1, 1] },
    ],
  };
  const widths: Record<string, number> = { feats: 3, extra: 2 };
  const cols = (id: string) => widths[id];
  const found = findNormalizers(model, 'feats', cols);
  assert.deepEqual(
    found.map((n) => [n.id, n.offset, n.via]),
    [
      ['direct', 0, undefined],
      ['viaConcat', 2, 'joined'],
    ],
  );
  assert.equal(standardizeValue(5, found[1], 1), (5 - 2) / 4);
  assert.ok(normalizersDiffer(found, 3));
  // The result matches the graph's own normalize node.
  const trace = forwardRow(model.nodes.slice(0, 2), { feats: [1, 6, 11], extra: [0, 0] });
  assert.deepEqual(
    Array.from(standardizeRow([1, 6, 11], found[1])!),
    trace.viaConcat.slice(2),
  );
  assert.deepEqual(findNormalizers(undefined, 'feats', cols), []);
  assert.deepEqual(findNormalizers(model, 'missing', cols), []);
});

test('ensemble members in saved datasets keep their own normalization', () => {
  const image = findNormalizers(collection.model, 'features.image', colsFrom(collection));
  assert.deepEqual(
    image.map((n) => n.id),
    ['image.0.encoder0.norm', 'image.1.encoder0.norm', 'image.2.encoder0.norm'],
  );
  assert.ok(image.every((n) => !n.via && n.offset === 0));
  const fused = findNormalizers(paired.model, 'features.image', colsFrom(paired));
  assert.ok(fused.some((n) => n.via === 'fusion.input.image' && n.offset === 0));
  assert.equal(fused[0].via, undefined); // direct readers are preferred
  const text = findNormalizers(paired.model, 'features.text', colsFrom(paired));
  assert.ok(text.length > 0 && text.every((n) => n.id.startsWith('fusion.')));
});

test('deltas use the intervened matrix against the baseline and are zero without one', () => {
  const baseline: Matrix = { rows: 2, cols: 3, data: Float32Array.from([1, 2, 3, 4, 5, 6]) };
  const current: Matrix = { rows: 2, cols: 3, data: Float32Array.from([1, 2, 3, 4, 0, 7]) };
  assert.deepEqual(Array.from(featureDeltas(baseline, undefined, 1)), [0, 0, 0]);
  assert.deepEqual(Array.from(featureDeltas(baseline, baseline, 1)), [0, 0, 0]);
  assert.deepEqual(Array.from(featureDeltas(baseline, current, 1)), [0, -5, 1]);
  assert.equal(strongestFeature([0.1, -3, 2, NaN]), 1);
  assert.equal(strongestFeature(null), 0);
});

test('feature representations without definitions still produce a compact atlas', () => {
  const manifest: Manifest = {
    schemaVersion: 1,
    id: 'plain',
    title: 'Plain vectors',
    items: [{ id: 'a', label: null }],
    representations: [
      { id: 'emb', name: 'Embedding', kind: 'embedding', dimensions: 30, matrix: { rows: 1, cols: 30 } },
      { id: 'handmade', name: 'Handmade features', kind: 'features', dimensions: 30, matrix: { rows: 1, cols: 30 } },
    ],
  };
  const banks = atlasBanks(manifest);
  assert.deepEqual(banks.map((b) => b.id), ['handmade']);
  const layout = atlasLayout(banks[0]);
  assert.equal(layout.flat, true);
  assert.equal(layout.columns.length, 12);
  assert.equal(layout.rows.length, 3);
  assert.equal(layout.rows[2].cells.filter((c) => c == null).length, 6);
  assert.equal(layout.rows[2].label, 'x24–29');
  // Definitions that do not match the width are disclosed and not applied.
  const broken = atlasBanks(toyManifest({ featureDefinitions: { q: defs.slice(1) } }));
  assert.equal(broken[0].definitions, undefined);
  assert.match(broken[0].note!, /13 definitions were supplied for 14 columns/);
  assert.equal(atlasLayout(broken[0]).flat, true);
  // Without saved normalization the standardized view falls back to raw values.
  assert.equal(effectiveMode('standardized', false), 'raw');
  assert.equal(effectiveMode('standardized', true), 'standardized');
  assert.equal(effectiveMode('delta', false), 'delta');
});
