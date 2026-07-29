import { useState } from 'react';
import { OPACITY_PERCENT, OPACITY_STEPS, type DichopticSettings } from '@/engine/dichoptic';
import { useI18n } from '@/i18n';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  settings: DichopticSettings;
  onApply: (next: Partial<DichopticSettings>) => void;
  onClose: () => void;
}

const VARIANT_LABEL: Record<string, string> = {
  fullColor: '●',
  highContrast: '◍',
  veryHighContrast: '◆',
};

function percentToByte(pct: number): string {
  const entry = Object.entries(OPACITY_PERCENT).find(([, p]) => p === pct);
  return entry ? entry[0] : 'FF';
}

export function SettingsPanel({ open, settings, onApply, onClose }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<DichopticSettings>(settings);

  // Re-sync draft whenever the panel is (re)opened.
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setDraft(settings);
    setSeenOpen(true);
  } else if (!open && seenOpen) {
    setSeenOpen(false);
  }

  const update = (patch: Partial<DichopticSettings>) => setDraft((d) => ({ ...d, ...patch }));
  const setOpacity = (idx: number, byte: string) => {
    const opacity = [...draft.opacity];
    opacity[idx] = byte;
    update({ opacity });
  };

  const apply = () => {
    onApply({ color: draft.color, opacity: draft.opacity, variant: draft.variant, cyanEye: draft.cyanEye });
    onClose();
  };

  return (
    <Modal
      open={open}
      title={t('settings.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            {t('shell.cancel')}
          </button>
          <button className="btn btn--primary" onClick={apply}>
            {t('shell.accept')}
          </button>
        </>
      }
    >
      <div className="settings">
        <section>
          <h3>{t('settings.palette')}</h3>
          <div className="settings__row">
            {settings.colorAlternatives.map((colors, i) => {
              const selected = draft.color[0].toUpperCase() === colors[0].toUpperCase();
              return (
                <button
                  key={i}
                  className={`swatch ${selected ? 'is-selected' : ''}`}
                  style={{ background: colors[0] }}
                  onClick={() => update({ color: [...colors] })}
                  aria-label={`palette ${i + 1}`}
                >
                  <span style={{ background: colors[1] }} />
                  <span style={{ background: colors[2] }} />
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3>{t('settings.difficulty')}</h3>
          <div className="settings__row">
            {settings.variantAlternatives.map((v) => (
              <button key={v} className={`pill ${draft.variant === v ? 'is-selected' : ''}`} onClick={() => update({ variant: v })}>
                <span className="pill__icon">{VARIANT_LABEL[v]}</span>
                {v}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>{t('settings.contrastCyan')}</h3>
          <div className="settings__row">
            {OPACITY_STEPS.map((byte) => (
              <button
                key={byte}
                className={`contrast ${draft.opacity[1] === byte ? 'is-selected' : ''}`}
                onClick={() => setOpacity(1, byte)}
              >
                <span className="contrast__swatch" style={{ background: `#00FFFF${byte}` }} />
                {OPACITY_PERCENT[byte]}%
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>{t('settings.contrastRed')}</h3>
          <div className="settings__row">
            {OPACITY_STEPS.map((byte) => (
              <button
                key={byte}
                className={`contrast ${draft.opacity[2] === byte ? 'is-selected' : ''}`}
                onClick={() => setOpacity(2, byte)}
              >
                <span className="contrast__swatch" style={{ background: `#FF0000${byte}` }} />
                {OPACITY_PERCENT[byte]}%
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>{t('settings.eyes')}</h3>
          <div className="settings__row">
            <button className={`pill ${draft.cyanEye === 'left' ? 'is-selected' : ''}`} onClick={() => update({ cyanEye: 'left' })}>
              {t('settings.left')}
            </button>
            <button className={`pill ${draft.cyanEye === 'right' ? 'is-selected' : ''}`} onClick={() => update({ cyanEye: 'right' })}>
              {t('settings.right')}
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

export { percentToByte };
