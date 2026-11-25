export function needsAiBackup(local, { enabled, configured, online }) {
  return !!(
    enabled &&
    configured &&
    online &&
    ['Insufficient evidence', 'Suspicious', 'Low risk'].includes(local?.level) &&
    local.sourceText?.trim()
  );
}
