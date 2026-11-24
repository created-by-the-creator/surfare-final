// Only fixed diagnostic codes leave the local verifier. Manifest text stays local.
export const CREDENTIAL_CHECK_CODES = new Set([
  'signature-valid', 'signature-failed', 'file-match', 'file-mismatch',
  'signer-trusted', 'signer-untrusted', 'credential-expired', 'credential-revoked',
  'manifest-invalid', 'validation-failed',
]);

export function credentialChecks(store) {
  const active = store?.validation_results?.activeManifest;
  const result = [];
  for (const [state, entries] of [['success', active?.success], ['failure', active?.failure]]) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const code = entry?.code;
      if (typeof code !== 'string') continue;
      if (state === 'success') {
        if (code === 'claimSignature.validated') result.push('signature-valid');
        if (/^assertion\.(?:dataHash|bmffHash|boxesHash|collectionHash)\.match$/.test(code)) result.push('file-match');
        if (code === 'signingCredential.trusted') result.push('signer-trusted');
      } else {
        if (code === 'claimSignature.mismatch' || code === 'claimSignature.missing') result.push('signature-failed');
        else if (/^assertion\.(?:dataHash|bmffHash|boxesHash|collectionHash)\.mismatch$/.test(code)) result.push('file-mismatch');
        else if (code === 'signingCredential.untrusted') result.push('signer-untrusted');
        else if (/^(?:signingCredential|timeStamp)\.expired$/.test(code)) result.push('credential-expired');
        else if (/^signingCredential\.(?:ocsp\.)?revoked$/.test(code)) result.push('credential-revoked');
        else if (/^(?:claim|assertion)\./.test(code)) result.push('manifest-invalid');
        else result.push('validation-failed');
      }
    }
  }
  if (store?.validation_state === 'Invalid' && !result.some((code) => !['signature-valid', 'file-match', 'signer-trusted'].includes(code))) result.push('validation-failed');
  return [...new Set(result)];
}
