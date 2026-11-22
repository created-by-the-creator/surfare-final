import { useEffect, useId, useRef, useState } from 'react';

export default function ImageModeModal({ t, initialMode, allowAi = true, onConfirm, onClose }) {
  const [mode, setMode] = useState(initialMode === 'origin' && allowAi ? 'origin' : 'ocr');
  const dialogRef = useRef(null);
  const headingId = useId();
  const groupName = `${headingId}-mode`;

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector('input:not([disabled])')?.focus({ preventScroll: true });
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll('input:not([disabled]), button:not([disabled])'),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleOutsidePointerDown = (event) => {
      if (!dialogRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="image-mode-catcher" data-image-mode-modal>
      <div
        className="image-mode-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        ref={dialogRef}
      >
        <h2 id={headingId}>{t('check.image.modeLabel')}</h2>
        <fieldset className="image-mode-switch">
          <legend className="visually-hidden">{t('check.image.modeLabel')}</legend>
          <label className="image-mode-option">
            <input
              type="radio"
              name={groupName}
              value="ocr"
              checked={mode === 'ocr'}
              onChange={() => setMode('ocr')}
            />
            <span>
              <strong>{t('check.image.modeOcr')}</strong>
              <small>{t('check.image.modeOcrHelp')}</small>
            </span>
          </label>
          {allowAi && (
            <label className="image-mode-option">
              <input
                type="radio"
                name={groupName}
                value="origin"
                checked={mode === 'origin'}
                onChange={() => setMode('origin')}
              />
              <span>
                <strong>{t('check.image.modeAi')}</strong>
                <small>{t('check.image.modeAiHelp')}</small>
              </span>
            </label>
          )}
        </fieldset>
        <button className="image-mode-confirm" type="button" onClick={() => onConfirm(mode)}>
          {t('check.image.modeConfirm')}
        </button>
      </div>
    </div>
  );
}
