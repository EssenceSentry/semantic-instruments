import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { appUrl } from '../src/core/app-url';

const PAGES = 'https://essencesentry.github.io/semantic-instruments/';
const PROJECT = '/semantic-instruments/';

function publicFile(url: string, base: string) {
  const { pathname } = new URL(url);
  assert.ok(pathname.startsWith(base), url + ' escapes ' + base);
  const file = 'public/' + pathname.slice(base.length);
  assert.ok(existsSync(file), file);
  return file;
}

test('application files resolve under a project path and at the origin root', () => {
  assert.equal(appUrl('/data/catalog.json', PROJECT, PAGES), PAGES + 'data/catalog.json');
  assert.equal(appUrl('data/catalog.json', PROJECT, PAGES), PAGES + 'data/catalog.json');
  assert.equal(
    appUrl('/data/catalog.json', '/', 'http://127.0.0.1:8773/?instrument=space#rank'),
    'http://127.0.0.1:8773/data/catalog.json',
  );
});

test('a relative build base follows the page, including query-string routes', () => {
  assert.equal(
    appUrl('tours/default.json', './', PAGES + 'index.html?instrument=space#compose'),
    PAGES + 'tours/default.json',
  );
});

test('worker runtimes locate WebAssembly from the application base, not the worker script', () => {
  const worker = PAGES + 'assets/engine.worker-abc123.js';
  assert.equal(appUrl('wasm/', PROJECT, worker), PAGES + 'wasm/');
  assert.equal(appUrl('ort/', PROJECT, worker), PAGES + 'ort/');
});

test('external dataset and media URLs are not rebased', () => {
  for (const url of [
    'https://example.org/datasets/manifest.json',
    'http://localhost:9000/manifest.json',
    '//cdn.example.org/manifest.json',
    'blob:https://essencesentry.github.io/1234',
    'data:application/json,{}',
  ])
    assert.equal(appUrl(url, PROJECT, PAGES), url);
});

test('built-in catalog and related-dataset links reach bundled files at the project base', () => {
  const catalog = JSON.parse(readFileSync('public/data/catalog.json', 'utf8')) as { url: string }[];
  assert.ok(catalog.length);
  for (const entry of catalog) {
    const file = publicFile(appUrl(entry.url, PROJECT, PAGES), PROJECT);
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const related = manifest.presets?.relatedDataset?.url;
    if (related) publicFile(appUrl(related, PROJECT, PAGES), PROJECT);
  }
  for (const file of [
    'tours/default.json',
    'tours/weapons.json',
    'wasm/tfjs-backend-wasm.wasm',
    'ort/ort-wasm-simd-threaded.jsep.mjs',
  ])
    publicFile(appUrl(file, PROJECT, PAGES), PROJECT);
});
