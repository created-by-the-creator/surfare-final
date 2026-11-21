#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(backendRoot, 'datasets', 'external', 'phishdestroy-domain-index.bin');
const defaultSource = 'https://raw.githubusercontent.com/phishdestroy/destroylist/main/list.txt';
const MAGIC = 'SURFPDI1';
const FINGERPRINT_BYTES = 8;
const HEADER_BYTES = 16;

function normalizeDomain(value) {
  let domain = String(value || '')
    .trim()
    .toLowerCase();
  if (!domain || domain.startsWith('#')) return '';
  domain = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  domain = domain.split(/[/?#]/)[0].replace(/^www\./, '').replace(/\.$/, '');
  if (!domain.includes('.') || /\s/.test(domain)) return '';
  return domain;
}

async function readSource(source) {
  if (source && !/^https?:\/\//i.test(source)) return fs.readFileSync(source, 'utf8');
  const url = source || defaultSource;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const raw = await readSource(process.argv[2]);
  const domains = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const domain = normalizeDomain(line);
    if (domain) domains.add(domain);
  }

  const fingerprints = [...domains]
    .map((domain) => ({
      domain,
      digest: crypto.createHash('sha256').update(domain).digest().subarray(0, FINGERPRINT_BYTES),
    }))
    .sort((a, b) => Buffer.compare(a.digest, b.digest))
    .map((entry) => entry.digest);

  const header = Buffer.alloc(HEADER_BYTES);
  header.write(MAGIC, 0, 8, 'ascii');
  header.writeUInt32LE(fingerprints.length, 8);
  header[12] = FINGERPRINT_BYTES;
  const output = Buffer.concat([header, ...fingerprints]);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);

  console.log(
    `Wrote ${fingerprints.length} domain fingerprints to ${path.relative(backendRoot, outputPath)}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
