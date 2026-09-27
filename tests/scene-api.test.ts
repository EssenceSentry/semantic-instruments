import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveScene,
  controlSchema,
  timelineScene,
  validateTimeline,
  type Timeline,
} from '../src/core/scene-schema';
import { ViewState } from '../src/core/view-state';
import type { Manifest } from '../src/core/types';
const weapons = JSON.parse(
  readFileSync('public/data/collection/manifest.json', 'utf8'),
) as Manifest;
const dynamics = JSON.parse(readFileSync('public/data/dynamics/manifest.json', 'utf8')) as Manifest;

test('stable IDs resolve against reordered rows without changing identities', () => {
  const ids = dynamics.items.slice(1, 3).map((i) => i.id);
  const spec = {
    schemaVersion: 1,
    scene: 'vector',
    selectedIds: ids,
    pinnedIds: [ids[0]],
    controls: { 'vector.otherItemId': ids[1] },
  };
  const a = resolveScene(spec, dynamics),
    reversed = { ...dynamics, items: dynamics.items.slice().reverse() },
    b = resolveScene(spec, reversed);
  assert.deepEqual(
    a.selected.map((i) => dynamics.items[i].id),
    b.selected.map((i) => reversed.items[i].id),
  );
  assert.equal(reversed.items[Number(b.view['algebra.other'])].id, ids[1]);
});
test('scene defaults and explicit controls produce a complete independent state', () => {
  const state = resolveScene(
    {
      schemaVersion: 1,
      scene: 'queries.pooling',
      seed: 42,
      controls: { 'queries.temperature': 0.17 },
    },
    weapons,
  );
  assert.equal(state.view['transform.0'], 'queries');
  assert.equal(state.view['transform.operator'], 'lse');
  assert.equal(state.view['transform.temperature'], 0.17);
  assert.equal(state.view['numeric.seed'], 42);
  assert.equal(state.view['uncertainty.round'], 42);
  assert.equal(state.view['audit.seed'], 42);
  assert.equal(state.view['rank.weight'], 0.5);
});
test('invalid controls, identities, shapes and unavailable scenes fail explicitly', () => {
  const base = { schemaVersion: 1, scene: 'space.pca' };
  for (const patch of [
    { controls: { 'queries.temperature': NaN } },
    { controls: { 'rank.k': 1.3 } },
    { selectedIds: ['missing'] },
    { selectedIds: [dynamics.items[0].id, dynamics.items[0].id] },
    { camera: { zoom: 0 } },
    { camera: { mystery: 1 } },
    { mystery: true },
    { controls: { unknown: 2 } },
    { scene: 'network' },
    { scene: 'audit' },
  ])
    assert.throws(() => resolveScene({ ...base, ...patch }, dynamics));
  assert.throws(
    () =>
      resolveScene(
        { schemaVersion: 1, scene: 'network', controls: { 'network.coordinate': 100000 } },
        weapons,
      ),
    /coordinate/,
  );
  assert.throws(() =>
    resolveScene(
      { schemaVersion: 1, scene: 'queries', controls: { 'queries.family': 'unknown' } },
      weapons,
    ),
  );
  assert.throws(
    () =>
      resolveScene(
        { schemaVersion: 1, scene: 'compose', controls: { 'compose.method': 'supported' } },
        dynamics,
      ),
    /probability/,
  );
});
test('timeline seeks are absolute and order-independent', () => {
  const timeline: Timeline = {
    scene: { schemaVersion: 1, scene: 'vector.blend', seed: 7 },
    duration: 2,
    tracks: [{ control: 'vector.alpha', from: 0, to: 1, easing: 'smoothstep' }],
  };
  validateTimeline(timeline, dynamics);
  const first = timelineScene(timeline, 1.5);
  timelineScene(timeline, 0.25);
  assert.deepEqual(timelineScene(timeline, 1.5), first);
  assert.equal(timelineScene(timeline, 1).controls?.['vector.alpha'], 0.5);
  assert.throws(() => timelineScene(timeline, 3));
  assert.throws(() =>
    validateTimeline(
      { ...timeline, tracks: [{ control: 'numeric.size', from: 1, to: 10 }] },
      dynamics,
    ),
  );
  assert.throws(() =>
    validateTimeline({ ...timeline, tracks: [timeline.tracks[0], timeline.tracks[0]] }, dynamics),
  );
  assert.throws(() =>
    validateTimeline(
      { ...timeline, tracks: [{ control: 'vector.alpha', from: -1, to: 1 }] },
      dynamics,
    ),
  );
});
test('reactive store batches external mutations and notifications', () => {
  const state = new ViewState();
  let events = 0;
  const unsubscribe = state.subscribe(() => events++);
  state.replace({ first: 1, second: 2 });
  assert.equal(events, 1);
  state.set('first', 1);
  assert.equal(events, 1);
  state.set('first', 2);
  assert.equal(events, 2);
  state.delete('second');
  assert.equal(events, 3);
  unsubscribe();
  state.clear();
  assert.equal(events, 3);
});
test('every public control has a named description and finite numeric default', () => {
  for (const m of [weapons, dynamics])
    for (const [name, c] of Object.entries(controlSchema(m))) {
      assert.ok(c.description, name);
      if (typeof c.default === 'number') assert.ok(Number.isFinite(c.default), name);
    }
});
