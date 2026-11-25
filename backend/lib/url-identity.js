// Bounded RFC 3492 decoding, used only to detect lookalikes. The actual
// destination remains the URL parser's host. https://www.rfc-editor.org/rfc/rfc3492
export function unicodeHost(host) {
  return host.split('.').map(label => {
    if (!label.startsWith('xn--') || label.length > 63) return label;
    const input = label.slice(4), delimiter = input.lastIndexOf('-');
    if (!input) return label;
    const output = delimiter < 0 ? [] : [...input.slice(0, delimiter)].map(c => c.codePointAt(0));
    let cursor = delimiter < 0 ? 0 : delimiter + 1, n = 128, i = 0, bias = 72;
    const adapt = (delta, count, first) => {
      delta = Math.floor(delta / (first ? 700 : 2));
      delta += Math.floor(delta / count);
      let k = 0;
      while (delta > 455) { delta = Math.floor(delta / 35); k += 36; }
      return k + Math.floor(36 * delta / (delta + 38));
    };
    try {
      while (cursor < input.length) {
        const previous = i;
        let weight = 1;
        for (let k = 36; ; k += 36) {
          if (cursor >= input.length || k > 252) throw Error('invalid_punycode');
          const code = input.charCodeAt(cursor++);
          const digit = code >= 97 && code <= 122 ? code - 97 : code >= 48 && code <= 57 ? code - 22 : 36;
          if (digit >= 36 || !Number.isSafeInteger(i + digit * weight)) throw Error('invalid_punycode');
          i += digit * weight;
          const threshold = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
          if (digit < threshold) break;
          weight *= 36 - threshold;
        }
        const size = output.length + 1;
        bias = adapt(i - previous, size, previous === 0);
        n += Math.floor(i / size);
        i %= size;
        if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw Error('invalid_punycode');
        output.splice(i++, 0, n);
      }
      return String.fromCodePoint(...output);
    } catch { return label; }
  }).join('.');
}

// Common substitutions informed by UTS #39, not a complete confusable table
// or a claim of UTS conformance. https://unicode.org/reports/tr39/
const CONFUSABLES = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ӏ: 'l', к: 'k', м: 'm', т: 't', ν: 'v', ο: 'o', ρ: 'p', α: 'a', ε: 'e', ι: 'i', τ: 't' };
export function hostSkeleton(value) {
  return [...unicodeHost(value).toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')]
    .map(c => CONFUSABLES[c] || c).join('');
}

export function decodeUrlComponent(value) {
  let decoded = value;
  for (let count = 0; count < 2; count++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  return decoded;
}
