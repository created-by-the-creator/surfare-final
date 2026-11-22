import { analyzeUrl } from './url.js';

const URL_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ph|xyz|top|click|zip|info|site|online)(?:\/[^\s<>"']*)?/gi;

const TEXT_RULES = [
  {
    id: 'urgency',
    severity: 2,
    weight: 2,
    pattern: /\b(act now|within\s+\d+\s+hours?|last warning|urgent|agad|ngayon na|bilisan mo|i-expire|expires today)\b/i,
  },
  {
    id: 'threat_loss',
    severity: 2,
    weight: 2,
    pattern: /\b(account (?:will be|has been) (?:suspended|blocked|closed)|ma-block|masuspinde|mawawala|will be terminated)\b/i,
  },
  {
    id: 'otp_request',
    severity: 3,
    weight: 4,
    pattern: /\b(otp|one[- ]time password|verification code|send (?:me )?(?:the )?code|i-send ang code|ibigay ang otp)\b/i,
  },
  {
    id: 'credential_request',
    severity: 3,
    weight: 3,
    pattern: /\b(password|passcode|pin|cvv|card number|login details|account details|account credentials|details we sent you)\b/i,
  },
  {
    id: 'money_demand',
    severity: 3,
    weight: 3,
    pattern: /\b(send (?:me )?money|give me your money|padala|gcash|maya|paymaya|bank transfer|processing fee|advance payment|bayad muna)\b/i,
  },
  {
    id: 'prize_lottery',
    severity: 2,
    weight: 2,
    pattern: /\b(you (?:have )?won|nanalo ka|claim your prize|free load|ayuda|lottery winner)\b/i,
  },
  {
    id: 'impersonation',
    severity: 2,
    weight: 2,
    pattern: /\b(bpi|bdo|gcash|maya|globe|smart|lbc|doh|sss|philhealth|bir|nbi|police|ceo|boss|anak mo|kamag-anak)\b/i,
  },
  {
    id: 'secrecy',
    severity: 2,
    weight: 2,
    pattern: /\b(don't tell anyone|do not tell anyone|huwag ipaalam|kahit kanino)\b/i,
  },
  {
    id: 'job_scam',
    severity: 2,
    weight: 2,
    pattern: /\b(work from home|easy money|per task|like and earn|walang puhunan|online job)\b/i,
  },
  {
    id: 'romance_or_emergency',
    severity: 3,
    weight: 3,
    pattern: /\b(naaksidente|kailangan ko ng pera|send help|emergency|huwag mong sabihin kahit kanino|kamag-anak ko)\b/i,
  },
  {
    id: 'generic_greeting',
    severity: 1,
    weight: 1,
    pattern: /\b(dear customer|dear user|mahal naming kliyente)\b/i,
  },
];

function urlMatches(text) {
  return Array.from(text.matchAll(URL_PATTERN), (match) => {
    const value = match[0].replace(/[),.!?;:]+$/, '');
    return { text: value, start: match.index, end: match.index + value.length };
  });
}

export function extractUrls(text) {
  return urlMatches(text).map((match) => match.text);
}

function evidenceInUrl(evidence, urlMatch) {
  const needle = String(evidence || '').trim();
  if (!needle) return [];
  const at = urlMatch.text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return [];
  return [
    {
      start: urlMatch.start + at,
      end: urlMatch.start + at + needle.length,
      text: urlMatch.text.slice(at, at + needle.length),
    },
  ];
}

export function analyzeText(text) {
  const matches = urlMatches(text);
  const textWithoutUrls = text.replace(URL_PATTERN, (value) => ' '.repeat(value.length));
  const signals = TEXT_RULES.flatMap((rule) => {
    const match = rule.pattern.exec(textWithoutUrls);
    return match
      ? [
          {
            id: rule.id,
            severity: rule.severity,
            weight: rule.weight,
            evidence: match[0],
            evidenceItems: [
              {
                start: match.index,
                end: match.index + match[0].length,
                text: match[0],
              },
            ],
          },
        ]
      : [];
  });
  const urls = matches.map((match) => match.text);
  const bareUrl =
    urls.length === 1 &&
    urls[0].replace(/[),.!?;:]+$/, '') === text.trim().replace(/[),.!?;:]+$/, '');

  if (matches.length > 0 && !bareUrl) {
    const first = matches[0];
    signals.push({
      id: 'link_in_message',
      severity: 1,
      weight: 1,
      evidence: first.text,
      evidenceItems: [{ start: first.start, end: first.end, text: first.text }],
    });
  }

  return {
    signals,
    urls,
    urlMatches: matches,
    checkedText: text,
  };
}

export function analyzeTextAndUrls(text) {
  const analysis = analyzeText(text);
  const urlSignals = analysis.urlMatches.flatMap((urlMatch) =>
    analyzeUrl(urlMatch.text).signals.map((signal) => ({
      ...signal,
      evidenceItems: evidenceInUrl(signal.evidence, urlMatch),
    })),
  );
  const signals = [...analysis.signals, ...urlSignals];
  const has = (ids) => signals.some((signal) => ids.includes(signal.id));
  const hasUrgency = has(['urgency', 'threat_loss']);
  const hasCredentials = has(['otp_request', 'credential_request']);
  const hasMoneyAndImpersonation = has(['money_demand']) && has(['impersonation']);
  const hasThreatAndLink = has(['threat_loss']) && has(['link_in_message']);
  if ((hasUrgency && hasCredentials) || hasMoneyAndImpersonation || hasThreatAndLink) {
    signals.push({
      id: 'combo_bonus',
      severity: 3,
      weight: 4,
      evidence: '',
    });
  }
  return {
    ...analysis,
    signals,
  };
}
