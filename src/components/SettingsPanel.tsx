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

/** Hex -> [hue 0-360, saturation 0-100, lightness 0-100]. */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s * 100, l * 100];
}

/** [hue 0-360, saturation 0-100, lightness 0-100] -> hex. */
function hslToHex(h: number, s: number, l: number): string {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Game settings + colour calibration in one panel. The app has exactly two
 * palettes (see dichoptic.ts): PALETTE_HIGH_CONTRAST (white bg, cyan/red
 * eyes) and PALETTE_LOW_CONTRAST (violet bg, navy/maroon eyes). Selecting a
 * palette swatch also targets it for calibration — the 3 sliders below
 * (background/cyan/red) edit only that palette, leaving the other alone.
 * Each slider keeps its colour's hue/saturation fixed and only varies
 * lightness, which is why the same 3 sliders work for either palette (e.g.
 * "red" spans anywhere from maroon to full red) without separate controls
 * per palette.
 */
export function SettingsPanel({ open, settings, onApply, onClose }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<DichopticSettings>(settings);
  const [colorAlternatives, setColorAlternatives] = useState<string[][]>(settings.colorAlternatives);
  const [activeIdx, setActiveIdx] = useState(PALETTE_HIGH_CONTRAST);
  const [bgL, setBgL] = useState(0);
  const [cyanL, setCyanL] = useState(0);
  const [redL, setRedL] = useState(0);

  const selectPalette = (idx: number, source: string[][]) => {
    setActiveIdx(idx);
    setBgL(hexToHsl(source[idx][0])[2]);
    setCyanL(hexToHsl(source[idx][1])[2]);
    setRedL(hexToHsl(source[idx][2])[2]);
  };

  // Re-sync whenever the panel is (re)opened.
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setDraft(settings);
    setColorAlternatives(settings.colorAlternatives);
    const idx =
      settings.color[0].toUpperCase() === settings.colorAlternatives[PALETTE_LOW_CONTRAST][0].toUpperCase() ? PALETTE_LOW_CONTRAST : PALETTE_HIGH_CONTRAST;
    selectPalette(idx, settings.colorAlternatives);
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

  const setSlot = (slot: 0 | 1 | 2, l: number) => {
    const [h, s] = hexToHsl(colorAlternatives[activeIdx][slot]);
    const next = colorAlternatives.map((c) => [...c]);
    next[activeIdx][slot] = hslToHex(h, s, l);
    setColorAlternatives(next);
  };

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
                onClick={() => selectPalette(i, colorAlternatives)}
                aria-label={`palette ${i + 1}`}
              >
                <span style={{ background: colors[1] }} />
                <span style={{ background: colors[2] }} />
              </button>
            ))}
          </div>

          <label className="calib__row">
            <span>{t('calib.cyan')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={cyanL}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCyanL(v);
                setSlot(1, v);
              }}
            />
          </label>
          <label className="calib__row">
            <span>{t('calib.red')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={redL}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRedL(v);
                setSlot(2, v);
              }}
            />
          </label>
          <label className="calib__row">
            <span>{t('calib.background')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={bgL}
              onChange={(e) => {
                const v = Number(e.target.value);
                setBgL(v);
                setSlot(0, v);
              }}
            />
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
