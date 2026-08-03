/**
 * Sync codes are canonically `idx1-idx2-number` (two indices into a 200-word
 * list, 0-199, plus a 3-digit number) — that's what's sent to the worker and
 * encoded in the QR. The word form (e.g. "gato-verde-742") is a display/entry
 * convenience layer only: WORDLIST_ES[idx] / WORDLIST_EN[idx] are the same
 * concept in each language, so a code typed as its ES words on one device and
 * its EN translation on another still resolves to the same canonical code.
 */
import { WORDLIST_EN, WORDLIST_ES, WORDLIST_SIZE } from './wordlist';
import type { Lang } from '@/i18n';

export const CANONICAL_CODE_PATTERN = /^(\d{1,3})-(\d{1,3})-(\d{3})$/;

/** Generates a fresh random canonical code, e.g. "17-42-742". */
export function generateCanonicalCode(): string {
  const idx1 = Math.floor(Math.random() * WORDLIST_SIZE);
  const idx2 = Math.floor(Math.random() * WORDLIST_SIZE);
  const number = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `${idx1}-${idx2}-${number}`;
}

export function isValidCanonicalCode(code: string): boolean {
  const match = CANONICAL_CODE_PATTERN.exec(code);
  if (!match) return false;
  const idx1 = Number(match[1]);
  const idx2 = Number(match[2]);
  return idx1 < WORDLIST_SIZE && idx2 < WORDLIST_SIZE;
}

function wordlistFor(lang: Lang): readonly string[] {
  return lang === 'es' ? WORDLIST_ES : WORDLIST_EN;
}

/** Canonical code -> localized display string, e.g. "17-42-742" -> "gato-verde-742". */
export function canonicalToWords(code: string, lang: Lang): string {
  const match = CANONICAL_CODE_PATTERN.exec(code);
  if (!match) return code;
  const words = wordlistFor(lang);
  const idx1 = Number(match[1]);
  const idx2 = Number(match[2]);
  return `${words[idx1] ?? '?'}-${words[idx2] ?? '?'}-${match[3]}`;
}

/** Deep link that scanning the QR (or pasting into "have a code?") auto-links from, e.g. ".../#/sync/17-42-742". */
export function canonicalToLinkUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/sync/${code}`;
}

/** If `input` is a sync deep link (pasted rather than scanned), pulls the code/words segment out of it; otherwise returns it unchanged. */
function stripLinkUrl(input: string): string {
  const match = input.trim().match(/#\/sync\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : input;
}

/**
 * Parses user-typed input (word-word-number, a bare canonical code, or a
 * pasted sync deep link) back into a canonical code. Tries both wordlists so
 * a code can be entered in either language regardless of which language it
 * was originally generated/displayed in. Returns null if it doesn't parse.
 */
export function wordsToCanonical(input: string): string | null {
  const trimmed = stripLinkUrl(input).trim().toLowerCase();
  if (isValidCanonicalCode(trimmed)) return trimmed;

  const parts = trimmed.split('-').map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [word1, word2, number] = parts;
  if (!/^\d{3}$/.test(number)) return null;

  for (const words of [WORDLIST_ES, WORDLIST_EN]) {
    const idx1 = words.indexOf(word1);
    const idx2 = words.indexOf(word2);
    if (idx1 !== -1 && idx2 !== -1) {
      return `${idx1}-${idx2}-${number}`;
    }
  }
  return null;
}
