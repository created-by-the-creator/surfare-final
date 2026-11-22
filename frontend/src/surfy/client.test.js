import { describe, it, expect, vi } from 'vitest';
import { translate } from '../i18n/useI18n.js';
import { buildSurfyContext, requestSurfyReply } from './client.js';
import { getSuggestedSignalQuestions } from './templates.js';
import { analyzeInput } from '../engine/analyze.js';
const t = (key, values) => translate('en', key, values);

describe('AI Surfy and detector wiring', () => {
  it.each(['en', 'tl', 'taglish'])('shows a single clean prompt for overlapping quotes in %s', lang => {
    const questions = getSuggestedSignalQuestions({ signals: [
      { id: 'winnings-deposit', evidence: 'Cash in ka 100' },
      { id: 'advance-fee', evidence: 'Cash in' },
    ] }, (key, values) => translate(lang, key, values));
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toContain('“Cash in ka 100”');
    expect(questions[0].text).not.toContain('?');
  });
  it('includes metadata findings and read limitations in Surfy context', () => {
    const context = buildSurfyContext({ level: 'unknown', signals: [], imageMetadata: {
      labelKey: 'result.imageMetadata.label.tool', summaryKey: 'result.imageMetadata.summary.tool',
      findings: ['ai-tool'], notes: ['malformed'],
    } }, t);
    expect(context.explanation).toContain(t('result.imageMetadata.finding.ai-tool'));
    expect(context.explanation).toContain(t('result.imageMetadata.note.malformed'));
  });
  it('shows one question when several tags point to the same words', () => {
    const questions = getSuggestedSignalQuestions({ level: 'high', signals: [{ id: 'money_demand', evidence: 'Cash in ka 100' }, { id: 'winnings-deposit', evidence: 'Cash in ka 100' }, { id: 'urgency', evidence: 'act now' }] }, t);
    expect(questions).toHaveLength(2);
  });
  it('only sends bounded textual check context, never uploaded image data', () => {
    const context = buildSurfyContext({ level: 'high', checkedText: 'Send OTP', image: 'private image bytes', signals: [{ id: 'otp_request', evidence: 'OTP' }] }, t);
    expect(context.findings[0].evidence).toBe('OTP');
    expect(JSON.stringify(context)).not.toContain('private image bytes');
  });
  it('sends conversation history and result with a typed question', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ status: 'completed', answer: 'Protect your PIN.' }));
    try {
      const answer = await requestSurfyReply({ question: 'How?', result: null, language: 'en', history: [{ role: 'surfy', text: 'Hello' }, { role: 'divider', text: 'New result' }], t, signal: new AbortController().signal });
      expect(answer).toBe('Protect your PIN.');
      const body = JSON.parse(fetcher.mock.calls[0][1].body);
      expect(body.history).toEqual([]);
      expect(body.consent).toBe(true);
    } finally { fetcher.mockRestore(); }
  });
  it('shows local findings before waiting for the extra AI layer', async () => {
    const order = [];
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      expect(body.ai).toBe(true);
      expect(body.consent).toBe(true);
      order.push('api');
      return Response.json({ level: 'High risk', score: 6, indicators: [], aiReview: { status: 'completed' } });
    });
    try {
      const result = await analyzeInput('text', { message: 'Send your OTP now' }, { ai: true, onLocalResult: (local) => { expect(local.aiReview.status).toBe('pending'); order.push('local'); } });
      expect(order).toEqual(['local', 'api']);
      expect(result.aiReview.status).toBe('completed');
    } finally { fetcher.mockRestore(); }
  });
  it('does not send AI sharing flags while offline', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ level: 'Insufficient evidence', score: 0, indicators: [] }));
    try {
      await analyzeInput('text', { message: 'See you tomorrow morning' }, { ai: true, onlineLookup: false });
      expect(fetcher).not.toHaveBeenCalled();
    } finally { fetcher.mockRestore(); }
  });
});
