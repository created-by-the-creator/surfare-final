import { parse } from 'tldts';
import { normalizeEvidence, evidenceMatches } from './text-evidence.js';
import { safetySignals } from './safety-signals.js';
import { scamSignals } from './scam-signals.js';
import { withoutLoginQrPayloads } from './qr-payload.js';
import { classifySms } from './sms-model.js';
import { assessDatasetModels } from './dataset-models.js';

import { normalizeUrl, redirectDestinations, urlCandidates } from './url-input.js';
import { SOCIAL_PLATFORM_DOMAINS } from './known-platform-domains.js';
import { hostSkeleton, decodeUrlComponent } from './url-identity.js';
export { normalizeUrl, extractUrls } from './url-input.js';
const brands = {
  gcash: ['gcash.com'],
  bdo: ['bdo.com.ph'],
  bpi: ['bpi.com.ph'],
  paypal: ['paypal.com'],
  maya: ['maya.ph', 'paymaya.com'],
  facebook: ['facebook.com', 'fb.com'],
  google: ['google.com'],
  microsoft: ['microsoft.com', 'live.com', 'office.com'],
  shopee: ['shopee.ph'],
  lazada: ['lazada.com.ph'],
};
const KNOWN_DOMAINS = new Set([...Object.values(brands).flat(), ...SOCIAL_PLATFORM_DOMAINS]);
const oneEdit = (a, b) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    n = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++n > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return n + (i < a.length || j < b.length ? 1 : 0) === 1;
};

const advisoryIds = new Set(['dataset-text-model', 'dataset-url-model']);
const isScoringIndicator = (indicator) =>
  indicator.id !== 'sms-pattern' && !advisoryIds.has(indicator.id);

export function scoreForIndicators(indicators) {
  const list = Array.isArray(indicators) ? indicators : [];
  return Math.max(
    list.filter(isScoringIndicator).reduce((total, indicator) => total + indicator.weight, 0),
    list.some((indicator) => indicator.id === 'sms-pattern') ? 2 : 0,
  );
}

export function levelForIndicators(indicators, { sufficient = true } = {}) {
  const list = Array.isArray(indicators) ? indicators : [];
  const score = scoreForIndicators(list);
  const strong =
    list.some((indicator) => isScoringIndicator(indicator) && indicator.weight >= 5) ||
    (score >= 5 && list.some((indicator) => isScoringIndicator(indicator) && indicator.weight >= 3));
  return strong
    ? 'High risk'
    : score >= 2
      ? 'Suspicious'
      : sufficient
        ? 'Low risk'
        : 'Insufficient evidence';
}

export function analyzeUrl(raw, context = '') {
  const u = normalizeUrl(raw),
    host = u.hostname.toLowerCase(),
    p = parse(host, { allowPrivateDomains: true }),
    domain = p.domain || host,
    indicators = [];
  const add = (id, title, message, weight) =>
    indicators.push({ id, title, message, weight, category: 'link', evidence: [] });
  const domainInSubdomain = Object.values(brands).flat().find((official) =>
    ('.' + (p.subdomain || '') + '.').includes('.' + official + '.'));
  const decodedPath = decodeUrlComponent(u.pathname);
  const signInPath = /\/(?:log-?in|sign-?in|verify|verification|kyc|password|authenticate|account-recovery)(?:[/.\-]|$)/i.test(decodedPath);
  if (u.username || u.password)
    add(
      'userinfo',
      'Hidden destination',
      'The text before @ is not the destination. The actual host is ' + host + '.',
      3,
    );
  if (u.protocol === 'http:')
    add(
      'http',
      'Unencrypted connection',
      'This address uses HTTP. That alone does not establish that it is a scam.',
      1,
    );
  if (p.isIp)
    add(
      'ip',
      'Numeric destination',
      'The address uses an IP address rather than a recognizable domain.',
      2,
    );
  if (host.includes('xn--'))
    add(
      'idn',
      'Internationalized domain',
      'This address uses an internationalized domain. Check for letters that imitate another alphabet.',
      1,
    );
  if ((p.subdomain || '').split('.').filter(Boolean).length >= 3)
    add(
      'subdomains',
      'Complex subdomains',
      'Several subdomains can obscure the actual registered domain: ' + domain + '.',
      1,
    );
  if (
    ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'shorturl.at', 'rb.gy', 'cutt.ly', 'rebrand.ly'].includes(
      domain,
    )
  )
    add(
      'shortener',
      'Hidden final destination',
      'This shortened address hides its final destination. It has not been expanded.',
      2,
    );
  for (const [brand, valid] of Object.entries(brands)) {
    const mentioned = new RegExp('\\b' + brand + '\\b', 'i').test(context);
    const brandToken = host.split(/[.-]/).some(token => token === brand ||
      new RegExp('^(?:(?:secure|security|login|signin|verify|verification|account|support|help|wallet|online|update|service|ph|bank|banking|pay|payment|refund)' + brand + '|' + brand + '(?:secure|security|login|signin|verify|verification|account|support|help|wallet|online|update|service|ph|bank|banking|pay|payment|refund))$').test(token));
    const claimed =
      brandToken ||
      (mentioned &&
        /\b(?:verify|login|log in|update|confirm|suspend|deactivat|cancel|password|otp|kyc)\w*/i.test(
          context,
        ));
    if (claimed && !valid.includes(domain))
      add(
        'brand-' + brand,
        'Possible ' + brand + ' impersonation',
        'This mentions ' +
          brand +
          ' but the registered domain is ' +
          domain +
          ', outside its known domains. A third-party reference is also possible.',
        valid.includes(domainInSubdomain) || (brandToken && signInPath) ? 4 : 2,
      );
    const label = p.domainWithoutSuffix || '',
      skeleton = hostSkeleton(label).replace(/0/g, 'o').replace(/1/g, 'l');
    if (
      brand.length >= 4 &&
      !valid.includes(domain) &&
      !label.includes(brand) &&
      (oneEdit(label, brand) || skeleton === brand)
    )
      add(
        'lookalike-' + brand,
        'Look-alike domain',
        'The registered name resembles ' +
          brand +
          ' with changed characters. Confirm the exact official address.',
        signInPath ? 4 : 3,
      );
  }
  for (const nested of redirectDestinations(u)) {
    const nestedHost = new URL(nested).hostname;
    if ((parse(nestedHost, { allowPrivateDomains: true }).domain || nestedHost) !== domain)
      add('redirect', 'Cross-site redirect parameter',
        'The address includes a destination on ' + nestedHost + '. No redirect has been followed.', 2);
  }
  if (
    /(?:verify|secure|login|account|update|wallet)/i.test(host) &&
    !KNOWN_DOMAINS.has(domain)
  )
    add(
      'lure',
      'Account-themed hostname',
      'The hostname uses account or security language. Verify its registered domain independently.',
      1,
    );
  if (/\.(?:apk|exe|scr|msi|bat|cmd)$/i.test(decodedPath))
    add(
      'download',
      'Executable download',
      'This address appears to offer an app or executable file. Unexpected downloads can install harmful software.',
      3,
    );
  return { url: u.href, host, domain, indicators };
}

export function analyzePatterns(text, explicitUrls = [], addReferenceIndicators) {
  text = withoutLoginQrPayloads(text);
  explicitUrls = explicitUrls.filter(value => withoutLoginQrPayloads(value).trim());
  const source = normalizeEvidence(text),
    indicators = [...safetySignals(text), ...scamSignals(text)];
  const find = (re, activeOnly = true) => evidenceMatches(source, re, { activeOnly });
  const add = (id, title, message, weight, evidence, category = 'scam') => {
    if (!indicators.some((i) => i.id === id))
      indicators.push({ id, title, message, weight, evidence, category });
  };
  const secret = find(
    /\b(?:o\s*t\s*p|one[- ]time (?:password|pin|code)|password|passcode|pin|cvv|(?:verification|security|login|sign-in|authentication|(?:six|6)[- ]digit) code|recovery phrase|seed phrase)\b/i,
  );
  const request = find(
    /\b(?:send|share|give|provide|enter|submit|reply|confirm|verify|(?:read|tell|text|forward)\s+(?:me|us)|ano(?:['’]?ng|\s+(?:ang|yung|iyong))(?=\s+(?:otp|pin|password|verification code)\b)|ibigay|isend|i-send|ipadala|ilagay|ibahagi|isulat|pakisend|paki-send|paki\s*bigay|paki\s*send)\b/i,
  );
  const secretRequests = secret.filter((e) =>
    request.some((r) => {
      const between = text.slice(Math.min(e.end, r.end), Math.max(e.start, r.start));
      if (Math.abs(e.start - r.start) >= 150 || /[.!?;\n]|\b(?:but|pero|however|instead)\b/i.test(between)) return false;
      // "Use your PIN to confirm a transfer" describes the code's purpose.
      if (r.start > e.end && /^(confirm|verify)$/i.test(r.text) && /\bto\s*$/i.test(between)) return false;
      return true;
    }),
  );
  if (secretRequests.length)
    add(
      'secret',
      'Request for a secret',
      'The message asks for an OTP, password, PIN, or other secret. Sharing it can give someone access to an account.',
      4,
      [
        ...secretRequests,
        ...request.filter((r) => secretRequests.some((e) => Math.abs(e.start - r.start) < 150)),
      ],
    );
  const urgent = find(
    /\b(?:urgent|immediately|now|today|within \d+|suspend(?:ed)?|blocked|deactivat\w*|expire\w*|final warning|agad|ngayon|mawawala|iba-block|maba-block|isususpinde)\b/i,
  );
  const payment = find(
    /\b(?:pay|payment|fee|deposit|transfer|send money|bayad|magbayad|magdeposit|magpadala|padala|processing|shipping fee|release fee)\b/i,
  );
  const reward = find(
    /\b(?:won|winner|prize|reward|lottery|panalo|nanalo|premyo|cash prize|giveaway|gift\s*card|congratulations|congrats)\b/i,
  );
  const claim = find(
    /\b(?:account|bank|gcash|bdo|bpi|maya|paypal|government|support|customer service|bangko|wallet)\b/i,
  );
  const accountAction = find(/\b(?:click|tap|sign[- ]?in|log[- ]?in|verify|reactivate|unlock|update your|pindutin|i-update)\b/i);
  if (urgent.length && ((claim.length && accountAction.length) || secretRequests.length || (payment.length && reward.length)))
    add(
      'pressure',
      'Pressure to act quickly',
      'Urgency or an account threat pressures you to act before verifying.',
      2,
      urgent,
    );
  const claiming = find(/\b(?:claim|redeem|collect|receive|kunin|i-claim|iclaim)\b/i),
    action = find(
      /\b(?:click|tap|press|continue|proceed|enter|submit|provide|fill|kumpletuhin|pindutin|ilagay|ibigay)\b/i,
    );
  const countdown = find(
    /\b(?:only|just|within|remaining|left|have|mayroon|nalang|na lang)\b[^.!?\n]{0,50}\b\d+\s*(?:seconds?|minutes?|hours?|segundo|minuto|oras)\b|\b(?:expires?|ends?)\s+in\s+\d+\s*(?:seconds?|minutes?|hours?)/i,
  );
  const claimInfo = find(
    /\b(?:enter|submit|provide|fill(?:\s+in|\s+out)?|confirm|ilagay|ibigay)\b[^.!?\n]{0,70}\b(?:information|details|form|survey|impormasyon|detalye)\b/i,
  );
  if (reward.length && claiming.length && action.length) {
    add(
      'reward-action',
      'Unexpected prize claim',
      'A prize or gift offer asks you to take action to claim it. Verify the promotion independently.',
      2,
      [...reward, ...claiming, ...action],
    );
    if (countdown.length || urgent.length)
      add(
        'reward-pressure',
        'Prize countdown',
        'The offer uses a short deadline or countdown to discourage careful checking.',
        2,
        [...countdown, ...urgent],
      );
    if (claimInfo.length)
      add(
        'reward-information',
        'Details requested for a prize',
        'The prize flow requests information, which could be used to collect personal details.',
        2,
        claimInfo,
      );
    const generic = find(
      /\b(?:facebook user|dear user|dear customer|valued customer|lucky visitor|selected visitor)\b/i,
    );
    if (generic.length)
      add(
        'generic-reward',
        'Generic winner greeting',
        'The offer addresses a generic visitor rather than a verified winner.',
        1,
        generic,
      );
  }
  if (reward.length && payment.length)
    add(
      'advance-fee',
      'Payment to receive a reward',
      'A prize or reward is paired with a payment request, a common advance-fee pattern.',
      4,
      [...reward, ...payment],
    );
  const guaranteed = find(
      /\b(?:guaranteed|risk[- ]free|double your|doble|tiyak na kita|doblehin|sigurad(?:o|ong)\s+(?:\w+\s+){0,4}(?:beses|balik|tubo))\b/i,
    ),
    investment = find(/\b(?:invest|investment|profit|return|pera|kita|money|puhunan|balik|tubo)\b/i);
  if (guaranteed.length && investment.length)
    add(
      'investment',
      'Unrealistic investment promise',
      'Guaranteed or unusually easy returns are a warning sign.',
      4,
      guaranteed,
    );
  const job = find(/\b(?:job|trabaho|hiring|task|part.time)\b/i),
    upfront = find(/\b(?:deposit|activation fee|registration fee|magbayad|recharge)\b/i);
  if (job.length && upfront.length)
    add(
      'job-fee',
      'Payment to get work',
      'Work or tasks require an upfront payment or recharge.',
      4,
      [...job, ...upfront],
    );
  const remote = find(/\b(?:remote access|anydesk|teamviewer)\b/i),
    install = find(/\b(?:install|download|support|refund|bank)\b/i);
  if (remote.length && install.length)
    add(
      'remote',
      'Remote control request',
      'The message requests remote-access software, which can let someone control your device.',
      3,
      remote,
    );
  const personal = find(/\b(?:id card|passport|bank details|card number|personal information)\b/i);
  if (request.length && personal.length)
    add(
      'personal',
      'Sensitive information request',
      'The message requests sensitive personal or financial information.',
      2,
      personal,
    );
  const delivery = find(/\b(?:parcel|package|delivery|shipment|pakete|padala)\b/i),
    deliveryIssue = find(
      /\b(?:failed|held|on hold|(?:naka|na)[ -]?hold|incomplete|invalid|undeliverable|kulang|hindi maihatid|customs)\b/i,
    );
  if (delivery.length && deliveryIssue.length && (payment.length || action.length))
    add(
      'delivery',
      'Delivery problem requiring action',
      'A delivery problem is used to request a payment or updated details. Verify it directly with the courier.',
      3,
      [...deliveryIssue, ...payment, ...action],
    );
  const changedNumber = find(
    /\b(?:new (?:phone )?number|replacement number|bagong (?:number|numero)|bago kong (?:number|numero)|nasira (?:ang )?(?:phone|cp)|(?:i )?lost my (?:phone|mobile)|ito (?:ang )?bago kong number)\b/i,
  );
  if (changedNumber.length && payment.length)
    add(
      'new-number',
      'New-number payment request',
      'Someone using a new number asks for money. Confirm their identity through an existing trusted contact.',
      3,
      [...changedNumber, ...payment],
    );
  const cryptoBalance = find(
    /\b(?:balance|available|left\s+you|inheritance|beneficiary|bequeath|withdraw|withdrawal)\b[^\n]{0,110}\b(?:usdt|btc|bitcoin|crypto|ethereum)\b|\b\d[\d,.]*\s*(?:usdt|btc|eth)\b/i,
  );
  const suppliedLogin = find(/\b(?:user\s*name|login|password)\s*[:=]\s*\S+/i, false);
  const wealthStory = find(
    /\b(?:left\s+you\s+(?:some\s+)?money|inheritance|next\s+life|farewell|beneficiary|bequeath|claim\s+(?:the|your)\s+(?:funds|balance))\b/i,
    false,
  );
  if (cryptoBalance.length && suppliedLogin.length && wealthStory.length)
    add(
      'account-bait',
      'Crypto-account bait',
      'An unexpected crypto balance and supplied login details lure you to a withdrawal site.',
      5,
      [...cryptoBalance, ...suppliedLogin, ...wealthStory],
    );
  const urls = [];
  for (const { url, evidence } of urlCandidates(text, explicitUrls)) {
    const a = analyzeUrl(url, text);
    a.evidence = evidence;
    for (const i of a.indicators) {
      i.evidence = evidence;
      const existing = indicators.find((indicator) => indicator.id === i.id);
      if (!existing) add(i.id, i.title, i.message + ' [' + a.host + ']', i.weight, evidence, 'link');
      else if (i.weight > existing.weight) Object.assign(existing, i);
    }
    urls.push(a);
  }
  // A delivery update or wallet alert becomes reviewable when it directs the
  // recipient away from the service's own site. Ordinary delivery notices,
  // received-payment alerts and official tracking links do not qualify alone.
  const courierDomains = ['phlpost.gov.ph', 'jtexpress.ph', 'shopee.ph', 'lazada.com.ph', 'ninjavan.co', 'fedex.com', 'dhl.com', 'ups.com', 'lbc.com.ph', 'lbcexpress.com'];
  const outside = (domains) => urls.filter(u => !domains.some(domain => u.host === domain || u.host.endsWith('.' + domain)));
  const parcel = find(/\b(?:parcel|package|delivery|shipment|domestic mail|phlpost|ph postal)\b/i);
  const parcelUpdate = find(/\b(?:reschedule|re-delivery|redelivery|unverified recipient|verify (?:the )?(?:recipient['’]?s? )?identity|confirm (?:your )?(?:shipping details|address)|update (?:your )?(?:shipping details|address)|paki-update|complete the verification)\b/i);
  const parcelUrls = outside(courierDomains);
  if (parcel.length && parcelUpdate.length && parcelUrls.length)
    add('parcel-update-link', 'Delivery update through an unfamiliar site',
      'A parcel message asks for verification or changed delivery details through a site outside the listed courier and shopping domains. Check your order in the usual app before acting.',
      3, [...parcel, ...parcelUpdate, ...parcelUrls.flatMap(u => u.evidence)], 'scam');
  const wallet = find(/\b(?:g\s*cash|maya|bdo|banco de oro|bpi)\b/i);
  const accountAlert = find(/\b(?:suspended|locked|restricted|unrecognized login|account security|redeem|claim your cash)\b/i);
  const walletUrls = outside(Object.values(brands).flat());
  if (wallet.length && accountAlert.length && walletUrls.length)
    add('account-alert-link', 'Account alert through an unfamiliar site',
      'A banking or wallet alert directs you outside the listed official service domains. Open your usual app and check there instead.',
      3, [...wallet, ...accountAlert, ...walletUrls.flatMap(u => u.evidence)], 'scam');
  const selectedWork = find(/\b(?:you (?:have been|are) selected|napili ka|selected ka)\b/i);
  const dailyPay = find(/\b(?:daily salary|daily pay|per day|bawat araw)\b/i);
  if (selectedWork.length && job.length && dailyPay.length && urls.length)
    add('unsolicited-work-offer', 'Paid-work selection through an unverified link',
      'The message says you were selected for paid work and directs you to a link. Verify that you applied and confirm the employer through its own contact before responding.',
      2, [...selectedWork, ...job, ...dailyPay, ...urls.flatMap(u => u.evidence)], 'scam');
  const reviewedBenign = addReferenceIndicators?.(text, urls, add);
  const datasetModels = assessDatasetModels(text, urls.map((u) => u.url));
  if (datasetModels.text?.flagged && !reviewedBenign)
    add(
      'dataset-text-model',
      'Unusual message pattern',
      'The offline text model found wording similar to labeled scam messages. This is a review signal, not proof of fraud or a calibrated probability.',
      2,
      datasetModels.text.evidence,
      'dataset',
    );
  if (datasetModels.url?.flagged)
    add(
      'dataset-url-model',
      'Unusual URL wording',
      'The offline URL-text model found wording similar to labeled phishing addresses. It did not check the live page, redirects or reputation; this is not proof of fraud.',
      2,
      datasetModels.url.evidence,
      'dataset',
    );
  const model = classifySms(text);
  const protectiveOnly =
    /\b(?:never|do not|don't|huwag|wag)\s+(?:share|send|give|ibigay|ibahagi|ipadala)\b/i.test(
      text,
    ) &&
    /\b(?:otp|password|pin|cvv|seed phrase)\b/i.test(text) &&
    request.length === 0 &&
    indicators.length === 0;
  if (model.flagged && !protectiveOnly && !reviewedBenign)
    add(
      'sms-pattern',
      'Pattern found in unwanted messages',
      'The offline SMS model found wording similar to labeled spam. This is a review signal, not proof of fraud or a calibrated probability.',
      2,
      model.evidence,
      'message pattern',
    );
  const sufficient = text.trim().split(/\s+/).length >= 4 || urls.length > 0;
  const score = scoreForIndicators(indicators);
  const level = levelForIndicators(indicators, { sufficient });
  const personalThreat = indicators.some((i) => i.category === 'personal safety');
  const accountBait = indicators.some((i) => i.id === 'account-bait');
  const summary = personalThreat
    ? 'The content contains ' +
      (indicators.some((i) => i.id === 'extortion')
        ? 'a demand backed by intimidation or harm.'
        : indicators.some((i) => i.id === 'violence')
          ? 'a threat of physical harm.'
          : 'personal intimidation or a threat to expose private material.')
    : accountBait
      ? 'This looks like a crypto-account scam using a farewell story and supplied login details.'
      : level === 'High risk'
        ? 'Several strong warning signs point to a potentially harmful request.'
        : level === 'Suspicious'
          ? 'Warning signs need independent verification before you act.'
          : level === 'Low risk'
            ? 'No strong warning signs were found in the checks performed. This does not guarantee safety.'
            : 'There is not enough information to make a reliable assessment.';
  return {
    level,
    score,
    summary,
    sourceText: text,
    indicators,
    urls,
    model: { available: true, flagged: model.flagged },
    limitations: [
      'Local rules and offline text/URL models can miss new wording or misunderstand context.',
      'Known-address checks cover only listed addresses; offline models are review signals, not proof or calibrated probabilities.',
      'Official warnings are point-in-time records, so absence from a list does not prove a site is safe.',
      'Sender identity, factual claims, and live redirect chains are not independently verified.',
    ],
    recommendation: personalThreat
      ? 'Save the message, avoid confronting the sender, and seek help. If danger is immediate, contact local emergency services.'
      : accountBait
        ? 'Do not sign in, send money, or share your details. Block and report the sender.'
        : score >= 2
          ? 'Pause before clicking, paying, or sharing information. Verify the request through an official app or a contact you already trust.'
          : 'Confirm unexpected requests through another trusted channel before acting.',
  };
}
