import { verifyContentCredentials } from './c2pa-verify.js';
import { CREDENTIAL_CHECK_CODES } from './credential-checks.js';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_SEGMENTS = 4096;

const decoder = new TextDecoder();

const AI_TOOL = /\b(?:DALL[- ]?E|Midjourney|Stable Diffusion|ComfyUI|AUTOMATIC1111|InvokeAI|Adobe Firefly|Fooocus|FLUX|Leonardo(?:\.AI)?|Ideogram)\b/i;
const EDITOR_TOOL = /\b(?:Adobe Photoshop|Photoshop|GIMP|Lightroom|Canva|Affinity Photo|Pixelmator)\b/i;
const AI_DECLARATION = /\b(?:trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia)\b/i;
const GENERATION_STEPS = /\bSteps\s*:\s*\d+\b/i;
const GENERATION_SAMPLER = /\bSampler\s*:\s*[\w-]+/i;
const GENERATION_CFG = /\bCFG scale\s*:\s*\d/i;
const WORKFLOW = /"class_type"\s*:\s*"(?:KSampler|KSamplerAdvanced)"/i;
const SEED = /\bSeed\s*[:=]\s*\d{1,12}\b/i;

const EXIF_TAGS = {
  0x010e: 'Description',
  0x0131: 'Software',
  0x013b: 'Artist',
  0x9286: 'Comment',
  0x9c9b: 'Title',
  0x9c9c: 'Comment',
  0x9c9e: 'Keywords',
};

function clean(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addFinding(findings, code) {
  if (!findings.includes(code)) findings.push(code);
}

function addNote(notes, code) {
  if (!notes.includes(code)) notes.push(code);
}

function scanText(context, text, key = '') {
  const value = clean(text);
  if (!value) return;
  const lowerKey = String(key).toLowerCase();

  if (AI_DECLARATION.test(value) && (lowerKey === 'digitalsourcetype' ||
      /\bdigitalSourceType\b[^<>]{0,60}[=>:]\s*["']?(?:https?:\/\/[^\s"'<>]+\/)?(?:trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia)\b/i.test(value) ||
      /\bdigitalSourceType\s*>\s*(?:https?:\/\/[^\s<>]+\/)?(?:trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia)\b/i.test(value))) {
    addFinding(context.findings, 'ai-declaration');
  }

  const toolValues =
    lowerKey === 'software' || lowerKey === 'creatortool'
      ? [value]
      : value.match(
          /(?:[\w-]+:)?(?:CreatorTool|Software)(?:\s*=\s*["'][^"']{0,300}["']|\b[^>]{0,300}>[^<]{0,300})/gi,
        ) || [];
  if (toolValues.some((tool) => AI_TOOL.test(tool))) addFinding(context.findings, 'ai-tool');
  if (EDITOR_TOOL.test(value) && !toolValues.some((tool) => AI_TOOL.test(tool))) {
    addNote(context.notes, 'editorOnly');
  }

  const hasSteps = GENERATION_STEPS.test(value);
  const hasSampler = GENERATION_SAMPLER.test(value);
  if (((hasSteps || hasSampler) && lowerKey === 'parameters') ||
      ([hasSteps, hasSampler, GENERATION_CFG.test(value), SEED.test(value)].filter(Boolean).length >= 2 && (hasSteps || hasSampler))) {
    addFinding(context.findings, 'generation-settings');
  }
  if (WORKFLOW.test(value)) addFinding(context.findings, 'generation-workflow');
  const seedMatch = value.match(SEED);
  if (seedMatch) {
    context.seedFound = true;
    if (
      context.findings.includes('generation-settings') ||
      context.findings.includes('generation-workflow') ||
      context.findings.includes('ai-tool')
    ) {
      addFinding(context.findings, 'generation-parameter');
    }
  }
}

function decodeUtf16(bytes, littleEndian) {
  let text = '';
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const code = littleEndian
      ? bytes[index] | (bytes[index + 1] << 8)
      : (bytes[index] << 8) | bytes[index + 1];
    text += String.fromCharCode(code);
  }
  return text.replace(/\u0000+$/, '');
}

function exifBytes(view, valueOffset, type, count, littleEndian, byteLength) {
  const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const size = sizes[type];
  if (!size || count > 8192) return null;
  const total = count * size;
  const offset = total <= 4 ? valueOffset : view.getUint32(valueOffset, littleEndian);
  if (offset + total > byteLength) return null;
  return new Uint8Array(view.buffer, view.byteOffset + offset, total);
}

function readExif(data, context) {
  if (data.length < 8) return;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const littleEndian = view.getUint16(0, false) === 0x4949;
  if (view.getUint16(2, littleEndian) !== 42) return;

  const readIfd = (offset, depth = 0) => {
    if (depth > 2 || offset < 8 || offset + 2 > data.length) return;
    const count = view.getUint16(offset, littleEndian);
    if (count > 256) return;
    let exifIfd = 0;
    for (let index = 0; index < count; index += 1) {
      const entry = offset + 2 + index * 12;
      if (entry + 12 > data.length) return;
      const tag = view.getUint16(entry, littleEndian);
      const type = view.getUint16(entry + 2, littleEndian);
      const countValue = view.getUint32(entry + 4, littleEndian);
      if (tag === 0x8769 && type === 4) {
        exifIfd = view.getUint32(entry + 8, littleEndian);
        continue;
      }
      const bytes = exifBytes(view, entry + 8, type, countValue, littleEndian, data.length);
      if (!bytes) continue;
      if (tag === 0x9286) {
        scanText(context, decoder.decode(bytes.subarray(8)), 'Comment');
      } else if ([0x9c9b, 0x9c9c, 0x9c9e].includes(tag)) {
        scanText(context, decodeUtf16(bytes, littleEndian), EXIF_TAGS[tag]);
      } else if (EXIF_TAGS[tag]) {
        scanText(context, decoder.decode(bytes), EXIF_TAGS[tag]);
      }
    }
    if (exifIfd) readIfd(exifIfd, depth + 1);
  };

  readIfd(view.getUint32(4, littleEndian));
}

function addC2pa(context, data) {
  context.credentials = true;
  scanText(context, decoder.decode(data), 'c2pa');
}

function reserveMetadata(context, length) {
  if (context.metadataBytes + length > MAX_METADATA_BYTES) {
    addNote(context.notes, 'limit');
    return false;
  }
  context.metadataBytes += length;
  return true;
}

async function readPngText(data, kind, context) {
  const separator = data.indexOf(0);
  if (separator < 1 || separator > 79) return;
  const key = decoder.decode(data.subarray(0, separator));
  let start = separator + 1;
  let compressed = kind === 'zTXt';
  if (kind === 'iTXt') {
    const flag = data[start++];
    if (flag !== 0 && flag !== 1) return;
    compressed = flag === 1;
  }
  if (kind !== 'tEXt' && data[start++] !== 0) return;
  if (kind === 'iTXt') {
    for (let index = 0; index < 2; index++) {
      const end = data.indexOf(0, start);
      if (end < 0) return;
      start = end + 1;
    }
  }
  if (!compressed) {
    scanText(context, decoder.decode(data.subarray(start)), key);
    return;
  }
  if (typeof DecompressionStream !== 'function') {
    addNote(context.notes, 'compressed');
    return;
  }
  const reader = new Blob([data.subarray(start)]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const textDecoder = new TextDecoder();
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!reserveMetadata(context, chunk.value.length)) {
        await reader.cancel();
        return;
      }
      text += textDecoder.decode(chunk.value, { stream: true });
    }
    scanText(context, text + textDecoder.decode(), key);
  } catch {
    addNote(context.notes, 'compressed');
  } finally {
    reader.releaseLock();
  }
}

async function readPng(bytes, context) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length && context.segments < MAX_SEGMENTS) {
    context.segments += 1;
    const length = view.getUint32(offset);
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 8 + length;
    if (end + 4 > bytes.length) {
      addNote(context.notes, 'malformed');
      return;
    }
    const data = bytes.subarray(offset + 8, end);
    if (['caBX', 'eXIf', 'tEXt', 'zTXt', 'iTXt'].includes(name) && reserveMetadata(context, data.length)) {
      if (name === 'caBX') addC2pa(context, data);
      else if (name === 'eXIf') readExif(data, context);
      else await readPngText(data, name, context);
    }
    if (name === 'IEND') return;
    offset = end + 4;
  }
  addNote(context.notes, 'malformed');
}

function readJpeg(bytes, context) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length && context.segments < MAX_SEGMENTS) {
    context.segments++;
    if (bytes[offset] !== 0xff) {
      addNote(context.notes, 'malformed');
      return;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xda || marker === 0xd9) return;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) {
      addNote(context.notes, 'malformed');
      return;
    }
    const length = view.getUint16(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) {
      addNote(context.notes, 'malformed');
      return;
    }
    const data = bytes.subarray(offset + 2, end);
    if (marker === 0xe1 && reserveMetadata(context, data.length)) {
      if (decoder.decode(data.subarray(0, 29)) === 'http://ns.adobe.com/xap/1.0/\0') {
        scanText(context, decoder.decode(data.subarray(29)));
      } else if (decoder.decode(data.subarray(0, 6)) === 'Exif\0\0') {
        readExif(data.subarray(6), context);
      }
    }
    if (marker === 0xeb && data[0] === 0x4a && data[1] === 0x50 && reserveMetadata(context, data.length)) {
      const header = decoder.decode(data.subarray(0, Math.min(data.length, 1024)));
      if (header.includes('c2pa')) addC2pa(context, data);
    }
    offset = end;
  }
  addNote(context.notes, 'malformed');
}

function readWebp(bytes, context) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredEnd = bytes.length >= 12 ? view.getUint32(4, true) + 8 : 0;
  if (declaredEnd > bytes.length) addNote(context.notes, 'malformed');
  let offset = 12;
  while (offset + 8 <= Math.min(bytes.length, declaredEnd) && context.segments < MAX_SEGMENTS) {
    context.segments += 1;
    const name = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    const end = offset + 8 + length;
    if (end > Math.min(bytes.length, declaredEnd)) {
      addNote(context.notes, 'malformed');
      return;
    }
    const data = bytes.subarray(offset + 8, end);
    if (['C2PA', 'EXIF', 'XMP '].includes(name) && reserveMetadata(context, data.length)) {
      if (name === 'C2PA') addC2pa(context, data);
      else if (name === 'EXIF') readExif(data, context);
      else scanText(context, decoder.decode(data));
    }
    offset = end + (length % 2);
  }
}

function verdict(context) {
  const codes = context.findings;
  if (codes.includes('ai-declaration')) {
    return {
      labelKey: 'result.imageMetadata.label.declaration',
      summaryKey: 'result.imageMetadata.summary.declaration',
      confidenceKey: 'result.imageMetadata.confidence.strong',
    };
  }
  if (
    codes.includes('generation-settings') ||
    codes.includes('generation-workflow') ||
    codes.includes('generation-parameter')
  ) {
    return {
      labelKey: 'result.imageMetadata.label.generation',
      summaryKey: 'result.imageMetadata.summary.generation',
      confidenceKey: 'result.imageMetadata.confidence.strong',
    };
  }
  if (codes.includes('ai-tool')) {
    return {
      labelKey: 'result.imageMetadata.label.tool',
      summaryKey: 'result.imageMetadata.summary.tool',
      confidenceKey: 'result.imageMetadata.confidence.medium',
    };
  }
  if (codes.includes('credentials-verified')) {
    return {
      labelKey: 'result.imageMetadata.label.credentialsVerified',
      summaryKey: 'result.imageMetadata.summary.credentialsVerified',
      confidenceKey: 'result.imageMetadata.confidence.marker',
    };
  }
  if (codes.includes('credentials-valid')) {
    return {
      labelKey: 'result.imageMetadata.label.credentialsValid',
      summaryKey: 'result.imageMetadata.summary.credentialsValid',
      confidenceKey: 'result.imageMetadata.confidence.marker',
    };
  }
  if (codes.includes('credentials-invalid')) {
    return {
      labelKey: 'result.imageMetadata.label.credentialsInvalid',
      summaryKey: 'result.imageMetadata.summary.credentialsInvalid',
      confidenceKey: 'result.imageMetadata.confidence.marker',
    };
  }
  if (context.credentials) {
    return {
      labelKey: 'result.imageMetadata.label.credentials',
      summaryKey: 'result.imageMetadata.summary.credentials',
      confidenceKey: 'result.imageMetadata.confidence.marker',
    };
  }
  return {
    labelKey: 'result.imageMetadata.label.none',
    summaryKey: 'result.imageMetadata.summary.none',
    confidenceKey: 'result.imageMetadata.confidence.none',
  };
}

function finalize(context) {
  if (context.seedFound && !context.findings.some((code) => code.startsWith('generation'))) {
    addNote(context.notes, 'seedOnly');
  }
  if (context.credentials && !context.credentialsChecked) addNote(context.notes, 'c2paUnverified');
  return {
    status: context.findings.length ? 'metadata-clues' : context.credentials ? 'credentials-present' : 'unconfirmed',
    ...verdict(context),
    findings: context.findings,
    notes: [...new Set(context.notes)],
    credentials: context.credentials,
    credentialChecks: context.credentialChecks || [],
    limitationKey: 'result.imageMetadata.limitation',
  };
}

export async function inspectImageMetadata(file, options = {}) {
  const { verifyCredentials = verifyContentCredentials } = options;
  const context = {
    findings: [],
    notes: [],
    credentials: false,
    credentialsChecked: false,
    seedFound: false,
    segments: 0,
    metadataBytes: 0,
  };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_FILE_BYTES) {
      addNote(context.notes, 'tooLarge');
      return finalize(context);
    }
    if (bytes[0] === 0x89 && decoder.decode(bytes.subarray(1, 4)) === 'PNG') await readPng(bytes, context);
    else if (bytes[0] === 0xff && bytes[1] === 0xd8) readJpeg(bytes, context);
    else if (decoder.decode(bytes.subarray(0, 4)) === 'RIFF' && decoder.decode(bytes.subarray(8, 12)) === 'WEBP') readWebp(bytes, context);
    else addNote(context.notes, 'unsupported');
  } catch {
    addNote(context.notes, 'unreadable');
  }

  if (context.credentials && typeof file?.type === 'string' && typeof verifyCredentials === 'function') {
    const result = await verifyCredentials(file);
    context.credentialsChecked = true;
    context.credentialChecks = Array.isArray(result?.checks)
      ? result.checks.filter((code) => CREDENTIAL_CHECK_CODES.has(code)) : [];
    const finding = {
      verified: 'credentials-verified',
      valid: 'credentials-valid',
      invalid: 'credentials-invalid',
    }[result?.status];
    if (finding) addFinding(context.findings, finding);
    else addNote(context.notes, 'credentialsUnchecked');
  }
  return finalize(context);
}
