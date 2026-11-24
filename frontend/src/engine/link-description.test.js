import { describe, expect, it } from 'vitest';
import { describeLink, linkDescription } from './link-description.js';
import { analyzeInput } from './analyze.js';
import { translate } from '../i18n/useI18n.js';

describe('link destination descriptions', () => {
  it('recognizes exact government domains and separates other government sites from the portal', () => {
    expect(describeLink('https://www.bir.gov.ph/home')).toMatchObject({ type: 'government', name: 'Bureau of Internal Revenue (BIR)', host: 'www.bir.gov.ph', basis: 'address-only' });
    expect(describeLink('sss.gov.ph')).toMatchObject({ name: 'Social Security System (SSS)' });
    expect(describeLink('https://www.gov.ph')).toMatchObject({ name: 'GOV.PH — National Government Portal' });
    expect(describeLink('https://another-agency.gov.ph')).toMatchObject({ type: 'government', name: '' });
  });
  it.each(['https://bir.gov.ph.attacker.example/', 'https://bir.gov.ph@attacker.example/', 'https://attacker.example/gov.ph', 'https://notgov.ph', 'https://bіr.gov.ph.example'])('does not assign government identity from misleading text in %s', value => {
    expect(describeLink(value)).toMatchObject({ type: 'website', name: '' });
  });
  it('explains shorteners and explicit redirect parameters without claiming to follow them', () => {
    expect(describeLink('https://bit.ly/test')).toMatchObject({ type: 'shortened', shortened: true, embeddedHosts: [] });
    expect(describeLink('https://bir.gov.ph/?next=https%3A%2F%2Felsewhere.example%2Flogin')).toMatchObject({ type: 'government', embeddedHosts: ['elsewhere.example'] });
    expect(describeLink('https://example.com/?redirect=javascript:alert(1)').embeddedHosts).toEqual([]);
  });
  it('recognizes common site types and handles invalid inputs without network requests', () => {
    for (const [url, type] of [['https://facebook.com/help', 'social'], ['https://bpi.com.ph', 'bank'], ['https://gcash.com', 'wallet'], ['https://shopee.ph', 'shopping'], ['https://school.edu.ph', 'education'], ['https://example.com/file.pdf', 'file']]) expect(describeLink(url).type).toBe(type);
    for (const invalid of ['', 'javascript:alert(1)', 'data:text/html,x', 'not an address', 'https://']) expect(describeLink(invalid)).toBeNull();
  });
  it('keeps descriptions on offline results and does not use them to certify safety', async () => {
    const result = await analyzeInput('links', { url: 'https://www.bir.gov.ph' }, { onlineLookup: false });
    expect(result.linkInfo.name).toBe('Bureau of Internal Revenue (BIR)');
    expect(result.level).not.toBe('low');
    expect(result.aiReview.status).toBe('not_checked');
    for (const lang of ['en', 'tl', 'taglish']) {
      const t = (key, values) => translate(lang, key, values);
      expect(linkDescription(result.linkInfo, t)).toContain('Bureau of Internal Revenue');
      expect(linkDescription(result.linkInfo, t)).toContain('www.bir.gov.ph');
    }
  });
});
