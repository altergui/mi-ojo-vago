/**
 * Persisted Orthoptics preferences. Not a DichopticSettings shape (no color
 * arrays — the stimulus images are pre-tinted PNGs, not canvas-drawn), so this
 * is a small parallel store under the same localStorage key convention as
 * src/settings/store.ts.
 */
const KEY = 'miojovago.settings.orthoptics';

export interface OrthopticsPrefs {
  stimulus: number; // 1..7
  fast: boolean;
  showMarkers: boolean;
  contrastRed: number; // 100/80/60/40/20
  contrastCyan: number;
}

export function defaultOrthopticsPrefs(): OrthopticsPrefs {
  return { stimulus: 1, fast: false, showMarkers: true, contrastRed: 100, contrastCyan: 100 };
}

export function loadOrthopticsPrefs(): OrthopticsPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultOrthopticsPrefs();
    return { ...defaultOrthopticsPrefs(), ...(JSON.parse(raw) as Partial<OrthopticsPrefs>) };
  } catch {
    return defaultOrthopticsPrefs();
  }
}

export function saveOrthopticsPrefs(prefs: OrthopticsPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}
