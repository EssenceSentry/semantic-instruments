import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { auditSessionKey } from '../src/core/audit';

function files(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(folder, entry.name)) : [join(folder, entry.name)],
  );
}

test('public assets contain no image files or embedded image payloads', () => {
  for (const file of files('public')) {
    assert.ok(!/\.(?:png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?)$/i.test(file), file);
    if (/\.(?:json|html|css|js|md)$/i.test(file)) {
      assert.ok(
        !/data:image\/[^,]+;base64,[a-z0-9+/=]{80}/i.test(readFileSync(file, 'utf8')),
        file,
      );
    }
  }
});

test('every paired video links to its own thumbnail; generic image IDs are not guessed', () => {
  const inventory = JSON.parse(readFileSync('scripts/media-selection.json', 'utf8'));
  for (const dataset of ['collection', 'paired']) {
    const m = JSON.parse(readFileSync(`public/data/${dataset}/manifest.json`, 'utf8'));
    const expected = new Map(inventory[dataset].map((item: any) => [item.id, item.media]));
    for (const item of m.items) {
      assert.equal(item.mediaFallback, undefined);
      assert.equal(
        item.media,
        dataset === 'paired'
          ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`
          : expected.get(item.id),
      );
      if (item.media) {
        assert.match(item.id, /^[A-Za-z0-9_-]{11}$/);
        assert.equal(item.media, `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`);
      }
    }
  }
});

test('expanding paired thumbnails keeps earlier mini-audit answers in a separate session', () => {
  const manifest = JSON.parse(readFileSync('public/data/paired/manifest.json', 'utf8'));
  const inventory = JSON.parse(readFileSync('scripts/media-selection.json', 'utf8'));
  const reviewed = new Set(inventory.paired.map((item: any) => item.id));
  const order = manifest.items.map((_: unknown, i: number) => i);
  const previous = order.filter((i: number) => reviewed.has(manifest.items[i].id));
  assert.ok(previous.length < order.length);
  const session = (indices: number[]) =>
    auditSessionKey(
      manifest.id,
      manifest.provenance.auditQuestion,
      'model',
      manifest.items,
      indices,
    );
  assert.notEqual(session(previous), session(order));
});

test('portable examples contain no hidden bundled image assets', () => {
  for (const file of files('examples').filter((path) => /\.(?:silab|zip)$/.test(path))) {
    const archive = unzipSync(readFileSync(file));
    for (const [name, data] of Object.entries(archive)) {
      assert.ok(!/\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(name), `${file}: ${name}`);
      if (name.endsWith('.json')) {
        const manifest = JSON.parse(strFromU8(data));
        for (const item of manifest.items ?? []) {
          assert.ok(!item.media || /^https:\/\//.test(item.media), `${file}: ${item.id}`);
          assert.equal(item.mediaFallback, undefined);
        }
      }
    }
  }
});
