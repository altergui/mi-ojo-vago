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

      <section className="hub__exercises">
        <h3>{t('hub.exercisesTitle')}</h3>
        <div className="hub__games">
          <article className="card">
            <div className="card__media">
              <img src="/assets/orthoptics/logo.svg" alt={t('game.orthoptics.name')} loading="lazy" />
            </div>
            <div className="card__body">
              <h2>{t('game.orthoptics.name')}</h2>
              <p>{t('game.orthoptics.desc')}</p>
              <Link className="btn btn--primary" to="/exercise/orthoptics">
                {t('hub.play')}
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="hub__glasses">
        <h3>{t('hub.glassesTitle')}</h3>
        <p>{t('hub.glassesText')}</p>
        <div className="glasses-grid">
          <a
            className="glasses-card"
            href="https://lapiramideopticas.com/product/lentes-rojo-azul-anaglifos-mod01/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src="/assets/brand/glasses-piramide.jpeg" alt={t('hub.glasses.piramideName')} loading="lazy" />
            <span className="glasses-card__name">{t('hub.glasses.piramideName')}</span>
            <span className="btn btn--primary">{t('hub.glasses.seeMore')}</span>
          </a>
          <a
            className="glasses-card"
            href="https://www.mercadolibre.com.ar/anteojo-3d--lente-anaglifo--columbia-pictures--1-unidad/up/MLAU299767780"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="/assets/brand/glasses-mercadolibre.webp"
              alt={t('hub.glasses.mercadolibreName')}
              loading="lazy"
            />
            <span className="glasses-card__name">{t('hub.glasses.mercadolibreName')}</span>
            <span className="btn btn--primary">{t('hub.glasses.seeMore')}</span>
          </a>
        </div>
      </section>

      <section className="hub__mario">
        <img src="/assets/brand/mario-cerrella.png" alt={t('hub.marioTitle')} className="hub__mario-photo" />
        <div className="hub__mario-body">
          <h3>{t('hub.marioTitle')}</h3>
          <a
            className="btn btn--primary"
            href="https://dresiribarren.com.ar/visual-training-2/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('hub.marioVisualTraining')}
          </a>
        </div>
      </section>

      <p className="hub__disclaimer">{t('app.disclaimer')}</p>
    </div>
  );
}
