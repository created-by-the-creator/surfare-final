// Preserve source meaning: an unwanted advertisement is not a verified scam.
const scamLabels = new Set([
  'scam', 'gambling scam', 'loan scam', 'delivery scam', 'bank scam', 'banking scam',
  'investment scam', 'prize scam', 'raffle scam', 'government spoofing', 'job scam', 'pasaload scam',
]);

export function messageLabel(value) {
  const label = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (['ham', 'legit', 'legitimate', '0'].includes(label)) return 'legitimate';
  if (label === 'commercial spam' || label === 'spam' || label === '1') return 'spam';
  if (scamLabels.has(label)) return 'scam';
  return 'unreviewed';
}
