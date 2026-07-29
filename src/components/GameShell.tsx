import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DichopticSettings } from '@/engine/dichoptic';
import { useI18n } from '@/i18n';
import { loadSettings, saveSettings } from '@/settings/store';
import { useTrainingRecorder } from '@/stats/useTrainingRecorder';
import type { GameController, GameDefinition, GameState, InputAction, ScoreInfo } from '@/games/types';
import { Modal } from './Modal';
import { SettingsPanel } from './SettingsPanel';
import { TouchControls } from './TouchControls';

const EMPTY_SCORE: ScoreInfo = { points: 0, level: 1 };
const EMPTY_STATE: GameState = { paused: true, starting: false, playing: false, muted: false };

export function GameShell({ def }: { def: GameDefinition }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const shellRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const subNextRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameController | null>(null);

  const [controller, setController] = useState<GameController | null>(null);
  const [score, setScore] = useState<ScoreInfo>(EMPTY_SCORE);
  const [state, setState] = useState<GameState>(EMPTY_STATE);
  const [settings, setSettings] = useState<DichopticSettings>(() => loadSettings());

  const [showWelcome, setShowWelcome] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [gameOver, setGameOver] = useState<ScoreInfo | null>(null);

  // Create / destroy the game engine for this game definition.
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const initial = loadSettings();
    const game = def.create({
      board,
      nextCanvas: def.hasPreview ? nextRef.current : null,
      subNextCanvas: def.hasPreview ? subNextRef.current : null,
      settings: initial,
    });
    gameRef.current = game;
    setController(game);
    setSettings(game.getSettings());

    const offScore = game.events.on('score', setScore);
    const offState = game.events.on('statechange', setState);
    const offOver = game.events.on('gameover', (s) => setGameOver(s));
    // Sync initial HUD (the engine emits its first score/state in its constructor,
    // before these listeners were attached).
    setScore(game.getScore());
    setState(game.getState());

    // Responsive: resize the board pixel buffers when the layout changes.
    const ro = new ResizeObserver(() => game.resize());
    ro.observe(board);
    game.resize();

    return () => {
      ro.disconnect();
      offScore();
      offState();
      offOver();
      game.destroy();
      gameRef.current = null;
      setController(null);
    };
  }, [def]);

  useTrainingRecorder(controller, def.id, () => gameRef.current?.getScore().points);

  const doInput = useCallback((action: InputAction) => gameRef.current?.input(action), []);

  const handleStart = () => {
    setShowWelcome(false);
    gameRef.current?.resume();
  };

  const handleApplySettings = (patch: Partial<DichopticSettings>) => {
    const game = gameRef.current;
    if (!game) return;
    game.applySettings(patch);
    const full = game.getSettings();
    setSettings(full);
    saveSettings(full);
  };

  const handleReset = () => {
    setShowConfirmReset(false);
    setShowMenu(false);
    gameRef.current?.resetGame();
    gameRef.current?.resume();
  };

  const handleTryAgain = () => {
    setGameOver(null);
    gameRef.current?.resetGame();
    gameRef.current?.resume();
  };

  const toggleMute = () => gameRef.current?.setMuted(!state.muted);

  const toggleFullscreen = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const openMenu = () => {
    gameRef.current?.pause();
    setShowMenu(true);
  };

  const showResumeOverlay = !showWelcome && !gameOver && !showMenu && !showSettings && !showConfirmReset && state.paused && !state.starting;

  return (
    <div className="shell" ref={shellRef}>
      <div className="shell__topbar">
        <button className="btn btn--ghost" onClick={() => navigate('/')}>
          ← {t('shell.back')}
        </button>
        <div className="shell__hud">
          <div className="hud__item">
            <span className="hud__label">{t('shell.score')}</span>
            <span className="hud__value">{score.points}</span>
          </div>
          <div className="hud__item">
            <span className="hud__label">{t('shell.level')}</span>
            <span className="hud__value">{score.level}</span>
          </div>
          {typeof score.rows === 'number' && (
            <div className="hud__item">
              <span className="hud__label">{t('shell.rows')}</span>
              <span className="hud__value">{score.rows}</span>
            </div>
          )}
          {typeof score.lives === 'number' && (
            <div className="hud__item">
              <span className="hud__label">{t('shell.lives')}</span>
              <span className="hud__value">{'♥'.repeat(score.lives) || '—'}</span>
            </div>
          )}
        </div>
        <div className="shell__actions">
          <button className="btn btn--icon" onClick={() => gameRef.current?.togglePause()} aria-label={t('shell.pause')}>
            {state.playing ? '❚❚' : '►'}
          </button>
          <button className="btn btn--icon" onClick={openMenu} aria-label={t('shell.menu')}>
            ☰
          </button>
        </div>
      </div>

      <div className="shell__stage">
        <div className="shell__board" ref={boardRef} style={{ aspectRatio: String(def.boardAspect) }} />
        {def.hasPreview && (
          <aside className="shell__side">
            <span className="hud__label">{t('shell.next')}</span>
            <canvas ref={nextRef} className="shell__preview" />
            <canvas ref={subNextRef} className="shell__preview" />
          </aside>
        )}

        {showResumeOverlay && (
          <button className="shell__overlay shell__overlay--btn" onClick={() => gameRef.current?.resume()}>
            <span className="bigbtn">►</span>
            <span>{t('shell.resume')}</span>
          </button>
        )}
      </div>

      <TouchControls scheme={def.controlScheme} onAction={doInput} />

      {/* Welcome */}
      <Modal
        open={showWelcome}
        title={t('shell.welcome')}
        hideClose
        onClose={() => undefined}
        footer={
          <button className="btn btn--primary" onClick={handleStart}>
            {t('shell.start')}
          </button>
        }
      >
        <p>{t('shell.welcomeText')}</p>
      </Modal>

      {/* Menu */}
      <Modal open={showMenu} title={t('shell.menu')} onClose={() => setShowMenu(false)}>
        <div className="menu">
          <button className="btn" onClick={() => { setShowMenu(false); gameRef.current?.resume(); }}>
            {t('shell.resume')}
          </button>
          <button className="btn" onClick={() => { setShowMenu(false); setShowSettings(true); }}>
            {t('shell.settings')}
          </button>
          <button className="btn" onClick={() => setShowConfirmReset(true)}>
            {t('shell.reset')}
          </button>
          <button className="btn" onClick={toggleMute}>
            {t('shell.sound')}: {state.muted ? '🔇' : '🔊'}
          </button>
          <button className="btn" onClick={toggleFullscreen}>
            {t('shell.fullscreen')}
          </button>
          <button className="btn btn--ghost" onClick={() => navigate('/')}>
            {t('shell.back')}
          </button>
        </div>
      </Modal>

      {/* Confirm reset */}
      <Modal
        open={showConfirmReset}
        title={t('shell.reset')}
        onClose={() => setShowConfirmReset(false)}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setShowConfirmReset(false)}>
              {t('shell.no')}
            </button>
            <button className="btn btn--primary" onClick={handleReset}>
              {t('shell.yes')}
            </button>
          </>
        }
      >
        <p>{t('shell.confirmReset')}</p>
      </Modal>

      {/* Game over */}
      <Modal
        open={!!gameOver}
        title={t('shell.gameover')}
        hideClose
        onClose={() => undefined}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => { setGameOver(null); navigate('/'); }}>
              {t('shell.back')}
            </button>
            <button className="btn btn--primary" onClick={handleTryAgain}>
              {t('shell.tryAgain')}
            </button>
          </>
        }
      >
        <p>{t('shell.gameoverText')}</p>
        {gameOver && (
          <p className="big">
            {t('shell.score')}: <strong>{gameOver.points}</strong>
          </p>
        )}
      </Modal>

      <SettingsPanel open={showSettings} settings={settings} onApply={handleApplySettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
