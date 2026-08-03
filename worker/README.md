# mi-ojo-vago-sync worker

Tiny, dependency-free Cloudflare Worker that stores/retrieves a JSON blob per sync
code in Workers KV. No auth, no accounts — anyone with the code can read/write that
code's blob. See `docs/superpowers/specs/2026-08-03-cross-device-sync-design.md` in
the repo root for the full design.

## Endpoints

- `GET /sync/:code` → 200 + stored JSON, or 404
- `PUT /sync/:code` → stores the request body (JSON, ≤ 50KB), 200 on success

`:code` must match `^\d{1,3}-\d{1,3}-\d{3}$` (two wordlist indices + a 3-digit
number — see `src/sync/code.ts` in the main app for how the human-readable words
map to this).

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
