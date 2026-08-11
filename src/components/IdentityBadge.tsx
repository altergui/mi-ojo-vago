import { NavLink } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useSyncMeta } from '@/sync/useSyncState';

/**
 * The persistent top-right login/identity indicator, shown on every screen
 * (including in-game): "Login" when logged out, or the person's name when
 * logged in — so "logged in" is always visually verifiable as "I can see my
 * name up there", never a hidden/ambiguous state. Always links to /sync,
 * which doubles as the login form and the account/logout management page.
 */
export function IdentityBadge() {
  const { t } = useI18n();
  const meta = useSyncMeta();
  return (
    <NavLink to="/sync" className="identity-badge">
      {meta.enabled && meta.name ? meta.name : t('sync.connect')}
    </NavLink>
  );
}
