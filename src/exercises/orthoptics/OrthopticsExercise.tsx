/**
 * Orthoptics — vergence/fusion training exercise.
 *
 * Ported from FUENTES/orthoptics/js/opcion.js. Not a scored game: two
 * pre-tinted (red/cyan) stimulus images are nudged apart/together with
 * arrow keys or on-screen buttons to train fusion, with a live diopter
 * readout. Uses discrete React state rather than the imperative
 * CanvasLayers/rAF engine the games use — there's no animation loop here.
 *
 * Coordinate system: the original tracked absolute `offsetLeft`/`offsetTop`
 * against a one-time-captured DOM baseline (`fin`/`fim`). This port instead
 * tracks a signed pixel delta from center (`offsetX`/`offsetY`), which is
 * resolution-independent and avoids needing that DOM-measurement dance —
 * same "re-base to relative coordinates" adaptation this app already makes
 * for the canvas games (see AmblyonoidGame's normalised 0..1 board space).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { saveCalibration } from '@/calibration/store';
import { IdentityBadge } from '@/components/IdentityBadge';
import { Modal } from '@/components/Modal';
import { SettingsPanel } from '@/components/SettingsPanel';
import { COLOR_INDEX, opacityToPercent, type Calibration, type GameplaySettings } from '@/engine/dichoptic';
import { useI18n } from '@/i18n';
import { useDichopticSettings } from '@/settings/composed';
import { saveGameplaySettings } from '@/settings/store';
import { scheduleSync } from '@/sync/engine';
import { loadOrthopticsPrefs, saveOrthopticsPrefs, type OrthopticsPrefs } from './store';

/** Below this width the exercise is unusable (fine pointer + precise fusion needed) — block with a modal instead. */
const MOBILE_BREAKPOINT = 768;

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

const BASE = '/assets/orthoptics';

interface StimulusDef {
  id: number;
  labelEs: string;
  labelEn: string;
  red: string;
  cyan: string;
}

const STIMULI: StimulusDef[] = [
  { id: 1, labelEs: 'Círculo', labelEn: 'Circle', red: 'cirR.png', cyan: 'cirA.png' },
  { id: 2, labelEs: '1ª fusión [cara]', labelEn: '1st fusion [face]', red: 'cirR.png', cyan: 'face.png' },
  { id: 3, labelEs: 'Sol', labelEn: 'Sun', red: 'solR.png', cyan: 'solA.png' },
  { id: 4, labelEs: '2ª fusión [cruz]', labelEn: '2nd fusion [cross]', red: 'crossR.png', cyan: 'crossA.png' },
  { id: 5, labelEs: 'Casa', labelEn: 'House', red: 'houseR.png', cyan: 'houseA.png' },
  { id: 6, labelEs: 'Auto', labelEn: 'Car', red: 'carR.png', cyan: 'carA.png' },
  { id: 7, labelEs: 'Estéreo', labelEn: 'Stereo', red: 'stereoR.png', cyan: 'stereoA.png' },
];

const PIXEL = 0.66;

/** Mutable ratchet bookkeeping — mirrors the original's finder/finizq/x1/x2/contar/kontar/y2/y3. */
interface Limits {
  finder: number;
  finizq: number;
  x1: number;
  x2: number;
  contar: number;
  kontar: number;
  y2: number;
  y3: number;
}

function freshLimits(lateral: number, arriba: number): Limits {
  return { finder: 0, finizq: 0, x1: lateral, x2: lateral, contar: 0, kontar: 0, y2: arriba, y3: arriba };
}

export function OrthopticsExercise() {
  const { lang } = useI18n();
  const es = lang === 'es';
  const isMobile = useIsMobile();

  const [prefs, setPrefs] = useState<OrthopticsPrefs>(() => loadOrthopticsPrefs());
  const settings = useDichopticSettings();
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [puntoA, setPuntoA] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const handleApplyCalibration = (patch: Partial<Calibration>) => {
    saveCalibration({ colorAlternatives: settings.colorAlternatives, color: settings.color, ...patch });
    // No scheduleSync() here — calibration is device-local and must never sync.
  };

  const handleApplyGameplay = (patch: Partial<GameplaySettings>) => {
    saveGameplaySettings({
      opacity: settings.opacity,
      variantAlternatives: settings.variantAlternatives,
      variant: settings.variant,
      cyanEye: settings.cyanEye,
      ...patch,
    });
    scheduleSync();
  };

  const step = prefs.fast ? 10 : 5;
  const lateral = prefs.fast ? 69 : 139;
  const arriba = prefs.fast ? 20 : 40;

  const limits = useRef<Limits>(freshLimits(lateral, arriba));

  useEffect(() => saveOrthopticsPrefs(prefs), [prefs]);

  const resetPosition = (newLateral = lateral, newArriba = arriba) => {
    limits.current = freshLimits(newLateral, newArriba);
    setOffsetX(0);
    setOffsetY(0);
    setPuntoA(0);
  };

  // Toggling speed changes future step size + limits but (faithfully) does
  // not reset current position/diopter — only the ratchet limits reset.
  const setFast = (fast: boolean) => {
    const newLateral = fast ? 69 : 139;
    const newArriba = fast ? 20 : 40;
    limits.current = freshLimits(newLateral, newArriba);
    setPrefs((p) => ({ ...p, fast }));
  };

  const diverge = () => {
    // right1(): finder gated by x1 (fixed); grows x2 (raises future converge room).
    const l = limits.current;
    if (l.finder >= l.x1) return;
    l.finder++;
    l.x2++;
    setOffsetX((x) => x - step);
    setPuntoA((p) => p - step);
  };

  const converge = () => {
    // left1(): finizq gated by x2 (ratcheted).
    const l = limits.current;
    if (l.finizq >= l.x2) return;
    l.finizq++;
    l.finder--;
    setOffsetX((x) => x + step);
    setPuntoA((p) => p + step);
  };

  const goUp = () => {
    // up(): contar gated by y2 (fixed); grows y3 (raises future down room).
    const l = limits.current;
    if (l.contar >= l.y2) return;
    l.contar++;
    l.y3++;
    setOffsetY((y) => y + step);
  };

  const goDown = () => {
    // down(): kontar gated by y3 (ratcheted).
    const l = limits.current;
    if (l.kontar >= l.y3) return;
    l.kontar++;
    l.contar--;
    setOffsetY((y) => y - step);
  };

  const goHome = () => resetPosition();

  const setStimulus = (id: number) => {
    setPrefs((p) => ({ ...p, stimulus: id }));
    resetPosition();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          converge();
          break;
        case 'ArrowRight':
          e.preventDefault();
          diverge();
          break;
        case 'ArrowUp':
          e.preventDefault();
          goUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          goDown();
          break;
        case 'Home':
          e.preventDefault();
          goHome();
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const stim = STIMULI.find((s) => s.id === prefs.stimulus) ?? STIMULI[0];
  // Punto = ((PuntoA * Pixel) / 10) * 0.75, verbatim from the source's diopter formula.
  const dp = (((puntoA * PIXEL) / 10) * 0.75).toFixed(1);

  const t = (esStr: string, enStr: string) => (es ? esStr : enStr);

  if (isMobile) {
    return (
      <Modal open title={t('No disponible', 'Not available')} hideClose onClose={() => undefined}>
        <p>
          {t(
            'Este ejercicio no está disponible en el celular, usá una computadora.',
            'This exercise is not available on mobile, please use a desktop computer.'
          )}
        </p>
        <Link className="btn btn--primary" to="/">
          {t('Volver', 'Back')}
        </Link>
      </Modal>
    );
  }

  const cyanContrast = opacityToPercent(settings.opacity[COLOR_INDEX.cyan]) / 100;
  const redContrast = opacityToPercent(settings.opacity[COLOR_INDEX.red]) / 100;

  return (
    <div className="shell shell--orthoptics" style={{ background: settings.color[0] }}>
      <div className="shell__topbar">
        <Link className="btn btn--ghost" to="/">
          ← {t('Volver', 'Back')}
        </Link>
        <div className="shell__hud">
          <div className="hud__item">
            <span className="hud__label">∆ DP @ 75cm</span>
            <span className="hud__value">{dp}dp</span>
          </div>
        </div>
        <div className="shell__actions">
          <button className="btn btn--icon" onClick={() => setShowSettings(true)} aria-label={t('Configurar', 'Settings')}>
            ⚙
          </button>
          <button className="btn btn--icon" onClick={goHome} aria-label={t('Centrar', 'Home')}>
            <img src={`${BASE}/home.png`} alt="" width={22} height={22} />
          </button>
          <IdentityBadge />
        </div>
      </div>

      <div className="ortho__controls">
        <label className="ortho__field">
          {t('Estímulo', 'Stimulus')}:{' '}
          <select value={prefs.stimulus} onChange={(e) => setStimulus(Number(e.target.value))}>
            {STIMULI.map((s) => (
              <option key={s.id} value={s.id}>
                {es ? s.labelEs : s.labelEn}
              </option>
            ))}
          </select>
        </label>

        <button className={`pill ${!prefs.fast ? 'is-selected' : ''}`} onClick={() => setFast(false)}>
          {t('Lento', 'Slow')}
        </button>
        <button className={`pill ${prefs.fast ? 'is-selected' : ''}`} onClick={() => setFast(true)}>
          {t('Rápido', 'Fast')}
        </button>

        <button
          className={`pill ${prefs.showMarkers ? 'is-selected' : ''}`}
          onClick={() => setPrefs((p) => ({ ...p, showMarkers: !p.showMarkers }))}
        >
          {t('Marcas', 'Markers')}
        </button>
      </div>

      <div className="shell__stage">
        <div className="ortho__stage">
          {prefs.showMarkers && (
            <img
              src={`${BASE}/left.png`}
              alt=""
              className="ortho__marker"
              style={{ opacity: redContrast, transform: `translate(${offsetX}px, ${offsetY + 90}px)` }}
            />
          )}
          <img
            src={`${BASE}/${stim.red}`}
            alt=""
            className="ortho__stimulus"
            style={{ opacity: redContrast, transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))` }}
          />
          <img
            src={`${BASE}/${stim.cyan}`}
            alt=""
            className="ortho__stimulus"
            style={{ opacity: cyanContrast, transform: `translate(calc(-50% - ${offsetX}px), calc(-50% - ${offsetY}px))` }}
          />
          {prefs.showMarkers && (
            <img
              src={`${BASE}/right.png`}
              alt=""
              className="ortho__marker"
              style={{ opacity: cyanContrast, transform: `translate(${-offsetX}px, ${-offsetY + 120}px)` }}
            />
          )}
        </div>
      </div>

      <p className="ortho__help muted">
        {t(
          'Usá las flechas del teclado para mover las figuras. Con anteojos rojo/cian, cada ojo ve una figura distinta: acercalas o alejalas para entrenar la fusión.',
          'Use the arrow keys to move the shapes. With red/cyan glasses, each eye sees a different shape: bring them together or apart to train fusion.'
        )}
      </p>

      <SettingsPanel
        open={showSettings}
        calibration={{ colorAlternatives: settings.colorAlternatives, color: settings.color }}
        gameplaySettings={{ opacity: settings.opacity, variantAlternatives: settings.variantAlternatives, variant: settings.variant, cyanEye: settings.cyanEye }}
        // The stimuli are pre-tinted red/cyan PNGs (only their opacity is
        // adjustable here, via settings.opacity) and there's no dot/piece
        // shape to vary — eye-color calibration and fill are dead in this
        // exercise.
        capabilities={{ eyeCalibration: false, fill: false }}
        onApplyCalibration={handleApplyCalibration}
        onApplyGameplay={handleApplyGameplay}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
