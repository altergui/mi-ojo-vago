import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Hide the default close (X); used for blocking dialogs. */
  hideClose?: boolean;
}

export function Modal({ open, title, onClose, children, footer, hideClose }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hideClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, hideClose]);

  if (!open) return null;
  return (
    <div className="modal__overlay" onClick={hideClose ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {(title || !hideClose) && (
          <div className="modal__head">
            {/* Close sits to the left of the title, matching the immersive
                game topbar's own ✕ (also top-left): closing always steps
                back exactly one level, in the same corner every time. */}
            {!hideClose && (
              <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
                ✕
              </button>
            )}
            {title && <h2 className="modal__title">{title}</h2>}
          </div>
        )}
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
