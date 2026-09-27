import { readCache, writeCache } from './cache';
const resolved = new Map<string, Promise<string>>();
// Sources verified by warming; the browser's image cache holds the pixels, not this module.
const warmed = new Set<string>();
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
        return url;
      })().catch((e) => {
        resolved.delete(key);
        throw e;
      }),
    );
  return resolved.get(key)!;
}
// Decode once to verify and warm the browser cache; the element is not retained.
function decodeImage(url: string, timeout: number) {
  const image = new Image();
  image.referrerPolicy = 'no-referrer';
  image.src = url;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    image.decode(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Preview timed out')), timeout);
    }),
  ]).finally(() => {
    clearTimeout(timer);
    image.src = '';
  });
}
async function loadPreview(src: string) {
  await decodeImage(await mediaSource(src), 15000);
}
export async function warmMedia(
  sources: (string | { src: string; fallback?: string })[],
  progress: (done: number, total: number) => void,
  {
    cancelled = () => false,
    load = loadPreview,
  }: { cancelled?: () => boolean; load?: (src: string) => Promise<void> } = {},
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
      while (cursor < unique.length && !cancelled()) {
        const item = unique[cursor++],
          src = item.src;
        if (!warmed.has(src))
          try {
            await load(src);
            warmed.add(src);
          } catch {
            try {
              if (!item.fallback) throw new Error('No fallback');
              await load(item.fallback);
              warmed.add(src);
            } catch {
              failures.push(src);
            }
          }
        progress(++done, unique.length);
      }
    }),
  );
  // Unavailable previews are reported, never thrown: numerical preparation does not need them.
  return {
    total: unique.length,
    ready: done - failures.length,
    failed: failures.length,
    cancelled: done < unique.length,
  };
}
