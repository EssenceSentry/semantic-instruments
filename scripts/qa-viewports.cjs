async (page) => {
  const results = [];
  for (const [width, height] of [
    [1440, 1000],
    [1280, 720],
    [559, 863],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [id, name] of [
      ['space', 'Space Explorer 01'],
      ['transform', 'Transformation Workbench 02'],
      ['compose', 'Evidence Composer 03'],
      ['rank', 'Ranking Comparator 04'],
      ['uncertainty', 'Uncertainty Explorer 05'],
    ]) {
      await page.getByRole('button', { name: new RegExp('^'+name.replace(/ 0[1-5]$/, '')) }).click();
      const result = await page.evaluate(() => ({
        rootOverflow: [
          document.documentElement.scrollWidth - innerWidth,
          document.documentElement.scrollHeight - innerHeight,
        ],
        heading: document.querySelector('h1')?.getBoundingClientRect().bottom,
        main: [
          document.querySelector('main').clientWidth,
          document.querySelector('main').clientHeight,
        ],
        mathErrors: document.querySelectorAll('.katex-error').length,
      }));
      results.push({ width, height, tool: id, ...result });
      if (width === 390 || width === 1280)
        await page.screenshot({ path: `output/playwright/${id}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  return results;
}
