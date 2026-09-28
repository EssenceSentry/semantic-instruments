import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  availableTour,
  BUNDLED_TOURS,
  customTourId,
  parseTour,
  resolveTour,
} from '../src/core/tour';
import { bundledTourFromSearch, checkTourScenes, tourStepScene } from '../src/core/tour-scenes';
import type { Manifest } from '../src/core/types';
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const catalog = json('public/data/catalog.json') as { id: string; url: string }[];
const manifest = (id: string) => json('public' + catalog.find((d) => d.id === id)!.url) as Manifest;
const bundled = BUNDLED_TOURS.map((id) => parseTour(json(`public/tours/${id}.json`)));
const base = bundled[0];

test('every bundled tour loads under its own name and matches the datasets it names', () => {
  assert.equal(base.id, 'default');
  for (const [i, doc] of bundled.entries()) {
    assert.equal(doc.id, BUNDLED_TOURS[i]);
    const tour = resolveTour(doc, base);
    for (const datasetId of doc.datasetIds ?? []) {
      const m = manifest(datasetId);
      assert.deepEqual(checkTourScenes(tour, m), [], `${doc.id} on ${datasetId}`);
      assert.ok(availableTour(tour, m).steps.length, `${doc.id} on ${datasetId}`);
    }
  }
});

test('the auto-classifier showcase ships with the lab for the paired weapons videos', () => {
  const doc = bundled.find((d) => d.id === 'auto-classifier-showcase');
  assert.ok(doc, 'the showcase is a bundled tour');
  assert.deepEqual(doc.datasetIds, ['weapons-paired']);
  const tour = availableTour(resolveTour(doc, base), manifest('weapons-paired'));
  // All sixteen presentation stops are offered, each opening its own scene on its own schedule.
  assert.equal(tour.steps.length, 16);
  assert.equal(tour.chapters.length, 4);
  assert.ok(tour.steps.every((s) => tourStepScene(s) && s.autoplay));
});

test('an imported tour never replaces a bundled tour with the same id', () => {
  for (const id of BUNDLED_TOURS) assert.equal(customTourId(id), 'custom-' + id);
  assert.equal(customTourId('my-talk'), 'my-talk');
});

test('a tour link can name a bundled tour instead of a file', () => {
  assert.equal(
    bundledTourFromSearch('?tour=auto-classifier-showcase&autoplay=1'),
    'auto-classifier-showcase',
  );
  assert.equal(bundledTourFromSearch('?tour=weapons'), 'weapons');
  for (const other of ['?tour=showcase/showcase-tour.json', '?tour=__proto__', '?pace=2', ''])
    assert.equal(bundledTourFromSearch(other), null, other);
});
