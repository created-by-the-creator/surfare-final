import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const directory = new URL('../evaluation/generalization/', import.meta.url);
mkdirSync(directory, { recursive: true });
const original = JSON.parse(readFileSync(new URL('../datasets/curated/message-challenge.json', import.meta.url), 'utf8'));
const messages = original.cases.map(c => ({ ...c, source: 'existing authored message challenge' }));
const extra = [
  ['scam', 'Your domestic mail cannot be re-delivered until you verify the recipient identity at https://postal-id.example/confirm'],
  ['scam', 'You have been selected for a part-time job with a daily salary of PHP2500. Contact our tutor at https://recruitment-offer.example/start'],
  ['scam', 'Hi Ma, bago kong numero ito. Magpadala ng pera ngayon para sa emergency. Hindi ako makatawag.'],
  ['scam', 'Papa, I lost my mobile. This is my replacement number. Please transfer cash to my friend now.'],
  ['scam', 'Approved ang pautang mo. Bayaran muna ang release fee bago makuha ang pera.'],
  ['scam', 'To withdraw your task commission, recharge your work account first.'],
  ['scam', 'GCash: Your wallet has been restricted. Restore access at https://wallet-restore.example/verify'],
  ['scam', 'You won a cash prize. Buy a gift card and send its code before we release your winnings.'],
  ['scam', 'S.e.n.d your p.a.s.s.w.o.r.d now to prevent your account being disabled.'],
  ['scam', 'Na-hold ang pakete mo. Magbayad ng release fee sa personal wallet para maihatid.'],
  ['legitimate', 'You have been selected for a part-time interview at the school library. Please bring a copy of your resume.'],
  ['legitimate', 'We are hiring German speakers in Taguig. The position requires SAP billing experience. Send your resume to the HR contact in our company directory.'],
  ['legitimate', 'This is my new number. Call the old contact you already have before saving it. No payment is needed.'],
  ['legitimate', 'Your package has arrived. Prepare the exact COD amount shown in the order you placed.'],
  ['legitimate', 'Your loan payment was received. No release fee or additional payment is required.'],
  ['legitimate', 'Never recharge an account to withdraw task commissions. Report this demand to the platform.'],
  ['legitimate', 'GCash security reminder: open the usual app to review your account. Never send passwords to another person.'],
  ['legitimate', 'The school raffle prize will be given to the winner at assembly. There is no payment to claim it.'],
  ['legitimate', 'Never s.e.n.d your p.a.s.s.w.o.r.d to a caller. Our support staff will not ask for it.'],
  ['legitimate', 'Your returned package is at our branch. Check the order history in your shopping app for collection details.'],
];
extra.forEach(([label, text], index) => messages.push({ id: `general-message-${index + 1}`, label, text, source: 'new authored robustness challenge' }));
const links = [];
function group(category, label, addresses) { addresses.forEach((text, i) => links.push({ id: `${category}-${i + 1}`, label, category, text })); }
group('homograph', 'review', ['раураl', 'gсash', 'fасеbооk', 'mаyа', 'gооgle'].map(host => `https://${host}.example/login`));
group('userinfo', 'review', ['gcash.com','bpi.com.ph','paypal.com','shopee.ph','facebook.com'].map(host => `https://${host}@receiver.example/login`));
group('fake-subdomain', 'review', ['gcash.com','bpi.com.ph','paypal.com','shopee.ph','facebook.com'].map(host => `https://${host}.receiver.example/verify`));
group('brand-affix', 'review', ['gcash-support','bdo-secure','bpi-online','shopee-refund','facebook-login'].map(host => `https://${host}.example/login`));
group('nested-destination', 'review', [
  'https://www.google.com/url?url=https%253A%252F%252Fgcash-login.example%252Fverify',
  'https://www.google.com/url?url=%2F%2Fpaypal-login.example%2Fverify',
  'https://www.google.com/url?next=https%3A%2F%2Freceiver.example%2F%3Furl%3Dhttps%253A%252F%252Fbpi-online.example%252Flogin',
  'https://www.google.com/url?url=https%3A%2F%2Fgcash.com.receiver.example%2Flogin',
  'https://www.google.com/url?continue=https%253A%252F%252Fpaypal.com.receiver.example%252Fverify',
]);
group('encoded-download', 'review', ['%65xe','%61pk','%73cr','%6dsi','%62at'].map(ext => `https://download.example/bank-update.${ext}`));
group('shortener', 'review', ['bit.ly','tinyurl.com','t.co','rb.gy','cutt.ly'].map(host => `https://${host}/authored-test`));
group('numeric-credential-host', 'review', ['2130706433','0x7f000001','127.1','192.0.2.15','[::ffff:127.0.0.1]'].map(host => `http://${host}/login`));
group('executable', 'review', ['exe','apk','scr','msi','bat'].map(ext => `https://download.example/bank-update.${ext}`));
group('dangerous-scheme', 'review', ['javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,authored-test','vbscript:msgbox(1)','  javascript:alert(1)  ']);
group('official', 'no_warning', ['gcash.com','bpi.com.ph','bdo.com.ph','paypal.com','maya.ph','shopee.ph','lazada.com.ph','facebook.com','google.com','microsoft.com'].map(host => `https://${host}/login`));
group('canonical-official', 'no_warning', ['https://GCASH.COM./login','https://www.bpi.com.ph./login','https://www.paypal.com./login','https://www.google.com./account','https://www.shopee.ph./orders']);
group('international-name', 'no_warning', ['bücher','例子','mañana','κόσμος','日本語'].map(host => `https://${host}.example/about`));
group('ordinary-name', 'no_warning', ['mayasflowers','mayaclinic','bpicnic','shopeerless','goggles'].map(host => `https://${host}.example/about`));
group('article-reference', 'no_warning', ['gcash','paypal','bpi','facebook','maya'].map(brand => `https://news.example/articles/about-${brand}`));
group('ordinary-path', 'no_warning', ['accounting-class','login-design-article','wallet-review','download-exe-guide.html','claim-procedure'].map(path => `https://school.example/${path}`));
group('same-origin-destination', 'no_warning', ['url','redirect','next','continue','target'].map(key => `https://www.google.com/account?${key}=%2Fhelp`));
group('ordinary-query', 'no_warning', ['name=gcash','topic=paypal','course=banking','filename=example.exe.txt','email=someone%40example.com'].map(query => `https://school.example/notes?${query}`));
group('ordinary-order', 'no_warning', ['https://www.lazada.com.ph/orders/42','https://shopee.ph/orders/81','https://www.fedex.com/tracking','https://www.phlpost.gov.ph/','https://www.jtexpress.ph/']);
const data = { version: 1, provenance: 'Synthetic development challenge authored before this round of rule changes. Includes the existing authored message challenge. Not independently collected data, not model accuracy, and not an unseen external holdout. URL labels describe reviewable structure, not verified malicious sites. No URL is visited.', messages, links };
writeFileSync(new URL('cases.json', directory), JSON.stringify(data, null, 2) + '\n');
console.log(`Saved ${messages.length} messages and ${links.length} URLs.`);
