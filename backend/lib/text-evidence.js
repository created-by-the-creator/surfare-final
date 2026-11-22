// Index every normalized UTF-16 character back to the exact original text.
// Highlights never reconstruct user text or inject HTML.
export function normalizeEvidence(text) {
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
  // Common evasion in words; leave standalone numbers and phone numbers intact.
  normalized = normalized.replace(/[a-z][a-z0-9@]*|[0-9@]+[a-z][a-z0-9@]*/g, (word) =>
    word.replace(/[034@]/g, (c) => ({ 0: 'o', 3: 'e', 4: 'a', '@': 'a' })[c]),
  );
  return { text, normalized, starts, ends };
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
  const directDemandAfter = /\band\s+(?:pay|send|give|transfer|reply)\s+(?:me|us|to me|to us)\b|\band\s+(?:send|share|give|provide)\s+(?:it|that|them|the code)\s+(?:to|with)\s+(?:me|us)\b/i.test(after);
  const keepPrivate = !directDemandAfter && /\bkeep\s+(?:(?:your|the)\s+)?$/i.test(before)
    && /^(?:otp|password|pin|cvv|verification code)\s+(?:private|secret|confidential)\b/i.test(after);
  const reportedWarning = !directDemandAfter && /\b(?:do not|don't|never)\s+follow\s+(?:messages?|texts?|offers?)\s+(?:saying|that say)\b[^.!?;\n]{0,160}$/i.test(before);
  const conditionalWarning = /\bif\s+(?:someone|anyone)\s+(?:asks|requests|demands)\b[^.!?;\n]{0,100}$/i.test(before)
    && /,\s*(?:(?:huwag|wag)\s+(?:(?:mo|mong|na|po|ito|iyong)\s+){0,3}(?:bayaran|magbayad|ibigay|ipadala)|(?:do not|don't|never)\s+(?:pay|send|share|give))\b/i.test(after);
  return keepPrivate || reportedWarning || conditionalWarning || /\b(?:never|do not|don't|dont|huwag|wag|hindi|di|won't|will not|not going to|avoid)\s+(?:(?:ever|please|mong?|na|po|kita|ka|ako|ikaw|ko|namin|we|i|you|your|ang|iyong|inyong|siya|sila|share|send|give|ibigay|ibahagi|ipadala|say|sabihin|provide|enter|submit|the|a|anyone|anybody|our|their|magbayad|bayaran|ng|hinihingi|nilang)\s+){0,7}$/i.test(
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
