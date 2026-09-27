import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  defaultFocusIndex,
  defaultComparisonIndex,
  distinctScoreKeys,
  mostActive,
  defaultNetworkNode,
} from '../src/core/capabilities';
import { defaultAuditScope, auditPopulation } from '../src/core/audit';
import { resolveScene } from '../src/core/scene-schema';
import type { Manifest } from '../src/core/types';
const m = JSON.parse(readFileSync('public/data/collection/manifest.json', 'utf8')) as Manifest;
const previewManifest = JSON.parse(
  readFileSync('public/data/paired/manifest.json', 'utf8'),
) as Manifest;
test('saved holdout examples and contrast survive reordering', () => {
  for (const manifest of [
    previewManifest,
    { ...previewManifest, items: previewManifest.items.slice().reverse() },
  ]) {
    const a = defaultFocusIndex(manifest),
      b = defaultComparisonIndex(manifest, a);
    assert.equal(manifest.items[a].split, 'holdout');
    assert.equal(manifest.items[b].split, 'holdout');
    assert.notEqual(manifest.items[a].label, manifest.items[b].label);
    assert.ok(manifest.items[a].media);
    assert.ok(manifest.items[b].media);
  }
});
test('audit population excludes fit rows without silently changing requested scope', () => {
  const items = [
    { split: 'fit', media: 'a' },
    { split: 'holdout', media: 'b' },
    { split: 'holdout', media: 'c' },
  ];
  assert.equal(defaultAuditScope(items), 'holdout');
  assert.deepEqual(auditPopulation(items, [0, 2, 1], 'holdout'), [2, 1]);
  assert.deepEqual(auditPopulation(items, [0], 'holdout'), []);
  assert.deepEqual(auditPopulation(items, [0, 2, 1], 'all'), [0, 2, 1]);
  assert.equal(defaultAuditScope([{ media: 'a' }]), 'all');
});
test('meaningful coordinates and score aliases', () => {
  assert.equal(mostActive([0, 0, -3, 2]), 2);
  const sample = {
    ...m,
    primaryScore: 'model',
    items: [{ id: 'a', label: 0, scores: { baseline: 0.3, model: 0.3, other: 0.6 } }],
  };
  assert.deepEqual(distinctScoreKeys(sample), ['model', 'other']);
});
test('full image simulation resolution stays interactive', () => {
  const start = performance.now();
  const scene = resolveScene({ schemaVersion: 1, scene: 'simulation', seed: 42 }, m);
  const ms = performance.now() - start;
  assert.equal(scene.tool, 'uncertainty');
  assert.ok(ms < 2000, `Full ${m.items.length}-row resolution took ${ms.toFixed(1)} ms`);
  console.log(`Full image simulation resolution: ${ms.toFixed(1)} ms (${m.items.length} rows)`);
});

test('a nested ensemble starts in the final model branch, with explicit branch overrides', () => {
  const paired = JSON.parse(readFileSync('public/data/paired/manifest.json', 'utf8')) as Manifest;
  assert.ok(defaultNetworkNode(paired).startsWith('fusion.0.'), defaultNetworkNode(paired));
  assert.ok(defaultNetworkNode(paired, 'image.2.probability').startsWith('image.2.'));
  const scene = resolveScene({ schemaVersion: 1, scene: 'network.flow' }, paired);
  assert.equal(scene.view['network.view'], 'flow');
  assert.equal(scene.view['transform.8'], defaultNetworkNode(paired));
});
