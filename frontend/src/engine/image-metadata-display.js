import { CREDENTIAL_CHECK_CODES } from './credential-checks.js';

const FINDINGS = new Set(['ai-declaration', 'ai-tool', 'generation-settings', 'generation-workflow', 'generation-parameter']);
const NOTES = new Set(['compressed', 'malformed', 'limit', 'editorOnly', 'seedOnly', 'c2paUnverified', 'credentialsUnchecked', 'tooLarge', 'unsupported', 'unreadable']);

export function imageMetadataDetails(metadata, t) {
  return [
    ...(metadata?.findings || []).filter((code) => FINDINGS.has(code)).map((code) => t(`result.imageMetadata.finding.${code}`)),
    ...(metadata?.notes || []).filter((code) => NOTES.has(code)).map((code) => t(`result.imageMetadata.note.${code}`)),
    ...(metadata?.credentialChecks || []).filter((code) => CREDENTIAL_CHECK_CODES.has(code)).map((code) => t(`result.imageMetadata.check.${code}`)),
  ].filter((text, index, all) => all.indexOf(text) === index);
}
