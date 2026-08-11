import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { IdentityBadge } from './components/IdentityBadge';
import { useI18n } from './i18n';
import { useSyncMeta } from './sync/useSyncState';

const donationEmail = import.meta.env.VITE_DONATION_EMAIL as string | undefined;
const donationPhone = import.meta.env.VITE_DONATION_PHONE as string | undefined;
const donationPhoneHref = donationPhone?.replace(/[^+\d]/g, '');

export function App() {
  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const meta = useSyncMeta();
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
          {meta.enabled && (
            <NavLink to="/stats" className={({ isActive }) => (isActive ? 'is-active' : '')}>
              {t('nav.stats')}
            </NavLink>
          )}
          <IdentityBadge />
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
            {(donationEmail || donationPhone) && (
              <span className="site-footer__donations">
                {t('footer.donationsLabel')}{' '}
                {donationEmail && <a href={`mailto:${donationEmail}`}>{donationEmail}</a>}
                {donationEmail && donationPhone && ' · '}
                {donationPhone && <a href={`tel:${donationPhoneHref}`}>{donationPhone}</a>}
              </span>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
