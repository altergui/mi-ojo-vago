import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { IdentityBadge } from './components/IdentityBadge';
import { asset } from './assets';
import { langFromSearch, useI18n, type Lang } from './i18n';
import { useSyncMeta } from './sync/useSyncState';

const donationEmail = import.meta.env.VITE_DONATION_EMAIL as string | undefined;
const donationPhone = import.meta.env.VITE_DONATION_PHONE as string | undefined;
const donationPhoneHref = donationPhone?.replace(/[^+\d]/g, '');

/** Each language's own name, in itself — never translated. */
const LANG_NAMES: Record<Lang, string> = {
  es: 'Español',
  en: 'English',
};

function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="lang-switcher">
      <button
        type="button"
        className="app__lang"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('nav.langToggle')}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
        {lang.toUpperCase()}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <button type="button" className="lang-switcher__scrim" aria-label={t('shell.close')} onClick={() => setOpen(false)} />
          <div className="lang-switcher__menu" role="menu">
            {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                role="menuitem"
                className={`lang-switcher__item ${lang === l ? 'is-selected' : ''}`}
                onClick={() => {
                  setLang(l);
                  setOpen(false);
                }}
              >
                {LANG_NAMES[l]}
                {lang === l && (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function App() {
  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const meta = useSyncMeta();
  const isImmersive = location.pathname.startsWith('/play/') || location.pathname.startsWith('/exercise/');

  // Legacy deep links redirect here with ?lang=, e.g. #/play/amblyotris?lang=en
  // — honor it once, same as picking the language from the switcher. Without
  // the param, behavior is unchanged (localStorage still decides).
  useEffect(() => {
    const requested = langFromSearch(location.search);
    if (requested && requested !== lang) {
      setLang(requested);
    }
  }, [location.search, lang, setLang]);

  return (
    <div className="app" data-immersive={isImmersive}>
      <header className="app__header" data-immersive={isImmersive}>
        <Link to="/" className="app__brand">
          <img className="app__logo" src={asset('/brand/logo.png')} alt={t('app.title')} />
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
          <LanguageSwitcher />
        </nav>
      </header>
      <main className="app__main">
        <Outlet />
      </main>
      {!isImmersive && (
        <footer className="site-footer">
          <div className="site-footer__inner">
            <span>
              {t('footer.copyright')} · <span className="site-footer__version">{__APP_VERSION__}</span>
            </span>
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
