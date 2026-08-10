export interface Env {
  SYNC_KV: KVNamespace;
  ALLOWED_ORIGINS: string;
}

const SECRET_HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_BODY_BYTES = 50 * 1024;
const TTL_SECONDS = 360 * 24 * 60 * 60;

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/sync\/([^/]+)$/);
    if (!match) {
      return json({ error: 'not_found' }, 404, cors);
    }
    const key = match[1];
    if (!SECRET_HASH_PATTERN.test(key)) {
      return json({ error: 'invalid_key' }, 400, cors);
    }

    if (request.method === 'GET') {
      const stored = await env.SYNC_KV.get(key);
      if (stored === null) {
        return json({ error: 'not_found' }, 404, cors);
      }
      return new Response(stored, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (request.method === 'PUT') {
      const contentLength = Number(request.headers.get('Content-Length') ?? '0');
      if (contentLength > MAX_BODY_BYTES) {
        return json({ error: 'payload_too_large' }, 413, cors);
      }

      const text = await request.text();
      if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
        return json({ error: 'payload_too_large' }, 413, cors);
      }

      try {
        JSON.parse(text);
      } catch {
        return json({ error: 'invalid_json' }, 400, cors);
      }

      await env.SYNC_KV.put(key, text, { expirationTtl: TTL_SECONDS });
      return json({ ok: true }, 200, cors);
    }

    return json({ error: 'method_not_allowed' }, 405, cors);
  },
};
