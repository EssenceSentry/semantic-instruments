async (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForFunction(() => window.__lab && window.__lab.dataset && !window.__lab.busy);
  const results = [];
  for (const [id, name] of [
    ['space', 'Space Explorer'],
    ['transform', 'Transformation Workbench'],
    ['compose', 'Evidence Composer'],
    ['rank', 'Ranking Comparator'],
    ['uncertainty', 'Uncertainty Explorer'],
  ]) {
    await page.getByRole('button', { name: new RegExp(name + ' 0') }).click();
    await page.locator('h1').waitFor();
    await page.screenshot({ path: 'output/playwright/' + id + '-white.png' });
    results.push(
      await page.evaluate(
        (id) => ({
          id,
          rootOverflow: [
            document.documentElement.scrollWidth - innerWidth,
            document.documentElement.scrollHeight - innerHeight,
          ],
          mathErrors: document.querySelectorAll('.katex-error').length,
          alert: document.querySelector('[role=alert]')?.textContent ?? null,
        }),
        id,
      ),
    );
  }
  return { results, errors };
}
