import { useState, type CSSProperties } from 'react';
import { asset } from '@/assets';
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
  /**
   * The "which eye has the red lens" control (and the preview's left/right
   * eye ordering that follows it). Only meaningful for Orthoptics — the 4
   * games always draw cyan/red as fixed roles regardless of this setting, so
   * showing a swap control there would visibly do nothing.
   */
  eyeSwap?: boolean;
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
 * Game settings + colour calibration in one panel, built around a single
 * full-width preview of the selected palette rather than a stack of separate
 * sections: the preview paints the real background and the real eye colours
 * at their real opacities, and every control floats on top of it the way a
 * map's controls float over the map.
 *
 * The app has exactly two palettes (see dichoptic.ts):
 * PALETTE_HIGH_CONTRAST (white bg, cyan/red eyes) and PALETTE_LOW_CONTRAST
 * (violet bg, navy/maroon eyes). The bottom-left thumbnail switches between
 * them and always shows the one you would switch *to*; switching also targets
 * that palette for calibration — the 3 sliders behind the gear
 * (cyan/red/background) edit only it, leaving the other alone. Each slider
 * keeps its colour's hue/saturation fixed and only varies lightness, which is
 * why the same 3 sliders work for either palette (e.g. "red" spans anywhere
 * from maroon to full red) without separate controls per palette.
 *
 * Per-eye contrast is the value under each square: tapping it opens a
 * dropdown of the opacity steps, each one previewed on the palette's own
 * background so the choice is visible before it is made.
 */
export function SettingsPanel({ open, calibration, gameplaySettings, capabilities = {}, onApplyCalibration, onApplyGameplay, onClose }: Props) {
  const { eyeCalibration = true, contrast = true, fill = true, eyeSwap = false } = capabilities;
  const { t } = useI18n();
  const [draftGameplay, setDraftGameplay] = useState<GameplaySettings>(gameplaySettings);
  const [colorAlternatives, setColorAlternatives] = useState<string[][]>(calibration.colorAlternatives);
  const [activeIdx, setActiveIdx] = useState(PALETTE_HIGH_CONTRAST);
  const [bgL, setBgL] = useState(0);
  const [cyanL, setCyanL] = useState(0);
  const [redL, setRedL] = useState(0);
  /** Which eye's opacity dropdown is open (slot index), or null. */
  const [openMenu, setOpenMenu] = useState<1 | 2 | null>(null);
  /** Whether the gear's calibration popover is open. */
  const [calibOpen, setCalibOpen] = useState(false);
  /** Whether the "?" contrast-help tooltip is open. */
  const [helpOpen, setHelpOpen] = useState(false);

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
    setOpenMenu(null);
    setCalibOpen(false);
    setHelpOpen(false);
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
    onApplyGameplay({
      opacity: draftGameplay.opacity,
      variant: draftGameplay.variant,
      cyanEye: draftGameplay.cyanEye,
      redEyeConfigured: draftGameplay.redEyeConfigured,
    });
    onClose();
  };

  const activeColors = colorAlternatives[activeIdx];
  const otherIdx = (activeIdx + 1) % colorAlternatives.length;
  const otherColors = colorAlternatives[otherIdx];
  /* The dropdown floats on the palette's own background so each step previews
     in situ, which means its text has to follow that background's lightness
     (calibration moves it) rather than the modal's dark surface. */
  const menuInk = hexToHsl(activeColors[0])[2] > 55 ? 'var(--primary-ink)' : 'var(--text)';
  /* Cyan sits over whichever eye wears the cyan lens, so the two squares read
     left-to-right the way the player's own eyes do — but only where the
     setting means anything (Orthoptics); games always get the fixed order,
     since they draw cyan/red as fixed roles regardless of it. */
  const eyeSlots: (1 | 2)[] = eyeSwap ? (draftGameplay.cyanEye === 'left' ? [1, 2] : [2, 1]) : [1, 2];

  const swapPalette = () => {
    setOpenMenu(null);
    setCalibOpen(false);
    selectPalette(otherIdx, colorAlternatives);
  };

  const calibRows: { label: string; slot: 0 | 1 | 2; value: number; set: (l: number) => void }[] = [
    ...(eyeCalibration
      ? ([
          { label: t('calib.cyan'), slot: 1 as const, value: cyanL, set: setCyanL },
          { label: t('calib.red'), slot: 2 as const, value: redL, set: setRedL },
        ])
      : []),
    { label: t('calib.background'), slot: 0 as const, value: bgL, set: setBgL },
  ];

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
        <div className={`preview ${openMenu !== null ? 'has-menu' : ''} ${helpOpen ? 'has-help' : ''}`} style={{ background: activeColors[0] }}>
          <div className="preview__eyes">
            {eyeSlots.map((slot) => (
              <div key={slot} className="preview__eye">
                <span
                  className={`preview__dot preview__dot--${draftGameplay.variant}`}
                  style={{ '--dot-color': `${activeColors[slot]}${draftGameplay.opacity[slot]}` } as CSSProperties}
                />
                {contrast && (
                  <button
                    type="button"
                    className="preview__pct"
                    style={{ color: activeColors[slot] }}
                    onClick={() => {
                      setCalibOpen(false);
                      setHelpOpen(false);
                      setOpenMenu((m) => (m === slot ? null : slot));
                    }}
                    aria-expanded={openMenu === slot}
                  >
                    <span className="preview__pct-value">{OPACITY_PERCENT[draftGameplay.opacity[slot]]}%</span>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {openMenu !== null &&
            (() => {
              const slot = openMenu; // freeze the narrowed value for the closures below
              return (
                <div
                  className="opacity-menu"
                  style={{ background: activeColors[0], color: menuInk }}
                  onClick={() => setOpenMenu(null)}
                >
                  {OPACITY_STEPS.map((byte) => (
                    <button
                      key={byte}
                      type="button"
                      className={`opacity-menu__item ${draftGameplay.opacity[slot] === byte ? 'is-selected' : ''}`}
                      onClick={() => {
                        setOpacity(slot, byte);
                        setOpenMenu(null);
                      }}
                    >
                      <span className="opacity-menu__swatch" style={{ background: `${activeColors[slot]}${byte}` }} />
                      <span className="opacity-menu__pct">{OPACITY_PERCENT[byte]}%</span>
                    </button>
                  ))}
                </div>
              );
            })()}

          {(openMenu !== null || calibOpen || helpOpen) && (
            <button
              type="button"
              className="preview__scrim"
              aria-label={t('shell.cancel')}
              onClick={() => {
                setOpenMenu(null);
                setCalibOpen(false);
                setHelpOpen(false);
              }}
            />
          )}

          {calibOpen && (
            <div className="calib-panel">
              {calibRows.map((row) => (
                <label key={row.slot} className="calib__row">
                  <span>{row.label}</span>
                  <input
                    type="range"
                    min={lightnessRange(activeIdx, row.slot).min}
                    max={lightnessRange(activeIdx, row.slot).max}
                    value={row.value}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      row.set(v);
                      setSlot(row.slot, v);
                    }}
                  />
                </label>
              ))}
            </div>
          )}

          {/* Palette switcher, Google-Maps-style: the thumbnail always shows the
              palette you would get by tapping it, never the one you are on. */}
          <button type="button" className="preview__layers" onClick={swapPalette} aria-label={t(`palette.${otherIdx === PALETTE_LOW_CONTRAST ? 'violet' : 'white'}`)}>
            <span className="preview__layers-tile" style={{ background: otherColors[0] }}>
              {eyeSlots.map((slot) => (
                <span key={slot} className="preview__layers-dot" style={{ background: `${otherColors[slot]}${draftGameplay.opacity[slot]}` }} />
              ))}
              <span className="preview__layers-cap">{t(`palette.${otherIdx === PALETTE_LOW_CONTRAST ? 'violet' : 'white'}`)}</span>
            </span>
          </button>

          <button
            type="button"
            className={`preview__gear ${calibOpen ? 'is-open' : ''}`}
            aria-label={t('settings.calibration')}
            aria-expanded={calibOpen}
            onClick={() => {
              setOpenMenu(null);
              setHelpOpen(false);
              setCalibOpen((c) => !c);
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.9 15.1a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-2.9-1.2l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0-1.2-2.9H3.4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.2-2.9l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 2.9-1.2V3.4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 2.9 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0 1.2 2.9h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1.03z" />
            </svg>
          </button>

          {contrast && (
            <button
              type="button"
              className={`preview__help ${helpOpen ? 'is-open' : ''}`}
              aria-label={t('settings.contrastHelp')}
              aria-expanded={helpOpen}
              onClick={() => {
                setOpenMenu(null);
                setCalibOpen(false);
                setHelpOpen((h) => !h);
              }}
            >
              ?
            </button>
          )}

          {helpOpen && (
            <div className="contrast-help">
              <div className="contrast-help__img-frame">
                <img className="contrast-help__img" src={asset('/help/cover-eye.png')} alt="" />
              </div>
              <p>{t('settings.contrastHelpText')}</p>
            </div>
          )}
        </div>

        {fill && (
          <section>
            <h3>{t('settings.fill')}</h3>
            <div className="settings__row">
              {gameplaySettings.variantAlternatives.map((v) => (
                <button key={v} className={`pill ${draftGameplay.variant === v ? 'is-selected' : ''}`} onClick={() => update({ variant: v })}>
                  <span className={`pill__shape pill__shape--${v}`} />
                  {t(`variant.${v}`)}
                </button>
              ))}
            </div>
          </section>
        )}

        {eyeSwap && (
          <section>
            <h3>{t('settings.redEyeLabel')}</h3>
            <div className="settings__row">
              <button
                className={`pill ${draftGameplay.cyanEye === 'right' ? 'is-selected' : ''}`}
                onClick={() => update({ cyanEye: 'right', redEyeConfigured: true })}
              >
                {t('settings.left')}
              </button>
              <button
                className={`pill ${draftGameplay.cyanEye === 'left' ? 'is-selected' : ''}`}
                onClick={() => update({ cyanEye: 'left', redEyeConfigured: true })}
              >
                {t('settings.right')}
              </button>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}

export { percentToByte };
