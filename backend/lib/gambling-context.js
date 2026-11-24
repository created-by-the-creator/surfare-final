// Generic words such as "bet" or "lottery" are too ambiguous on their own.
// Require an explicit gambling offer/CTA, or a gambling-looking address.
export const GAMBLING_INTENT_PATTERN =
  /\b(?:gambl(?:e|ing)|casino|sports(?:book|[- ]?betting)|betting|wager(?:ing)?|poker|bingo|perya|swert(?:e|res)|taya|juankada|baccarat|roulette|slots?|cash[- ]?wheel|jackpot|free spins?|igaming|online gaming|mahjong|sabong|cockfight|bonus code)\b/i;
export const GAMBLING_CTA_PATTERN =
  /\b(?:place (?:a|your) bet|bet now|play now|maglaro|register now|sign up now|claim (?:your )?bonus|avail (?:the )?bonus|cash[- ]?in now|deposit now)\b/i;
export const GAMBLING_URL_CUE_PATTERN =
  /(?:^|[^a-z])(?:casino|bet|slots?|lotto|lottery|swert\w*|perya|sabong|poker|jackpot|bingo|cash[- ]?wheel|games?|gaming|wins?|prizes?|payouts?|bonus(?:es)?|jili|pgsoft)(?:$|[^a-z])/i;

function decodeUrlText(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

export function hasGamblingContext(text, urls) {
  const message = String(text || '');
  const urlText = (Array.isArray(urls) ? urls : [])
    .map((info) => decodeUrlText(info?.url))
    .join(' ');
  return (
    GAMBLING_INTENT_PATTERN.test(message) ||
    GAMBLING_CTA_PATTERN.test(message) ||
    GAMBLING_URL_CUE_PATTERN.test(urlText)
  );
}
