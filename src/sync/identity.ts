/**
 * The sync secret is derived from a name + date of birth, never stored raw
 * server-side: normalize both, hash them, and that hash is the KV key. The
 * QR/deep-link carries the LITERAL (as-typed) name/dob — not the normalized
 * form, not the hash — so a second device shows the identical display string
 * ("Juan Pérez", not "juan perez") and independently derives the identical
 * hash by normalizing locally. Scanning is a convenience only: typing the
 * same name+dob from scratch on a fresh device gives the exact same result.
 */

/** Strips combining diacritical marks after NFD decomposition, e.g. "é" -> "e", "ñ" -> "n". */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalizes a name for hashing: trim, collapse internal whitespace,
 * lowercase, strip diacritics. NOT for display — always display the raw,
 * as-typed value from SyncMeta.
 */
export function normalizeName(name: string): string {
  return stripDiacritics(name.trim().replace(/\s+/g, ' ').toLowerCase());
}

/** Normalizes a DOB (already ISO YYYY-MM-DD from <input type="date">) for hashing: trim only. */
export function normalizeDob(dob: string): string {
  return dob.trim();
}

/**
 * hex(SHA-256(normalizedName + "|" + normalizedDob)) — the KV key. Uses Web
 * Crypto (crypto.subtle), natively available in both the browser and
 * Cloudflare Workers, so no new dependency.
 */
export async function computeSecretHash(name: string, dob: string): Promise<string> {
  const input = `${normalizeName(name)}|${normalizeDob(dob)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface JoinLinkParams {
  name: string;
  dob: string;
}

/**
 * Deep link that scanning the QR (or opening a shared link) lands on with
 * name/dob pre-filled, e.g. ".../#/sync/join?name=Juan+P%C3%A9rez&dob=1990-05-12".
 * Encodes the literal, as-typed name/dob — see module doc comment.
 */
export function buildJoinLink({ name, dob }: JoinLinkParams): string {
  const params = new URLSearchParams({ name, dob });
  return `${window.location.origin}${window.location.pathname}#/sync/join?${params.toString()}`;
}

/**
 * Parses name/dob out of a join-link's query string. `search` is whatever
 * useSearchParams() gives the caller — react-router already splits the hash
 * route's own query string out, so there's no URL string to hand-parse.
 * Returns null if either param is missing/empty.
 */
export function parseJoinLinkParams(search: URLSearchParams): JoinLinkParams | null {
  const name = search.get('name');
  const dob = search.get('dob');
  if (!name || !dob) return null;
  return { name, dob };
}
