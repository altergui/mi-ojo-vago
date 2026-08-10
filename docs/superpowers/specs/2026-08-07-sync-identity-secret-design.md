# Sync identity secret — design

Supersedes the sync-code / wordlist mechanism described in
`2026-08-03-cross-device-sync-design.md` (`## Sync code format` and the
enable/link flow in `## UX`). Everything else in that doc — worker
architecture, data model, merge logic, engine triggers — is unchanged and not
repeated here.

## Goal

Replace the random 25-bit sync code with a secret **derived** from a name and
date of birth the user types, so:

- The user doesn't have to copy/remember an arbitrary code — typing the same
  name+DOB on any device reproduces the same secret.
- The Worker/KV store never sees or stores raw name/DOB, only a SHA-256 hash
  of them — this keeps KV free of personal data, avoiding LGPD/GDPR data-
  handling obligations for that store.
- Raw name/DOB live only in each device's own `localStorage`, never sent to
  the server — including when they travel between a person's own devices via
  QR/link.

This is a full replacement, not additive — no real users depended on the old
random-code sync, so no migration path exists. Orphaned old-format KV entries
(`^\d{1,3}-\d{1,3}-\d{3}$` keys) simply expire via the existing TTL.

## Secret derivation

```
normalizedName = strip_diacritics(lowercase(collapse_whitespace(trim(name))))
normalizedDob  = trim(dob)                          // already ISO YYYY-MM-DD from <input type="date">
secretHash     = hex(SHA-256(normalizedName + "|" + normalizedDob))
```

Implemented in `src/sync/identity.ts`, using `crypto.subtle.digest` (Web
Crypto) — natively available in both the browser and Cloudflare Workers, so no
new dependency. `secretHash` is a 64-character lowercase hex string and
becomes the KV key, in the same `GET/PUT /sync/:key` endpoints the worker
already exposed — only the key's shape and its validation regex
(`worker/src/index.ts`) changed, from the old code pattern to
`^[0-9a-f]{64}$`. The worker otherwise remains an unchanged dumb blob store.

Normalization is intentionally lossy (ASCII-fold, e.g. "Muñoz" → "munoz") so
minor typing variations (case, extra whitespace, accents) still land on the
same secret across devices — this is a deliberate usability trade-off, not an
oversight.

## What's stored where

- **KV (server)**: only the hash, as the key. Never name, never DOB.
- **`localStorage` (client, per device)**: `{name, dob, secretHash}` — name
  and DOB **as literally typed** (original casing/accents), so the UI can
  display "Sincronizado como: Juan Pérez" rather than the normalized form.
  `secretHash` is cached at connect time rather than recomputed on every sync
  poll (every 15s) — there's no "edit identity" flow that would make the
  cached value stale.

## QR / deep link

The link (`buildJoinLink` in `identity.ts`) encodes the **literal** name and
DOB as URL params — e.g. `.../#/sync/join?name=Juan+P%C3%A9rez&dob=1990-05-12`
— not the normalized form and not the hash. If it encoded the normalized form
instead, a second device would display "juan perez" while the first shows
"Juan Pérez": encoding the literal keeps both devices' display identical,
while each independently normalizes locally to derive the identical hash.

Scanning is a convenience only, not the only path: typing the same name+DOB
from scratch on a fresh device produces the exact same hash and joins the same
sync group, with no QR involved. The sensitive pair only ever travels between
a person's own devices this way — never to the server.

## Threat model shift

The old code was an anonymous, unguessable random draw (~25 bits) with "no
PII, no auth" as an explicit, accepted trade-off. The new secret is
*derivable* from two pieces of information about a specific person. This
worker still never stores PII — only the hash — but "no auth" now implicitly
depends on a name+DOB pair not being trivially known/guessable by someone who
isn't that person. This is a knowingly-accepted trade-off (a targeted
attacker who knows a person's name and birthdate can compute their hash and
read/write their synced data), not a regression introduced by mistake — the
data being protected (playtime stats, calibration settings) remains low-
stakes, and the win is removing raw PII from server-side storage entirely,
not adding authentication.

## UX

Single form (`src/routes/SyncPage.tsx`): Name (text) + Date of birth
(`<input type="date">`) + one "Sincronizar" button — there's no separate
"enable" vs. "link" action anymore, since entering your own identity is the
same step whether you're the first device or joining existing data
(`connectSync` in `src/sync/engine.ts` collapses the old `enableSync`/
`linkDevice` into one). Whether a match was found (`foundExisting`) only
resolves after the initial pull, and is surfaced as a non-blocking
informational notice when nothing was found — covering both "you're
genuinely first" and "your name/DOB don't match another device's" without
being able to tell those apart.
