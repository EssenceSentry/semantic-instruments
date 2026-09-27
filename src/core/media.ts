import { readCache, writeCache } from './cache';
const resolved = new Map<string, Promise<string>>();
const decoded = new Map<string, HTMLImageElement>();
export async function mediaSource(src: string, retry = false): Promise<string> {
  if (/^(blob:|data:)/.test(src)) return src;
  const key = new URL(src, location.href).href;
  // External previews render as ordinary image links, without fetching their bytes into JS.
  if (new URL(key).origin !== location.origin) return key;
  if (retry) resolved.delete(key);
  if (!resolved.has(key))
    resolved.set(
      key,
      (async () => {
        const saved = retry ? undefined : await readCache<Blob>('media:' + key);
        if (saved) return URL.createObjectURL(saved);
        const response = await fetch(key, { cache: retry ? 'reload' : 'default' });
        if (!response.ok) throw new Error('Preview could not be loaded');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.referrerPolicy = 'no-referrer';
        image.src = url;
        try {
          await image.decode();
        } catch (e) {
          URL.revokeObjectURL(url);
          throw e;
        }
        await writeCache('media:' + key, blob);
        decoded.set(key, image);
        return url;
      })().catch((e) => {
        resolved.delete(key);
        throw e;
      }),
    );
  return resolved.get(key)!;
}
export async function warmMedia(
  sources: (string | { src: string; fallback?: string })[],
  progress: (done: number, total: number) => void,
) {
  const unique = [
    ...new Map(
      sources.map((s) => {
        const item = typeof s === 'string' ? { src: s } : s;
        return [item.src, item];
      }),
    ).values(),
  ];
  let cursor = 0,
    done = 0;
  const failures: string[] = [];
  await Promise.all(
    Array.from({ length: Math.min(6, unique.length) }, async () => {
      while (cursor < unique.length) {
        const item = unique[cursor++],
          src = item.src;
        try {
          if (item.fallback) await mediaSource(item.fallback);
          const url = await mediaSource(src);
          if (!decoded.has(src)) {
            const image = new Image();
            image.referrerPolicy = 'no-referrer';
            image.src = url;
            await image.decode();
            decoded.set(src, image);
          }
        } catch {
          if (item.fallback) {
            try {
              const image = new Image();
              image.src = await mediaSource(item.fallback);
              await image.decode();
              decoded.set(src, image);
            } catch {
              failures.push(src);
            }
          } else failures.push(src);
        }
        progress(++done, unique.length);
      }
    }),
  );
  if (failures.length)
    throw new Error(failures.length + ' previews could not be prepared. Retry preparation.');
}
