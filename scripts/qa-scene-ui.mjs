import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createCaptureClient } from './capture-client.mjs';
const client = await createCaptureClient({ url: process.env.LAB_URL ?? 'http://127.0.0.1:8775/' });
const { page, call } = client,
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await call('setScene', { schemaVersion: 1, dataset: 'weapons-paired', scene: 'network' });
  const description = await call('describe');
  assert.equal(description.dataset.rows, 2875);
  for (const scene of description.scenes.filter((s) => s.available))
    await call('setScene', { schemaVersion: 1, dataset: 'weapons-paired', scene: scene.id });
  console.log('PASS paired multimodal dataset scene navigation');
  await call('setScene', { schemaVersion: 1, dataset: 'weapons-paired', scene: 'audit' });
  await call('release');
  await page.getByRole('button', { name: 'Expand audit', exact: true }).click();
  await page.locator('dialog.audit-modal[open]').waitFor();
  await call('setScene', { schemaVersion: 1, scene: 'audit' });
  assert.equal(await page.locator('dialog.audit-modal[open]').count(), 0);
  console.log('PASS programmatic scene closes expanded audit');
  await call('release');
  await page.getByRole('button', { name: 'Guided tour', exact: true }).click();
  await page.getByRole('button', { name: /Turn matches into evidence/ }).click();
  await page.waitForFunction(() => window.__tour?.active && !window.__tour.preparing);
  const before = await page.locator('.driver-popover').getAttribute('data-tour-step');
  await page.getByRole('button', { name: 'Next tour step', exact: true }).click();
  await page.waitForFunction(
    (id) =>
      window.__tour?.active &&
      !window.__tour.preparing &&
      document.querySelector('.driver-popover')?.getAttribute('data-tour-step') !== id,
    before,
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.driver-popover').count(), 0);
  console.log('PASS guided tour navigation and pause after API release');
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const scene of [
      'space.pca',
      'queries',
      'network',
      'compose',
      'rank',
      'audit',
      'numeric',
    ]) {
      await call('setScene', { schemaVersion: 1, scene });
      await call('release');
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - innerWidth,
        y: document.documentElement.scrollHeight - innerHeight,
        math: document.querySelectorAll('.katex-error').length,
      }));
      assert.ok(overflow.x <= 1 && overflow.y <= 1, JSON.stringify({ scene, viewport, overflow }));
      assert.equal(overflow.math, 0);
    }
  }
  console.log('PASS normal UI on desktop and mobile without root overflow');
  assert.deepEqual(errors, []);
  await writeFile(
    'output/playwright/scene-api/ui-verification.json',
    JSON.stringify(
      {
        pairedScenes: description.scenes.filter((s) => s.available).length,
        viewports: [
          { width: 1280, height: 720 },
          { width: 390, height: 844 },
        ],
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
