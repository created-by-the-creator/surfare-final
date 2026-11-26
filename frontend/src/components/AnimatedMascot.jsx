import { forwardRef, useSyncExternalStore } from 'react';
import { ASSETS } from '../assets.js';

const variants = new Map([
  [ASSETS.surfyPoint, '/assets/risk/surfy-caution'],
  [ASSETS.surfyCheer, '/assets/risk/surfy-calm'],
  [ASSETS.surfyWink, '/assets/risk/surfy-calm'],
  [ASSETS.surfyAlarm, '/assets/risk/surfy-alert'],
  [ASSETS.surfyMagnify, '/assets/risk/surfy-curious'],
  [ASSETS.surfyTablet, '/assets/animated/surfy-tablet'],
  [ASSETS.surfyLifeguard, '/assets/animated/surfy-lifeguard'],
  [ASSETS.surfySurfingBody, '/assets/animated/surfy-surfer'],
]);
const subscribe = callback => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
};
const snapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useMascotSource(src, paused = false) {
  const reduced = useSyncExternalStore(subscribe, snapshot, () => true);
  const base = variants.get(src);
  return base ? `${base}${reduced || paused ? '-still.png' : '.gif'}` : src;
}

export default forwardRef(function AnimatedMascot({ src, paused = false, ...props }, ref) {
  const current = useMascotSource(src, paused);
  return <img {...props} ref={ref} src={current} data-mascot-source={src} />;
});
