import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from './i18n';

export function App() {
  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const isImmersive = location.pathname.startsWith('/play/') || location.pathname.startsWith('/exercise/');

  return (
    <div className="app" data-immersive={isImmersive}>
      <header className="app__header" data-immersive={isImmersive}>
        <Link to="/" className="app__brand">
          <img className="app__logo" src="/assets/brand/logo.png" alt={t('app.title')} />
        </Link>
        <nav className="app__nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            {t('nav.games')}
          </NavLink>
          <NavLink to="/stats" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            {t('nav.stats')}
          </NavLink>
          <NavLink to="/sync" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            {t('nav.sync')}
          </NavLink>
          <button
            type="button"
            className="app__lang"
            onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
            aria-label="Toggle language"
          >
            {lang === 'es' ? 'EN' : 'ES'}
          </button>
        </nav>
      </header>
      <main className="app__main">
        <Outlet />
      </main>
      {!isImmersive && (
        <footer className="site-footer">
          <div className="site-footer__inner">
            <span>{t('footer.copyright')}</span>
            <span className="site-footer__donations">
              {t('footer.donationsLabel')} <a href="mailto:REDACTED_EMAIL">REDACTED_EMAIL</a> ·{' '}
              <a href="tel:REDACTED_PHONE">REDACTED_PHONE</a>
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
