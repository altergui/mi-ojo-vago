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
 * Unified across the whole app (not per-original-game) into exactly two
 * palettes — not just two backgrounds sharing one eye-colour pair, but two
 * fully separate schemes:
 *  - PALETTE_HIGH_CONTRAST: white background + true cyan/red eye colours
 *    (bright saturated colour on white — the highest contrast).
 *  - PALETTE_LOW_CONTRAST: violet background + navy/maroon eye colours
 *    (muted dark colour on a dark background — subtler, lower contrast).
 * Selecting a palette in SettingsPanel also targets it for calibration: 3
 * sliders (background/cyan/red) edit only the currently selected palette's
 * own colours (lightness only, hue/saturation fixed), leaving the other
 * palette untouched.
 */

export type PointVariant = 'filled' | 'hollow' | 'hollowLine';

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
  /**
   * Has the patient explicitly confirmed which eye wears the red lens?
   * Gates Orthoptics' one-time first-run prompt (see OrthopticsExercise) —
   * false (the default, including for every pre-existing settings record)
   * means "ask once, then remember."
   */
  redEyeConfigured: boolean;
}

/**
 * The screen-color-calibration slice of DichopticSettings: bound to *this
 * device* (localStorage, never synced), since it's a property of a specific
 * screen's color rendering, not of a person's therapy progression. Survives
 * register/login/logout — only an explicit recalibration changes it.
 */
export type Calibration = Pick<DichopticSettings, 'colorAlternatives' | 'color'>;

/**
 * Everything else: the account-level, cross-device-synced slice of
 * DichopticSettings — a person's therapy progression (contrast, difficulty,
 * eye assignment), which should follow them from device to device.
 */
export type GameplaySettings = Omit<DichopticSettings, 'colorAlternatives' | 'color'>;

export function composeDichopticSettings(calibration: Calibration, gameplay: GameplaySettings): DichopticSettings {
  return { ...calibration, ...gameplay };
}

/** Index of the high-contrast palette (white bg, true cyan/red eyes) within colorAlternatives. */
export const PALETTE_HIGH_CONTRAST = 0;
/** Index of the low-contrast palette (violet bg, navy/maroon eyes) within colorAlternatives. */
export const PALETTE_LOW_CONTRAST = 1;

export const DEFAULT_COLOR_ALTERNATIVES: string[][] = [
  ['#FFFFFF', '#00ffff', '#ff0000', '#969696'],
  ['#800080', '#04007d', '#800000', '#969696'],
];

export const OPACITY_STEPS = ['FF', 'CC', '99', '66', '33'] as const;
export const OPACITY_PERCENT: Record<string, number> = {
  FF: 100,
  CC: 80,
  '99': 60,
  '66': 40,
  '33': 20,
};

export function defaultCalibration(): Calibration {
  return {
    colorAlternatives: DEFAULT_COLOR_ALTERNATIVES.map((c) => [...c]),
    color: [...DEFAULT_COLOR_ALTERNATIVES[0]],
  };
}

export function defaultGameplaySettings(): GameplaySettings {
  return {
    opacity: ['FF', 'FF', 'FF', 'FF'],
    variantAlternatives: ['filled', 'hollow', 'hollowLine'],
    variant: 'filled',
    cyanEye: 'left',
    redEyeConfigured: false,
  };
}

export function defaultDichopticSettings(): DichopticSettings {
  return composeDichopticSettings(defaultCalibration(), defaultGameplaySettings());
}

/** Opacity byte -> percentage (100 if unknown). */
export function opacityToPercent(byte: string): number {
  return OPACITY_PERCENT[byte] ?? 100;
}

/** Eye that wears the red lens, derived from cyanEye. */
export function redEye(settings: Pick<DichopticSettings, 'cyanEye'>): Eye {
  return settings.cyanEye === 'left' ? 'right' : 'left';
}
