// File provenance is assessed separately on the device. These categories describe pixels only.
export const ORIGIN_CRITERIA = ['anatomy', 'lighting', 'objects', 'texture', 'text', 'background'];

export function validateCompactOrigin(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid visual clue review.');
  if (!['clear', 'unclear'].includes(value.clarity))
    throw Error('Invalid visual review clarity.');
  if (!Array.isArray(value.clues) || value.clues.length > ORIGIN_CRITERIA.length)
    throw Error('Invalid visual clue list.');
  if (new Set(value.clues.map((clue) => clue?.id)).size !== value.clues.length)
    throw Error('Duplicate visual clue area.');
  for (const clue of value.clues) {
    if (
      !clue ||
      !ORIGIN_CRITERIA.includes(clue.id) ||
      ![1, 2].includes(clue.level) ||
      typeof clue.note !== 'string' ||
      !clue.note.trim() ||
      clue.note.length > 200
    )
      throw Error('Invalid visual clue.');
  }
  if (
    value.nonClue !== undefined &&
    (typeof value.nonClue !== 'string' || value.nonClue.length > 200)
  )
    throw Error('Invalid non-clue note.');
  return value;
}

export function buildOriginReview(value) {
  const compact = validateCompactOrigin(value);
  const unique = new Map();
  // Two categories can describe the same artifact. Count the observation only once.
  for (const clue of compact.clues) {
    const key = clue.note.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!unique.has(key) || clue.level > unique.get(key).level) unique.set(key, clue);
  }
  const clues = [...unique.values()].sort((left, right) => right.level - left.level);
  const clearClues = clues.filter((clue) => clue.level === 2);
  let likelihood = 'Unclear';
  if (compact.clarity === 'clear') {
    if (clearClues.length >= 3) likelihood = 'Strong';
    else if (clearClues.length) likelihood = 'Possible';
    else if (!clues.length) likelihood = 'No clear';
  }
  const summary = compact.clarity === 'unclear'
    ? 'There was too little visible detail for a reliable visual review.'
    : {
        Strong: 'Several specific visual inconsistencies were seen.',
        Possible: 'The visual review found a specific inconsistency that could be related to AI.',
        Unclear: 'The visual details have several possible explanations.',
        'No clear': 'The visual review could not establish how this image was made.',
      }[likelihood];
  const observations = clues.slice(0, 4).map((clue) => clue.note.trim());
  const nonClues = compact.nonClue?.trim() ? [compact.nonClue.trim()] : [];

  return {
    extractedText: '',
    analysis: {
      level: 'Insufficient evidence',
      summary: 'No message text was read in this mode.',
      recommendation: 'Switch to text reading to check words in the image.',
      findings: [],
    },
    origin: {
      label:
        likelihood === 'Strong' || likelihood === 'Possible'
          ? 'AI-like visual cues'
          : likelihood === 'No clear'
            ? 'No clear AI cues'
            : 'Uncertain',
      likelihood,
      summary: summary.slice(0, 800),
      observations,
      nonClues: nonClues.slice(0, 3),
    },
  };
}
