// Versioned, content-addressed cache. A changed array or parameter produces a new key.
export const CACHE_VERSION = 'instruments-ux-4';
let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('semantic-instruments-computation', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('entries');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error('Close older lab tabs to enable the presentation cache.'));
    });
  return database;
}
export async function readCache<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const r = db
        .transaction('entries')
        .objectStore('entries')
        .get(CACHE_VERSION + ':' + key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return undefined;
  }
}
export async function writeCache(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('entries', 'readwrite');
      t.objectStore('entries').put(value, CACHE_VERSION + ':' + key);
      t.oncomplete = () => resolve();
      t.onabort = t.onerror = () => reject(t.error);
    });
    return true;
  } catch {
    return false;
  }
}
export async function clearCache() {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('entries', 'readwrite');
    t.objectStore('entries').clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
export async function digest(value: string | ArrayBufferView) {
  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join('');
}
export function canonical(value: unknown): string {
  if (ArrayBuffer.isView(value))
    return canonical(Array.from(value as unknown as ArrayLike<number>));
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export async function operationKey(type: string, payload: unknown, dependencies: string[]) {
  return digest(canonical({ version: CACHE_VERSION, type, payload, dependencies }));
}
// Let React commit a loading state and the browser paint before synchronous preparation.
export const paint = () =>
  new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, 50);
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(() =>
        setTimeout(() => {
          clearTimeout(fallback);
          resolve();
        }, 0),
      );
  });
