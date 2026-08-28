import { useMemo } from 'react';
import { useI18n, type StringKey } from '@/i18n';
import { statsStore, todayKey } from '@/stats/store';
import { formatDuration, formatDurationShort } from '@/stats/format';
import { getGame } from '@/games/registry';
import { useSyncedStats } from '@/sync/useSyncedStats';
import { clearAccountStats } from '@/sync/engine';
import { useDeviceLabels } from '@/sync/useSyncState';
import { shortDeviceId } from '@/sync/deviceId';

const VARIANT_KEYS = new Set(['filled', 'hollow', 'hollowLine']);

/** Translates known variant names; falls back to the raw string for legacy stats data. */
function variantLabel(variant: string, t: (key: StringKey) => string): string {
  return VARIANT_KEYS.has(variant) ? t(`variant.${variant}` as StringKey) : variant;
}

function last7Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(todayKey(d));
  }
  return days;
}

export function StatsDashboard() {
  const { t, lang } = useI18n();
  const stats = useSyncedStats();
  const deviceLabels = useDeviceLabels();

  const days = useMemo(last7Days, []);
  const dayMax = Math.max(1, ...days.map((d) => stats.byDay[d] ?? 0));
  const contrastSorted = useMemo(() => [...stats.contrast].sort((a, b) => b.ms - a.ms), [stats.contrast]);
  const contrastMax = Math.max(1, ...contrastSorted.map((c) => c.ms));

  const hasData = stats.totalMs > 0 || stats.sessions.length > 0;

  const exportJSON = () => {
    const blob = new Blob([statsStore.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mi-ojo-vago-stats-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clear = () => {
    // Clears stats for the whole account (every synced device), not just this
    // one — see clearAccountStats for why a per-device clear isn't enough.
    if (confirm(t('stats.clearConfirm'))) {
      void clearAccountStats();
    }
  };

  const dateFmt = (iso: string) => new Date(iso).toLocaleString(lang === 'es' ? 'es-AR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="stats">
      <h1>{t('stats.title')}</h1>

      {!hasData && <p className="muted">{t('stats.noData')}</p>}

      <div className="stats__cards">
        <div className="stat-card">
          <span className="stat-card__label">{t('stats.totalTime')}</span>
          <span className="stat-card__value">{formatDuration(stats.totalMs)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">{t('stats.today')}</span>
          <span className="stat-card__value">{formatDuration(stats.byDay[todayKey()] ?? 0)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">{t('stats.streak')}</span>
          <span className="stat-card__value">{Object.keys(stats.byDay).length}</span>
        </div>
        {Object.entries(stats.bestScore).map(([gid, sc]) => {
          const def = getGame(gid);
          return (
            <div className="stat-card" key={gid}>
              <span className="stat-card__label">
                {t('stats.bestScore')} · {def ? t(def.nameKey) : gid}
              </span>
              <span className="stat-card__value">{sc}</span>
            </div>
          );
        })}
      </div>

      <section className="stats__block">
        <h2>{t('stats.last7')}</h2>
        <div className="barchart">
          {days.map((d) => {
            const ms = stats.byDay[d] ?? 0;
            const h = Math.round((ms / dayMax) * 100);
            return (
              <div key={d} className="barchart__col" title={`${d}: ${formatDuration(ms)}`}>
                <div className="barchart__bar" style={{ height: `${Math.max(2, h)}%` }} />
                <span className="barchart__x">{d.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="stats__block">
        <h2>{t('stats.byContrast')}</h2>
        {contrastSorted.length === 0 ? (
          <p className="muted">{t('common.none')}</p>
        ) : (
          <ul className="contrast-list">
            {contrastSorted.map((c, i) => (
              <li key={i}>
                <div className="contrast-list__meta">
                  <span className="dot" style={{ background: `#00FFFF` }} title="cyan" />
                  {c.cyanEye === 'left' ? t('settings.left') : t('settings.right')} {c.cyanPercent}%
                  <span className="dot" style={{ background: `#FF4040` }} title="red" />
                  {c.cyanEye === 'left' ? t('settings.right') : t('settings.left')} {c.redPercent}%
                  <span className="tag">{variantLabel(c.variant, t)}</span>
                </div>
                <div className="contrast-list__bar">
                  <div style={{ width: `${(c.ms / contrastMax) * 100}%` }} />
                  <span>{formatDurationShort(c.ms)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stats__block">
        <h2>{t('stats.sessions')}</h2>
        {stats.sessions.length === 0 ? (
          <p className="muted">{t('common.none')}</p>
        ) : (
          <table className="sessions">
            <thead>
              <tr>
                <th>{t('stats.date')}</th>
                <th>{t('nav.games')}</th>
                <th>{t('stats.duration')}</th>
                <th>{t('shell.score')}</th>
                <th>{t('stats.deviceId')}</th>
                <th>{t('stats.device')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.sessions.slice(0, 20).map((s) => {
                const def = getGame(s.game);
                return (
                  <tr key={s.id}>
                    <td>{dateFmt(s.startedAt)}</td>
                    <td>{def ? t(def.nameKey) : s.game}</td>
                    <td>{formatDuration(s.durationMs)}</td>
                    <td>{s.score ?? t('common.none')}</td>
                    <td>{s.deviceId ? shortDeviceId(s.deviceId) : t('common.none')}</td>
                    <td>{s.deviceId ? (deviceLabels[s.deviceId] ?? t('common.none')) : t('common.none')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="stats__actions">
        <button className="btn btn--ghost" onClick={exportJSON}>
          {t('stats.export')}
        </button>
        <button className="btn btn--danger" onClick={clear}>
          {t('stats.clear')}
        </button>
      </div>
    </div>
  );
}
