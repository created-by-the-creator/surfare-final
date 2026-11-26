import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseCsv} from '../backend/lib/csv-rows.js';
import {messageLabel} from '../backend/lib/message-labels.js';
import {textTemplate,urlGroup} from '../backend/scripts/lib/dataset-training.mjs';
const dir=path.resolve('artifacts/offline-improvement/audit');fs.mkdirSync(dir,{recursive:true});
if(fs.existsSync(path.join(dir,'cases.json')))throw Error('Frozen cases already exist; do not overwrite.');
const sha=v=>createHash('sha256').update(v).digest('hex');
const seed='surfare-offline-reserved-audit-v1-2026-11-26';
const normalize=v=>String(v).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const definitions=[
 ['asea','A.S.E.A Taglish','backend/datasets/A.S.E.A Taglish scam Dataset.csv','https://github.com/ChrisThePCGamer/asea-sms-scam-detection'],
 ['filipino-original','Filipino Spam SMS original','backend/datasets/external/filipino-spam-sms-dataset.csv','https://github.com/Yissuh/Filipino-Spam-SMS-Detection-Model/blob/main/data-set.csv'],
 ['filipino-merged','Filipino Spam SMS merged','backend/datasets/external/filipino-spam-sms-merged.csv','https://github.com/Yissuh/Filipino-Spam-SMS-Detection-Model/blob/main/merged-set.csv'],
 ['uci-sms','UCI SMS Spam Collection (deduplicated copy)','backend/datasets/external/sms-spam-collection-dedup.csv','https://archive.ics.uci.edu/dataset/228/sms+spam+collection'],
 ['hinglish','Hinglish/English corpus: UCI-matched ham only','backend/datasets/external/hinglish-scam-text.json','https://huggingface.co/datasets/bolewara/hinglish-scam-text-dataset'],
 ['imc25','IMC25 public smishing reports','backend/datasets/external/imc25-smishing.csv','https://github.com/reportsmishing/Smishing-Dataset-IMC25'],
 ['phiusiil','PhiUSIIL phishing URLs','backend/datasets/PhiUSIIL_Phishing_URL_Dataset.csv','https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset']
];
const sources={};const pools={};
for(const [id,name,file,url] of definitions){
 const bytes=fs.readFileSync(file);const parsed=file.endsWith('.json')?JSON.parse(bytes.toString('utf8')).rows:parseCsv(bytes.toString('utf8'));
 sources[id]={name,file,url,sha256:sha(bytes),sourceRows:parsed.length,trainingOrReferenceOverlap:true};
 pools[id]=parsed.map((r,i)=>({raw:r,sourceRecord:i+2,...(file.endsWith('.json')?{sourceRecord:i+1}:{}),source:id}));
}
const uciHam=new Map(pools['uci-sms'].filter(r=>messageLabel(r.raw.label)==='legitimate').map(r=>[normalize(r.raw.text),r.sourceRecord]));
const excludedTemplates=new Set();
for(const file of ['artifacts/corpus-evaluation-200/cases.json','backend/evaluation/local-messages/messages.json','artifacts/evaluation-300/cases.json','backend/datasets/curated/message-training.json','backend/datasets/curated/message-challenge.json']){
 if(!fs.existsSync(file))continue;
 const data=JSON.parse(fs.readFileSync(file,'utf8'));for(const r of Array.isArray(data)?data:data.cases||[])if(r.text||r.expectedText)excludedTemplates.add(textTemplate(r.text||r.expectedText));
}
const audit={seed,excludedPriorTemplates:excludedTemplates.size,filterCounts:{}};
function drop(reason){audit.filterCounts[reason]=(audit.filterCounts[reason]||0)+1;return null;}
function redact(value){
 const operations=[];let text=String(value);
 for(const [name,re,replacement] of [
  ['email',/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'<EMAIL>'],
  ['phone',/(?:\+?63|0)9[\d* -]{8,13}\b/g,'<PHONE>'],
  ['long-numeric-identifier',/\b\d{5,}\b/g,'<NUMBER>'],
  ['titled-name',/\b(?:Ms\.?|Mr\.?)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g,'<NAME>']
 ]){const n=[...text.matchAll(re)].length;if(n){text=text.replace(re,replacement);operations.push({type:name,count:n});}}
 const compact=text.replace(/\s+/g,' ').trim();if(compact!==text)operations.push({type:'whitespace-normalization'});
 return {text:compact,operations};
}
const ageAppropriate=/\b(?:sex(?:y|ual)?|porn\w*|nude\w*|erotic|fuck\w*|dick|pussy|blowjob|horny|cum)\b/i;
const eligible={};const messageLabels=new Map();
for(const [id,rows] of Object.entries(pools)){
 eligible[id]=[];
 for(const r of rows){
  let original,label,column,originalLabel,category;
  if(id==='phiusiil'){
   original=r.raw.URL;originalLabel=r.raw.label;label=String(originalLabel)==='0'?'scam':String(originalLabel)==='1'?'legitimate':null;column='URL';category='source-labeled phishing URL';
  }else if(id==='imc25'){
   column=r.raw.translation?.trim()?'translation':'text';original=r.raw[column];label='scam';originalLabel=`public smishing report / ${r.raw.scam_type||'unspecified'}`;category=r.raw.scam_type||'smishing';
  }else{
   column=id==='asea'?'text':id.startsWith('filipino')?'message':'text';original=r.raw[column];originalLabel=id==='asea'?r.raw.intent:r.raw.label;label=messageLabel(originalLabel);category=id==='asea'?originalLabel:'source-labeled legitimate message';
  }
  if(!['scam','legitimate'].includes(label)) {drop('spam-or-unreviewed-not-fraud-ground-truth');continue;}
  if(!original||ageAppropriate.test(original)){drop('empty-or-unsuitable-presentation-content');continue;}
  if(id!=='phiusiil'&&(original.length<30||original.length>350||/[^\x00-\x7F\u00a0-\u024f\u2010-\u2026\u20ac\u20b1]/u.test(original))){drop('length-or-script-boundary');continue;}
  if(id==='hinglish'&&(!uciHam.has(normalize(original))||label!=='legitimate')){drop('hinglish-not-verifiable-UCI-ham');continue;}
  if(id!=='phiusiil'&&!['asea','imc25'].includes(id)&&label!=='legitimate')continue;
  let prepared,group;
  if(id==='phiusiil'){
   try{const u=new URL(original);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||original.length>300||/[\s]/.test(original)||/[?&](?:token|key|auth|password|secret|session)=/i.test(original)){drop('unsupported-or-sensitive-url');continue;}group='url:'+urlGroup(original);}catch{drop('invalid-url');continue;}
   prepared={text:original,operations:[]};
  }else{
   prepared=redact(original);group='message:'+textTemplate(prepared.text);
   if(excludedTemplates.has(textTemplate(original))||excludedTemplates.has(textTemplate(prepared.text))){drop('previous-development-template');continue;}
  }
  const row={source:id,sourceRecord:r.sourceRecord,sourceColumn:column,originalLabel:String(originalLabel),label:label==='scam',expectedText:prepared.text,sourceTextSha256:sha(original),redactions:prepared.operations,group,category,translationUsed:id==='imc25'&&column==='translation',labelStatus:'Source label retained; not independently adjudicated for this study',trainingOrReferenceOverlap:true,...(id==='hinglish'?{alsoMatchesUciRecord:uciHam.get(normalize(original))}:{})};
  eligible[id].push(row);
  const labels=messageLabels.get(group)||new Set();labels.add(row.label);messageLabels.set(group,labels);
 }
}
const used=new Set(JSON.parse(fs.readFileSync('artifacts/corpus-evaluation-200/cases.json','utf8')).map(r=>r.group));const selected=[];
function take(source,label,n){
 const candidates=eligible[source].filter(r=>r.label===label&&messageLabels.get(r.group).size===1).sort((a,b)=>sha(seed+source+a.sourceTextSha256).localeCompare(sha(seed+source+b.sourceTextSha256)));
 const rows=[];
 for(const r of candidates){if(used.has(r.group))continue;used.add(r.group);rows.push(r);if(rows.length===n)break;}
 if(rows.length!==n)throw Error(`${source} ${label}: only ${rows.length}/${n} eligible unique templates`);
 selected.push(...rows);return rows;
}
take('asea',true,50);take('asea',false,12);take('imc25',true,76);
for(const source of ['filipino-original','filipino-merged','uci-sms','hinglish'])take(source,false,28);
take('phiusiil',true,74);take('phiusiil',false,76);
const order=(rows)=>rows.toSorted((a,b)=>sha(seed+'assignment'+a.sourceTextSha256).localeCompare(sha(seed+'assignment'+b.sourceTextSha256)));
const messagePositive=order(selected.filter(r=>r.source!=='phiusiil'&&r.label));
const messageNegative=order(selected.filter(r=>r.source!=='phiusiil'&&!r.label));
const urlPositive=order(selected.filter(r=>r.source==='phiusiil'&&r.label));
const urlNegative=order(selected.filter(r=>r.source==='phiusiil'&&!r.label));
const byKind={text:[messagePositive.slice(0,50),messageNegative.slice(0,50)],image:[messagePositive.slice(50,100),messageNegative.slice(50,100)],links:[urlPositive.slice(0,50),urlNegative.slice(0,50)],qr:[[...messagePositive.slice(100),...urlPositive.slice(50)],[...messageNegative.slice(100),...urlNegative.slice(50)]]};
const cases=[];
for(const [kind,[positive,negative]] of Object.entries(byKind)){
 if(positive.length!==50||negative.length!==50)throw Error('Unbalanced assignment');
 for(let i=0;i<50;i++)for(const r of [positive[i],negative[i]])cases.push({...r,id:`${kind}-${String(i*2+(r.label?1:2)).padStart(3,'0')}`,kind});
}
if(cases.length!==400||new Set(cases.map(r=>r.group)).size!==400)throw Error('Expected 200 distinct source groups');
const bytes=Buffer.from(JSON.stringify(cases,null,2)+'\n','utf8');fs.writeFileSync(path.join(dir,'cases.json'),bytes);
const counts=Object.fromEntries(Object.keys(sources).map(s=>[s,{positive:cases.filter(c=>c.source===s&&c.label).length,negative:cases.filter(c=>c.source===s&&!c.label).length}]));
const runtimeFiles=['frontend/src/engine/analyze.js','frontend/src/engine/check-content.js',...fs.readdirSync('backend/lib').filter(n=>n.endsWith('.js')).map(n=>'backend/lib/'+n),...fs.readdirSync('backend/lib/models').filter(n=>n.endsWith('.json')).map(n=>'backend/lib/models/'+n),...fs.readdirSync('backend/server/services').filter(n=>n.endsWith('.js')).map(n=>'backend/server/services/'+n),...fs.readdirSync('backend/server/providers').filter(n=>n.endsWith('.js')).map(n=>'backend/server/providers/'+n)];
fs.writeFileSync(path.join(dir,'runtime-hashes.json'),JSON.stringify(Object.fromEntries(runtimeFiles.map(f=>[f,sha(fs.readFileSync(f))])),null,2));
const manifest={frozenAt:new Date().toISOString(),caseSha256:sha(bytes),seed,sources,counts,audit,scope:'400 new dataset-derived source groups; 100 per modality, each 50 positive and 50 negative; same cases compared locally and with AI double-check. Dataset/reference overlap prevents independent full-app accuracy claims.',selection:'Fixed hash order, quotas, one normalized message template or registrable URL domain per selected input. Excludes earlier evaluation and curated development templates. No detector predictions used for selection.',excludedSources:[{source:'Project-authored synthetic training/challenge cases',reason:'Excluded because requested dataset-derived records, not new authored examples.'},{source:'dataset_phishing.csv',reason:'Engineered features without raw URLs; not compatible with app input.'},{source:'Vrbanic CSV',reason:'Excluded from runtime and no verified license.'},{source:'PhishDestroy/PAGCOR/SEC/local watchlists',reason:'Reference lists are not balanced message/URL ground truth; PhishDestroy only stores non-reversible domain fingerprints here.'}],limitations:['Dataset provenance is traceable; individual messages/senders and labels are not independently verified.','All selected corpus sources overlap training/reference material; novel selection is not proof of unseen data.','Hinglish rows are English ham matching the UCI source; no authored Hinglish scenarios are used.','Screenshot/QR files are controlled renderings of actual source records, not collected camera images.','Redaction and translation can affect detection. Original source hashes, parsed record indexes, column and original labels are preserved.']};
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({caseCount:cases.length,counts,caseSha256:manifest.caseSha256,filterCounts:audit.filterCounts},null,2));
