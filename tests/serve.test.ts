import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function builtSite() {
  const dir = mkdtempSync(join(tmpdir(), 'si-serve-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Lab</title>');
  return dir;
}

function serve(script: string, args: string[], env: Record<string, string> = {}) {
  const child = spawn('python3', [script, ...args], { env: { ...process.env, ...env } });
  let stdout = '',
    stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));
  const address = new Promise<string>((resolve, reject) => {
    child.stdout.on('data', (d) => {
      stdout += d;
      const url = stdout.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (url) resolve(url[0]);
    });
    exited.then((code) => reject(new Error(`${script} exited with ${code}: ${stdout}${stderr}`)));
  });
  address.catch(() => {});
  return { child, address, exited, output: () => stdout + stderr };
}

async function until(done: () => boolean, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!done() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  return done();
}

test('when the port is taken, the lab is served on the next free one', async () => {
  const occupant = createServer();
  await new Promise<void>((r) => occupant.listen(0, '127.0.0.1', r));
  const taken = (occupant.address() as AddressInfo).port;
  const lab = serve('serve.py', ['--directory', builtSite(), '--port', String(taken)]);
  try {
    const url = await lab.address;
    assert.notEqual(url, `http://127.0.0.1:${taken}/`);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.match(await response.text(), /<title>Lab<\/title>/);
  } finally {
    lab.child.kill();
    occupant.close();
  }
});

test('--open shows the served address in the default browser', async () => {
  const dir = builtSite(),
    opened = join(dir, 'opened'),
    browser = join(dir, 'browser.sh');
  writeFileSync(browser, `#!/bin/sh\nprintf '%s' "$1" > '${opened}'\n`);
  chmodSync(browser, 0o755);
  const lab = serve('serve.py', ['--directory', dir, '--port', '0', '--open'], {
    BROWSER: browser,
  });
  try {
    const url = await lab.address;
    assert.ok(await until(() => existsSync(opened)), 'the browser was asked to open the lab');
    assert.equal(readFileSync(opened, 'utf8'), url);
  } finally {
    lab.child.kill();
  }
});

test('Control-C stops the server without an error, even as it starts', async () => {
  // The signal lands as soon as the address is printed, while startup may still be running;
  // several servers at once make that moment likely to be hit.
  const site = builtSite();
  const labs = Array.from({ length: 20 }, () =>
    serve('serve.py', ['--directory', site, '--port', '0']),
  );
  await Promise.all(labs.map((lab) => lab.address.then(() => lab.child.kill('SIGINT'))));
  for (const lab of labs) {
    assert.equal(await lab.exited, 0, lab.output());
    assert.doesNotMatch(lab.output(), /Traceback/);
  }
});

test('a folder without a built site is refused with instructions', async () => {
  const lab = serve('serve.py', ['--directory', mkdtempSync(join(tmpdir(), 'si-empty-'))]);
  assert.notEqual(await lab.exited, 0);
  assert.match(lab.output(), /npm run build:site/);
});

test('the source-checkout server uses the same implementation', async () => {
  const lab = serve('scripts/serve.py', ['--directory', builtSite(), '--port', '0']);
  try {
    const response = await fetch(await lab.address);
    assert.equal(response.headers.get('cross-origin-embedder-policy'), 'credentialless');
    assert.match(lab.output(), /Control-C/);
  } finally {
    lab.child.kill();
  }
});
