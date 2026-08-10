# mi-ojo-vago-sync worker

Tiny, dependency-free Cloudflare Worker that stores/retrieves a JSON blob per sync
key in Workers KV. No auth, no accounts — anyone who derives the key can read/write
that key's blob. The key is a SHA-256 hash of a normalized name + date of birth,
computed client-side; this worker never sees the raw name/DOB, only the hash, so KV
never holds personal data. See
`docs/superpowers/specs/2026-08-07-sync-identity-secret-design.md` in the repo root
for the full design (supersedes `2026-08-03-cross-device-sync-design.md`).

## Endpoints

- `GET /sync/:key` → 200 + stored JSON, or 404
- `PUT /sync/:key` → stores the request body (JSON, ≤ 50KB), 200 on success

`:key` must match `^[0-9a-f]{64}$` (a SHA-256 hex digest — see
`src/sync/identity.ts` in the main app for how it's derived from name + DOB).

## Deploy

From this directory:

```bash
npm install -g wrangler   # or use the repo root's local wrangler via npx
wrangler kv namespace create SYNC_KV
```

Copy the `id` it prints into `wrangler.toml`'s `[[kv_namespaces]]` block (replacing
`REPLACE_WITH_KV_NAMESPACE_ID`), then:

```bash
wrangler deploy
```

This also provisions the `sync.mi-ojo-vago.guidev.org` custom domain route
automatically (Cloudflare manages the DNS record for `custom_domain = true` routes —
no manual `flarectl` step needed).

## Local dev

```bash
wrangler dev
```

Add `http://localhost:5173` to `ALLOWED_ORIGINS` in `wrangler.toml` (comma-separated)
while developing against the local Vite dev server.
