import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import katex from 'katex';
import {
  parseTour,
  resolveTour,
  availableTour,
  sceneConfig,
  tourFacts,
  interpolateTour,
  TOUR_TARGETS,
} from '../src/core/tour';
import type { Manifest } from '../src/core/types';
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const base = parseTour(json('public/tours/default.json'));
const weapons = parseTour(json('public/tours/weapons.json'));
const collection = json('public/data/collection/manifest.json') as Manifest;
const paired = json('public/data/paired/manifest.json') as Manifest;
const dynamics = json('public/data/dynamics/manifest.json') as Manifest;

test('default and specialized curricula resolve against all built-in capabilities', () => {
  for (const m of [collection, paired, dynamics]) {
    const tour = availableTour(resolveTour(m.id.startsWith('weapons') ? weapons : base, base), m);
    assert.ok(tour.steps.length > 35);
    assert.ok(tour.steps.every((s) => !s.target || s.target in TOUR_TARGETS));
    const facts = tourFacts(m);
    for (const s of tour.steps)
      for (const text of [s.title, ...s.body, ...(s.detail?.body ?? []), s.try ?? ''])
        assert.ok(!interpolateTour(text, facts).includes('{{'), s.id);
    assert.equal(tour.steps.at(-1)?.id, 'reuse');
    assert.ok(tour.chapters.every((c) => tour.steps.some((s) => s.chapter === c.id)));
  }
});
test('specialization changes the story and keeps capability requirements', () => {
  const resolved = resolveTour(weapons, base);
  const source = base.steps!.find((s) => s.id === 'query-family')!;
  const specialized = resolved.steps.find((s) => s.id === source.id)!;
  assert.notEqual(specialized.title, source.title);
  assert.deepEqual(specialized.requires, source.requires);
  assert.equal(
    availableTour(resolved, collection).steps.some((s) => s.id === 'weapons-fusion'),
    false,
  );
  assert.equal(
    availableTour(resolved, paired).steps.some((s) => s.id === 'weapons-fusion'),
    true,
  );
});
test('generic non-classification data never navigates into unavailable model or audit views', () => {
  const tour = availableTour(resolveTour(base), dynamics);
  assert.ok(tour.steps.some((s) => s.id === 'numeric-sampling'));
  assert.ok(
    tour.steps.every(
      (s) =>
        !['network', 'audit', 'simulation', 'compose.supported'].includes(s.scene) &&
        !s.scene.startsWith('queries'),
    ),
  );
  const standalone = availableTour(resolveTour(base), dynamics, 'transform');
  assert.ok(standalone.steps.length > 5);
  assert.ok(standalone.steps.every((s) => sceneConfig(s.scene, dynamics).tool === 'transform'));
});
test('all authored mathematical expressions render as valid KaTeX', () => {
  for (const s of resolveTour(weapons, base).steps)
    for (const formula of [s.formula, s.detail?.formula])
      if (formula)
        assert.doesNotThrow(
          () => katex.renderToString(formula, { throwOnError: true, strict: false, trust: false }),
          s.id,
        );
});
test('custom tours reject unknown navigation, invalid schemas and broken inheritance', () => {
  const editable = JSON.parse(JSON.stringify(base));
  editable.steps[0].scene = 'javascript:submitAudit()';
  assert.throws(() => parseTour(editable), /Invalid tour step/);
  editable.steps[0].scene = 'space';
  editable.steps[0].target = '__proto__';
  assert.throws(() => parseTour(editable), /Invalid tour step/);
  assert.throws(() => parseTour({ ...base, version: -1 }), /positive version/);
  assert.throws(
    () => resolveTour({ ...weapons, overrides: { absent: { title: 'Unknown' } } }, base),
    /Unknown overridden/,
  );
  assert.throws(
    () => resolveTour({ ...base, steps: [base.steps![0], base.steps![0]] }),
    /unique IDs/,
  );
});
test('exported specialized tour is standalone and preserves the full curriculum', () => {
  const resolved = resolveTour(weapons, base);
  const roundtrip = resolveTour(parseTour(JSON.parse(JSON.stringify(resolved))));
  assert.deepEqual(roundtrip.steps, resolved.steps);
  assert.equal(roundtrip.extends, undefined);
  assert.equal(tourFacts(collection).records, '18,327');
  assert.equal(tourFacts(collection).previews, '0');
  assert.equal(tourFacts(paired).previews, '2,875');
  assert.ok(availableTour(resolved, collection).steps.every(step => step.scene !== 'audit'));
});
