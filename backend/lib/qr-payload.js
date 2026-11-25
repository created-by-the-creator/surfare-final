// Check line starts too: an image may contain several codes as well as OCR text.
// EMV merchant-presented payment data starts with field 00, length 02, value 01.
// Recognizing that layout does not authenticate the merchant or the payment.
const privateRecord = /^(?:WIFI:[A-Z]{1,2}:|DPP:[A-Z]:|OTPAUTH(?:-MIGRATION)?:\/\/|BEGIN:(?:VCARD|VCALENDAR|VEVENT)\b|MECARD:|BIZCARD:|MAILTO:|SMS:|SMSTO:|MMS:|MMSTO:|GEO:[+-]?\d|UPI:\/\/|BITCOIN:\S|ETHEREUM:\S|LIGHTNING:\S|000201\d{4})/im;

// WhatsApp-style companion pairing: reference, three 32-byte base64 keys,
// with optional numeric client/version fields. Shape recognition is not proof
// that WhatsApp issued the code. Never send these linking secrets to AI.
function isLoginRecord(line) {
  const parts = line.trim().split(',');
  return parts.length >= 4 && parts.length <= 6 &&
    /^(?:[0-9]+@)?[A-Za-z0-9+/_=-]{16,1024}$/.test(parts[0]) &&
    parts.slice(1, 4).every(part => /^[A-Za-z0-9+/_-]{43}=?$/.test(part)) &&
    parts.slice(4).every(part => /^\d{1,6}$/.test(part));
}

export function isLoginQrPayload(text) {
  return typeof text === 'string' && text.split(/\r?\n/).some(isLoginRecord);
}

// Preserve offsets for genuine warnings in accompanying text.
export function withoutLoginQrPayloads(text) {
  return String(text || '').replace(/[^\r\n]+/g, line => isLoginRecord(line) ? ' '.repeat(line.length) : line);
}

export function isPrivateQrPayload(text) {
  return typeof text === 'string' && (isLoginQrPayload(text) || privateRecord.test(text.trim().replace(/^[ \t]+/gm, '')));
}

export function isUnsupportedQrPayload(text) {
  return isPrivateQrPayload(text) || /^(?:tel|facetime|sip|intent|market|data|file):/im.test(String(text || '').trim());
}
