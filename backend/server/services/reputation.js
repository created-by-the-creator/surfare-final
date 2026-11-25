// Retired endpoints for older clients. No URL or third-party requests are made.
const retired = () => Response.json({
  status: 'unavailable', configured: false, matched: false, unavailable: true,
  message: 'URL lookups have been removed. Use local checks or opt in to the AI double-check.',
}, { status: 410, headers: { 'Cache-Control': 'no-store' } });
export async function verifyUrls() { return retired(); }
export async function verify() { return retired(); }
export async function checkUrl() { return retired(); }
