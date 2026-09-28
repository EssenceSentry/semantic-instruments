import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTour, resolveTour, type TourStep } from '../src/core/tour';
import {
  autoplayPlan,
  checkTourScenes,
  tourActionScene,
  tourStepScene,
  tourUrlFromSearch,
} from '../src/core/tour-scenes';
import type { Manifest } from '../src/core/types';
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const paired = json('public/data/paired/manifest.json') as Manifest;
const dynamics = json('public/data/dynamics/manifest.json') as Manifest;
const hero = '8yLz3tcFgh0',
  textCase = 'oV5pUSwqx9k';

function staged(): any {
  return {
    schemaVersion: 1,
    id: 'staged-showcase',
    version: 1,
    title: 'A staged showcase',
    description: 'Every step opens exactly the scene it describes.',
    datasetIds: ['weapons-paired'],
    chapters: [{ id: 'story', title: 'Story', description: 'One example, several views.' }],
    steps: [
      {
        id: 'geometry',
        chapter: 'story',
        scene: 'space.compare',
        target: 'cloud',
        title: 'The same records in two geometries',
        body: ['Follow the pinned examples from image embeddings into the fusion representation.'],
        state: {
          representation: 'embedding.image',
          selectedIds: [hero],
          pinnedIds: [hero, textCase],
          controls: { 'space.color': 'label', 'space.other': 'fusion.0.head0' },
          seed: 42,
        },
        actions: [
          { label: 'Text-supported case', state: { selectedIds: [textCase] } },
          { label: 'Back to the opening view', restore: true },
        ],
        autoplay: {
          dwell: 12,
          actions: [
            { at: 4, action: 0 },
            { at: 8, action: 1 },
          ],
        },
      },
      {
        id: 'ranking',
        chapter: 'story',
        scene: 'rank.sets',
        target: 'sets',
        title: 'Where the text-supported case ranks',
        body: ['Compare the selections made by the image model and the joint model.'],
        state: { selectedIds: [textCase], controls: { 'rank.k': 100 } },
        actions: [
          {
            label: 'Inspect the ranking lanes',
            scene: 'rank',
            state: { controls: { 'rank.view': 'lanes' } },
            target: 'lanes',
          },
        ],
      },
      {
        id: 'free',
        chapter: 'story',
        scene: 'audit',
        title: 'Now explore on your own',
        body: ['This step only opens a view, as before.'],
      },
    ],
  };
}

test('tours can set a full scene, offer actions and schedule playback', () => {
  const tour = resolveTour(parseTour(staged()));
  const geometry = tour.steps[0];
  assert.deepEqual(geometry.state?.selectedIds, [hero]);
  assert.equal(geometry.actions?.length, 2);
  assert.equal(geometry.autoplay?.dwell, 12);
  // A downloaded tour loads back unchanged.
  const roundtrip = resolveTour(parseTour(JSON.parse(JSON.stringify(tour))));
  assert.deepEqual(roundtrip.steps, tour.steps);
});

test('a staged step opens exactly the scene it declares', () => {
  const [geometry, , free] = resolveTour(parseTour(staged())).steps;
  assert.deepEqual(tourStepScene(geometry), {
    schemaVersion: 1,
    scene: 'space.compare',
    representation: 'embedding.image',
    selectedIds: [hero],
    pinnedIds: [hero, textCase],
    controls: { 'space.color': 'label', 'space.other': 'fusion.0.head0' },
    seed: 42,
  });
  assert.equal(tourStepScene(free), null);
});

test('actions patch the scene on screen and restore returns to the step scene', () => {
  const [geometry, ranking] = resolveTour(parseTour(staged())).steps;
  const opening = tourStepScene(geometry)!;
  const textView = tourActionScene(geometry, 0, opening);
  assert.deepEqual(textView.selectedIds, [textCase]);
  assert.equal(textView.representation, 'embedding.image');
  assert.deepEqual(textView.controls, opening.controls);
  assert.deepEqual(tourActionScene(geometry, 1, textView), opening);
  const lanes = tourActionScene(ranking, 0, tourStepScene(ranking)!);
  assert.equal(lanes.scene, 'rank');
  assert.deepEqual(lanes.controls, { 'rank.k': 100, 'rank.view': 'lanes' });
  // Patching never mutates the scene it starts from.
  assert.deepEqual(opening.selectedIds, [hero]);
});

test('staged scenes are checked against the loaded dataset before the tour starts', () => {
  assert.deepEqual(checkTourScenes(resolveTour(parseTour(staged())), paired), []);
  const badControl = staged();
  badControl.steps[0].state.controls['space.nonexistent'] = true;
  const controlErrors = checkTourScenes(resolveTour(parseTour(badControl)), paired);
  assert.equal(controlErrors.length, 1);
  assert.match(controlErrors[0], /geometry/);
  assert.match(controlErrors[0], /Unknown control: space\.nonexistent/);
  const badAction = staged();
  badAction.steps[1].actions[0].state.selectedIds = ['not-a-video'];
  const actionErrors = checkTourScenes(resolveTour(parseTour(badAction)), paired);
  assert.equal(actionErrors.length, 1);
  assert.match(actionErrors[0], /ranking/);
  assert.match(actionErrors[0], /Inspect the ranking lanes/);
  assert.match(actionErrors[0], /Unknown item ID: not-a-video/);
  // The same identities do not exist in another dataset.
  assert.ok(checkTourScenes(resolveTour(parseTour(staged())), dynamics).length >= 2);
});

test('invalid staged content is rejected when the tour is loaded', () => {
  const cases: [string, (t: any) => void, RegExp][] = [
    ['dataset switch', (t) => (t.steps[0].state.dataset = 'weapons-collection'), /geometry.*state/],
    ['unknown state field', (t) => (t.steps[0].state.script = 'alert(1)'), /geometry.*state/],
    ['non-string item', (t) => (t.steps[0].state.selectedIds = [42]), /geometry.*state/],
    ['empty action', (t) => (t.steps[0].actions[0] = { label: 'Nothing' }), /geometry.*action/],
    [
      'restore with a patch',
      (t) => (t.steps[0].actions[1].state = { selectedIds: [hero] }),
      /geometry.*action/,
    ],
    [
      'unknown action target',
      (t) => (t.steps[1].actions[0].target = '__proto__'),
      /ranking.*action/,
    ],
    [
      'unknown action scene',
      (t) => (t.steps[1].actions[0].scene = 'javascript:x'),
      /ranking.*action/,
    ],
    [
      'too many actions',
      (t) => (t.steps[0].actions = Array(9).fill({ label: 'Again', restore: true })),
      /geometry.*action/,
    ],
    ['missing action', (t) => (t.steps[0].autoplay.actions[0].action = 5), /geometry.*autoplay/],
    ['zero dwell', (t) => (t.steps[0].autoplay.dwell = 0), /geometry.*autoplay/],
    ['action after dwell', (t) => (t.steps[0].autoplay.actions[1].at = 20), /geometry.*autoplay/],
    ['staged tour without datasetIds', (t) => delete t.datasetIds, /datasetIds/],
  ];
  for (const [name, edit, message] of cases) {
    const tour = staged();
    edit(tour);
    assert.throws(() => parseTour(tour), message, name);
  }
});

test('playback follows the authored schedule or a reading-time default', () => {
  const [geometry, ranking] = resolveTour(parseTour(staged())).steps;
  assert.deepEqual(autoplayPlan(geometry), {
    dwell: 12,
    actions: [
      { at: 4, action: 0 },
      { at: 8, action: 1 },
    ],
  });
  assert.deepEqual(autoplayPlan(geometry, 1.5), {
    dwell: 18,
    actions: [
      { at: 6, action: 0 },
      { at: 12, action: 1 },
    ],
  });
  const reading = autoplayPlan(ranking);
  assert.deepEqual(reading.actions, []);
  assert.ok(reading.dwell >= 8 && reading.dwell <= 30);
  const long = {
    ...ranking,
    body: [Array(200).fill('word').join(' ')],
  } as TourStep;
  assert.equal(autoplayPlan(long).dwell, 30);
});

test('a tour link only loads JSON from the lab itself', () => {
  const lab = 'https://lab.example/semantic-instruments/';
  assert.equal(
    tourUrlFromSearch('?tour=showcase/tour.json&autoplay=1', lab),
    'https://lab.example/semantic-instruments/showcase/tour.json',
  );
  assert.equal(tourUrlFromSearch('?instrument=space', lab), null);
  for (const hostile of [
    'https://elsewhere.example/tour.json',
    '//elsewhere.example/tour.json',
    'javascript:alert(1)',
    'data:application/json,{}',
  ])
    assert.throws(
      () => tourUrlFromSearch('?tour=' + encodeURIComponent(hostile), lab),
      /same site/,
    );
});
