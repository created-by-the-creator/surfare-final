import test from 'node:test';
import assert from 'node:assert/strict';
import { imageCheck } from '../server/services/image.js';
import { validateImageAssessment } from '../lib/image-assessment.js';
import { buildOriginReview } from '../lib/image-origin-score.js';
import { imageOriginVerdict } from '../lib/image-origin.js';
import worker from '../worker/index.js';
import adapter from '../api/image-assess.js';

const env = { OPENROUTER_API_KEY: 'unit-test-placeholder-not-a-real-key' };
const geminiEnv = { GEMINI_API_KEY: 'unit-test-placeholder-not-a-real-key' };
// Only a synthetic signature is needed: the provider is mocked in these unit tests.
const image = 'data:image/jpeg;base64,/9j/2Q==';
const emptyAnalysis = {
  level: 'Insufficient evidence',
  summary: 'No readable message.',
  recommendation: 'Use a readable message for a safety check.',
  findings: [],
};
const review = {
  extractedText: '',
  analysis: emptyAnalysis,
  origin: {
    label: 'Uncertain',
    likelihood: 'Unclear',
    summary: 'The image does not provide clear evidence.',
    observations: [],
    nonClues: ['The soft edges look like resizing, not an AI clue.'],
  },
};
const compactReview = {
  clarity: 'clear',
  clues: [{ id: 'anatomy', level: 2, note: 'One hand has an extra finger.' }],
  nonClue: 'The soft edges look like resizing, not an AI clue.',
};
const req = (overrides = {}, headers = {}) =>
  new Request('https://surfare.example/api/image-assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      image,
      mode: 'origin',
      consent: true,
      provider: 'openrouter',
      ...overrides,
    }),
  });
const provider = (value) =>
  Response.json({
    model: 'test/vision:free',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }],
  });
const geminiProvider = (value) =>
  Response.json({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
  });

test('image configuration contains no credentials and independently enforces free vision models', async () => {
  const response = await imageCheck(new Request('https://surfare.example/api/image-assess'), {
    ...env,
    OPENROUTER_MODEL: 'test/text:free',
  });
  const config = await response.json();
  assert.equal(config.model, 'nvidia/nemotron-3.5-super-vl:free');
  assert.equal(config.configured, true);
  assert(!JSON.stringify(config).includes(env.OPENROUTER_API_KEY));
  const paid = await imageCheck(req(), { ...env, OPENROUTER_IMAGE_MODEL: 'test/paid' }, () =>
    assert.fail('Must not call a paid provider'),
  );
  assert.equal(paid.status, 503);
  const geminiOnly = await imageCheck(new Request('https://surfare.example/api/image-assess'), geminiEnv);
  const geminiConfig = await geminiOnly.json();
  assert.equal(geminiConfig.providerId, 'gemini');
  assert.equal(geminiConfig.model, 'gemini-4-hydrogen');
  assert.equal(geminiConfig.freeOnly, true);
  assert.equal(geminiConfig.backupConfigured, false);
  assert(!JSON.stringify(geminiConfig).includes(geminiEnv.GEMINI_API_KEY));
  const namedGemini = await imageCheck(
    new Request('https://surfare.example/api/image-assess'),
    { ...geminiEnv, GEMINI_IMAGE_MODEL: 'gemini-3.5-flash-lite' },
  );
  assert.equal((await namedGemini.json()).model, 'gemini-3.5-flash-lite');
  const paidGemini = await imageCheck(
    new Request('https://surfare.example/api/image-assess'),
    { ...geminiEnv, GEMINI_IMAGE_MODEL: 'gemini-paid-vision' },
    () => assert.fail('Must not call a non-free Gemini model'),
  );
  assert.equal((await paidGemini.json()).configured, false);
});

test('image sharing, origin, provider, mode, body bounds and JPEG data are validated before calling AI', async () => {
  for (const [request, status] of [
    [req({ consent: false }), 400],
    [req({}, { origin: 'https://evil.example' }), 403],
    [req({ provider: 'other' }), 409],
    [req({ provider: 'gemini' }), 409],
    [req({ mode: 'anything' }), 400],
    [req({ image: 'https://example.com/photo.jpg' }), 400],
    [req({ image: 'data:image/jpeg;base64,aGVsbG8=' }), 400],
    [req({ image: image + 'A' }), 400],
    [req({}, { 'content-length': '1100001' }), 413],
    [req({ image: 'x'.repeat(1050001) }), 413],
    [new Request('https://surfare.example/api/image-assess', { method: 'POST', body: '{' }), 400],
    [new Request('https://surfare.example/api/image-assess', { method: 'DELETE' }), 405],
  ]) {
    const response = await imageCheck(request, env, () =>
      assert.fail('Invalid request reached AI'),
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('local development pages and configured origins can use the image endpoint', async () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:4173']) {
    const response = await imageCheck(req({}, { origin }), env, () => provider(compactReview));
    assert.equal(response.status, 200);
  }
  const configured = await imageCheck(
    req({}, { origin: 'https://app.example' }),
    { ...env, IMAGE_ALLOWED_ORIGINS: 'https://app.example' },
    () => provider(compactReview),
  );
  assert.equal(configured.status, 200);
});

test('unavailable image responses carry safe reason codes without provider details', async () => {
  for (const [request, reason] of [
    [req({ consent: false }), 'consent'],
    [req({ provider: 'other' }), 'provider'],
    [req({ provider: 'gemini' }), 'provider'],
    [req({ mode: 'anything' }), 'invalid_mode'],
    [req({ image: 'https://example.com/photo.jpg' }), 'invalid_image'],
  ]) {
    const response = await imageCheck(request, env, () => assert.fail('Invalid request reached AI'));
    const data = await response.json();
    assert.equal(data.reason, reason);
    assert(!JSON.stringify(data).includes(env.OPENROUTER_API_KEY));
  }
});

test('free image requests send bounded inline data to a fixed provider and return validated review', async () => {
  const response = await imageCheck(req(), env, async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'nvidia/nemotron-3.5-super-vl:free');
    assert.equal(payload.response_format.json_schema.strict, true);
    assert.deepEqual(
      payload.response_format.json_schema.schema.properties.clues.items.properties.id.enum,
      ['anatomy', 'lighting', 'objects', 'texture', 'text', 'background'],
    );
    assert.equal(payload.max_tokens, 700);
    assert.equal(payload.response_format.json_schema.name, 'image_visual_clues');
    assert.equal(payload.messages[1].content[1].image_url.url, image);
    assert.match(payload.messages[0].content, /Areas: anatomy/);
    assert(payload.messages[0].content.length < 2500);
    assert(Object.values(payload.provider.max_price).every((price) => price === 0));
    assert.equal(payload.provider.sort, 'latency');
    return provider(compactReview);
  });
  const data = await response.json();
  assert.equal(data.status, 'completed');
  assert.equal(data.model, 'test/vision:free');
  assert.equal(data.analysis.level, 'Insufficient evidence');
  assert.deepEqual(data.analysis.findings, []);
  assert.deepEqual(data.origin.nonClues, [compactReview.nonClue]);
  assert(!('score' in data));
});

test('legacy file notes cannot bias the independent visual review', async () => {
  const response = await imageCheck(
    req({
      metadata: {
        findings: ['ai-tool', 'credentials-verified', 'credentials-valid', 'credentials-invalid', 'made-up-code'],
        notes: ['editorOnly', 'credentialsUnchecked'],
        fields: [{ key: 'Content Credentials', value: 'raw binary must not be sent' }],
      },
    }),
    env,
    async (url, options) => {
      const payload = JSON.parse(options.body);
      const inputText = payload.messages[1].content[0].text;
      assert.doesNotMatch(inputText, /The file names an AI tool|A source note was checked/);
      assert.doesNotMatch(inputText, /made-up-code/);
      assert.doesNotMatch(inputText, /raw binary must not be sent/);
      return provider(compactReview);
    },
  );
  const data = await response.json();
  assert.deepEqual(data.origin.nonClues, [compactReview.nonClue]);
  assert.equal(response.status, 200);
});

test('visual ratings require independent, visible evidence', () => {
  const clue = { id: 'objects', level: 2, note: 'A handle joins two unrelated objects.' };
  assert.equal(buildOriginReview({ clarity: 'clear', clues: [] }).origin.likelihood, 'No clear');
  assert.equal(buildOriginReview({ clarity: 'clear', clues: [clue] }).origin.likelihood, 'Possible');
  assert.equal(buildOriginReview({ clarity: 'unclear', clues: [clue] }).origin.likelihood, 'Unclear');
});

test('a second visual review can find a clue on an untagged image and records the disagreement', async () => {
  const response = await imageCheck(req({ secondReview: true }), { ...env, ...geminiEnv }, async url =>
    url.includes('openrouter') ? provider({ clarity: 'clear', clues: [] }) : geminiProvider(compactReview));
  const data = await response.json();
  assert.equal(data.reviewCount, 2);
  assert.equal(data.origin.likelihood, 'Possible');
  assert.match(data.origin.summary, /could not confirm/);
  assert.deepEqual(data.origin.observations, [compactReview.clues[0].note]);
});

test('a failed visual recheck preserves the completed first opinion', async () => {
  const response = await imageCheck(req({ secondReview: true }), { ...env, ...geminiEnv }, async url =>
    url.includes('openrouter') ? provider(compactReview) : new Response(null, { status: 429 }));
  const data = await response.json();
  assert.equal(data.reviewCount, 1);
  assert.equal(data.origin.likelihood, 'Possible');
  assert.equal(data.model, 'test/vision:free');
});

test('a second no-clue opinion cannot erase an ambiguous hand observation', async () => {
  const note = 'The hand appears elongated, although perspective could explain it.';
  const response = await imageCheck(req({ secondReview: true }), { ...env, ...geminiEnv }, async url =>
    url.includes('openrouter')
      ? provider({ clarity: 'clear', clues: [{ id: 'anatomy', level: 1, note }], nonClue: 'The image has screenshot borders.' })
      : geminiProvider({ clarity: 'clear', clues: [], nonClue: 'Small text looks compressed.' }));
  const data = await response.json();
  assert.equal(data.status, 'completed');
  assert.equal(data.origin.likelihood, 'Unclear');
  assert.deepEqual(data.origin.observations, [note]);
  assert.deepEqual(data.origin.ambiguousObservations, [note]);
  assert.equal(data.origin.nonClues.length, 2);
});

test('both visual reviews keep their observations when only one finds a specific inconsistency', async () => {
  const response = await imageCheck(req({ secondReview: true }), { ...env, ...geminiEnv }, async url =>
    url.includes('openrouter')
      ? provider({ clarity: 'clear', clues: [{ id: 'anatomy', level: 2, note: 'Two fingers visibly join into one.' }] })
      : geminiProvider({ clarity: 'clear', clues: [{ id: 'lighting', level: 1, note: 'The shadow could come from another light.' }] }));
  const data = await response.json();
  assert.equal(data.origin.likelihood, 'Possible');
  assert.equal(data.origin.reviewDisagreement, true);
  assert.equal(data.origin.observations.length, 2);
  assert.deepEqual(data.origin.ambiguousObservations, ['The shadow could come from another light.']);
});

test('visible scam text receives grounded safety findings independently of image origin', async () => {
  const value = {
    ...review,
    extractedText: 'Send your OTP now.',
    analysis: {
      level: 'High risk',
      summary: 'This asks for a secret code.',
      recommendation: 'Do not share your OTP.',
      findings: [
        {
          kind: 'secret',
          level: 'High risk',
          quote: 'Send your OTP',
          explanation: 'The sender asks for a private login code.',
        },
      ],
    },
  };
  const response = await imageCheck(req({ mode: 'content' }), env, async () => provider(value));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).analysis.level, 'High risk');
  const wrongMode = await imageCheck(req(), env, async () => provider(value));
  assert.equal(wrongMode.status, 502);
});

test('invented quotes, unsupported origin labels, empty evidence and no-text safety verdicts are rejected', () => {
  for (const value of [
    { ...review, origin: { ...review.origin, label: '99% AI' } },
    { ...review, origin: { ...review.origin, likelihood: '99% AI' } },
    { ...review, origin: { ...review.origin, label: 'AI-like visual cues' } },
    { ...review, origin: { ...review.origin, nonClues: ['', 'A real note.'] } },
    { ...review, analysis: { ...emptyAnalysis, level: 'Low risk' } },
    {
      ...review,
      extractedText: 'hello',
      analysis: {
        ...emptyAnalysis,
        level: 'High risk',
        findings: [
          {
            kind: 'scam',
            level: 'High risk',
            quote: 'not in image',
            explanation: 'Invented evidence.',
          },
        ],
      },
    },
  ])
    assert.throws(() => validateImageAssessment(value));
});

test('provider failure, incomplete output and timeouts stay unavailable without retry', async () => {
  for (const [fetcher, status, reason] of [
    [async () => Response.json({ error: 'busy' }, { status: 429 }), 429, 'busy'],
    [async () => Response.json({ choices: [{ finish_reason: 'length' }] }), 502, 'incomplete'],
    [async () => provider({ invalid: true }), 502, 'provider_error'],
    [
      async () => {
        throw new DOMException('timed out', 'TimeoutError');
      },
      504,
      'timeout',
    ],
  ]) {
    let calls = 0;
    const response = await imageCheck(req(), env, (...args) => {
      calls++;
      return fetcher(...args);
    });
    const data = await response.json();
    assert.equal(response.status, status);
    assert.equal(data.status, 'unavailable');
    assert.equal(data.reason, reason);
    assert.equal(calls, 1);
  }
});

test('provider failures expose only safe attempt statuses', async () => {
  const response = await imageCheck(req(), { ...env, ...geminiEnv }, async (url) =>
    url.includes('openrouter.ai')
      ? Response.json({ error: 'bad request' }, { status: 400 })
      : Response.json({ error: 'not found' }, { status: 404 }),
  );
  const data = await response.json();
  assert.equal(data.status, 'unavailable');
  assert.equal(data.reason, 'provider_error');
  assert.deepEqual(data.attempts, [
    { provider: 'openrouter', http: 400 },
    { provider: 'gemini', http: 404 },
    { provider: 'gemini', http: 404 },
  ]);
  assert(!JSON.stringify(data).includes(env.OPENROUTER_API_KEY));
  assert(!JSON.stringify(data).includes(geminiEnv.GEMINI_API_KEY));
});

test('Gemini diagnostics expose only a safe status and a key flag', async () => {
  const response = await imageCheck(req(), { ...env, ...geminiEnv }, async (url) =>
    url.includes('openrouter.ai')
      ? Response.json({ error: 'busy' }, { status: 429 })
      : Response.json(
          { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid for this service' } },
          { status: 400 },
        ),
  );
  const data = await response.json();
  assert.deepEqual(data.attempts[1], {
    provider: 'gemini',
    http: 400,
    upstreamStatus: 'INVALID_ARGUMENT',
    keyIssue: true,
  });
  assert(!JSON.stringify(data).includes('API key not valid for this service'));
  assert(!JSON.stringify(data).includes(geminiEnv.GEMINI_API_KEY));
});

test('Gemini string clue levels are read as numbers before scoring', async () => {
  const response = await imageCheck(req(), { ...env, ...geminiEnv }, async (url) =>
    url.includes('openrouter.ai')
      ? Response.json({ error: 'busy' }, { status: 429 })
      : geminiProvider({ ...compactReview, clues: [{ id: 'anatomy', level: '2', note: 'Extra finger.' }] }),
  );
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'completed');
  assert.equal(data.providerId, 'gemini');
});

test('a busy primary provider stays reported as busy when the backup also fails', async () => {
  const response = await imageCheck(req(), { ...env, ...geminiEnv }, async (url) =>
    url.includes('openrouter.ai')
      ? Response.json({ error: 'rate limited' }, { status: 429 })
      : Response.json({ error: 'bad request' }, { status: 400 }),
  );
  const data = await response.json();
  assert.equal(response.status, 429);
  assert.equal(data.status, 'unavailable');
  assert.equal(data.reason, 'busy');
  assert.deepEqual(data.attempts, [
    { provider: 'openrouter', http: 429 },
    { provider: 'gemini', http: 400 },
    { provider: 'gemini', http: 400 },
  ]);
  assert(!JSON.stringify(data).includes(env.OPENROUTER_API_KEY));
  assert(!JSON.stringify(data).includes(geminiEnv.GEMINI_API_KEY));
});

test('Gemini is used only after OpenRouter fails and its key is never exposed', async () => {
  const urls = [];
  const response = await imageCheck(req({ provider: 'openrouter' }), { ...env, ...geminiEnv }, async (url, options) => {
    urls.push(url);
    if (url.includes('openrouter.ai')) return Response.json({ error: 'busy' }, { status: 429 });
    assert.match(url, /gemini-4-hydrogen:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'], geminiEnv.GEMINI_API_KEY);
    const payload = JSON.parse(options.body);
    assert.equal(payload.generationConfig.responseMimeType, 'application/json');
    assert.equal(payload.generationConfig.maxOutputTokens, 700);
    assert.equal(
      payload.contents[0].parts[0].inlineData.data,
      image.slice('data:image/jpeg;base64,'.length),
    );
    assert.equal(payload.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
    assert.deepEqual(
      payload.generationConfig.responseSchema.properties.clues.items.properties.level.enum,
      ['1', '2'],
    );
    return geminiProvider(compactReview);
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'completed');
  assert.equal(data.providerId, 'gemini');
  assert.equal(data.model, 'gemini-4-hydrogen');
  assert.deepEqual(urls.map((url) => (url.includes('openrouter.ai') ? 'openrouter' : 'gemini')), [
    'openrouter',
    'gemini',
  ]);
  assert(!JSON.stringify(data).includes(geminiEnv.GEMINI_API_KEY));
});

test('Gemini alone handles the review when no OpenRouter key is configured', async () => {
  const response = await imageCheck(req({ provider: 'gemini' }), geminiEnv, async () =>
    geminiProvider(compactReview),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).providerId, 'gemini');
});

test('a second free Gemini model is used only after the first one fails', async () => {
  const urls = [];
  const response = await imageCheck(req(), { ...env, ...geminiEnv }, async (url) => {
    urls.push(url);
    if (url.includes('openrouter.ai')) return Response.json({ error: 'busy' }, { status: 429 });
    if (url.includes('gemini-4-hydrogen'))
      return Response.json(
        { error: { status: 'UNAVAILABLE', message: 'private provider message' } },
        { status: 503 },
      );
    assert.match(url, /gemini-3\.5-flash-lite:generateContent$/);
    return geminiProvider(compactReview);
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'completed');
  assert.equal(data.providerId, 'gemini');
  assert.equal(data.model, 'gemini-3.5-flash-lite');
  assert.deepEqual(urls.map((url) => (url.includes('openrouter.ai') ? 'openrouter' : 'gemini')), [
    'openrouter',
    'gemini',
    'gemini',
  ]);
  assert(!JSON.stringify(data).includes('private provider message'));
  assert(!JSON.stringify(data).includes(geminiEnv.GEMINI_API_KEY));
});

test('Gemini failures expose only safe status codes and no provider details', async () => {
  const response = await imageCheck(req(), { ...env, ...geminiEnv }, async (url) =>
    url.includes('openrouter.ai')
      ? Response.json({ error: 'busy' }, { status: 503 })
      : Response.json({ error: { message: 'private provider message' } }, { status: 429 }),
  );
  const data = await response.json();
  assert.equal(data.status, 'unavailable');
  assert.equal(data.reason, 'busy');
  assert.deepEqual(data.attempts, [
    { provider: 'openrouter', http: 503 },
    { provider: 'gemini', http: 429 },
    { provider: 'gemini', http: 429 },
  ]);
  assert(!JSON.stringify(data).includes('private provider message'));
  assert(!JSON.stringify(data).includes(geminiEnv.GEMINI_API_KEY));
});

test('compact visual scores select labels locally without exposing the number', async () => {
  const cases = [
    {
      clues: [
        { id: 'anatomy', level: 2, note: 'A clear clue.' },
        { id: 'lighting', level: 2, note: 'A second clue.' },
        { id: 'objects', level: 2, note: 'A third clue.' },
        { id: 'texture', level: 2, note: 'A fourth clue.' },
        { id: 'text', level: 2, note: 'A fifth clue.' },
        { id: 'background', level: 2, note: 'A sixth clue.' },
      ],
      likelihood: 'Strong',
      summary: 'Several specific visual inconsistencies were seen.',
    },
    {
      clues: [
        { id: 'anatomy', level: 2, note: 'A clear clue.' },
        { id: 'lighting', level: 2, note: 'A second clue.' },
      ],
      likelihood: 'Possible',
      summary: 'The visual review found a specific inconsistency that could be related to AI.',
    },
    {
      clues: [{ id: 'anatomy', level: 1, note: 'A possible clue.' }],
      likelihood: 'Unclear',
      summary: 'The visual details have several possible explanations.',
    },
  ];
  for (const item of cases) {
    const response = await imageCheck(req(), env, () =>
      provider({ clarity: 'clear', clues: item.clues }),
    );
    const data = await response.json();
    assert.equal(data.status, 'completed');
    assert.equal(data.origin.likelihood, item.likelihood);
    assert.equal(
      data.origin.label,
      item.likelihood === 'Unclear' ? 'Uncertain' : 'AI-like visual cues',
    );
    assert.equal(data.origin.summary, item.summary);
    assert(!('score' in data));
    assert(!JSON.stringify(data).includes('authentic'));
  }
});

test('unclear compact output is labelled Not sure and unsupported clue ids are rejected', async () => {
  const unclear = await imageCheck(req(), env, () => provider({ clarity: 'unclear', clues: [] }));
  assert.equal((await unclear.json()).origin.label, 'Uncertain');
  const unsupported = await imageCheck(req(), env, () =>
    provider({ clarity: 'clear', clues: [{ id: 'detector', level: 2, note: 'Guessed.' }] }),
  );
  assert.equal(unsupported.status, 502);
  assert.equal((await unsupported.json()).reason, 'provider_error');
});

test('creation metadata takes priority and visual confidence is never a numeric authenticity claim', () => {
  const metadata = { findings: [{ code: 'ai-declaration', message: 'AI creation declared.' }] };
  assert.equal(
    imageOriginVerdict(metadata, { status: 'completed', origin: { label: 'No clear AI cues' } })
      .label,
    'AI-generated',
  );
  assert.equal(imageOriginVerdict(metadata).confidence, 'High');
  assert.equal(
    imageOriginVerdict({ findings: [{ code: 'ai-tool', message: 'Tool named.' }] }).label,
    'AI-generated or edited',
  );
  for (const [label, expected] of [
    ['AI-like visual cues', 'Likely AI-generated'],
    ['No clear AI cues', 'No clear AI signs'],
    ['Uncertain', 'Origin unclear'],
  ]) {
    const verdict = imageOriginVerdict(null, {
      status: 'completed',
      origin: { label, summary: 'Evidence review.', observations: ['Specific observed clue.'] },
    });
    assert.equal(verdict.label, expected);
    assert(['Medium', 'Low'].includes(verdict.confidence));
    assert.match(verdict.limitation, /not a forensic detector/);
  }
  assert.equal(imageOriginVerdict(null, { status: 'unavailable' }).confidence, 'Not measured');
});

test('Cloudflare and Vercel both expose the image route without credentials', async () => {
  const response = await worker.fetch(new Request('https://surfare.example/api/image-assess'), {});
  assert.equal((await response.json()).configured, false);
  let data, status;
  await adapter(
    { method: 'GET', url: '/api/image-assess', headers: { host: 'surfare.example' } },
    {
      statusCode: 200,
      setHeader() {},
      end(value) {
        data = JSON.parse(value);
        status = this.statusCode;
      },
    },
  );
  assert.equal(status, 200);
  assert.equal(typeof data.configured, 'boolean');
  assert(!JSON.stringify(data).includes('API_KEY'));
});
