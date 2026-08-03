const KEY = 'miojovago.deviceId';
const MAX_LABEL_LENGTH = 70;

/** Stable per-browser identity, generated once and kept forever (independent of sync being enabled). */
export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Short, human-glanceable id for disambiguating devices in a table — not the full UUID. */
export function shortDeviceId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Raw (length-capped) navigator.userAgent, for the player to eyeball which
 * device is which. Deliberately not parsed into "phone"/"laptop"/OS/browser —
 * that kind of UA sniffing is fragile and goes stale; showing the real string
 * and letting the player interpret it is simpler and more honest. Computed
 * fresh each time (not persisted), so it stays accurate across browser updates.
 */
export function getDeviceLabel(): string {
  const ua = navigator.userAgent || 'unknown';
  return ua.length > MAX_LABEL_LENGTH ? `${ua.slice(0, MAX_LABEL_LENGTH)}…` : ua;
}
