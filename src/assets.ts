/**
 * URL of a file under `public/assets`, honouring the deploy base path.
 *
 * These paths are runtime string literals, not imports, so Vite can't rewrite
 * them — they'd 404 under a subpath deploy (e.g. /mi-ojo-vago-dev/). BASE_URL
 * always ends in a slash.
 */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}assets${path}`;
}
