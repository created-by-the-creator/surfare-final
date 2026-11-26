import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Sun, Crown, Waves, Heart, X } from 'lucide-react';
import './SurfySecret.css';

const SECRETS = [
  { Icon: Sun, title: 'Why so shiny?', body: 'He keeps his head bald and shiny for a bright future. His morning routine? One polish, two big dreams, zero bad hair days.' },
  { Icon: Crown, title: 'A little chess nerd', body: 'He loves chess. He thinks three moves ahead, but still says “wait, one more game” six games later.' },
  { Icon: Waves, title: 'Off-duty Surfy', body: 'He counts waves to relax and practices his victory pose in the mirror. He calls both “important research.”' },
  { Icon: Heart, title: 'His biggest soft spot', body: 'Nothing makes him happier than someone saying, “Oh, now I understand!” He saves every imaginary thank-you note.' },
];

export default function SurfySecret() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [open]);
  return <>
    <button ref={triggerRef} className="nav-guide-link nav-secret-link" type="button" onClick={() => setOpen(true)}
      aria-haspopup="dialog" aria-expanded={open} aria-controls="surfy-secret-dialog">
      <Sparkles size={17} aria-hidden="true" /><span>Surfy’s little secret</span>
    </button>
    {createPortal(<dialog id="surfy-secret-dialog" ref={dialogRef} className="surfy-secret-dialog" aria-labelledby="surfy-secret-label"
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setOpen(false);
      }}>
      {open && <>
        <header className="secret-header"><span id="surfy-secret-label"><Sparkles size={17} aria-hidden="true" />Surfy’s little secret</span>
          <button type="button" className="secret-close" aria-label="Close Surfy’s little secret" onClick={() => setOpen(false)}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="secret-content">
          <div className="secret-hero">
            <div className="secret-intro-copy">
              <p className="secret-eyebrow">Behind the shine</p>
              <h2>Bald head.<br /><em>Big dreams.</em></h2>
              <p className="secret-intro">Before he became your digital safety buddy, Surfy had one very important goal: a bright future. Literally.</p>
            </div>
            <picture className="secret-mascot-stage"><source media="(prefers-reduced-motion: reduce)" srcSet="/assets/animated/surfy-happy-jump-still.png" />
              <img src="/assets/animated/surfy-happy-jump.gif" alt="Surfy jumping happily with his arms raised" width="512" height="512" decoding="async" />
            </picture>
          </div>
          <div className="secret-chapters">{SECRETS.map(({ Icon, title, body }) => <section className="secret-chapter" key={title}>
            <span className="secret-chapter-icon" aria-hidden="true"><Icon size={19} strokeWidth={1.8} /></span>
            <div><h3>{title}</h3><p>{body}</p></div>
          </section>)}</div>
          <p className="secret-signature">mabuhay ang kalbo</p>
        </div>
      </>}
    </dialog>, document.body)}
  </>;
}
