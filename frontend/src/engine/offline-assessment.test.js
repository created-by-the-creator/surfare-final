import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {checkExtractedContent} from './check-content.js';
import {matchesKnownPhishingUrl} from './phishing-urls.js';
import {prepareOfflineText} from './offline-assessment.js';
import {parseCsvRows} from '../../../backend/lib/csv-rows.js';

it('uses exact full-corpus URL references offline without blocking neighboring paths or hosts',async()=>{
 const rows=parseCsvRows(readFileSync(new URL('../../../backend/datasets/PhiUSIIL_Phishing_URL_Dataset.csv',import.meta.url),'utf8'));
 const header=rows.next().value;const u=header.indexOf('URL'),label=header.indexOf('label');
 const examples={0:[],1:[]};
 for(const row of rows){
  if(examples[row[label]]?.length<12&&/^https?:\/\//.test(row[u]))examples[row[label]].push(row[u]);
  if(examples[0].length===12&&examples[1].length===12)break;
 }
 const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('Network forbidden'));
 try{
  for(const url of examples[0]){
   expect(matchesKnownPhishingUrl(url)).toBe(true);
   const result=await checkExtractedContent('links',url,null,{onlineLookup:false,ai:false});
   expect(result.level).toBe('high');
   expect(result.signals.some(s=>s.id==='dataset-url-match')).toBe(true);
   expect(matchesKnownPhishingUrl(url+(url.includes('?')?'&':'?')+'surfare-neighbor=1')).toBe(false);
  }
  for(const url of examples[1])expect(matchesKnownPhishingUrl(url)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
 }finally{fetcher.mockRestore();}
});

it('repairs OCR wrapping while preserving original highlights and typed-message boundaries',async()=>{
 const text='| will publish your private photos\nunless you send money tonight.';
 const result=await checkExtractedContent('image',text,{text},{onlineLookup:false,ai:false});
 expect(['high','suspicious']).toContain(result.level);
 for(const s of result.signals)for(const e of s.evidenceItems||[])expect(text.slice(e.start,e.end)).toBe(e.text);
 expect(prepareOfflineText(text).text).toBe(text);
 const url='See https://parcel-\nnotice.example/verify';
 expect(prepareOfflineText(url,{ocr:true}).text).toBe('See https://parcel-notice.example/verify');
});

it.each([
 'Never share passwords or PINs. Open the bank app to review your account.',
 'Your verification code is 193762. Use it only for the sign-in you requested.',
 'Your contribution payment has been posted. No further action is required.',
 'Vaccination appointment: bring your ID for the second dose at 9 AM.',
 'Loan processing fees before release are a scam. Huwag magbayad; hindi humihingi ng paunang bayad ang lender.',
 'The class raffle winner receives the prize at assembly. No purchase necessary.',
])('keeps ordinary notices and protective advice free of learned-model alarms: %s',async text=>{
 const result=await checkExtractedContent('text',text,null,{onlineLookup:false,ai:false});
 expect(['low','unknown']).toContain(result.level);
 expect(result.signals.some(s=>s.id==='offline-text-model')).toBe(false);
});

it.each([
 'Never share passwords. But send me your OTP now or your account will be locked.',
 'Never share passwords. But send me your passwords now or your bank account will be blocked.',
 'No registration fee is needed. Pay the processing fee to my personal wallet before your loan is released.',
 'Vaccination appointment: pay a release fee to my wallet now to unlock your booking.',
])('preserves a separate active demand inside benign-looking wording: %s',async text=>{
 const result=await checkExtractedContent('text',text,null,{onlineLookup:false,ai:false});
 expect(['high','suspicious']).toContain(result.level);
});
