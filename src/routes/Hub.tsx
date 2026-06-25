import { Link } from 'react-router-dom';
import { GAMES } from '@/games/registry';
import { useI18n } from '@/i18n';
import { useStats } from '@/stats/useStats';
import { formatDuration } from '@/stats/format';

export function Hub() {
  const { t } = useI18n();
  const stats = useStats();

  return (
    <div className="hub">
      <section className="hub__hero">
        <h1>{t('app.title')}</h1>
        <p className="hub__tagline">{t('app.tagline')}</p>
        <p className="hub__intro">{t('hub.intro')}</p>
        {stats.totalMs > 0 && (
          <p className="hub__time">
            ⏱ {t('stats.totalTime')}: <strong>{formatDuration(stats.totalMs)}</strong>
          </p>
        )}
      </section>

      <section className="hub__games">
        {GAMES.map((g) => (
          <article key={g.id} className="card">
            <div className="card__media">
              <img src={g.screenshot} alt={t(g.nameKey)} loading="lazy" />
            </div>
            <div className="card__body">
              <h2>{t(g.nameKey)}</h2>
              <p>{t(g.descKey)}</p>
              <Link className="btn btn--primary" to={`/play/${g.id}`}>
                {t('hub.play')}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="hub__glasses">
        <h3>{t('hub.glassesTitle')}</h3>
        <p>{t('hub.glassesText')}</p>
        <div className="glasses-demo" aria-hidden>
          <span className="glasses-demo__lens" style={{ background: '#ff0000' }} />
          <span className="glasses-demo__lens" style={{ background: '#00ffff' }} />
        </div>
      </section>

      <footer className="hub__disclaimer">{t('app.disclaimer')}</footer>
    </div>
  );
}
