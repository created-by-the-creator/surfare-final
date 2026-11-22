// Check line starts too: an image may contain several codes as well as OCR text.
// EMV merchant-presented payment data starts with field 00, length 02, value 01.
// Recognizing that layout does not authenticate the merchant or the payment.
const privateRecord = /^(?:WIFI:[A-Z]{1,2}:|DPP:[A-Z]:|OTPAUTH(?:-MIGRATION)?:\/\/|BEGIN:(?:VCARD|VCALENDAR|VEVENT)\b|MECARD:|BIZCARD:|GEO:[+-]?\d|UPI:\/\/|BITCOIN:\S|ETHEREUM:\S|LIGHTNING:\S|000201\d{4})/im;

export function isPrivateQrPayload(text) {
  return typeof text === 'string' && privateRecord.test(text.trim().replace(/^[ \t]+/gm, ''));
}

export function isUnsupportedQrPayload(text) {
  return isPrivateQrPayload(text) || /^(?:tel|facetime|sip|intent|market|data|file):/im.test(String(text || '').trim());
}
