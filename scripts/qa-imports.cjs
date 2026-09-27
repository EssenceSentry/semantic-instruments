async (page) => {
  await page.goto('http://127.0.0.1:8773/');
  await page.waitForFunction(()=>window.__lab && __lab.dataset && !__lab.busy,{}, {timeout:60000});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const out = {};
  const ready = async () =>
    page.waitForFunction(
      () => window.__lab && window.__lab.dataset && __lab.dataset.manifest.items.length===240 && !window.__lab.busy,
      {},
      { timeout: 60000 },
    );
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/vectors-and-labels.json');
  await ready();
  out.minimal = await page.evaluate(() => ({
    id: __lab.dataset.manifest.id,
    rows: __lab.dataset.manifest.items.length,
    backend: __lab.runtime.backend,
  }));
  await page.getByRole('button', { name: 'Transformation Workbench 02', exact: true }).click();
  out.algebra = await page.locator('.vector-plane').count();
  await page.getByRole('button', { name: 'Load your dataset', exact: true }).click();
  await page.getByRole('button', { name: 'Fit an explainable linear probe', exact: true }).click();
  await ready();
  out.probe = await page.evaluate(() => {
    const p = __lab.dataset.manifest.provenance.browserProbe;
    return {
      id: __lab.dataset.manifest.id,
      trainingRecords: p.trainingRecords,
      holdoutRecords: p.holdoutRecords,
      initialLoss: p.losses[0],
      finalLoss: p.losses.at(-1),
      maxReplayError: __lab.runtime.error,
    };
  });
  await page.getByRole('button', { name: 'Load your dataset', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export this dataset package' }).click();
  const file = await downloaded;
  await file.saveAs('output/playwright/browser-probe.silab');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('output/playwright/browser-probe.silab');
  await ready();
  out.roundtrip = await page.evaluate(() => ({
    id: __lab.dataset.manifest.id,
    rows: __lab.dataset.manifest.items.length,
    maxReplayError: __lab.runtime.error,
  }));
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/portable-example.parquet');
  await ready();
  out.parquet = await page.evaluate(() => ({
    rows: __lab.dataset.manifest.items.length,
    dimensions: __lab.dataset.manifest.representations[0].dimensions,
    finite: __lab.dataset.positions.values().next().value.data.every(Number.isFinite),
  }));
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/unlabeled.json');
  await ready();
  out.unlabeled = [];
  for (const name of [
    'Space Explorer 01',
    'Transformation Workbench 02',
    'Evidence Composer 03',
    'Ranking Comparator 04',
    'Uncertainty Explorer 05',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    out.unlabeled.push({
      name,
      empty: await page.locator('.empty-state').count(),
      mathErrors: await page.locator('.katex-error').count(),
    });
  }
  out.errors = errors;
  out.alert = await page.locator('[role=alert]').allTextContents();
  return out;
}
