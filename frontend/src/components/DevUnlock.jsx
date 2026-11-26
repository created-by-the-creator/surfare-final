import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, X } from 'lucide-react';
import './DevUnlock.css';

export default function DevUnlock({ unlocked, onUnlock, onLock }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => { dialog.close(); triggerRef.current?.focus({ preventScroll: true }); };
  }, [open]);
  const close = () => { setOpen(false); setPassword(''); setError(false); };
  return <>
    <button ref={triggerRef} className="footer-privacy-link footer-dev-link" type="button" aria-haspopup="dialog"
      onClick={() => setOpen(true)}>Dev</button>
    <dialog ref={dialogRef} className="dev-unlock-dialog" aria-labelledby="dev-unlock-title"
      onCancel={event => { event.preventDefault(); close(); }}>
      {open && <>
        <button className="dev-unlock-close" type="button" aria-label="Close developer access" onClick={close}><X size={20} /></button>
        <LockKeyhole size={26} aria-hidden="true" />
        <h2 id="dev-unlock-title">Developer access</h2>
        {unlocked ? <>
          <p role="status">All surfboards are unlocked on this browser.</p>
          <button className="dev-unlock-submit" type="button" onClick={() => {
            close(); requestAnimationFrame(() => document.querySelector('#practice')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
          }}>View surfboards</button>
          <button className="dev-unlock-revert" type="button" onClick={() => { onLock(); close(); }}>Turn off dev mode</button>
        </> : <form onSubmit={event => {
          event.preventDefault();
          if (password !== 'kalbo') { setError(true); return; }
          setPassword(''); setError(false); onUnlock();
        }}>
          <p>Enter the password to unlock every surfboard.</p>
          <label htmlFor="dev-unlock-password">Password</label>
          <input id="dev-unlock-password" type="password" value={password} autoComplete="off" required
            aria-invalid={error} aria-describedby={error ? 'dev-unlock-error' : undefined}
            onChange={event => { setPassword(event.target.value); setError(false); }} />
          {error && <p id="dev-unlock-error" className="dev-unlock-error" role="alert">Incorrect password. Try again.</p>}
          <button className="dev-unlock-submit" type="submit">Unlock surfboards</button>
        </form>}
      </>}
    </dialog>
  </>;
}
