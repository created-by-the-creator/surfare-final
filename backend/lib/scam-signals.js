import { normalizeEvidence, evidenceMatches } from './text-evidence.js';

// Intent combinations informed by development examples, not sender blocklists.
export function scamSignals(text) {
  const source = normalizeEvidence(text),
    signals = [];
  const hits = (pattern) => evidenceMatches(source, pattern, { activeOnly: true });
  const close = (left, right) =>
    Math.abs(left.start - right.start) <= 220 &&
    !/[!?;\n]/.test(
      text.slice(Math.min(left.end, right.end), Math.max(left.start, right.start)),
    );
  // Every supplied condition group must match near the same clause. Passing a
  // third group is not silently ignored, which keeps broad payout promises
  // from becoming profit-share accusations on their own.
  const add = (id, title, message, weight, ...groups) => {
    const evidence = [];
    for (const left of groups[0] || []) {
      const chosen = [left];
      for (const group of groups.slice(1)) {
        const match = group.find((right) => chosen.every((item) => close(item, right)));
        if (!match) {
          chosen.length = 0;
          break;
        }
        chosen.push(match);
      }
      if (chosen.length) evidence.push(...chosen);
    }
    if (evidence.length)
      signals.push({
        id,
        title,
        message,
        weight,
        category: 'scam',
        evidence: [...new Map(evidence.map((p) => [p.start + ':' + p.end, p])).values()],
      });
  };
  const fee = hits(
    /\b(?:advance fee|upfront|processing fee|release fee|activation fee|security deposit|registration fee|magdeposito|mag-deposito|magbayad muna|bayad muna|recharge|top[ -]?up)\b/i,
  );
  add('gift-card-prize-fee', 'Gift-card payment for a prize',
    'A prize offer asks you to buy a gift card or send its code before receiving winnings. Verify independently and do not send the code.',
    4,
    hits(/\b(?:prize|winnings|premyo|nanalo)\b/i),
    hits(/\b(?:gift[ -]?card|voucher code)\b/i),
    hits(/\b(?:buy|purchase|bumili|send (?:its|the|your) code|ipadala (?:ang )?code)\b/i));
  add(
    'loan-fee',
    'Payment before a loan is released',
    'A loan offer asks for an advance payment. Verify the lender independently before paying.',
    4,
    hits(/\b(?:loan|pautang|utang|approved credit|cash assistance)\b/i),
    fee,
  );
  add(
    'job-fee',
    'Payment to unlock work or earnings',
    'A work or commission offer asks for a deposit or recharge. This resembles an advance-payment task scam.',
    4,
    hits(/\b(?:job|trabaho|hiring|tasks?|commission|komisyon|salary|sahod)\b/i),
    fee,
  );
  add(
    'task-recruitment',
    'Easy-income recruitment',
    'The message offers earnings for simple online actions and asks you to contact a recruiter. Confirm the employer and avoid deposits.',
    2,
    hits(
      /\b(?:earn|kumita|kikita|kita|paid)\b[^!?;\n]{0,100}\b(?:watching|manood|nanonood|youtube|liking|likes|rating|reviews|tasks?)\b/i,
    ),
    hits(/\b(?:contact|tutor|telegram|whatsapp|recruiter|makipag-ugnayan|message me|register)\b/i),
  );
  add(
    'task-income-recruitment',
    'Daily earnings for simple social-media tasks',
    'A hiring offer promises daily earnings for likes, follows or similar tasks and directs you to a messaging-app recruiter. Verify the employer independently and avoid sending money or codes.',
    5,
    hits(/\b(?:hiring|job(?: opening)?|trabaho|recruiting)\b[!:,\s-]{0,12}(?:earn|kumita|kikita|paid)\b[^!?;\n]{0,55}\b(?:daily|per day|bawat araw|araw[ -]araw)\b/i),
    hits(/\b(?:like\s+and\s+follow|liking\s+and\s+following|liking\s+(?:posts|videos)|following\s+(?:accounts|pages)|rating\s+(?:products|videos)|(?:post|video|product)\s+reviews|watching videos|manood)\b/i),
    hits(/\b(?:telegram|whatsapp)\b/i),
  );
  add(
    'cancel-lure',
    'Unexpected renewal or cancellation request',
    'A claimed automatic charge asks you to cancel or dispute it through a link. Check the official app independently.',
    3,
    hits(
      /\b(?:automatically renew|auto[ -]?renew|automatic charge|unauthorized (?:payment|transaction)|charged|renewal)\b/i,
    ),
    hits(
      /\b(?:cancel|dispute|reverse|refund|stop)\b[^!?;\n]{0,100}\b(?:visit|click|link|https?|www|here)\b/i,
    ),
  );
  add(
    'benefit-claim',
    'Benefit claim through an unverified channel',
    'A benefit or entitlement asks you to apply or contact someone. Verify eligibility and the contact through the agency directly.',
    2,
    hits(
      /\b(?:social security|sss|gsis|government|ayuda|beneficiary|entitlement|lump sum|contribution)\b/i,
    ),
    hits(
      /\b(?:claim|apply|contact|email|register|kunin)\b[^!?;\n]{0,100}(?:https?:|\b[\w-]+\.[a-z]{2,}\b|@)/i,
    ),
  );
  add(
    'load-transfer',
    'Dial code may transfer prepaid credit',
    'A reward or points message asks you to dial a service code. Confirm what the code does with your mobile provider before calling.',
    4,
    hits(/\b(?:points|bonus|prepaid|load|reward|convert|expire)\b/i),
    hits(/\*[\d*\s]{6,}#/),
  );
  const winningsPromise = hits(
    /\b(?:(?:ipapanalo|papanalunin|panalunin|papalduhin)\s+(?:(?:ko|namin)\s+)?(?:kita|ka|kayo)|ako bahala sa winning|guaranteed win(?:nings)?|sure win)\b/i,
  );
  add(
    'guaranteed-winnings',
    'Someone promises to control your winnings',
    'The sender promises winnings and asks for contact or a share. This does not establish that a game or offer is legitimate.',
    3,
    winningsPromise,
    hits(/\b(?:reply|message|facebook|peysbuk|fb|bahala sa(?:kin| akin)|share|deposit|hati tayo|hatian|search)\b|@[\w.]+/i),
  );
  add(
    'winnings-deposit',
    'Cash-in requested for promised winnings',
    'The sender asks for a cash-in or deposit while promising to control your winnings. This is a strong scam warning sign; do not send money on that promise.',
    5,
    winningsPromise,
    hits(/\b(?:cash[ -]?in\s+(?:ka|kayo|muna)|mag[ -]?cash[ -]?in|mag[ -]?deposito|deposit\s+(?:first|now|money|funds|\d))\b/i),
  );
  add(
    'profit-share-bait',
    'Money-doubling or profit-share offer',
    'A stranger offers to grow your money and split the profit after you send cash. Confirm the person through a channel you already trust before sending money.',
    5,
    hits(/\b(?:cash[ -]?in|mag[ -]?deposito|deposit|send money)\b/i),
    hits(/\b(?:ipapanalo|papalduhin|panalunin|double your|multiply your)\b/i),
    hits(/\b(?:hati tayo|hatian|split|komisyon|commission)\b/i),
  );
  add(
    'gambling-signup-offer',
    'Gambling sign-up bonus offer',
    'A gambling message promises free credits or a welcome bonus and gives a code to use. Check the operator and the offer through its own official channel before signing up.',
    3,
    hits(/\b(?:welcome package|welcome bonus|free spins?|free credits?|bonus|panalo|nanalo|premyo|jackpot)\b/i),
    hits(/\b(?:use code|promo code|use\s+\d+|register|sign up|maglaro|play now)\b/i),
  );
  return signals;
}
