const ABSOLUTE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
/**
 * Resolves a file shipped with the application (public/) against the deployment base, so the
 * same build works at the origin root and under a project path such as /semantic-instruments/.
 * A leading slash names the application root, not the origin root. Absolute URLs are external
 * references and are returned unchanged. Workers need an absolute base: a relative base would
 * resolve against the worker script instead of the page.
 */
export function appUrl(
  path: string,
  base: string = import.meta.env.BASE_URL,
  context: string = globalThis.location.href,
) {
  if (ABSOLUTE.test(path)) return path;
  return new URL(path.replace(/^\/+/, ''), new URL(base, context)).href;
}
