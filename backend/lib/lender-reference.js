const genericLenderNames = new Set([
  'bat loan',
  'cash 100',
  'easy cash',
  'flash cash',
  'happy credit',
  'happy loan',
  'hatulong',
  'little cash',
  'umbrella',
]);

function compact(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function compactText(text) {
  let value = '';
  const offsets = [];
  for (let i = 0; i < text.length; i += 1) {
    const character = compact(text[i]);
    if (!character) continue;
    value += character;
    offsets.push(i);
  }
  return { value, offsets };
}

function isWordCharacter(character) {
  return Boolean(character && /[\p{L}\p{N}]/u.test(character));
}

function hasLoanContext(text, start, end) {
  const before = text.slice(Math.max(0, start - 90), start);
  const after = text.slice(end, Math.min(text.length, end + 90));
  return /\b(?:loan|lending|lender|pera|cash|credit|pautang|hiram|bayad|installment|loan app)\b/i.test(
    `${before} ${after}`,
  );
}

export function prepareLenderNames(names) {
  return (Array.isArray(names) ? names : [])
    .map((name) => ({ name, key: compact(name) }))
    .filter((entry) => entry.key.length >= 5 && !genericLenderNames.has(entry.name.toLowerCase()));
}

export function matchStoppedLenders(text, urls, preparedNames) {
  const source = String(text || '');
  const indexed = compactText(source);
  const matches = [];
  const byStart = new Map();

  const addMatch = (name, start, end) => {
    if (start < 0 || end <= start) return;
    const previous = byStart.get(start);
    if (previous && previous.name.length >= name.length) return;
    const match = {
      name,
      evidence: [{ start, end, text: source.slice(start, end) }],
    };
    if (previous) matches.splice(matches.indexOf(previous), 1, match);
    else matches.push(match);
    byStart.set(start, match);
  };

  for (const { name, key } of preparedNames) {
    let from = 0;
    while (from <= indexed.value.length - key.length) {
      const at = indexed.value.indexOf(key, from);
      if (at < 0) break;
      from = at + 1;
      const start = indexed.offsets[at];
      const end = indexed.offsets[at + key.length - 1] + 1;
      if (isWordCharacter(source[start - 1]) || isWordCharacter(source[end])) continue;
      if (genericLenderNames.has(name.toLowerCase()) && !hasLoanContext(source, start, end)) continue;
      addMatch(name, start, end);
      break;
    }

    for (const info of Array.isArray(urls) ? urls : []) {
      const rawHost = String(info?.host || '');
      const labels = rawHost.split('.').filter(Boolean);
      const matchedLabel = labels.find((label) => compact(label) === key);
      if (!matchedLabel) continue;
      const start = source.indexOf(matchedLabel);
      if (start < 0) continue;
      const end = start + matchedLabel.length;
      if (genericLenderNames.has(name.toLowerCase()) && !hasLoanContext(source, start, end)) continue;
      addMatch(name, start, end);
    }
  }
  return matches;
}
