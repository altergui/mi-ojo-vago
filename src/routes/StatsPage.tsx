import { Link } from 'react-router-dom';
import { StatsDashboard } from '@/components/StatsDashboard';
import { useI18n } from '@/i18n';
import { useSyncMeta } from '@/sync/useSyncState';

export function StatsPage() {
  const { t } = useI18n();
  const meta = useSyncMeta();

  if (!meta.enabled) {
    return (
      <div className="stats">
        <h1>{t('stats.title')}</h1>
        <p>{t('stats.loginRequired')}</p>
        <Link className="btn btn--primary" to="/sync">
          {t('sync.connect')}
        </Link>
      </div>
    );
  }

  return <StatsDashboard />;
}
