import { useEffect, useRef } from 'react';
import type { ControlScheme, InputAction } from '@/games/types';

interface Props {
  scheme: ControlScheme;
  onAction: (action: InputAction) => void;
}

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
      aria-label={action}
    >
      {label}
    </button>
  );
}

export function TouchControls({ scheme, onAction }: Props) {
  if (scheme === 'paddle') {
    return (
      <div className="tc tc--paddle">
        <CtrlButton label="◀" action="left" onAction={onAction} hold className="tc__btn--wide" />
        <CtrlButton label="⤒" action="launch" onAction={onAction} />
        <CtrlButton label="▶" action="right" onAction={onAction} hold className="tc__btn--wide" />
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
