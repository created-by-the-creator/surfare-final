import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, parseCsvRows } from './csv-rows.js';
import { messageLabel } from './message-labels.js';
import { normalizeForMatching } from './text-evidence.js';
import reviewedMessages from '../datasets/external/local-reviewed-messages.json' with { type: 'json' };

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetsDir = path.join(backendRoot, 'datasets');
const textDatasetPath = path.join(datasetsDir, 'A.S.E.A Taglish scam Dataset.csv');
const urlDatasetPath = path.join(datasetsDir, 'PhiUSIIL_Phishing_URL_Dataset.csv');

let textRows = null;
let urlIndex = null;
let textIndex = null;
const textMatchCache = new Map();

function loadTextRows() {
  if (!textRows) {
    textRows = parseCsv(fs.readFileSync(textDatasetPath, 'utf8'))
      .filter((row) => row.text?.trim())
      .map((row) => ({
        text: normalizeText(row.text),
        intent: row.intent?.trim() || '',
        tokens: tokenSet(row.text),
      }));
    for (const item of reviewedMessages.messages || []) {
      if (!item.text?.trim()) continue;
      textRows.push({
        text: normalizeText(item.text),
        intent: item.intent === 'HAM' ? 'HAM' : 'Scam',
        tokens: tokenSet(item.text),
      });
    }
    textIndex = new Map();
    for (const row of textRows) {
      // A changed greeting should not hide a known scam template. The final
      // similarity and prefix gates below still decide whether it is a match.
      const keys = row.text.split(' ').filter(Boolean).slice(0, 3);
      for (const key of keys) {
        const bucket = textIndex.get(key) || [];
        bucket.push(row);
        textIndex.set(key, bucket);
      }
    }
  }
  return textRows;
}

function loadUrlIndex() {
  if (!urlIndex) {
    // Quote-aware parsing: PhiUSIIL fields can contain commas and quotes.
    const rows = parseCsvRows(fs.readFileSync(urlDatasetPath, 'utf8'));
    const header = (rows.next().value || []).map((value) => value.trim());
    const urlColumn = header.findIndex((value) => value.toLowerCase() === 'url');
    const labelColumn = header.findIndex((value) => value.toLowerCase() === 'label');
    urlIndex = new Map();
    for (const values of rows) {
      const url = normalizeUrl(values[urlColumn] ?? values[1] ?? '');
      const label = String(values[labelColumn] ?? values.at(-1) ?? '').trim();
      if (url && label && !urlIndex.has(url)) {
        urlIndex.set(url, label);
      }
    }
  }
  return urlIndex;
}

export function normalizeText(value) {
  return normalizeForMatching(value)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length >= 3));
}

function tokenSimilarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
}

function textMatch(text) {
  const normalized = normalizeText(text);
  if (normalized.length < 12) return null;
  if (textMatchCache.has(normalized)) return textMatchCache.get(normalized);
  loadTextRows();
  const keys = normalized.split(' ').filter(Boolean).slice(0, 3);
  const candidates = [...new Set(keys.flatMap((key) => textIndex.get(key) || []))];
  const exact = candidates.find((row) =>
    row.text === normalized
  );
  if (exact) {
    const category = messageLabel(exact.intent);
    const result = category === 'legitimate'
      ? { kind: 'text', risk: 'low', similarity: 1, intent: exact.intent }
      : category === 'scam'
        ? { kind: 'text', risk: 'high', similarity: 1, intent: exact.intent }
        : null;
    textMatchCache.set(normalized, result);
    return result;
  }

  let bestSuspicious = null;
  for (const row of candidates) {
    if (row.text.length < 12) continue;
    const score = tokenSimilarity(normalized, row.text);
    const leftTokens = normalized.split(' ').filter(Boolean);
    const rightTokens = row.text.split(' ').filter(Boolean);
    let matchedPrefix = 0;
    while (
      matchedPrefix < leftTokens.length &&
      matchedPrefix < rightTokens.length &&
      leftTokens[matchedPrefix] === rightTokens[matchedPrefix]
    ) matchedPrefix += 1;
    const prefixRatio = leftTokens.length ? matchedPrefix / leftTokens.length : 0;
    const match = { ...row, similarity: score, prefixRatio };
    if (
      messageLabel(row.intent) === 'scam' &&
      (!bestSuspicious ||
        score > bestSuspicious.similarity ||
        (score === bestSuspicious.similarity && prefixRatio > bestSuspicious.prefixRatio))
    ) {
      bestSuspicious = match;
    }
  }
  // A benign closest neighbour must not hide a suspicious near-match.
  const near = bestSuspicious;
  if (!near) {
    textMatchCache.set(normalized, null);
    return null;
  }
  const strongPrefix =
    leftTokenCount(normalized) >= 8 &&
    near.prefixRatio >= 0.82 &&
    near.similarity >= 0.72;
  const strongSimilarity = near.similarity >= 0.94;
  if (!strongPrefix && !strongSimilarity) {
    textMatchCache.set(normalized, null);
    return null;
  }
  const result = {
    kind: 'text',
    risk: 'high',
    similarity: Math.max(near.similarity, near.prefixRatio),
    intent: near.intent,
  };
  textMatchCache.set(normalized, result);
  return result;
}

function leftTokenCount(value) {
  return normalizeText(value).split(' ').filter(Boolean).length;
}

function urlMatch(urls) {
  if (!urls.length) return null;
  const index = loadUrlIndex();
  let benign = null;
  for (const raw of urls || []) {
    const normalized = normalizeUrl(raw);
    if (!normalized || !index.has(normalized)) continue;
    const label = String(index.get(normalized)).trim();
    // PhiUSIIL: label 1 is legitimate; label 0 is phishing.
    if (label === '0') return { kind: 'url', risk: 'high', similarity: 1, label, url: normalized };
    if (label === '1') benign ??= { kind: 'url', risk: 'low', similarity: 1, label, url: normalized };
  }
  return benign;
}

export function assessDatasets(text, urls = []) {
  const textResult = textMatch(text);
  const urlResult = urlMatch(urls);
  if (urlResult?.risk === 'high') return urlResult;
  if (textResult?.risk === 'high') return textResult;
  return textResult?.risk === 'low' ? textResult : urlResult;
}
