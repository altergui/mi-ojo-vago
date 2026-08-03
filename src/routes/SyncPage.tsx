import { useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import { useSyncMeta } from '@/sync/useSyncState';
import { enableSync, linkDevice, disconnectSync } from '@/sync/engine';
import { canonicalToWords } from '@/sync/code';
import { renderQrSvg } from '@/sync/qr';

export function SyncPage() {
  const { t, lang } = useI18n();
  const meta = useSyncMeta();

  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [linkError, setLinkError] = useState<'sync.invalidCode' | 'sync.linkError' | null>(null);
  const [copied, setCopied] = useState(false);

  const words = meta.code ? canonicalToWords(meta.code, lang) : '';
  const qrSvg = useMemo(() => (meta.code ? renderQrSvg(meta.code) : ''), [meta.code]);

  const handleEnable = async () => {
    setBusy(true);
    try {
      await enableSync();
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async () => {
    setBusy(true);
    setLinkError(null);
    try {
      const result = await linkDevice(codeInput);
      if (!result.ok) setLinkError(result.error === 'invalid_code' ? 'sync.invalidCode' : 'sync.linkError');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(words);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDisconnect = () => {
    if (confirm(t('sync.disconnectConfirm'))) disconnectSync();
  };

  const dateFmt = (iso: string) => new Date(iso).toLocaleString(lang === 'es' ? 'es-AR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="stats sync">
      <h1>{t('sync.title')}</h1>

      {!meta.enabled && (
        <>
          <section className="stats__block">
            <p>{t('sync.disabledIntro')}</p>
            <button className="btn btn--primary" onClick={() => void handleEnable()} disabled={busy}>
              {busy ? t('sync.enabling') : t('sync.enable')}
            </button>
          </section>

          <section className="stats__block">
            <h2>{t('sync.haveCode')}</h2>
            <div className="sync__linkRow">
              <input
                type="text"
                className="sync__input"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder={t('sync.codePlaceholder')}
              />
              <button className="btn btn--primary" onClick={() => void handleLink()} disabled={busy || !codeInput.trim()}>
                {busy ? t('sync.linking') : t('sync.link')}
              </button>
            </div>
            {linkError && <p className="sync__error">{t(linkError)}</p>}
          </section>
        </>
      )}

      {meta.enabled && meta.code && (
        <section className="stats__block sync__code-block">
          <h2>{t('sync.yourCode')}</h2>
          <div className="sync__code">{words}</div>
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
    </div>
  );
}
