import { useState, type CSSProperties } from 'react';
import {
  DEFAULT_COLOR_ALTERNATIVES,
  OPACITY_PERCENT,
  OPACITY_STEPS,
  PALETTE_HIGH_CONTRAST,
  PALETTE_LOW_CONTRAST,
  type Calibration,
  type GameplaySettings,
} from '@/engine/dichoptic';
import { useI18n } from '@/i18n';
import { Modal } from './Modal';

/**
 * Which sections of the panel a given caller's rendering actually respects.
 * Not every game/exercise honors every dichoptic setting (see the per-game
 * comments in `games/registry.ts`); showing a control with no visible effect
 * just teaches players to distrust the settings screen, so callers opt out of
 * whichever sections are dead for them. Everything defaults to visible — the
 * background slider and palette switcher aren't listed here because every
 * caller respects those.
 */
export interface SettingsCapabilities {
  /** Cyan/red fine-calibration sliders. */
  eyeCalibration?: boolean;
  /** Per-eye contrast (opacity) buttons. */
  contrast?: boolean;
  /** Fill/variant pills (dot shape: filled/hollow/hollow-line). */
  fill?: boolean;
}

interface Props {
  open: boolean;
  /** Device-local screen calibration (never synced) — backs the palette/lightness section only. */
  calibration: Calibration;
  /** Account-level gameplay config (synced) — backs fill/contrast/eyes. */
  gameplaySettings: GameplaySettings;
  /** Defaults every section to visible; pass overrides for sections this caller's rendering doesn't respect. */
  capabilities?: SettingsCapabilities;
  onApplyCalibration: (next: Partial<Calibration>) => void;
  onApplyGameplay: (next: Partial<GameplaySettings>) => void;
  onClose: () => void;
}

const VARIANT_ICON: Record<string, string> = {
  filled: '●',
  hollow: '◍',
  hollowLine: '◆',
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
 * Fixed hue/saturation/default-lightness per palette/slot, taken from the
 * canonical defaults. The sliders only ever vary lightness (see module doc
 * comment above), so hue/sat must come from a stable reference rather than
 * the live stored hex: at the lightness extremes (0 or 100) a colour turns
 * black/white, which is achromatic (hue/sat undefined) — re-deriving hue/sat
 * from that hex on the next drag would silently and irrecoverably flatten
 * the colour to grey.
 */
const REFERENCE_HSL: [number, number, number][][] = DEFAULT_COLOR_ALTERNATIVES.map((palette) =>
  palette.map((hex) => hexToHsl(hex)),
);

/**
 * Calibration is meant to be a fine trim, not a repaint: cap how far each
 * slider can move a colour's lightness away from its default, so it can
 * never wander into a washed-out near-black/near-white extreme.
 */
const MAX_LIGHTNESS_DEVIATION = 20;

function lightnessRange(activeIdx: number, slot: 0 | 1 | 2): { min: number; max: number } {
  const defaultL = REFERENCE_HSL[activeIdx][slot][2];
  return {
    min: Math.max(0, defaultL - MAX_LIGHTNESS_DEVIATION),
    max: Math.min(100, defaultL + MAX_LIGHTNESS_DEVIATION),
  };
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
export function SettingsPanel({ open, calibration, gameplaySettings, capabilities = {}, onApplyCalibration, onApplyGameplay, onClose }: Props) {
  const { eyeCalibration = true, contrast = true, fill = true } = capabilities;
  const { t } = useI18n();
  const [draftGameplay, setDraftGameplay] = useState<GameplaySettings>(gameplaySettings);
  const [colorAlternatives, setColorAlternatives] = useState<string[][]>(calibration.colorAlternatives);
  const [activeIdx, setActiveIdx] = useState(PALETTE_HIGH_CONTRAST);
  const [bgL, setBgL] = useState(0);
  const [cyanL, setCyanL] = useState(0);
  const [redL, setRedL] = useState(0);

  const clampToSlotRange = (idx: number, slot: 0 | 1 | 2, l: number): number => {
    const { min, max } = lightnessRange(idx, slot);
    return Math.min(max, Math.max(min, l));
  };

  const selectPalette = (idx: number, source: string[][]) => {
    setActiveIdx(idx);
    setBgL(clampToSlotRange(idx, 0, hexToHsl(source[idx][0])[2]));
    setCyanL(clampToSlotRange(idx, 1, hexToHsl(source[idx][1])[2]));
    setRedL(clampToSlotRange(idx, 2, hexToHsl(source[idx][2])[2]));
  };

  // Re-sync whenever the panel is (re)opened.
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setDraftGameplay(gameplaySettings);
    setColorAlternatives(calibration.colorAlternatives);
    const idx =
      calibration.color[0].toUpperCase() === calibration.colorAlternatives[PALETTE_LOW_CONTRAST][0].toUpperCase()
        ? PALETTE_LOW_CONTRAST
        : PALETTE_HIGH_CONTRAST;
    selectPalette(idx, calibration.colorAlternatives);
    setSeenOpen(true);
  } else if (!open && seenOpen) {
    setSeenOpen(false);
  }

  const update = (patch: Partial<GameplaySettings>) => setDraftGameplay((d) => ({ ...d, ...patch }));
  const setOpacity = (idx: number, byte: string) => {
    const opacity = [...draftGameplay.opacity];
    opacity[idx] = byte;
    update({ opacity });
  };

  const setSlot = (slot: 0 | 1 | 2, l: number) => {
    const [h, s] = REFERENCE_HSL[activeIdx][slot];
    const next = colorAlternatives.map((c) => [...c]);
    next[activeIdx][slot] = hslToHex(h, s, l);
    setColorAlternatives(next);
  };

  const apply = () => {
    const color = [...colorAlternatives[activeIdx]];
    onApplyCalibration({ color, colorAlternatives });
    onApplyGameplay({ opacity: draftGameplay.opacity, variant: draftGameplay.variant, cyanEye: draftGameplay.cyanEye });
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
          <div className="palette-cards">
            {colorAlternatives.map((colors, i) => {
              const cyanFirst = draftGameplay.cyanEye === 'left';
              const dots = [
                { color: colors[1], opacity: draftGameplay.opacity[1], order: cyanFirst ? 1 : 2 },
                { color: colors[2], opacity: draftGameplay.opacity[2], order: cyanFirst ? 2 : 1 },
              ];
              return (
                <button
                  key={i}
                  className={`palette-card ${activeIdx === i ? 'is-selected' : ''}`}
                  style={{ background: colors[0] }}
                  onClick={() => selectPalette(i, colorAlternatives)}
                  aria-label={`palette ${i + 1}`}
                >
                  {dots.map((dot, j) => (
                    <span
                      key={j}
                      className={`palette-card__dot palette-card__dot--${draftGameplay.variant}`}
                      style={{ order: dot.order, '--dot-color': `${dot.color}${dot.opacity}` } as CSSProperties}
                    />
                  ))}
                </button>
              );
            })}
          </div>

          {eyeCalibration && (
            <label className="calib__row">
              <span>{t('calib.cyan')}</span>
              <input
                type="range"
                min={lightnessRange(activeIdx, 1).min}
                max={lightnessRange(activeIdx, 1).max}
                value={cyanL}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setCyanL(v);
                  setSlot(1, v);
                }}
              />
            </label>
          )}
          {eyeCalibration && (
            <label className="calib__row">
              <span>{t('calib.red')}</span>
              <input
                type="range"
                min={lightnessRange(activeIdx, 2).min}
                max={lightnessRange(activeIdx, 2).max}
                value={redL}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRedL(v);
                  setSlot(2, v);
                }}
              />
            </label>
          )}
          <label className="calib__row">
            <span>{t('calib.background')}</span>
            <input
              type="range"
              min={lightnessRange(activeIdx, 0).min}
              max={lightnessRange(activeIdx, 0).max}
              value={bgL}
              onChange={(e) => {
                const v = Number(e.target.value);
                setBgL(v);
                setSlot(0, v);
              }}
            />
          </label>
        </section>

        {fill && (
          <section>
            <h3>{t('settings.fill')}</h3>
            <div className="settings__row">
              {gameplaySettings.variantAlternatives.map((v) => (
                <button key={v} className={`pill ${draftGameplay.variant === v ? 'is-selected' : ''}`} onClick={() => update({ variant: v })}>
                  <span className="pill__icon">{VARIANT_ICON[v]}</span>
                  {t(`variant.${v}`)}
                </button>
              ))}
            </div>
          </section>
        )}

        {contrast && (
          <section>
            <h3>{t('settings.contrast')}</h3>
            <div className="settings__row settings__row--contrast">
              {OPACITY_STEPS.map((byte) => (
                <button
                  key={byte}
                  className={`contrast ${draftGameplay.opacity[1] === byte ? 'is-selected' : ''}`}
                  onClick={() => setOpacity(1, byte)}
                >
                  <span className="contrast__swatch" style={{ background: `#00FFFF${byte}` }} />
                  {OPACITY_PERCENT[byte]}%
                </button>
              ))}
            </div>
            <div className="settings__row settings__row--contrast">
              {OPACITY_STEPS.map((byte) => (
                <button
                  key={byte}
                  className={`contrast ${draftGameplay.opacity[2] === byte ? 'is-selected' : ''}`}
                  onClick={() => setOpacity(2, byte)}
                >
                  <span className="contrast__swatch" style={{ background: `#FF0000${byte}` }} />
                  {OPACITY_PERCENT[byte]}%
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}

export { percentToByte };
