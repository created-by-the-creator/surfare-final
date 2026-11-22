// Compact, clue-only scoring for the visual origin review.
// The number is internal: it only selects a user-facing label. It is never
// shown, is not a probability, and is not a claim about authenticity.

export const ORIGIN_CRITERIA = [
  { id: 'anatomy', weight: 15 },
  { id: 'lighting', weight: 15 },
  { id: 'objects', weight: 15 },
  { id: 'texture', weight: 15 },
  { id: 'text', weight: 10 },
  { id: 'background', weight: 10 },
];

const CRITERION_BY_ID = new Map(ORIGIN_CRITERIA.map((item) => [item.id, item]));

export const METADATA_FINDING_TEXT = {
  'ai-declaration': 'The file says AI was used.',
  'ai-tool': 'The file names an AI tool.',
  'generation-settings': 'The file has AI making details.',
  'generation-workflow': 'The file has AI making steps.',
  'generation-parameter': 'The file has AI making details with a number.',
  'credentials-verified': 'A source note was checked and passed.',
  'credentials-valid': 'A source note was checked but its source was not recognized.',
  'credentials-invalid': 'A source note was checked and did not pass.',
};

export const METADATA_NOTE_TEXT = {
  compressed: 'Some file notes could not be read.',
  malformed: 'Some file notes were incomplete.',
  limit: 'Reading stopped early to keep this check safe.',
  editorOnly: 'A photo editor name alone is not an AI clue.',
  seedOnly: 'One AI detail alone is not enough.',
  c2paUnverified: 'A source note was found but not verified.',
  credentialsUnchecked: 'A source note was found but could not be checked.',
  tooLarge: 'The file was too large to read notes safely.',
  unsupported: 'This file type has no readable notes.',
  unreadable: 'The file notes could not be read.',
};

const NON_CLUE_NOTE_CODES = ['editorOnly', 'seedOnly', 'c2paUnverified', 'credentialsUnchecked'];

export function fileNoteClues(value) {
  const findings = Array.isArray(value?.findings) ? value.findings : [];
  const notes = Array.isArray(value?.notes) ? value.notes : [];
  return [
    ...new Set([
      ...findings
        .filter((code) => typeof code === 'string' && METADATA_FINDING_TEXT[code])
        .map((code) => METADATA_FINDING_TEXT[code]),
      ...notes
        .filter((code) => typeof code === 'string' && METADATA_NOTE_TEXT[code])
        .map((code) => METADATA_NOTE_TEXT[code]),
    ]),
  ].slice(0, 6);
}

function fileNoteNonClues(metadata) {
  const notes = Array.isArray(metadata?.notes) ? metadata.notes : [];
  return NON_CLUE_NOTE_CODES.filter((code) => notes.includes(code)).map(
    (code) => METADATA_NOTE_TEXT[code],
  );
}

// Only locally supported notes add weight. No SynthID, detector probability or
// reverse-image result is available here, so that group stays at zero.
function metadataPoints(metadata) {
  const findings = Array.isArray(metadata?.findings) ? metadata.findings : [];
  if (findings.includes('ai-declaration')) return 10;
  if (findings.some((code) => typeof code === 'string' && code.startsWith('generation')))
    return 8;
  if (findings.includes('ai-tool')) return 6;
  // A source note says where a file came from. It is not AI evidence, even
  // when its check passes, so provenance codes add no points here.
  return 0;
}

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
      !CRITERION_BY_ID.has(clue.id) ||
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

export function scoreOriginClues(value, metadata) {
  const compact = validateCompactOrigin(value);
  const score = compact.clues.reduce((sum, clue) => {
    const weight = CRITERION_BY_ID.get(clue.id).weight;
    return sum + (clue.level === 2 ? weight : Math.round(weight / 2));
  }, metadataPoints(metadata));

  if (compact.clarity === 'unclear')
    return { likelihood: 'Unclear', score };
  if (score >= 75) return { likelihood: 'Strong', score };
  if (score >= 25) return { likelihood: 'Possible', score };
  return { likelihood: 'No clear', score };
}

export function buildOriginReview(value, metadata) {
  const compact = validateCompactOrigin(value);
  const { likelihood } = scoreOriginClues(compact, metadata);
  const summary =
    compact.clarity === 'unclear'
      ? 'The image was too unclear for a useful visual review.'
      : likelihood === 'Strong'
        ? 'Several specific visual clues were seen.'
        : likelihood === 'Possible'
          ? 'Some specific visual clues were seen.'
          : 'No specific visual clue stood out.';
  const observations = compact.clues.slice(0, 4).map((clue) => clue.note.trim().slice(0, 400));
  const nonClues = [...fileNoteNonClues(metadata)];
  if (typeof compact.nonClue === 'string' && compact.nonClue.trim())
    nonClues.push(compact.nonClue.trim().slice(0, 300));

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
