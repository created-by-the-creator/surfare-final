function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function urlLexicalFeatures(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || !host.includes('.')) return null;
  const pathname = safeDecode(url.pathname).toLowerCase();
  const search = safeDecode(url.search).toLowerCase();
  const surface = `${host}${pathname}${search}`;
  const words = surface.match(/[a-z]{3,}/g) || [];
  const features = new Set(words.map((word) => `w:${word}`));

  const hostChars = host.replace(/\./g, '');
  for (let i = 0; i + 2 < hostChars.length; i += 1)
    features.add(`c:${hostChars.slice(i, i + 3)}`);

  const labels = host.split('.').filter(Boolean);
  features.add(`d:labels_${Math.min(labels.length, 5)}`);
  features.add(`d:tld_${labels.at(-1)}`);

  const digits = (surface.match(/\d/g) || []).length;
  features.add(`n:digits_${digits > 10 ? '10plus' : digits}`);
  features.add(`n:length_${Math.min(Math.floor(surface.length / 10) * 10, 120)}`);
  features.add(`n:hyphens_${Math.min((host.match(/-/g) || []).length, 5)}`);
  features.add(`n:subdomains_${Math.min(Math.max(labels.length - 2, 0), 4)}`);

  for (const token of [
    'verify', 'login', 'account', 'secure', 'update', 'bank', 'wallet',
    'password', 'otp', 'claim', 'bonus', 'free', 'gift', 'prize',
  ])
    if (surface.includes(token)) features.add(`k:${token}`);

  return { features: [...features], words };
}
