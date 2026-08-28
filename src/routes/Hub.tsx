import { Link } from 'react-router-dom';
import { asset } from '@/assets';
import { GAMES } from '@/games/registry';
import { useI18n } from '@/i18n';
import { useStats } from '@/stats/useStats';
import { formatDuration } from '@/stats/format';

export function Hub() {
  const { t, lang } = useI18n();
  const stats = useStats();

  return (
    <div className="hub">
      <section className="hub__hero">
        <h1>{t('app.title')}</h1>

        <div className="hub__ortho">
          <article className="card">
            <div className="card__media">
              <img src={asset('/orthoptics/logo.svg')} alt={t('game.orthoptics.name')} loading="lazy" />
            </div>
            <div className="card__body">
              <h2>{t('game.orthoptics.name')}</h2>
              <p>{t('game.orthoptics.desc')}</p>
              <Link className="btn btn--primary" to="/exercise/orthoptics">
                {t('hub.trainFree')}
              </Link>
            </div>
          </article>
        </div>

        <p className="hub__tagline">{t('app.tagline')}</p>
        <p className="hub__intro">{t('hub.about1')}</p>
        <p className="hub__intro">{t('hub.about2')}</p>
        <p className="hub__intro">{t('hub.about3')}</p>
        <p className="hub__intro">{t('hub.about4')}</p>
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
        <div className="glasses-grid">
          {lang === 'en' ? (
            // lapiramideopticas/MercadoLibre only ship within Argentina — for
            // English speakers, point at Bernell instead (an international
            // vision-therapy supplier), same one dresiribarren.com.ar/my-lazy-eye/
            // links to.
            <a
              className="glasses-card"
              href="https://www.bernell.com/product/HTSRBG/137"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={asset('/brand/glasses-bernell.jpg')} alt={t('hub.glasses.bernellName')} loading="lazy" />
              <span className="glasses-card__name">{t('hub.glasses.bernellName')}</span>
              <span className="btn btn--accent">{t('hub.glasses.seeMore')}</span>
            </a>
          ) : (
            <>
              <a
                className="glasses-card"
                href="https://lapiramideopticas.com/product/lentes-rojo-azul-anaglifos-mod01/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={asset('/brand/glasses-piramide.jpeg')} alt={t('hub.glasses.piramideName')} loading="lazy" />
                <span className="glasses-card__name">{t('hub.glasses.piramideName')}</span>
                <span className="btn btn--accent">{t('hub.glasses.seeMore')}</span>
              </a>
              <a
                className="glasses-card"
                href="https://www.mercadolibre.com.ar/anteojo-3d--lente-anaglifo--columbia-pictures--1-unidad/up/MLAU299767780"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={asset('/brand/glasses-mercadolibre.webp')}
                  alt={t('hub.glasses.mercadolibreName')}
                  loading="lazy"
                />
                <span className="glasses-card__name">{t('hub.glasses.mercadolibreName')}</span>
                <span className="btn btn--accent">{t('hub.glasses.seeMore')}</span>
              </a>
            </>
          )}
        </div>
      </section>

      <section className="hub__mario">
        <div className="hub__mario-info">
          <img src={asset('/brand/mario-cerrella.png')} alt={t('hub.marioTitle')} className="hub__mario-photo" />
          <div className="hub__mario-body">
            <h3>{t('hub.marioTitle')}</h3>
            <a
              className="btn btn--accent"
              href="https://dresiribarren.com.ar/visual-training-2/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('hub.marioVisualTraining')}
            </a>
          </div>
        </div>
        <img
          src={asset('/brand/visual-training-screenshot.png')}
          alt={t('hub.marioVisualTraining')}
          className="hub__mario-screenshot"
        />
      </section>
    </div>
  );
}
