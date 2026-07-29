import { useState } from 'react';
import type { DichopticSettings } from '@/engine/dichoptic';
import { useI18n } from '@/i18n';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  settings: DichopticSettings;
  onApply: (next: Partial<DichopticSettings>) => void;
  onClose: () => void;
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
const byteOf = (s: string, start: number) => parseInt(s.substring(start, start + 2), 16) || 0;

/**
 * Color calibration, extending the original showCalibration (game.ts:1471+).
 * White (background) 224-255, violet (background) 40-128, cyan blue-channel
 * 208-255, red red-channel 0-100.
 *
 * The app has exactly two backgrounds — violet (colorAlternatives[0]) and
 * white (colorAlternatives[1]) — each independently calibratable so picking
 * one doesn't lose the other's calibration; cyan/red are shared by both.
 * Applying updates whichever background is currently active plus both
 * colorAlternatives entries, and is saved globally (see settings/store.ts).
 */
export function CalibrationPanel({ open, settings, onApply, onClose }: Props) {
  const { t } = useI18n();

  const [violet, setViolet] = useState(0);
  const [white, setWhite] = useState(0);
  const [cyan, setCyan] = useState(0);
  const [red, setRed] = useState(0);

  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setViolet(byteOf(settings.colorAlternatives[0][0], 1));
    setWhite(byteOf(settings.colorAlternatives[1][0], 1));
    setCyan(byteOf(settings.color[1], 5));
    setRed(byteOf(settings.color[2], 3));
    setSeenOpen(true);
  } else if (!open && seenOpen) {
    setSeenOpen(false);
  }

  const violetColor = `#${hex2(violet)}00${hex2(violet)}`;
  const whiteColor = `#${hex2(white)}${hex2(white)}${hex2(white)}`;
  const cyanColor = `#00FF${hex2(cyan)}`;
  const redColor = `#FF${hex2(red)}00`;

  const isWhiteActive = settings.color[0].toUpperCase() === settings.colorAlternatives[1][0].toUpperCase();
  const activeBgColor = isWhiteActive ? whiteColor : violetColor;

  const apply = () => {
    const colorAlternatives = settings.colorAlternatives.map((c) => [...c]);
    colorAlternatives[0] = [violetColor, cyanColor, redColor, colorAlternatives[0][3]];
    colorAlternatives[1] = [whiteColor, cyanColor, redColor, colorAlternatives[1][3]];
    const color = [activeBgColor, cyanColor, redColor, settings.color[3]];
    onApply({ color, colorAlternatives });
    onClose();
  };

  return (
    <Modal
      open={open}
      title={t('calib.title')}
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
      <p className="muted">{t('calib.text')}</p>
      <div className="calib__glasses" style={{ background: activeBgColor }}>
        <span className="calib__eye" style={{ color: cyanColor }}>
          ◆
        </span>
        <span className="calib__bridge" />
        <span className="calib__eye" style={{ color: redColor }}>
          ◆
        </span>
      </div>
      <label className="calib__row">
        <span>{t('calib.cyan')}</span>
        <input type="range" min={208} max={255} value={cyan} onChange={(e) => setCyan(Number(e.target.value))} />
      </label>
      <label className="calib__row">
        <span>{t('calib.red')}</span>
        <input type="range" min={0} max={100} value={red} onChange={(e) => setRed(Number(e.target.value))} />
      </label>
      <label className="calib__row">
        <span>{t('calib.violet')}</span>
        <input type="range" min={40} max={128} value={violet} onChange={(e) => setViolet(Number(e.target.value))} />
      </label>
      <label className="calib__row">
        <span>{t('calib.white')}</span>
        <input type="range" min={224} max={255} value={white} onChange={(e) => setWhite(Number(e.target.value))} />
      </label>
    </Modal>
  );
}
