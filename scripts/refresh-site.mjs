/** Publish the verified build to the existing portable server; switch index last. */
import { readdir, readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...(await files(root, name)));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}
const paths = await files('dist');
if (!paths.includes('index.html'))
  throw new Error('Build the application before refreshing site/.');
paths.sort((a, b) => Number(a === 'index.html') - Number(b === 'index.html') || a.localeCompare(b));
let changed = 0;
for (const name of paths) {
  const bytes = await readFile(join('dist', name)),
    destination = join('site', name);
  let current;
  try {
    current = await readFile(destination);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current?.equals(bytes)) continue;
  await mkdir(dirname(destination), { recursive: true });
  const temporary = destination + `.publish-${process.pid}`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  changed++;
}
console.log(
  `Portable site refreshed: ${changed} changed files. Existing hashed assets retained for open tabs.`,
);
