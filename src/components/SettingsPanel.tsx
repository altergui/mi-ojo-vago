import { useState } from 'react';
import {
  OPACITY_PERCENT,
  OPACITY_STEPS,
  PALETTE_HIGH_CONTRAST,
  PALETTE_LOW_CONTRAST,
  type DichopticSettings,
} from '@/engine/dichoptic';
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

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
const byteOf = (s: string, start: number) => parseInt(s.substring(start, start + 2), 16) || 0;

/**
 * Game settings + colour calibration in one panel (extending the original
 * showCalibration, game.ts:1471+). The app has exactly two palettes (see
 * dichoptic.ts): PALETTE_HIGH_CONTRAST (white bg, cyan/red eyes) and
 * PALETTE_LOW_CONTRAST (violet bg, fixed navy/maroon eyes). Both backgrounds
 * and the high-contrast palette's cyan/red are calibratable via sliders
 * right under the palette swatches, so picking a palette and fine-tuning it
 * happen in the same place; navy/maroon are fixed. Calibrating updates both
 * colorAlternatives entries (so switching palettes doesn't lose either
 * one's calibration) plus whichever is currently selected.
 */
export function SettingsPanel({ open, settings, onApply, onClose }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<DichopticSettings>(settings);
  const [activeIdx, setActiveIdx] = useState(PALETTE_HIGH_CONTRAST);

  const [white, setWhiteByte] = useState(0);
  const [violet, setVioletByte] = useState(0);
  const [cyan, setCyanByte] = useState(0);
  const [red, setRedByte] = useState(0);

  // Re-sync draft whenever the panel is (re)opened.
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setDraft(settings);
    setActiveIdx(settings.color[0].toUpperCase() === settings.colorAlternatives[PALETTE_LOW_CONTRAST][0].toUpperCase() ? PALETTE_LOW_CONTRAST : PALETTE_HIGH_CONTRAST);
    setWhiteByte(byteOf(settings.colorAlternatives[PALETTE_HIGH_CONTRAST][0], 1));
    setVioletByte(byteOf(settings.colorAlternatives[PALETTE_LOW_CONTRAST][0], 1));
    setCyanByte(byteOf(settings.colorAlternatives[PALETTE_HIGH_CONTRAST][1], 5));
    setRedByte(byteOf(settings.colorAlternatives[PALETTE_HIGH_CONTRAST][2], 3));
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

  const whiteColor = `#${hex2(white)}${hex2(white)}${hex2(white)}`;
  const violetColor = `#${hex2(violet)}00${hex2(violet)}`;
  const cyanColor = `#00FF${hex2(cyan)}`;
  const redColor = `#FF${hex2(red)}00`;

  const colorAlternatives = draft.colorAlternatives.map((c) => [...c]);
  colorAlternatives[PALETTE_HIGH_CONTRAST] = [whiteColor, cyanColor, redColor, colorAlternatives[PALETTE_HIGH_CONTRAST][3]];
  colorAlternatives[PALETTE_LOW_CONTRAST][0] = violetColor;

  const apply = () => {
    const color = [...colorAlternatives[activeIdx]];
    onApply({ color, colorAlternatives, opacity: draft.opacity, variant: draft.variant, cyanEye: draft.cyanEye });
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
            {colorAlternatives.map((colors, i) => (
              <button
                key={i}
                className={`swatch swatch--lg ${activeIdx === i ? 'is-selected' : ''}`}
                style={{ background: colors[0] }}
                onClick={() => setActiveIdx(i)}
                aria-label={`palette ${i + 1}`}
              >
                <span style={{ background: colors[1] }} />
                <span style={{ background: colors[2] }} />
              </button>
            ))}
          </div>

          <label className="calib__row">
            <span>{t('calib.cyan')}</span>
            <input type="range" min={208} max={255} value={cyan} onChange={(e) => setCyanByte(Number(e.target.value))} />
          </label>
          <label className="calib__row">
            <span>{t('calib.red')}</span>
            <input type="range" min={0} max={100} value={red} onChange={(e) => setRedByte(Number(e.target.value))} />
          </label>
          <label className="calib__row">
            <span>{t('calib.white')}</span>
            <input type="range" min={224} max={255} value={white} onChange={(e) => setWhiteByte(Number(e.target.value))} />
          </label>
          <label className="calib__row">
            <span>{t('calib.violet')}</span>
            <input type="range" min={40} max={128} value={violet} onChange={(e) => setVioletByte(Number(e.target.value))} />
          </label>
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
