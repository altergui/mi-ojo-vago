import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from './i18n';

export function App() {
  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const isGame = location.pathname.startsWith('/play/');

  return (
    <div className="app">
      <header className="app__header" data-immersive={isGame}>
        <Link to="/" className="app__brand">
          <span className="app__eye" aria-hidden>
            👁
          </span>
          {t('app.title')}
        </Link>
        <nav className="app__nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            {t('nav.games')}
          </NavLink>
          <NavLink to="/stats" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            {t('nav.stats')}
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
    </div>
  );
}
