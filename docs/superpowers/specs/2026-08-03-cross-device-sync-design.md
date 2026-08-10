# Cross-device sync — design

> **Superseded (2026-08-07):** the sync **code** (`## Sync code format`) and how a
> device **enables/links** (`## UX`) described below were replaced by a name+DOB
> derived secret — see
> `docs/superpowers/specs/2026-08-07-sync-identity-secret-design.md`. The worker
> architecture, data model, merge logic, and engine behavior described here are
> otherwise still accurate.

## Goal

Let a user carry their game settings and playtime stats between devices (e.g. phone +
tablet) without accounts or email. Sync is opt-in and keyed by a human-readable code
the user copies or scans between devices. No login, no database beyond a Cloudflare
Workers KV blob store, worker stays dependency-free.

## Current state (for context)

- `src/settings/store.ts` — a single flat `DichopticSettings` object in localStorage
  (`miojovago.settings.global`). No timestamp, no versioning.
- `src/stats/store.ts` — a single flat `StatsData` object in localStorage
  (`miojovago.stats.v1`): `totalMs`, `byDay`, `byGame`, `contrast[]` (bucketed by
  cyan%/red%/variant/eye), `sessions[]` (capped at 200, newest first), `bestScore`.
  Consumed entirely by `StatsDashboard.tsx`.
- No accounts, no per-device identity, no backend today. `wrangler.jsonc` at the repo
  root is an **assets-only** Worker (serves the built SPA at
  `mi-ojo-vago.guidev.org`) — it has no script, so the sync worker is a fully
  separate deployment.
- i18n is es/en (`src/i18n.tsx`), default es.

## Architecture

### Worker (`/worker`, new, separate deployment)

- `worker/wrangler.toml` — Worker name `mi-ojo-vago-sync`, KV binding `SYNC_KV`,
  route `sync.mi-ojo-vago.guidev.org/*`, var `ALLOWED_ORIGINS` (comma-separated —
  production origin plus, for local dev, `http://localhost:5173`).
- `worker/src/index.ts` — dependency-free (no npm runtime deps; TypeScript compiled
  by wrangler's built-in esbuild, consistent with the rest of the repo).
- `worker/README.md` — deploy steps: `wrangler kv namespace create SYNC_KV`, wire the
  returned id into `wrangler.toml`, `wrangler deploy`.

Endpoints:

| Method | Path         | Behavior |
|--------|--------------|----------|
| GET    | `/sync/:code` | 200 + stored JSON blob, or 404 `{ "error": "not_found" }` |
| PUT    | `/sync/:code` | Validates `:code`, body; stores blob with `expirationTtl: 360*86400` (refreshed on every write since KV TTLs aren't sticky); 200 on success |

Validation (server-side, no server-side knowledge of the wordlists — see "Sync
code format" below for why):

- `:code` must match `^\d{1,3}-\d{1,3}-\d{3}$` (two wordlist indices, each 0–199 as
  1–3 digits, then exactly 3 digits) → else 400.
- Body must be valid JSON → else 400.
- Body must be ≤ 50KB (checked via `Content-Length` and re-checked on the read
  buffer) → else 413.
- CORS: reflect `Origin` back only if it's in `ALLOWED_ORIGINS`; handle `OPTIONS`
  preflight. No other abuse protection (no rate limiting) — out of scope per the
  original ask, low-stakes data (no PII, no auth).

### Client (new `src/sync/` module + `src/routes/SyncPage.tsx`)

```
src/sync/
  deviceId.ts   — generate/persist a per-browser crypto.randomUUID()
  wordlist.ts   — 200-word es list + 200-word en list, index-aligned
  code.ts       — generate/validate/encode/decode sync codes
  schema.ts     — wire types (SyncBlob) + local meta storage
  merge.ts       — pure merge functions (unit tested)
  client.ts     — fetch wrappers (pull/push) + debounce + offline retry
  useSyncedStats.ts — selector hook combining local + cached remote for display
src/routes/SyncPage.tsx  — enable/disable, code+QR, link-device, disconnect
```

- `qrcode-generator` added as a dependency (tiny, zero-dep) for rendering the QR
  code; app renders it to an inline SVG.
- `vitest` added as a devDependency (none exists in the repo today) with a `test`
  npm script, for `src/sync/merge.test.ts`.

## Sync code format

The spec's example (`gato-verde-742`) is two words + a 3-digit number (3
dash-separated segments), which is what this design uses — the spec's prose said
"three words" but that contradicts its own example; resolving in favor of the
example since it's concrete.

The code is **canonically an index pair + number**, e.g. `17-42-742`, where 17 and
42 are indices into a 200-word list. Two word lists exist (es/en), same length and
index-aligned (index 17 = "gato" in es, "cat" in en) — purely a display/entry
convenience layer:

- **Display**: render using whichever wordlist matches the current UI language.
- **Manual entry**: parse the typed words against *both* wordlists (so a code
  generated on an es device can be typed as its en translation on an en device and
  still resolve to the same underlying code).
- **QR payload**: encodes the canonical index form directly (`17-42-742`) —
  language-independent, no parsing ambiguity.
- **Wire format to the worker**: always the canonical index form. The server never
  sees or knows about words.

Entropy: 200 × 200 × 1000 ≈ 40M combinations (~25 bits) — adequate for this app's
threat model (playtime stats + display config, no PII).

## Data model & schema versioning

Local storage keeps its **existing shapes** — no restructuring of `StatsData` or
`DichopticSettings` — to minimize blast radius and avoid a risky migration. Sync
adds new fields and new local storage keys alongside what's there:

- `settings/store.ts`: settings gain an `updatedAt: number` (single timestamp — this
  app has exactly one config "section", so per-section LWW collapses to a single
  timestamp) and a `schemaVersion`. Migrating a pre-sync flat `DichopticSettings`
  wraps it as `{ schemaVersion: 1, updatedAt: Date.now(), settings }` — using "now"
  (not 0) so a first-ever link doesn't let a stale/old remote value clobber a
  freshly-configured local device.
- `stats/store.ts`: `StatsData.version` bumps (schema-version bump only, no shape
  change) to mark "post-sync-feature" data.
- New key `miojovago.deviceId` — generated once (`crypto.randomUUID()`), persisted
  forever regardless of whether sync is ever enabled.
- New key `miojovago.sync.meta` — `{ enabled, code, lastSyncedAt }`.
- New key `miojovago.sync.remoteDevices` — cache of the last-pulled snapshot of
  *other* devices' `StatsData`, keyed by their deviceId. Never merged into this
  device's own counters — kept strictly separate so this device's local numbers
  stay authoritative and monotonic for itself.

Wire schema (`SyncBlob`, what's stored in KV):

```ts
interface SyncBlob {
  schemaVersion: 1;
  config: { settings: DichopticSettings; updatedAt: number };
  stats: { devices: Record<string /* deviceId */, StatsData> }; // StatsData.sessions capped at 50 here
}
```

## Merge logic (`src/sync/merge.ts`, pure functions, unit tested)

**Config**: pure last-write-wins. Compare `updatedAt`; the newer `settings` blob
wins wholesale (no field-level merge — there's only one section).

**Stats, on pull** — reconcile only *our own* deviceId's entry against local, taking
the max per counter (guards against local data loss, e.g. cleared browser storage,
without ever going backwards):
- `totalMs`: `max(local, remote)`
- `byDay[day]`, `byGame[game]`: `max` per key, unioning key sets
- `contrast[]`: matched by bucket signature (`cyanPercent|redPercent|variant|cyanEye`,
  same signature `addTraining` already uses); `max(ms)` per matching bucket
- `bestScore[game]`: `max` per key (already effectively a max locally)
- `sessions[]`: **not** a counter — see below

Every *other* deviceId's entry in the pulled blob is cached as-is into
`remoteDevices` (they're authoritative for themselves; we never second-guess them).

**Stats, for display** (`useSyncedStats`, only when sync is enabled — otherwise the
dashboard reads local `statsStore` unchanged as it does today):
- `totalMs`, `byDay`, `byGame`, contrast `ms`: **sum** across own + all cached
  remote devices (each device's counter is disjoint/additive by construction).
- `bestScore[game]`: **max** across own + all cached remote devices.
- `sessions`: **union** of own + all cached remote devices' sessions, deduped by
  existing id (`${startedAt}-${durationMs}`), sorted by `startedAt` desc, capped at
  200 for display. (This is a log, not a counter — the spec's "max per counter"
  rule doesn't apply; union+dedup is the natural analog.)

**Stats, for push** — each device pushes only its **own** entry (reconciled via the
max rule above) plus its cached copies of other known devices, unmodified. Own
`sessions` list is trimmed to the most recent **50** before inclusion (not the full
200) — 200 sessions/device × ~150 bytes ≈ 30KB, which alone exceeds the 50KB body
cap once more than one device is involved; 50/device (~7.5KB) leaves headroom.
Local-only history (this device's own view when sync is off, or its own full
200-entry list on its own device) is unaffected — only the synced copy is trimmed.

**Edge case — "Clear data"**: the existing stats-clear button, when sync is enabled,
must also immediately push a zeroed entry for this device. Otherwise the
max-reconciliation on the next pull would resurrect the deleted numbers from the
last-synced snapshot.

## Sync engine behavior

Triggers (debounced ~3s so rapid changes coalesce into one round trip): app load (if
sync enabled), after any config change, after any game session end.

Flow per trigger: pull → merge (as above) → push merged blob.

- Offline-safe: a failed push sets a single "dirty" flag (not a real queue — we
  always push the latest full merged state, so only the *fact* that a push is
  pending matters, not a diff history). Retried on the browser's `online` event and
  on the next debounced trigger.
- A 404 on pull (freshly generated code, never pushed) is expected and silent, not
  an error.

## UX

New top-level nav item + route (`src/routes/SyncPage.tsx`), alongside "Games" /
"Stats" in `App.tsx`.

- **Disabled state**: "Enable sync" button — generates `deviceId` (if absent) + a
  sync code, does an initial push, flips to enabled.
- **Enabled state**: code shown as localized words + copy button; QR code (canonical
  index form, rendered via `qrcode-generator` as inline SVG) below it; "link another
  device" text input (accepts words in either es or en, parsed against both lists);
  "disconnect" button — stops syncing (clears `miojovago.sync.meta` and
  `remoteDevices` cache) but explicitly leaves local `settings`/`stats` untouched.
- **Linking flow**: entering/scanning a code on device B validates the format
  client-side, pulls the blob, merges it into device B's local state (config via
  LWW, stats via the rules above), adopts that code as its own, and starts syncing.

## Testing

`vitest` unit tests for the pure functions in `src/sync/merge.ts`: own-device
max-reconcile, cross-device sum/union for display, LWW config resolution, session
dedup/cap, and the clear-data zeroing behavior. No e2e/integration tests, no worker
tests (the worker is thin enough to be low-risk to leave manually verified for now).
