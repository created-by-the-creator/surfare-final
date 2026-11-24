import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { SOCIAL_PLATFORM_DOMAINS } from '../lib/known-platform-domains.js';
import { VERIFIED_OFFICIAL_DOMAINS } from '../lib/url-reference-datasets.js';
import { normalizeHost } from '../lib/host-reference.js';
import { prepareLenderNames } from '../lib/lender-reference.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(backendRoot, '..');
const externalDir = path.join(backendRoot, 'datasets', 'external');
const outputPath = path.join(repoRoot, 'frontend', 'src', 'engine', 'generated', 'url-reference-data.js');

const phishingIndexPath = path.join(externalDir, 'phishdestroy-domain-index.bin');
const reportedHostsPath = path.join(externalDir, 'pagcor-reported-hosts.txt');
const fakeRegulatorHostsPath = path.join(externalDir, 'pagcor-fake-certification-hosts.txt');
const registeredGamblingHostsPath = path.join(externalDir, 'pagcor-registered-gambling-hosts.txt');
const reviewedGamblingHostsPath = path.join(externalDir, 'local-reviewed-gambling-hosts.txt');
const lendersPath = path.join(externalDir, 'sec-stopped-lenders.txt');

const MAGIC = 'SURFPDI1';
const HEADER_BYTES = 16;
const CHUNK_SIZE = 1024;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function loadLines(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function loadHosts(file) {
  return [...new Set(loadLines(file).map((host) => normalizeHost(host)))].sort();
}

function jsArray(values) {
  return `[\n${values.map((value) => `  ${JSON.stringify(value)},`).join('\n')}\n]`;
}

function base64Chunks(payload) {
  const base64 = payload.toString('base64');
  const chunks = [];
  for (let offset = 0; offset < base64.length; offset += CHUNK_SIZE) {
    chunks.push(base64.slice(offset, offset + CHUNK_SIZE));
  }
  return chunks.map((chunk) => `  ${JSON.stringify(chunk)},`).join('\n');
}

const indexBuffer = fs.readFileSync(phishingIndexPath);
if (
  indexBuffer.length < HEADER_BYTES ||
  indexBuffer.subarray(0, 8).toString('ascii') !== MAGIC
) {
  throw new Error('Invalid known phishing address index.');
}
const count = indexBuffer.readUInt32LE(8);
const fingerprintBytes = indexBuffer[12];
const expectedLength = HEADER_BYTES + count * fingerprintBytes;
if (fingerprintBytes !== 8 || indexBuffer.length !== expectedLength) {
  throw new Error('Truncated known phishing address index.');
}
const fingerprintPayload = indexBuffer.subarray(HEADER_BYTES);
const lenders = prepareLenderNames(loadLines(lendersPath)).map(({ name }) => name);

const generated = `// GENERATED FILE — do not edit by hand.
// Source: backend/scripts/build-browser-url-indexes.mjs
// Reference matches are review clues only; they never certify a destination.
export const PHISHING_INDEX = Object.freeze({
  magic: ${JSON.stringify(MAGIC)},
  count: ${count},
  fingerprintBytes: ${fingerprintBytes},
  sourceSha256: ${JSON.stringify(sha256(phishingIndexPath))},
});

const PHISHING_FINGERPRINT_CHUNKS = [
${base64Chunks(fingerprintPayload)}
];

export const PHISHING_FINGERPRINTS_BASE64 = PHISHING_FINGERPRINT_CHUNKS.join('');
export const SOCIAL_PLATFORM_DOMAINS = Object.freeze(${jsArray([...SOCIAL_PLATFORM_DOMAINS].sort())});
export const VERIFIED_OFFICIAL_DOMAINS = Object.freeze(${jsArray([...VERIFIED_OFFICIAL_DOMAINS].sort())});
export const REPORTED_GAMBLING_HOSTS = Object.freeze(${jsArray(loadHosts(reportedHostsPath))});
export const FAKE_REGULATOR_HOSTS = Object.freeze(${jsArray(loadHosts(fakeRegulatorHostsPath))});
export const REGISTERED_GAMBLING_HOSTS = Object.freeze(${jsArray(loadHosts(registeredGamblingHostsPath))});
export const REVIEWED_GAMBLING_HOSTS = Object.freeze(${jsArray(loadHosts(reviewedGamblingHostsPath))});
export const STOPPED_LENDER_NAMES = Object.freeze(${jsArray(lenders.sort((a, b) => a.localeCompare(b)))});
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, generated);
console.log(`Wrote ${path.relative(repoRoot, outputPath)} (${generated.length} bytes).`);
