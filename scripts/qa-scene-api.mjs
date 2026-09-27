import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCaptureClient } from './capture-client.mjs';
const url = process.env.LAB_URL ?? 'http://127.0.0.1:8775/';
const output = 'output/playwright/scene-api';
await mkdir(output, { recursive: true });
const client = await createCaptureClient({ url, width: 1440, height: 900 });
const { page, call } = client,
  errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(error.message));
const check = (name, data = {}) => {
  checks.push({ name, ...data });
  console.log('PASS ' + name);
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  const description = await call('describe');
  assert.equal(description.dataset.id, 'weapons-paired');
  check('API discovery exposes all tools, controls and component names', {
    components: description.components.length,
    controls: Object.keys(description.controls).length,
  });
  const ids = (await call('items', { mediaOnly: true, limit: 3 })).items.map((i) => i.id);
  const base = {
    schemaVersion: 1,
    dataset: 'weapons-paired',
    selectedIds: [ids[0]],
    pinnedIds: [ids[1]],
    seed: 42,
  };
  for (const scene of description.scenes.filter((s) => s.available)) {
    await call('setScene', { ...base, scene: scene.id });
    const state = await call('getState');
    assert.equal(state.selectedIds[0], ids[0]);
    assert.ok(
      (await call('describe')).components.some((c) => c.visible && c.id !== 'workspace'),
      scene.id,
    );
  }
  check('Every available weapons scene settles without UI clicks', {
    scenes: description.scenes.filter((s) => s.available).length,
  });
  await call('setScene', {
    ...base,
    scene: 'queries.pooling',
    controls: { 'queries.temperature': 0.1 },
  });
  const firstText = (await call('inspect', 'queries.output')).text;
  await call('update', { controls: { 'queries.temperature': 0.7 } });
  assert.notEqual((await call('inspect', 'queries.output')).text, firstText);
  const saved = await call('snapshot');
  await call('setScene', { ...base, scene: 'network' });
  await call('setScene', saved);
  assert.deepEqual((await call('getState')).controls, saved.controls);
  check('Controls update real arithmetic; JSON snapshot restores the scene');
  const before = await call('getState');
  await assert.rejects(call('update', { controls: { 'queries.temperature': -2 } }));
  assert.deepEqual(await call('getState'), before);
  await Promise.all([
    call('update', { controls: { 'queries.temperature': 0.2 } }),
    call('update', { controls: { 'queries.temperature': 0.3 } }),
  ]);
  assert.equal((await call('getState')).controls['queries.temperature'], 0.3);
  check('Invalid commands preserve the scene and concurrent commands execute in order');
  const targets = [
    ['space.pca', 'space.scatter'],
    ['queries.pooling', 'queries.operation'],
    ['network', 'network.calculation'],
    ['compose.mean', 'compose.collections'],
    ['rank.rrf', 'rank.lanes'],
    ['audit', 'audit.curve'],
  ];
  for (const [scene, component] of targets) {
    const result = await client.render({ ...base, scene }, `${output}/${component}.png`, {
      component,
    });
    const mounted = result.receipt.components.find((c) => c.id === component);
    assert.deepEqual(mounted.bounds, { x: 0, y: 0, width: 1440, height: 900 });
    assert.ok(result.png.length > 10000, component);
  }
  check('Independent native-size captures cover all five instruments');
  await call('setScene', { ...base, scene: 'space.pca', controls: { 'space.rotate': true } });
  await call('seek', 2);
  const one = await client.capture(`${output}/seek-2-a.png`, { component: 'space.scatter' });
  await call('seek', 0.25);
  const other = await client.capture(`${output}/seek-quarter.png`, { component: 'space.scatter' });
  await call('seek', 2);
  const two = await client.capture(`${output}/seek-2-b.png`, { component: 'space.scatter' });
  assert.equal(hash(one.png), hash(two.png));
  assert.notEqual(hash(one.png), hash(other.png));
  check('WebGL seek 2 → 0.25 → 2 produces identical repeated frames', { sha256: hash(one.png) });
  const timeline = {
    scene: { ...base, scene: 'queries.pooling' },
    duration: 2,
    tracks: [{ control: 'queries.temperature', from: 0.05, to: 0.6, easing: 'smoothstep' }],
  };
  await call('loadTimeline', timeline);
  await call('seek', 1.5);
  const ta = await client.capture(`${output}/pool-1.5-a.png`, { component: 'queries.operation' });
  await call('seek', 0.5);
  await call('seek', 1.5);
  const tb = await client.capture(`${output}/pool-1.5-b.png`, { component: 'queries.operation' });
  assert.equal(hash(ta.png), hash(tb.png));
  check('Parameter timeline seeks reproduce identical frames', { sha256: hash(ta.png) });
  await call('releaseCapture');
  const stored = await page.evaluate(() =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(localStorage).filter(([k]) => k.startsWith('semantic-instruments:audit:')),
      ),
    ),
  );
  await call('setScene', { ...base, scene: 'audit' });
  const audit = await call('audit.state');
  assert.equal(audit.pendingIds.length, 9);
  assert.equal(audit.imagesReady, true);
  await assert.rejects(call('audit.submit', { positives: 10 }));
  await call('audit.submit', { positives: 4 });
  const after = await call('audit.state');
  assert.equal(after.batches.length, 1);
  assert.equal(after.batches[0].positives, 4);
  assert.equal(after.batches[0].selectedIds, undefined);
  assert.ok(after.pendingIds.every((id) => !audit.pendingIds.includes(id)));
  assert.ok(after.posterior.endpoints.length);
  const observation = await call('snapshot');
  await call('setScene', { ...base, scene: 'network' });
  await call('setScene', observation);
  assert.deepEqual((await call('audit.state')).posterior, after.posterior);
  await call('audit.undo');
  assert.equal((await call('audit.state')).batches.length, 0);
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(localStorage).filter(([k]) => k.startsWith('semantic-instruments:audit:')),
        ),
      ),
    ),
    stored,
  );
  check('Scripted mini-audit updates posterior, replays, undoes and preserves stored audits');
  await call('prepareCapture', { component: 'audit.grid' });
  await page.evaluate(() => {
    const p = document.createElement('span');
    p.className = 'media-state failed';
    p.id = 'qa-failed-media';
    p.textContent = 'Deliberate failed-media readiness probe';
    document.querySelector('[data-capture="audit.grid"]').append(p);
  });
  await assert.rejects(call('ready', { component: 'audit.grid', timeoutMs: 2000 }), /failed-media/);
  await page.evaluate(() => document.getElementById('qa-failed-media').remove());
  await call('ready', { component: 'audit.grid' });
  check('Capture readiness rejects failed media explicitly');
  await call('releaseCapture');
  await call('setScene', {
    schemaVersion: 1,
    dataset: 'damped-oscillators',
    scene: 'numeric',
    seed: 17,
    controls: { 'numeric.repeating': true, 'numeric.reveal': true, 'numeric.size': 40 },
  });
  const generic = await call('describe');
  assert.equal(generic.dataset.id, 'damped-oscillators');
  assert.equal(generic.scenes.find((s) => s.id === 'network').available, false);
  await client.capture(`${output}/generic-numeric.png`, { component: 'numeric.distribution' });
  await call('releaseCapture');
  const genericSnapshot = await call('snapshot');
  await call('setScene', { ...base, scene: 'space.pca' });
  await call('setScene', genericSnapshot);
  assert.equal((await call('getState')).seed, 17);
  check('Generic non-classifier dataset, repeated sampling and cross-dataset restore');
  await call('release');
  assert.equal(
    await page.evaluate(() => document.documentElement.classList.contains('scene-capture')),
    false,
  );
  assert.equal(
    await page.getByRole('navigation', { name: 'Visual instruments' }).isVisible(),
    true,
  );
  await page.getByRole('button', { name: /Transformation Workbench/ }).click();
  await call('ready');
  assert.equal((await call('getState')).scene, 'vector');
  await page.screenshot({ path: `${output}/normal-ui.png` });
  assert.deepEqual(errors, []);
  check('Normal UI navigation still works after releasing capture mode');
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify({ url, checks, errors }, null, 2) + '\n',
  );
  console.log(`${checks.length} checks passed. Evidence: ${output}`);
} finally {
  await client.close();
}
