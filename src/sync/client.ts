import type { SyncBlob } from './schema';

const SYNC_URL = (import.meta.env.VITE_SYNC_URL as string | undefined) ?? 'https://sync.mi-ojo-vago.guidev.org';

/** GET the blob for a code. Returns null on 404 (expected for a freshly generated, never-pushed code). */
export async function pullBlob(code: string): Promise<SyncBlob | null> {
  const res = await fetch(`${SYNC_URL}/sync/${code}`, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`pull failed: ${res.status}`);
  return (await res.json()) as SyncBlob;
}

/** PUT the blob for a code. Returns false (rather than throwing) on any failure, so callers can queue a retry. */
export async function pushBlob(code: string, blob: SyncBlob): Promise<boolean> {
  try {
    const res = await fetch(`${SYNC_URL}/sync/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(blob),
    });
    return res.ok;
  } catch {
    return false;
  }
}
