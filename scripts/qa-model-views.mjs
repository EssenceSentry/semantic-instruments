import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createCaptureClient } from './capture-client.mjs';
const output = 'output/playwright/model-views';
await mkdir(output, { recursive: true });
const client = await createCaptureClient({ url: process.env.LAB_URL ?? 'http://127.0.0.1:8775/' });
const { page, call } = client,
  errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (message) => {
  if (message.type() === 'error' && /NaN|attribute.*Expected length/.test(message.text()))
    errors.push(message.text());
});
const check = (name) => {
  checks.push(name);
  console.log('PASS ' + name);
};
const scene = (name, controls = {}) =>
  call('setScene', {
    schemaVersion: 1,
    scene: name,
    controls,
    dataset: 'weapons-collection',
    seed: 42,
  });
const shot = async (name) => {
  await call('ready', { allowMissingMedia: true });
  await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
};
try {
  const manifest = JSON.parse(await readFile('public/data/collection/manifest.json', 'utf8'));
  await scene('features');
  assert.equal((await call('getState')).scene, 'features');
  assert.equal(await page.locator('.fa-cell.on').count(), 1);
  assert.equal(
    await page.locator('.fa-cell[aria-pressed]').count(),
    manifest.featureDefinitions[manifest.queries[0].id].length,
  );
  await shot('atlas-light');
  const snap = await call('snapshot');
  await page.locator('.fa-cell[aria-pressed]').nth(24).click();
  assert.notEqual((await call('getState')).controls['features.coordinate'], 0);
  await call('setScene', snap);
  assert.deepEqual((await call('getState')).controls, snap.controls);
  check('Feature cell selection and scene snapshot round trip');
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('theme-switching'));
  assert.equal(
    await page.evaluate(() => localStorage.getItem('semantic-instruments-theme')),
    'dark',
  );
  await shot('atlas-dark');
  await client.capture(`${output}/atlas-dark-capture.png`, {
    component: 'features.atlas',
    background: 'theme',
  });
  await call('releaseCapture');
  await client.capture(`${output}/atlas-white-capture.png`, {
    component: 'features.atlas',
    background: 'white',
  });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await call('releaseCapture');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.reload();
  await page.waitForFunction(() => !!window.semanticInstruments);
  await call('ready');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  check('Dark preference persists; white and themed component captures restore the preference');
  await scene('network.flow');
  await shot('network-dark');
  assert.ok((await call('inspect', 'network.flow')).text.includes('mean'));
  const selectedId = (await call('getState')).selectedIds[0];
  const dense = page.locator('[data-capture="network.flow"] [role="button"][aria-label*="neuron"]');
  if (await dense.count()) {
    await dense.first().click();
    assert.equal((await call('getState')).controls['network.view'], 'flow');
    assert.ok((await page.locator('.nf-readout').innerText()).includes('bias'));
    assert.deepEqual((await call('getState')).selectedIds, [selectedId]);
  }
  await scene('network.flow');
  const members = manifest.model.nodes.find((n) => n.id === manifest.model.output).inputs;
  await call('update', { controls: { 'network.branch': members.at(-1) } });
  assert.equal((await call('getState')).controls['network.branch'], members.at(-1));
  assert.ok((await call('getState')).controls['network.node'].startsWith('image.2.'));
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('theme-switching'));
  await shot('network-light');
  check('Network branches are controllable through the scene API');
  const q = manifest.queries[0].items[0],
    defs = manifest.featureDefinitions[manifest.queries[0].id];
  const column = defs.findIndex(
    (d) => d.kind === 'lse' && d.family === q.family && d.polarity === q.polarity,
  );
  await scene('features', { 'features.mode': 'delta', 'features.coordinate': column });
  await call('update', {
    intervention: {
      disabled: [q.id],
      zeroFamilies: [],
      temperature: null,
      countNeutral: true,
      bankId: manifest.queries[0].id,
    },
  });
  const detail = (await call('inspect', 'features.inspector')).text;
  assert.ok(detail.includes('Count-neutral'));
  assert.ok(!detail.includes('does not match'));
  await shot('atlas-intervention');
  const changed = await call('snapshot');
  await scene('features');
  await call('setScene', changed);
  assert.equal((await call('inspect', 'features.inspector')).text, detail);
  check('Dataset-wide count-neutral intervention agrees with the atlas arithmetic and replays');
  await scene('queries.pooling');
  const originalPrediction = await page.locator('.prediction-delta').innerText();
  await call('update', { controls: { 'queries.temperature': 0.14 } });
  assert.equal(await page.locator('.prediction-delta').innerText(), originalPrediction);
  await call('update', { controls: { 'queries.temperatureOverride': true } });
  assert.notEqual(await page.locator('.prediction-delta').innerText(), originalPrediction);
  check('Temperature slider preserves saved model features until override is explicit');
  await call('setScene', {
    schemaVersion: 1,
    dataset: 'weapons-paired',
    scene: 'audit',
    controls: { 'audit.scope': 'holdout' },
  });
  assert.equal((await call('getState')).controls['audit.scope'], 'holdout');
  const audit = await call('audit.state');
  const pairedManifest = JSON.parse(await readFile('public/data/paired/manifest.json', 'utf8'));
  const imageResults = await page.evaluate(
    async (urls) => {
      const results = [];
      let next = 0;
      await Promise.all(
        Array.from({ length: 6 }, async () => {
          while (next < urls.length) {
            const url = urls[next++];
            results.push(
              await new Promise((resolve) => {
                const img = new Image();
                img.referrerPolicy = 'no-referrer';
                const timeout = setTimeout(() => resolve({ url, loaded: false }), 15000);
                img.onload = () => {
                  clearTimeout(timeout);
                  resolve({ url, loaded: img.naturalWidth > 120 });
                };
                img.onerror = () => {
                  clearTimeout(timeout);
                  resolve({ url, loaded: false });
                };
                img.src = url;
              }),
            );
          }
        }),
      );
      return results;
    },
    pairedManifest.items.filter((i) => i.media).map((i) => i.media),
  );
  assert.deepEqual(
    imageResults.filter((i) => !i.loaded),
    [],
  );
  check(
    `All ${imageResults.length} preview URLs load directly from YouTube without local fallbacks`,
  );
  const held = new Set(pairedManifest.items.filter((i) => i.split === 'holdout').map((i) => i.id));
  assert.ok(audit.pendingIds.every((id) => held.has(id)));
  await call('audit.submit', { positives: 2 });
  const auditSnap = await call('snapshot');
  await scene('features');
  await call('setScene', auditSnap);
  assert.deepEqual((await call('audit.state')).batches, auditSnap.auditBatches);
  await call('update', { controls: { 'audit.scope': 'all' }, auditBatches: [] });
  check('Held-out mini-audit population and saved batch replay stay aligned');
  await call('setScene', {
    schemaVersion: 1,
    dataset: 'weapons-paired',
    scene: 'features',
    controls: { 'features.bank': 'text' },
  });
  await shot('paired-text-atlas');
  await call('setScene', { schemaVersion: 1, dataset: 'weapons-paired', scene: 'network.flow' });
  await shot('paired-network');
  check('The same atlas and network support paired image/text data');
  const toy = await readFile('examples/engineered-features.json', 'utf8');
  await page.route('**/qa-engineered-features.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: toy }),
  );
  await call('setScene', {
    schemaVersion: 1,
    dataset: '/qa-engineered-features.json',
    scene: 'features',
  });
  assert.ok((await call('inspect', 'features.inspector')).text.includes('No operator metadata'));
  await shot('generic-features');
  await call('setScene', { schemaVersion: 1, scene: 'network.flow' });
  await shot('generic-network');
  check('Unlabeled non-weapon toy features and a nonensemble graph use the same views');
  for (const [width, height] of [
    [1280, 800],
    [900, 720],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await scene('features');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot(`atlas-${width}`);
    await scene('network.flow');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot(`network-${width}`);
  }
  check('Desktop, tablet and phone viewports contain page width without overflow');
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ checks, errors }, null, 2));
} finally {
  await client.close();
}
