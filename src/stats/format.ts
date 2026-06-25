/** Human-friendly duration from milliseconds, e.g. "1 h 23 min" or "45 min". */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '< 1 min';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}

/** Short form for compact spots, e.g. "1h23" / "45m". */
export function formatDurationShort(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}m`;
}
