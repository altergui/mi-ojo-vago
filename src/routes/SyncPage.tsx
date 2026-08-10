import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useDeviceList, useSyncMeta } from '@/sync/useSyncState';
import { connectSync, disconnectSync } from '@/sync/engine';
import { buildJoinLink, parseJoinLinkParams } from '@/sync/identity';
import { shortDeviceId } from '@/sync/deviceId';
import { renderQrSvg } from '@/sync/qr';

type FormError = 'sync.nameRequired' | 'sync.dobRequired' | 'sync.dobFuture' | 'sync.linkError';

export function SyncPage() {
  const { t, lang } = useI18n();
  const meta = useSyncMeta();
  const devices = useDeviceList();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [busy, setBusy] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [dobInput, setDobInput] = useState('');
  const [formError, setFormError] = useState<FormError | null>(null);
  const [notFoundNotice, setNotFoundNotice] = useState(false);
  const [copied, setCopied] = useState(false);

  // Scanning the QR (or opening a shared sync link) lands here as
  // /sync/join?name=...&dob=... — prefill and connect immediately, same
  // one-step "instantly synced" directness as before. Guarded against
  // StrictMode's double-invoke and against clobbering a device that's
  // already syncing under a different identity (that needs an explicit
  // disconnect first, not a silent switch).
  const attempted = useRef(false);
  useEffect(() => {
    const joinParams = parseJoinLinkParams(searchParams);
    if (!joinParams || meta.enabled || attempted.current) {
      if (joinParams && meta.enabled) navigate('/sync', { replace: true });
      return;
    }
    attempted.current = true;
    setNameInput(joinParams.name);
    setDobInput(joinParams.dob);
    setBusy(true);
    setFormError(null);
    void connectSync(joinParams).then((result) => {
      setBusy(false);
      if (!result.ok) setFormError('sync.linkError');
      else setNotFoundNotice(!result.foundExisting);
      navigate('/sync', { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, meta.enabled]);

  const linkUrl = meta.name && meta.dob ? buildJoinLink({ name: meta.name, dob: meta.dob }) : '';
  const qrSvg = useMemo(() => (linkUrl ? renderQrSvg(linkUrl) : ''), [linkUrl]);

  const handleConnect = async () => {
    const name = nameInput.trim();
    const dob = dobInput.trim();
    if (!name) return setFormError('sync.nameRequired');
    if (!dob) return setFormError('sync.dobRequired');
    if (new Date(dob).getTime() > Date.now()) return setFormError('sync.dobFuture');

    setBusy(true);
    setFormError(null);
    try {
      const result = await connectSync({ name, dob });
      if (!result.ok) setFormError('sync.linkError');
      else setNotFoundNotice(!result.foundExisting);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDisconnect = () => {
    if (confirm(t('sync.disconnectConfirm'))) disconnectSync();
  };

  const dateFmt = (when: string | number) => new Date(when).toLocaleString(lang === 'es' ? 'es-AR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="stats sync">
      <h1>{t('sync.title')}</h1>

      {!meta.enabled && (
        <section className="stats__block">
          <p>{t('sync.disabledIntro')}</p>
          <div className="sync__form">
            <label className="sync__field">
              {t('sync.nameLabel')}
              <input
                type="text"
                className="sync__input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={t('sync.namePlaceholder')}
              />
            </label>
            <label className="sync__field">
              {t('sync.dobLabel')}
              <input type="date" className="sync__input" value={dobInput} onChange={(e) => setDobInput(e.target.value)} />
            </label>
            <button className="btn btn--primary" onClick={() => void handleConnect()} disabled={busy}>
              {busy ? t('sync.connecting') : t('sync.connect')}
            </button>
          </div>
          {formError && <p className="sync__error">{t(formError)}</p>}
        </section>
      )}

      {meta.enabled && meta.secretHash && (
        <section className="stats__block sync__code-block">
          <h2>
            {t('sync.syncedAs')}: {meta.name}
          </h2>
          {notFoundNotice && <p className="sync__notice">{t('sync.notFoundNotice')}</p>}
          <div className="settings__row">
            <button className="btn btn--ghost" onClick={handleCopy}>
              {copied ? t('sync.copied') : t('sync.copy')}
            </button>
          </div>
          <div className="sync__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="muted">{t('sync.scanHint')}</p>
          <p className="muted">
            {t('sync.lastSynced')}: {meta.lastSyncedAt ? dateFmt(meta.lastSyncedAt) : t('sync.never')}
          </p>
          <button className="btn btn--danger" onClick={handleDisconnect}>
            {t('sync.disconnect')}
          </button>
        </section>
      )}

      {meta.enabled && (
        <section className="stats__block">
          <h2>{t('sync.devices')}</h2>
          <table className="sessions">
            <thead>
              <tr>
                <th>{t('stats.deviceId')}</th>
                <th>{t('stats.device')}</th>
                <th>{t('sync.lastSynced')}</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.deviceId}>
                  <td>{shortDeviceId(d.deviceId)}</td>
                  <td>
                    {d.label}
                    {d.isSelf && <span className="tag">{t('sync.thisDevice')}</span>}
                  </td>
                  <td>{d.lastActiveAt ? dateFmt(d.lastActiveAt) : t('sync.never')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
