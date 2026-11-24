// Run against the local dev server. Only repository-authored fixtures are submitted.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTICE_VERSION } from '../src/privacy/acknowledgment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/detector-audit.json');
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
const checks = [
  { id: 'text-ai', tab: 'text', inputs: { message: 'Never share your OTP or password. Open your usual wallet app for account safety advice.' } },
  { id: 'link-ai', tab: 'links', inputs: { url: 'https://gcash.login-example.xyz/verify' } },
  { id: 'image-text-ai', tab: 'image', fixture: 'content/tagalog-threat.png', mode: 'ocr' },
  { id: 'qr-content-ai', tab: 'qr', fixture: 'content/tagalog-threat-qr.png' },
  { id: 'image-origin-ai', tab: 'image', fixture: 'ocr/screenshot.png', mode: 'origin' },
];
const results = [];
try {
  const page = await browser.newPage();
  await page.addInitScript((version) => {
    localStorage.setItem('surfare-welcome-seen', 'true');
    localStorage.setItem('surfare-privacy-acknowledgment', JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
  }, NOTICE_VERSION);
  await page.goto(process.env.SURFARE_BASE_URL || 'http://localhost:5173', { waitUntil: 'domcontentloaded' });
  for (const check of checks) {
    const fixture = check.fixture ? await readFile(path.join(root, 'backend/tests/fixtures', check.fixture)) : null;
    const started = Date.now();
    try {
      const result = await page.evaluate(async ({ check, base64 }) => {
        const { analyzeInput } = await import('/src/engine/analyze.js');
        const inputs = { ...check.inputs };
        if (base64) {
          const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
          const file = new File([bytes], 'authored-test-fixture.png', { type: 'image/png' });
          inputs[check.tab === 'qr' ? 'qr' : 'image'] = file;
          inputs.imageVisualConsent = check.mode === 'origin';
        }
        const result = await analyzeInput(check.tab, inputs, { onlineLookup: true, ai: true, imageMode: check.mode || 'ocr' });
        return {
          level: result.level, errorKey: result.errorKey || null,
          aiReview: result.aiReview || null, imageVisualStatus: result.imageVisualStatus || null,
          visualLabel: result.imageOrigin?.labelKey || null,
          imageProvider: result.imageOrigin?.source || null,
          imageDetectionScore: result.imageOrigin?.score ?? null,
          signals: result.signals?.map(signal => signal.id),
          extractedCharacters: result.checkedText?.length || 0,
          decodedQr: Boolean(result.mediaInfo?.qrValue),
          ocrConfidence: result.mediaInfo?.ocrConfidence ?? null,
          onlineUnavailable: result.onlineUnavailable,
        };
      }, { check, base64: fixture?.toString('base64') });
      results.push({ id: check.id, elapsedMs: Date.now() - started, ...result });
    } catch (error) {
      results.push({ id: check.id, elapsedMs: Date.now() - started, error: error.message });
    }
    console.log(JSON.stringify(results.at(-1)));
  }
  const training = JSON.parse(await readFile(path.join(root, 'backend/reports/dataset-training.json'), 'utf8'));
  const report = {
    checkedAt: new Date().toISOString(),
    scope: 'Live local integration checks with authored synthetic fixtures. These are not an accuracy benchmark.',
    results,
    existingInternalComponentMetrics: {
      source: 'backend/reports/dataset-training.json',
      text: training.text.evaluation.test, url: training.url.evaluation.test,
      limitations: training.limits,
    },
    conclusions: [
      'Text, links, OCR-extracted text and decoded QR content share the opt-in AI assessment.',
      'Image-origin review uses local metadata and, with its own sharing choice, the Sightengine genai API; OCR and QR extraction run on the device.',
      'Private QR payloads are excluded from AI and reputation requests.',
      'Component precision and recall do not measure the complete app or live AI accuracy.',
      'Independent, representative labels are still needed for OCR, QR safety, vision provenance and end-to-end AI accuracy.',
    ],
  };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${output}`);
  if (results.some(result => result.error || result.errorKey || (result.id === 'image-origin-ai' ? result.imageVisualStatus !== 'completed' : result.aiReview?.status !== 'completed'))) process.exitCode = 1;
} finally {
  await browser.close();
}
