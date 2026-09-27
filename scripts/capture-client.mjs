/** Browser-host adapter. No UI clicks or CSS-selector guessing are required. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export async function createCaptureClient({
  url = 'http://127.0.0.1:8773/',
  width = 1440,
  height = 900,
  scale = 1,
  channel = 'chrome',
  headless = true,
} = {}) {
  for (const [name, value, min, max] of [
    ['width', width, 320, 7680],
    ['height', height, 200, 4320],
    ['scale', scale, 1, 4],
  ])
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  const browser = await chromium.launch({ channel, headless });
  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.semanticInstruments);
    await page.evaluate(() => window.semanticInstruments.ready());
    const call = (method, ...args) =>
      page.evaluate(
        ({ method, args }) => {
          const api = window.semanticInstruments;
          if (method.startsWith('audit.')) return api.audit[method.slice(6)](...args);
          return api[method](...args);
        },
        { method, args },
      );
    async function capture(path, { component = 'workspace', background = 'white' } = {}) {
      await call('prepareCapture', { component, background });
      // prepareCapture lays out the original component at the viewport's native size.
      const receipt = await call('receipt');
      const png = await page.screenshot({
        type: 'png',
        omitBackground: background === 'transparent',
        animations: 'disabled',
      });
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, png);
      await writeFile(
        path.replace(/\.png$/i, '') + '.json',
        JSON.stringify(
          {
            ...receipt,
            image: {
              file: path,
              sha256: createHash('sha256').update(png).digest('hex'),
              pixelWidth: width * scale,
              pixelHeight: height * scale,
            },
          },
          null,
          2,
        ) + '\n',
      );
      return { path, receipt, png };
    }
    return {
      page,
      call,
      capture,
      render: async (scene, path, options) => {
        await call('setScene', scene);
        return capture(path, options);
      },
      close: () => browser.close(),
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
