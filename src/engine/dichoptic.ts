/**
 * Dichoptic (anaglyph red/cyan) colour + contrast model.
 *
 * A colour alternative is a 4-tuple: [background, cyan/left-eye, red/right-eye, grey].
 * `opacity` is a per-colour hex byte ("FF" = 100%, "33" = 20%) appended to the
 * colour to dim what one eye sees — this is the therapeutic "contrast" control.
 *
 * The therapy idea: through red/cyan glasses each eye perceives only the pieces
 * drawn in its lens colour. Lowering one colour's opacity reduces contrast for
 * that eye, forcing the other (typically the amblyopic) eye to do the work.
 *
 * Unified across the whole app (not per-original-game): the only two
 * backgrounds are pure violet (#800080) and white (#FFFFFF), always paired
 * with true cyan/red (#00ffff/#ff0000). The various original per-game
 * defaults (navy/maroon obstacle schemes, the #81007f/#04007d "alternate"
 * palette, etc.) were inconsistent with each other and are not preserved —
 * users calibrate their own violet/white/cyan/red via CalibrationPanel
 * instead of relying on a fixed "faithful" alternate.
 */

export type PointVariant = 'fullColor' | 'highContrast' | 'veryHighContrast';

/** Index meaning inside a colour alternative / opacity tuple. */
export const COLOR_INDEX = {
  background: 0,
  cyan: 1, // left eye by convention
  red: 2, // right eye by convention
  grey: 3, // settled / stacked pieces
} as const;

/** Which physical eye a lens colour sits over. Configurable per patient. */
export type Eye = 'left' | 'right';

export interface DichopticSettings {
  /** Selectable [bg, cyan, red, grey] palettes (calibration presets live here). */
  colorAlternatives: string[][];
  /** Active palette (one of colorAlternatives, possibly calibrated). */
  color: string[];
  /** Per-colour opacity byte as hex string, e.g. "FF" | "CC" | "99" | "66" | "33". */
  opacity: string[];
  /** Difficulty variants available. */
  variantAlternatives: PointVariant[];
  /** Active difficulty variant. */
  variant: PointVariant;
  /** Which eye wears the cyan lens (the other wears red). Default: left. */
  cyanEye: Eye;
}

/** The two supported backgrounds (violet default, white alternative), both paired with true cyan/red. */
export const DEFAULT_COLOR_ALTERNATIVES: string[][] = [
  ['#800080', '#00ffff', '#ff0000', '#969696'],
  ['#FFFFFF', '#00ffff', '#ff0000', '#969696'],
];

export const OPACITY_STEPS = ['FF', 'CC', '99', '66', '33'] as const;
export const OPACITY_PERCENT: Record<string, number> = {
  FF: 100,
  CC: 80,
  '99': 60,
  '66': 40,
  '33': 20,
};

export function defaultDichopticSettings(): DichopticSettings {
  return {
    colorAlternatives: DEFAULT_COLOR_ALTERNATIVES.map((c) => [...c]),
    color: [...DEFAULT_COLOR_ALTERNATIVES[0]],
    opacity: ['FF', 'FF', 'FF', 'FF'],
    variantAlternatives: ['fullColor', 'highContrast', 'veryHighContrast'],
    variant: 'fullColor',
    cyanEye: 'left',
  };
}

/** Opacity byte -> percentage (100 if unknown). */
export function opacityToPercent(byte: string): number {
  return OPACITY_PERCENT[byte] ?? 100;
}

/** Eye that wears the red lens, derived from cyanEye. */
export function redEye(settings: Pick<DichopticSettings, 'cyanEye'>): Eye {
  return settings.cyanEye === 'left' ? 'right' : 'left';
}
