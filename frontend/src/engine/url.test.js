import { describe, expect, it } from 'vitest';
import { analyzeUrl } from './url.js';
import {
  PHISHING_INDEX,
  SOCIAL_PLATFORM_DOMAINS as BROWSER_SOCIAL_PLATFORM_DOMAINS,
} from './generated/url-reference-data.js';
import {
  PLATFORM_CATEGORIES,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_DOMAINS,
} from '../../../backend/lib/known-platform-domains.js';

describe('reviewed social platform domains', () => {
  it('loads the extracted platforms as distinct official domains', () => {
    expect(SOCIAL_PLATFORM_DOMAINS.size).toBe(293);
    for (const domain of [
      'facebook.com', 'instagram.com', 'youtube.com', 'reddit.com',
      'qq.com', 'kakao.com', 'bsky.app', 'whirlpool.net.au',
      'twitter.com', 'bluesky.app', 'tinder.com', 'archiveofourown.org',
    ]) {
      expect(SOCIAL_PLATFORM_DOMAINS.has(domain)).toBe(true);
    }
  });

  it('records a source category for every reviewed platform', () => {
    expect(SOCIAL_PLATFORMS).toHaveLength(300);
    expect(SOCIAL_PLATFORMS.every(({ category }) => PLATFORM_CATEGORIES.includes(category))).toBe(true);
    for (const category of PLATFORM_CATEGORIES) {
      expect(SOCIAL_PLATFORMS.filter((platform) => platform.category === category).length).toBeGreaterThan(0);
    }
  });

  it('does not treat known platform addresses as impersonation or lookalikes', () => {
    for (const address of [
      'https://www.reddit.com',
      'https://www.instagram.com',
      'https://secure.avaaz.org',
    ]) {
      const ids = analyzeUrl(address).signals.map((signal) => signal.id);
      expect(ids).not.toContain('brand_in_subdomain_not_domain');
      expect(ids).not.toContain('lookalike_brand');
    }
  });

  it('still flags a brand hosted on a user-controlled platform subdomain', () => {
    for (const address of [
      'https://facebook.substack.com/login',
      'https://gcash.tumblr.com/verify',
      'https://bpi.wordpress.com/pay',
    ]) {
      const ids = analyzeUrl(address).signals.map((signal) => signal.id);
      expect(ids).toContain('brand_in_subdomain_not_domain');
    }
  });

  it('matches the server rule for short look-alike brands and shorteners', () => {
    expect(analyzeUrl('https://bdo1.com').signals.map((signal) => signal.id)).not.toContain('lookalike_brand');
    for (const domain of ['shorturl.at', 'rb.gy', 'rebrand.ly']) {
      expect(analyzeUrl(`https://${domain}/abc`).signals.map((signal) => signal.id)).toContain('url_shortener');
    }
  });
});

describe('bundled offline URL references', () => {
  it('ships the same reviewed platform domains to the browser', () => {
    expect(new Set(BROWSER_SOCIAL_PLATFORM_DOMAINS).size).toBe(SOCIAL_PLATFORM_DOMAINS.size);
    expect(PHISHING_INDEX.count).toBe(231725);
  });

  it('matches the phishing, regulator and locally reviewed host lists', () => {
    expect(analyzeUrl('https://0-0sc.com/login').signals.map((signal) => signal.id))
      .toContain('dataset-url-match');
    expect(analyzeUrl('https://0phlboss.com').signals.map((signal) => signal.id))
      .toContain('reported-gambling-link');
    expect(analyzeUrl('https://verification.pagcorlicense.ph').signals.map((signal) => signal.id))
      .toContain('fake-regulator-link');
    expect(analyzeUrl('https://3go.run').signals.map((signal) => signal.id))
      .toContain('watchlisted-gambling-link');
  });

  it('flags a gambling-looking address that is not on the registered list', () => {
    const ids = analyzeUrl('https://yyphs8i.com/#/cashwheel?a=0twbf7dc')
      .signals.map((signal) => signal.id);
    expect(ids).toContain('unlisted-gambling-link');
  });

  it('does not treat reviewed official domains as phishing matches', () => {
    for (const address of ['https://www.gcash.com', 'https://www.facebook.com']) {
      expect(analyzeUrl(address).signals.map((signal) => signal.id)).not.toContain('dataset-url-match');
    }
  });
});
