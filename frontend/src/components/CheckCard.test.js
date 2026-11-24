import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CheckCard from './CheckCard.jsx';
import { translate } from '../i18n/useI18n.js';

const t = (key, values) => translate('en', key, values);

const baseInputs = {
  message: 'Send your OTP now.',
  url: '',
  image: null,
  qr: null,
  qrValue: '',
  imageMode: '',
  imageVisualConsent: false,
};

function renderCard(overrides = {}) {
  return renderToStaticMarkup(createElement(CheckCard, {
    activeTab: 'text',
    inputs: baseInputs,
    onTabChange: () => {},
    onInputChange: () => {},
    onImageModeChange: () => {},
    onCheck: () => {},
    onReset: () => {},
    onCamera: () => {},
    isAnalyzing: false,
    isCheckUsed: true,
    canReviewAgain: false,
    onReviewAgain: () => {},
    status: 'result',
    isAskOpen: false,
    isAskClosing: false,
    isAskThinking: false,
    askMessages: [],
    onAskSend: () => {},
    surfyOpenRequest: 0,
    questionKeys: [],
    aiEnabled: false,
    onAiChange: () => {},
    isOnline: true,
    t,
    children: createElement('div', { className: 'result-column' }, 'Result'),
    ...overrides,
  }));
}

function primaryButton(html) {
  const match = html.match(/<button class="check-button"[^>]*>[\s\S]*?<\/button>/);
  if (!match) throw new Error('Primary check button was not rendered.');
  return match[0];
}

function isDisabled(button) {
  return /\sdisabled(?:="")?(?=[\s>])/.test(button);
}

describe('primary Check button', () => {
  it('becomes the only New Check button after a result', () => {
    const html = renderCard();
    expect(primaryButton(html)).toContain(t('check.new'));
    expect(isDisabled(primaryButton(html))).toBe(false);
    expect(html).not.toContain('new-check-button');
  });

  it('keeps Check disabled before there is anything to check', () => {
    const html = renderCard({
      status: 'idle',
      isCheckUsed: false,
      inputs: { ...baseInputs, message: '' },
    });
    expect(primaryButton(html)).toContain(t('check.button'));
    expect(isDisabled(primaryButton(html))).toBe(true);
  });

  it('keeps the AI retry in the same button when it is available', () => {
    const html = renderCard({ canReviewAgain: true });
    expect(primaryButton(html)).toContain(t('check.reviewAgain'));
    expect(html).not.toContain(t('check.new'));
  });
});
