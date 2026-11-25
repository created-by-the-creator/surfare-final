// Index every normalized UTF-16 character back to the exact original text.
// Highlights never reconstruct user text or inject HTML.
const TOKEN_CHAR = /[a-z0-9@]/;
const SEPARATED_TOKEN = /\b[a-z0-9](?:[\s.\-]*[.\-][\s.\-]*[a-z0-9])+\b/g;
const LEET = { 0: 'o', 3: 'e', 4: 'a', '@': 'a' };

function appendRange(target, source, from, to) {
  target.text += source.text.slice(from, to);
  for (let index = from; index < to; index += 1) {
    target.starts.push(source.starts[index]);
    target.ends.push(source.ends[index]);
  }
}

// O.T.P / p-i-n / p4ss.w0rd keep their original character spans even though
// the separators disappear from the matching form.
function collapseSeparators(source) {
  const target = { text: '', starts: [], ends: [] };
  let cursor = 0;
  for (const match of source.text.matchAll(SEPARATED_TOKEN)) {
    const token = match[0];
    const segments = token.split(/[\s.\-]+/).filter(Boolean);
    const compact = segments.join('');
    if (!/[a-z]/.test(compact) || compact.length > 10 || segments.some((part) => part.length > 4))
      continue;
    appendRange(target, source, cursor, match.index);
    let at = match.index;
    for (const ch of compact) {
      while (at < match.index + token.length && !TOKEN_CHAR.test(source.text[at])) at += 1;
      target.text += ch;
      target.starts.push(source.starts[at]);
      target.ends.push(source.ends[at]);
      at += 1;
    }
    cursor = match.index + token.length;
  }
  appendRange(target, source, cursor, source.text.length);
  return target;
}

function foldLeet(source) {
  const tokenHasLetter = (index) => {
    let start = index;
    let end = index + 1;
    while (start > 0 && TOKEN_CHAR.test(source.text[start - 1])) start -= 1;
    while (end < source.text.length && TOKEN_CHAR.test(source.text[end])) end += 1;
    return /[a-z]/.test(source.text.slice(start, end));
  };
  let text = '';
  for (let index = 0; index < source.text.length; index += 1) {
    const ch = source.text[index];
    if (LEET[ch] && tokenHasLetter(index)) text += LEET[ch];
    else if (ch === '1' && /[a-z]/.test(source.text[index - 1] || '') &&
      /[a-z]/.test(source.text[index + 1] || '')) text += 'i';
    else text += ch;
  }
  return { text, starts: source.starts, ends: source.ends };
}

export function normalizeEvidence(value) {
  const text = String(value ?? '');
  let normalized = '',
    starts = [],
    ends = [],
    offset = 0;
  for (const ch of text) {
    const folded = ch
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/[’‘]/g, "'");
    for (let i = 0; i < folded.length; i++) {
      starts.push(offset);
      ends.push(offset + ch.length);
    }
    normalized += folded;
    offset += ch.length;
  }
  const collapsed = collapseSeparators({ text: normalized, starts, ends });
  const leet = foldLeet(collapsed);
  return { text, normalized: leet.text, starts: leet.starts, ends: leet.ends };
}

// Shared by rule evidence, SMS features and dataset matching so the same
// obfuscated spelling reaches every local layer.
export function normalizeForMatching(value) {
  return normalizeEvidence(value).normalized;
}
export function evidenceMatches(source, pattern, { activeOnly = false } = {}) {
  const re = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '') + 'g'),
    found = [];
  for (const match of source.normalized.matchAll(re)) {
    const start = source.starts[match.index],
      end = source.ends[match.index + match[0].length - 1];
    if (start === undefined || end === undefined) continue;
    if (activeOnly && isProtective(source.normalized, match.index)) continue;
    found.push({ start, end, text: source.text.slice(start, end) });
  }
  return found;
}
export function isProtective(text, index) {
  // Treat explicitly quoted examples as advice only with a local educational cue.
  // A report of an actual threat can have quotation marks too.
  const beforeQuote = text.slice(Math.max(0, index - 240), index);
  const quoted = beforeQuote.match(/(?:^|[.!?;\n])([^.!?;\n]{0,145}?)(["“'])[^"”'\n]{0,150}$/);
  if (quoted) {
    const closing = quoted[2] === '“' ? '”' : quoted[2];
    const afterQuote = text.slice(index, index + 200);
    const closeAt = afterQuote.indexOf(closing);
    if (closeAt >= 0) {
      const example = /\b(?:scam example|example (?:of (?:a |an )?(?:scam|phishing|fraudulent) (?:text|message)|of what scammers say)|halimbawa ng scam|sample scam (?:text|message))\s*[:,-]?\s*$/i.test(quoted[1]);
      const reported = /\b(?:if (?:someone|somebody|anyone) (?:says|texts|writes)|kapag may (?:nagsabi|nagtext))\s*[:,]?\s*$/i.test(quoted[1]) &&
        /^[,\s]*(?:report|ignore|block|do not|don't|never|i-report|huwag|wag)\b/i.test(afterQuote.slice(closeAt + 1));
      if (example || reported) return true;
    }
  }
  // Negation applies only to the local clause, not to another request elsewhere.
  const before =
    text
      .slice(0, index)
      .split(/[.!?;\n]|\b(?:but|pero|however|instead)\b|\band\s+(?=(?:send|pay|transfer|reply|provide|enter|submit)\b)/)
      .pop() || '';
  const after = text.slice(index).split(/[.!?;\n]|\b(?:but|pero|however|instead)\b/)[0];
  const waivedPayment = /\b(?:no|without|walang)\s+(?:(?:advance|upfront|processing|release|activation|registration|service|handling|extra|additional|security|deposit|fee|fees|payment|payments|or|and|na|bayad|sinisingil)\s+){0,8}$/i.test(before)
    && /^(?:payment|fees?|deposit|release fee|processing fee|registration fee|advance fee|upfront|recharge|bayad)\b/i.test(after);
  const directDemandAfter = /\band\s+(?:pay|send|give|transfer|reply)\s+(?:me|us|to me|to us)\b|\band\s+(?:send|share|give|provide)\s+(?:it|that|them|the code)\s+(?:to|with)\s+(?:me|us)\b/i.test(after);
  const keepPrivate = !directDemandAfter && /\bkeep\s+(?:(?:your|the)\s+)?$/i.test(before)
    && /^(?:otp|password|pin|cvv|verification code)\s+(?:private|secret|confidential)\b/i.test(after);
  const reportedWarning = !directDemandAfter && /\b(?:do not|don't|never)\s+follow\s+(?:messages?|texts?|offers?)\s+(?:saying|that say)\b[^.!?;\n]{0,160}$/i.test(before);
  const conditionalWarning = /\bif\s+(?:someone|anyone)\s+(?:asks|requests|demands)\b[^.!?;\n]{0,100}$/i.test(before)
    && /,\s*(?:(?:huwag|wag)\s+(?:(?:mo|mong|na|po|ito|iyong)\s+){0,3}(?:bayaran|magbayad|ibigay|ipadala)|(?:do not|don't|never)\s+(?:pay|send|share|give))\b/i.test(after);
  return waivedPayment || keepPrivate || reportedWarning || conditionalWarning || /\b(?:never|do not|don't|dont|huwag|wag|hindi|di|won't|will not|not going to|avoid)\s+(?:(?:ever|please|mong?|na|po|kita|ka|ako|ikaw|ko|namin|we|i|you|your|ang|iyong|inyong|siya|sila|share|send|give|ibigay|ibahagi|ipadala|say|sabihin|provide|enter|submit|the|a|anyone|anybody|our|their|magbayad|bayaran|ng|hinihingi|nilang)\s+){0,7}$/i.test(
    before,
  );
}
export function evidenceSegments(text, indicators) {
  const spans = indicators
    .flatMap((i) => (i.evidence || []).map((e) => ({ ...e, id: i.id })))
    .filter(
      (e) =>
        Number.isInteger(e.start) &&
        Number.isInteger(e.end) &&
        e.start >= 0 &&
        e.end > e.start &&
        e.end <= text.length,
    );
  const points = [...new Set([0, text.length, ...spans.flatMap((e) => [e.start, e.end])])].sort(
    (a, b) => a - b,
  );
  return points.slice(0, -1).map((start, i) => ({
    start,
    end: points[i + 1],
    text: text.slice(start, points[i + 1]),
    ids: [
      ...new Set(spans.filter((e) => e.start <= start && e.end >= points[i + 1]).map((e) => e.id)),
    ],
  }));
}
