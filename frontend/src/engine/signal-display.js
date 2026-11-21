function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fallbackLabel(t) {
  return clean(t('fallback.missing')) || 'This needs a closer look.';
}

export function getSignalLabel(signal, t) {
  if (!signal) return fallbackLabel(t);
  const key = `signal.${signal.id}`;
  let translated = clean(t(key));

  if (
    (!translated || translated === key || translated === fallbackLabel(t)) &&
    typeof signal.id === 'string'
  ) {
    let genericKey = '';
    if (signal.id.startsWith('brand-')) genericKey = 'signal.brand-imitation-link';
    else if (signal.id.startsWith('lookalike-')) genericKey = 'signal.lookalike-link';
    if (genericKey) {
      const generic = clean(t(genericKey));
      if (generic && generic !== genericKey) translated = generic;
    }
  }

  if (translated && translated !== key && translated !== fallbackLabel(t)) return translated;
  let supplied = clean(signal.label || signal.title || signal.message);
  if (supplied === key || supplied.startsWith('signal.')) supplied = '';
  return supplied || fallbackLabel(t);
}

export function evidenceCandidates(signal) {
  if (Array.isArray(signal?.evidenceItems)) return signal.evidenceItems;
  if (Array.isArray(signal?.evidence)) return signal.evidence;
  const text = clean(signal?.evidence);
  return text ? [{ text }] : [];
}

export function getSignalEvidenceItems(signal) {
  return evidenceCandidates(signal)
    .map((item) => ({
      text: clean(item?.text),
      start: item?.start,
      end: item?.end,
    }))
    .filter((item) => item.text);
}

export function groundSignals(signals, content) {
  const source = String(content || '');
  const lowerSource = source.toLowerCase();

  return (Array.isArray(signals) ? signals : []).map((signal) => {
    const items = [];
    const seen = new Set();

    for (const candidate of evidenceCandidates(signal)) {
      const text = clean(candidate?.text);
      if (text.length < 2) continue;

      const needle = text.toLowerCase();
      let start = -1;
      if (
        Number.isInteger(candidate?.start) &&
        Number.isInteger(candidate?.end) &&
        candidate.start >= 0 &&
        candidate.end <= source.length &&
        source.slice(candidate.start, candidate.end).toLowerCase() === needle
      ) {
        start = candidate.start;
      } else {
        start = lowerSource.indexOf(needle);
      }
      if (start < 0) continue;

      const end = start + text.length;
      const key = `${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ start, end, text: source.slice(start, end) });
    }

    return {
      ...signal,
      evidenceItems: items,
      evidence: items[0]?.text || '',
    };
  });
}

export function getDisplaySignals(result) {
  return (Array.isArray(result?.signals) ? result.signals : []).filter(
    (signal) => signal?.id !== 'online_match' && getSignalEvidenceItems(signal).length > 0,
  );
}

export function formatEvidenceList(items, t, limit = 2) {
  const texts = [];
  for (const item of Array.isArray(items) ? items : []) {
    const text = clean(item?.text);
    if (text && !texts.includes(text)) texts.push(text);
  }
  const shown = texts.slice(0, limit);
  if (!shown.length) return '';

  const quoted = shown.map((text) => `“${text}”`);
  if (quoted.length === 1) return clean(t('evidence.one', { text: quoted[0] }));
  const joined = `${quoted.slice(0, -1).join(', ')} ${clean(t('evidence.and'))} ${quoted.at(-1)}`;
  return clean(t('evidence.many', { text: joined }));
}
