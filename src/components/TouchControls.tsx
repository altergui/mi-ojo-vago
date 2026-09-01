import { useEffect, useRef } from 'react';
import { useI18n, type StringKey } from '@/i18n';
import type { ControlScheme, InputAction } from '@/games/types';

interface Props {
  scheme: ControlScheme;
  onAction: (action: InputAction) => void;
}

/** aria-label per action — the visible glyph (▲/◀/⟳...) carries no text for
 * screen readers to fall back on, so this is the only accessible name they
 * get. Keyed to shared i18n strings rather than the raw action id, which
 * would always read out in English regardless of the site's language. */
const ACTION_LABEL: Record<InputAction, StringKey> = {
  left: 'tc.left',
  right: 'tc.right',
  up: 'tc.up',
  down: 'tc.down',
  rotate: 'tc.rotate',
  drop: 'tc.drop',
  launch: 'tc.launch',
};

/** A control button. Holdable actions auto-repeat while pressed. */
function CtrlButton({
  label,
  action,
  onAction,
  hold,
  className,
}: {
  label: string;
  action: InputAction;
  onAction: (a: InputAction) => void;
  hold?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => stop, []);

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    onAction(action);
    if (hold) {
      stop();
      timer.current = setInterval(() => onAction(action), 90);
    }
  };

  return (
    <button
      type="button"
      className={`tc__btn ${className ?? ''}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      aria-label={t(ACTION_LABEL[action])}
    >
      {label}
    </button>
  );
}

export function TouchControls({ scheme, onAction }: Props) {
  if (scheme === 'paddle') {
    // Position is driven by dragging directly on the board; only launch needs a button.
    return (
      <div className="tc tc--paddle">
        <CtrlButton label="⤒" action="launch" onAction={onAction} className="tc__btn--wide" />
      </div>
    );
  }
  if (scheme === 'pointer') {
    // Position is driven entirely by dragging on the board; no buttons needed.
    return null;
  }
  if (scheme === 'glider') {
    return (
      <div className="tc tc--glider">
        <CtrlButton label="▲" action="up" onAction={onAction} hold className="tc__btn--wide" />
        <CtrlButton label="▼" action="down" onAction={onAction} hold className="tc__btn--wide" />
      </div>
    );
  }
  // tetris
  return (
    <div className="tc tc--tetris">
      <div className="tc__group">
        <CtrlButton label="◀" action="left" onAction={onAction} hold />
        <CtrlButton label="▼" action="down" onAction={onAction} hold />
        <CtrlButton label="▶" action="right" onAction={onAction} hold />
      </div>
      <div className="tc__group">
        <CtrlButton label="⟳" action="rotate" onAction={onAction} className="tc__btn--accent" />
        <CtrlButton label="⤓" action="drop" onAction={onAction} className="tc__btn--accent" />
      </div>
    </div>
  );
}
