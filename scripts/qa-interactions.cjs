async (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const results = {};
  const nav = async (name) => page.getByRole('button', { name: new RegExp(name + ' 0') }).click();
  const ready = async () =>
    page.waitForFunction(
      () => window.__lab && window.__lab.dataset && !window.__lab.busy,
      {},
      { timeout: 60000 },
    );
  await page.reload();
  await ready();
  results.collection = await page.evaluate(() => ({
    records: __lab.dataset.manifest.items.length,
    backend: __lab.runtime.backend,
    threads: __lab.runtime.threads,
    maxError: __lab.runtime.error,
  }));
  await nav('Space Explorer');
  await page.locator('.item-card > button').first().click();
  await page.getByLabel('Pin selected example').click();
  await page.getByRole('button', { name: /05 Image code/ }).click();
  await page.getByLabel('Compare representations').click();
  await page.screenshot({ path: 'output/playwright/space-linked.png' });
  results.selection = await page.evaluate(() => ({
    selected: __lab.selected.length,
    selectedId: __lab.dataset.manifest.items[__lab.selected[0]].id,
    canvases: document.querySelectorAll('canvas').length,
  }));
  await nav('Transformation Workbench');
  results.predictionBefore = await page.locator('.prediction-delta').innerText();
  await page.locator('.query-entry.negative').first().click();
  results.predictionAfter = await page.locator('.prediction-delta').innerText();
  await page.getByRole('button', { name: 'Apply across the dataset', exact: true }).click();
  await ready();
  results.intervention = await page.evaluate(() => ({
    disabled: __lab.intervention.disabled.length,
    status: __lab.status,
  }));
  await page.getByRole('button', { name: 'Restore baseline' }).click();
  await ready();
  await page.getByRole('button', { name: 'Neural arithmetic', exact: true }).click();
  await page.getByLabel('Inspect neuron 5', { exact: true }).click();
  results.neuron = await page.locator('.neuron-result').innerText();
  await page.screenshot({ path: 'output/playwright/neural-white.png' });
  await nav('Evidence Composer');
  await page.getByLabel('Aggregation rule').selectOption('mean');
  results.meanBefore = await page.locator('.collection-summary').first().innerText();
  await page.getByLabel('Added observations', { exact: true }).fill('100');
  results.meanAfter = await page.locator('.collection-summary').first().innerText();
  await page.getByLabel('Aggregation rule').selectOption('supported');
  await page.waitForFunction(
    () => !document.querySelector('.collection-summary strong').textContent.includes('—'),
    {},
    { timeout: 60000 },
  );
  results.supported = await page.locator('.collection-summary').allTextContents();
  await nav('Ranking Comparator');
  await page.getByLabel('Rank fusion rule').selectOption('rrf');
  await page.getByRole('button', { name: 'Precision & recall', exact: true }).click();
  results.ranking = await page.locator('.curve-legend').innerText();
  await page.screenshot({ path: 'output/playwright/ranking-curves.png' });
  await nav('Uncertainty Explorer');
  await page.getByRole('button', { name: 'Reference-label experiment', exact: true }).click();
  await page.getByRole('button', { name: 'Draw 50', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal the reference answer' }).click();
  results.audit = await page.locator('.uncertainty-summary').innerText();
  await page.getByRole('button', { name: 'Repeat 300 experiments', exact: true }).click();
  await page.getByRole('button', { name: 'Repeat 300 experiments', exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/uncertainty-sampled.png' });
  results.mathErrors = await page.locator('.katex-error').count();
  results.errors = errors;
  return results;
}
