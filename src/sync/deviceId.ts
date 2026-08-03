const KEY = 'miojovago.deviceId';

/** Stable per-browser identity, generated once and kept forever (independent of sync being enabled). */
export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
