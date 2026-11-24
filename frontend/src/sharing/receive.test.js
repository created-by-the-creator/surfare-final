import { describe, expect, it } from 'vitest';
import { prepareSharedInput, readShareLaunch } from './receive.js';

describe('incoming shares', () => {
  it('removes the receipt from the address without exposing shared content', () => {
    const changes = [];
    expect(readShareLaunch({ href: 'https://surfare.test/?shared=12345678-1234-1234-1234-123456789abc&lang=en' }, {
      state: null, replaceState: (...args) => changes.push(args),
    })).toEqual({ id: '12345678-1234-1234-1234-123456789abc' });
    expect(changes[0][2]).toBe('/?lang=en');
  });
  it('ignores regular URLs and rejects an invalid receipt or error', () => {
    const history = { replaceState() {} };
    expect(readShareLaunch({ href: 'https://surfare.test/' }, history)).toBeNull();
    expect(readShareLaunch({ href: 'https://surfare.test/?shared=bad' }, history)).toEqual({ error: 'unavailable' });
    expect(readShareLaunch({ href: 'https://surfare.test/?shareError=tooLarge' }, history)).toEqual({ error: 'tooLarge' });
    expect(readShareLaunch({ href: 'https://surfare.test/?shareError=untrusted' }, history)).toEqual({ error: 'unavailable' });
  });
  it.each([
    { url: 'https://example.com/a?x=1', title: 'Page title' },
    { text: 'https://example.com/a?x=1' },
    { title: 'https://example.com/a?x=1' },
  ])('recognizes a link in the fields used by different sharing apps', record => {
    expect(prepareSharedInput(record)).toMatchObject({ tab: 'links', inputs: { url: 'https://example.com/a?x=1' } });
  });
  it('preserves the whole message and its link instead of checking just the link', () => {
    expect(prepareSharedInput({ text: 'Ipadala ang OTP ngayon.', url: 'https://example.com' }))
      .toMatchObject({ tab: 'text', inputs: { message: 'Ipadala ang OTP ngayon.\nhttps://example.com' } });
    expect(prepareSharedInput({ text: 'Check https://example.com', url: 'https://example.com' }).inputs.message)
      .toBe('Check https://example.com');
  });
  it('keeps unsafe schemes and HTML as text without opening or running them', () => {
    for (const text of ['javascript:alert(1)', '<img src=x onerror=alert(1)>', 'data:text/html,secret']) {
      expect(prepareSharedInput({ text })).toMatchObject({ tab: 'text', inputs: { message: text } });
    }
  });
  it('keeps original image bytes and a caption without granting AI sharing', async () => {
    const file = new File(['image bytes'], 'photo.png', { type: 'image/png' });
    const shared = prepareSharedInput({ file, text: 'An image caption' });
    expect(shared.tab).toBe('image');
    expect(shared.inputs.image).toBe(file);
    expect(shared.inputs.message).toBe('An image caption');
    expect(shared.inputs.imageVisualConsent).toBeUndefined();
  });
  it('rejects empty or oversized content rather than truncating a potential warning', () => {
    expect(() => prepareSharedInput({})).toThrow('empty');
    expect(() => prepareSharedInput({ text: 'x'.repeat(12001) })).toThrow('longText');
    expect(() => prepareSharedInput({ file: new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.png') })).toThrow('tooLarge');
  });
});
