import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESENTATION_EXAMPLES,
  UI_EXAMPLES,
  presentationExamples,
  previewPopulation,
} from '../src/core/presentation-plan';
import { defaultComparisonIndex, defaultFocusIndex } from '../src/core/capabilities';
import { warmMedia } from '../src/core/media';
import type { Manifest } from '../src/core/types';
const manifest = (n: number, media: (i: number) => boolean) =>
  ({
    items: Array.from({ length: n }, (_, i) => ({
      id: 'item-' + i,
      label: i % 2,
      split: i % 5 ? 'train' : 'holdout',
      ...(media(i) ? { media: 'https://i.ytimg.com/vi/v' + i + '/hqdefault.jpg' } : {}),
    })),
  }) as unknown as Manifest;
test('Presentation examples stay bounded, deterministic, and spread through the dataset', () => {
  const m = manifest(2875, () => true),
    a = presentationExamples(m),
    b = presentationExamples(m);
  assert.equal(a.length, PRESENTATION_EXAMPLES);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
  // Opening examples and defaults come first; the rest reach the far end of the dataset.
  for (let i = 0; i < UI_EXAMPLES; i++) assert.ok(a.includes(i));
  assert.ok(a.includes(defaultFocusIndex(m)) && a.includes(defaultComparisonIndex(m)));
  assert.ok(Math.max(...a) > 2875 * 0.9);
  const quarters = [0, 1, 2, 3].map((q) => a.filter((i) => Math.floor(i / 719) === q).length);
  assert.ok(
    quarters.every((c) => c >= 10),
    'spread ' + quarters,
  );
});
test('Current selections take priority and invalid indices are ignored', () => {
  const m = manifest(2875, () => true),
    a = presentationExamples(m, [2000, 1500, 2000, -1, 99999, 1.5]);
  assert.deepEqual(a.slice(0, 2), [2000, 1500]);
  assert.equal(a.length, PRESENTATION_EXAMPLES);
  assert.ok(a.every((i) => Number.isInteger(i) && i >= 0 && i < 2875));
  const many = presentationExamples(
    m,
    Array.from({ length: 100 }, (_, i) => 2874 - i),
  );
  assert.equal(many.length, PRESENTATION_EXAMPLES);
});
test('Neighbor candidates remain the full preview population while anchors are bounded', () => {
  const m = manifest(2875, (i) => i % 3 !== 1),
    previews = previewPopulation(m.items),
    anchors = presentationExamples(m, [1]);
  // Space Explorer's default candidate list, which determines the neighbor cache key.
  const ui = m.items.map((item, i) => (item.media ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(previews, ui);
  assert.equal(previews.length, 1917);
  // A selected record without media is still an anchor; spread anchors all have previews.
  assert.equal(anchors[0], 1);
  assert.ok(anchors.slice(1).every((i) => m.items[i].media));
  assert.equal(anchors.length, PRESENTATION_EXAMPLES);
});
test('Collections without media spread anchors over all records; small ones use every record', () => {
  const generic = manifest(500, () => false),
    a = presentationExamples(generic);
  assert.deepEqual(previewPopulation(generic.items), []);
  assert.equal(a.length, PRESENTATION_EXAMPLES);
  assert.ok(Math.max(...a) > 450);
  assert.deepEqual(
    presentationExamples(manifest(12, () => true)).sort((x, y) => x - y),
    Array.from({ length: 12 }, (_, i) => i),
  );
  assert.deepEqual(presentationExamples(manifest(0, () => true)), []);
});
test('Preview warming reports unavailable previews without throwing and honors fallbacks', async () => {
  const seen: string[] = [];
  const result = await warmMedia(
    ['a', 'bad', { src: 'broken', fallback: 'spare' }, 'a', 'bad-too'],
    () => {},
    {
      load: async (src) => {
        seen.push(src);
        if (src.startsWith('bad') || src === 'broken') throw new Error('unavailable');
      },
    },
  );
  assert.deepEqual(result, { total: 4, ready: 2, failed: 2, cancelled: false });
  assert.ok(seen.includes('spare'));
  // Verified sources are not loaded again; failures are retried on the next preparation.
  seen.length = 0;
  const again = await warmMedia(['a', 'bad'], () => {}, {
    load: async (src) => {
      seen.push(src);
    },
  });
  assert.deepEqual(seen, ['bad']);
  assert.equal(again.ready, 2);
});
test('Preview warming stops dispatching once cancelled', async () => {
  let started = 0,
    stop = false;
  const sources = Array.from({ length: 60 }, (_, i) => 'cancel-' + i);
  const result = await warmMedia(
    sources,
    (done) => {
      if (done >= 8) stop = true;
    },
    {
      cancelled: () => stop,
      load: async () => {
        started++;
        await new Promise((r) => setTimeout(r, 1));
      },
    },
  );
  assert.ok(result.cancelled);
  assert.ok(started < 20, 'started ' + started);
  assert.equal(result.failed, 0);
});
