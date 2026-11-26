import {analyzePatterns,levelForIndicators,scoreForIndicators} from '../../../backend/lib/pattern-detection.js';
import {classifyTaglishIntent} from '../../../backend/lib/dataset-models.js';
import {normalizeEvidence,evidenceMatches} from '../../../backend/lib/text-evidence.js';
import {addBrowserReferenceIndicators} from './reference-indicators.js';

// OCR can wrap a sentence or URL without introducing a new semantic clause.
// Keep an original-character map so every highlight still quotes the upload.
export function prepareOfflineText(value,{ocr=false}={}){
 const original=String(value||'');let text='';const starts=[],ends=[];
 for(let i=0;i<original.length;i++){
  let ch=original[i];
  if(ocr&&ch==='|'&&/^(?:\s+)(?:will|would|am|have|shall|can)\b/i.test(original.slice(i+1)))ch='I';
  if(ocr&&ch==='\n'&&original[i-1]!=='\n'&&original[i+1]!=='\n'){
   if(/https?:\/\/[^\s]*-$/i.test(text)&&/^[a-z0-9]/i.test(original.slice(i+1)))continue;
   ch=' ';
  }
  text+=ch;starts.push(i);ends.push(i+1);
 }
 return {text,original,starts,ends};
}

function contexts(text){
 const source=normalizeEvidence(text);
 const hits=re=>evidenceMatches(source,re,{activeOnly:true});
 const directDanger=hits(/\b(?:send|share|reply|give|provide|enter|submit|ibigay|ipadala)\b[^.!?;\n]{0,55}\b(?:otps?|passwords?|pins?|cvv|verification codes?|card details|card numbers?)\b|\b(?:pay|transfer|send money|magbayad|magpadala)\b[^.!?;\n]{0,55}\b(?:fees?|deposit|personal|me|us|akin|wallet|ngayon)\b/i).length>0;
 const secretSafety=!directDanger&&/\b(?:otps?|passwords?|pins?|cvv|verification codes?)\b/i.test(text)&&/\b(?:never|do not|don't|huwag|wag)\s+(?:share|send|give|ibigay|ibahagi|ipadala)\b|\bkeep\s+(?:your|the)\s+(?:otp|password|pin|cvv|verification code)\s+(?:private|secret|confidential)\b/i.test(text);
 const advice=!directDanger&&(
  /\b(?:scam|fraud|phishing|scammers)\b/i.test(text)&&/\b(?:never|do not|don't|huwag|wag|avoid|beware|hindi humihingi|hindi hinihingi)\b/i.test(text)||
  /\b(?:never|do not|don't|huwag|wag)\s+(?:share|send|give|pay|recharge|follow|click|transfer|magbigay|magbibigay|ibigay|ibahagi|ipadala)\b/i.test(text)||
  /\b(?:warning|babala)\b/i.test(text)&&/\b(?:illegal|prohibited|not permitted|hindi pinapayagan)\b/i.test(text)
 );
 const codeNotice=!directDanger&&/\b(?:your|ang iyong|ang inyong)\s+(?:otp|verification code|security code|one[- ]time (?:password|pin|code))\s*(?:is|ay|:)|\b(?:verification code|security code|authentication code|otp)\s*[:=]|\b(?:remember|keep)\s+(?:this|the|your)\s+code\b|\buse\s+(?:the\s+)?code\s+\S+\s+in\s+(?:that|the|your)\s+(?:sign[- ]?in|login)\s+screen\b/i.test(text);
 const pending=hits(/\b(?:verify|reactivate|unlock|click|visit|pay now|pay a|pay the|send money|reply with|provide your|enter your|magbayad|ibigay)\b/i).length>0;
 const receipt=!directDanger&&!pending&&/\b(?:you have paid|you've paid|payment\b[^.!?]{0,70}\b(?:posted|received|successful)|loaded to|load received|transaction (?:was |is )?(?:successful|completed)|receipt)\b/i.test(text);
 const delivery=!directDanger&&!pending&&/\b(?:parcel|package|courier|shipment|delivery)\b/i.test(text)&&/\b(?:cod|cash on delivery|prepaid|prepare (?:the )?exact|existing order|order (?:you |history)|shopping app)\b/i.test(text);
 const appointment=!directDanger&&/\b(?:vaccin\w*|bakuna|immuni\w*|medical appointment|health appointment)\b/i.test(text)&&/\b(?:dose|appointment|schedule|dalhin|bring|am|pm)\b/i.test(text);
 const registration=!directDanger&&!pending&&/\b(?:thank you|thanks|salamat)\b[^.!?]{0,70}\b(?:registering|registration)|\bregistration\s+(?:is |was |has been )?(?:confirmed|successful|completed)\b/i.test(text);
 const recruiting=!directDanger&&/\b(?:hiring|position|job|vacancy|trabaho)\b/i.test(text)&&/\b(?:resume|cv|company directory|hr contact)\b/i.test(text);
 const telecom=!directDanger&&!pending&&/\b(?:globeone|smart|smartapp|smart credit|globe|ka-tm|mobile data)\b/i.test(text)&&(/\b(?:data|mb|gb|app|promos?|reload|service fee)\b/i.test(text)||/\bdial\s*\*\d+[\d*]*#/i.test(text));
 const waivedPayment=!directDanger&&/\b(?:no|without|walang)\s+(?:(?:advance|upfront|processing|release|activation|registration|extra|additional|security|or|and)\s+){0,5}(?:fees?|payment|deposit|purchase)\b|\b(?:nothing to pay|no purchase necessary)\b/i.test(text);
 const topics=hits(/\b(?:bank(?:ing)?|account|loan|prize|winner|winnings|payment|money|cash|balance|parcel|package|order|delivery|shipment|kyc|refund|overcharged|credit|debit|reward|funds|benefit|tax|inheritance|crypto|usdt|recharge|wallet|security|otps?|passwords?|pins?|pa[ -]?utang|pera|premyo|pautang|withdraw\w*)\b/i);
 const actions=hits(/\b(?:verify|validate|claim|reply|send|share|pay|settle|recharge|contact|open|visit|receive|confirm|call|click|review|enter|complete|activate|reactivate|restore|update|cancel|fill|follow|expire\w*|hold|held|frozen|suspend\w*|blocked|restricted|limited|magbayad|ipadala|ibigay|tumawag|kunin)\b/i);
 return {advice,appointment,benign:advice||secretSafety||codeNotice||receipt||delivery||appointment||registration||recruiting||telecom||waivedPayment,reviewEvidence:topics.length&&actions.length?[...topics,...actions].slice(0,4):[]};
}

function originalEvidence(items,prepared){
 return (items||[]).flatMap(item=>{
  if(!Number.isInteger(item?.start)||!Number.isInteger(item?.end)||item.end<=item.start)return [];
  let from=item.start,to=item.end;
  // Shared rules can remove a private login payload before matching. Locate
  // the actual quoted phrase rather than highlighting its old byte position.
  if(prepared.text.slice(from,to)!==item.text){
   from=prepared.text.indexOf(item.text);if(from<0)return [];to=from+item.text.length;
  }
  const start=prepared.starts[from],end=prepared.ends[to-1];
  return start===undefined||end===undefined?[]:[{start,end,text:prepared.original.slice(start,end)}];
 });
}

export function analyzeOfflineContent(content,explicitUrls=[],{ocr=false}={}){
 const prepared=prepareOfflineText(content,{ocr});
 const result=analyzePatterns(prepared.text,explicitUrls,addBrowserReferenceIndicators);
 const context=contexts(prepared.text);
 // Educational fee warnings and health appointments should not become scam
 // accusations because of a spam-like phrase; unrelated strong findings remain.
 result.indicators=result.indicators.filter(i=>!(context.advice&&['loan-fee','advance-fee','sms-pattern'].includes(i.id))&&!(context.appointment&&i.id==='sms-pattern'));
 const model=classifyTaglishIntent(prepared.text);
 const generic=/^(?:your|you|dear|has|have|been|our|the|this|that|there|please|thank|number|phone|named|entity|url|date|time|name|one|new|no|not|will|with|from|customer|sms|us|id)$/i;
 const learnedEvidence=[...new Map(model.evidence.filter(e=>!generic.test(e.text)).map(e=>[e.text.toLowerCase(),e])).values()];
 const reviewEvidence=context.reviewEvidence.length?context.reviewEvidence:learnedEvidence.length>=2?learnedEvidence.slice(0,4):[];
 if(model.flagged&&!context.benign&&reviewEvidence.length){
  result.indicators.push({id:'offline-text-model',title:'Message pattern needs review',message:'The on-device text classifier found a scam-like action pattern. This is a reason to verify the request, not proof that the sender is fraudulent.',weight:2,category:'message pattern',evidence:reviewEvidence});
 }
 const previous=result.level;
 result.score=scoreForIndicators(result.indicators);
 result.level=levelForIndicators(result.indicators,{sufficient:prepared.text.trim().split(/\s+/).length>=4||result.urls.length>0});
 if(result.level!==previous){
  result.summary=result.score>=2?'The request has warning signs that need independent verification.':'No strong warning signs matched; the sender and meaning remain unverified.';
  result.recommendation='Confirm unexpected requests through the usual official app or a contact you already trust.';
 }
 result.sourceText=prepared.original;
 result.indicators=result.indicators.map(i=>({...i,evidence:originalEvidence(i.evidence,prepared)}));
 result.urls=result.urls.map(u=>({...u,evidence:originalEvidence(u.evidence,prepared)}));
 return result;
}
