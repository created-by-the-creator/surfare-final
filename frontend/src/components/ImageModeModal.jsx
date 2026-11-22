import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ScanText, ShieldCheck, Sparkles, X } from 'lucide-react';

export default function ImageModeModal({ t, initialMode, isOnline, onConfirm, onClose }) {
  const [selectedMode, setMode] = useState(initialMode || 'origin');
  const dialogRef = useRef(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.querySelector('input:checked')?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog
      className="image-mode-dialog"
      data-image-mode-modal
      aria-labelledby={headingId}
      aria-describedby={`${headingId}-description`}
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <button className="image-mode-close" type="button" onClick={onClose} aria-label={t('check.image.modeClose')}>
        <X aria-hidden="true" />
      </button>
      <div className="image-mode-header">
        <span className="image-mode-emblem"><ShieldCheck aria-hidden="true" /></span>
        <p className="image-mode-eyebrow">{t('check.image.modeEyebrow')}</p>
        <h2 id={headingId}>{t('check.image.modeLabel')}</h2>
        <p id={`${headingId}-description`}>{t('check.image.modeDescription')}</p>
      </div>
      <fieldset className="image-mode-switch">
        <legend className="visually-hidden">{t('check.image.modeLabel')}</legend>
        {[
          { value: 'origin', Icon: Sparkles, title: 'modeAi', help: 'modeAiHelp', tag: isOnline ? 'modeAiTag' : 'modeOffline' },
          { value: 'ocr', Icon: ScanText, title: 'modeOcr', help: 'modeOcrHelp', tag: 'modeOcrTag' },
        ].map(({ value, Icon, title, help, tag }) => (
          <label key={value} className={`image-mode-option${selectedMode === value ? ' is-selected' : ''}`}>
            <input
              className="visually-hidden"
              type="radio"
              name={`${headingId}-mode`}
              value={value}
              checked={selectedMode === value}
              onChange={() => setMode(value)}
            />
            <span className="image-mode-option-top">
              <span className="image-mode-icon"><Icon aria-hidden="true" /></span>
              <span className="image-mode-selection" aria-hidden="true">{selectedMode === value && <Check />}</span>
            </span>
            <strong>{t(`check.image.${title}`)}</strong>
            <span className="image-mode-help">{t(`check.image.${help}`)}</span>
            <span className="image-mode-tag">{t(`check.image.${tag}`)}</span>
          </label>
        ))}
      </fieldset>
      <p className="image-mode-note">{t(selectedMode === 'ocr' ? 'check.image.modeOcrNote' : isOnline ? 'check.image.modeAiNote' : 'result.imageMetadata.visualOffline')}</p>
      <button className="image-mode-confirm" type="button" onClick={() => onConfirm(selectedMode)}>
        {t('check.image.modeConfirm')}
      </button>
    </dialog>,
    document.body,
  );
}
