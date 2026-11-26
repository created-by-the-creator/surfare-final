"""Simple two-page results PDF plus a complete source/sample booklet and data ZIP."""
import collections,csv,hashlib,json,pathlib,textwrap,zipfile
from datetime import datetime,timezone,timedelta
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
import numpy as np
from PIL import Image

ROOT=pathlib.Path(__file__).resolve().parents[1];D=ROOT/'artifacts/corpus-evaluation-200'
read=lambda name:json.loads((D/name).read_text(encoding='utf-8'))
cases=read('cases.json');manifest=read('manifest.json');files=read('image-files.json');local=read('local.json');online=read('online.json');backend=read('backend-local.json')
assert len(cases)==len(local['rows'])==len(online['rows'])==len(backend['rows'])==200
assert hashlib.sha256((D/'cases.json').read_bytes()).hexdigest()==manifest['caseSha256']
C={r['id']:r for r in cases};L={r['id']:r for r in local['rows']};O={r['id']:r for r in online['rows']};B={r['id']:r for r in backend['rows']}
assert len(C)==200 and set(C)==set(L)==set(O)==set(B)
assert len({c['group'] for c in cases})==len({c['expectedText'] for c in cases})==200
for s in manifest['sources'].values():assert hashlib.sha256((ROOT/s['file']).read_bytes()).hexdigest()==s['sha256']
for name,hash in read('runtime-hashes.json').items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==hash
for f in files.values():assert hashlib.sha256((D/f['file']).read_bytes()).hexdigest()==f['sha256']
KINDS=['text','links','qr','image'];NAMES={'text':'Messages','links':'Links','qr':'QR codes','image':'Screenshot text'}
def metrics(rows):
 n=len(rows);p=sum(r['label'] for r in rows);q=n-p
 valid=[r for r in rows if not r.get('error') and not r.get('errorKey') and r.get('flagged') is not None]
 tp=sum(r['label'] and r['flagged'] for r in valid);fp=sum(not r['label'] and r['flagged'] for r in valid);tn=sum(not r['label'] and not r['flagged'] for r in valid);fn=p-tp
 return dict(n=n,positive=p,negative=q,tp=tp,fp=fp,tn=tn,fn=fn,failed=n-len(valid),unknown=sum(r.get('level') in ['unknown','Insufficient evidence'] for r in valid),accuracy=100*(tp+tn)/n if n else None,fpr=100*fp/q if q else None,fnr=100*fn/p if p else None)
complete={r['id'] for r in online['rows'] if r['onlineStatus']=='completed'}
AI=[r for r in online['rows'] if r['id'] in complete];pairedLocal=[L[i] for i in complete];pairedBackend=[B[i] for i in complete]
statuses=dict(collections.Counter(r['onlineStatus'] for r in online['rows']))
overall={'local_browser':metrics(local['rows']),'ai_completed_subset':metrics(AI),'online_mode_including_fallback':metrics(online['rows']),'local_browser_on_completed_subset':metrics(pairedLocal),'backend_without_ai_on_completed_subset':metrics(pairedBackend),'backend_without_ai_all':metrics(backend['rows'])}
perKind={k:{'local':metrics([r for r in local['rows'] if r['kind']==k]),'ai_completed':metrics([r for r in AI if r['kind']==k]),'online_mode':metrics([r for r in online['rows'] if r['kind']==k])} for k in KINDS}
perSource={s:{'local':metrics([r for r in local['rows'] if r['source']==s]),'ai_completed':metrics([r for r in AI if C[r['id']]['source']==s])} for s in manifest['sources']}
changes={
 'improved_vs_same_backend_without_ai':sum(O[i]['flagged']==C[i]['label'] and B[i]['flagged']!=C[i]['label'] for i in complete),
 'worsened_vs_same_backend_without_ai':sum(O[i]['flagged']!=C[i]['label'] and B[i]['flagged']==C[i]['label'] for i in complete),
 'unchanged_warning_vs_same_backend_without_ai':sum(O[i]['flagged']==B[i]['flagged'] for i in complete)}
summary=dict(caseSha256=manifest['caseSha256'],scope=manifest['scope'],labelPolicy='Source labels retained. Generic spam is not reclassified as verified scam. Unknown/no warning counts as a miss on a positive, and is not certified safe.',overall=overall,perKind=perKind,perSource=perSource,onlineStatuses=statuses,aiChangesVsBackend=changes,onlineProviders=online['providers'],startedAt=local['startedAt'],finishedAt=online['updatedAt'],localExternalRequestsBlocked=local['externalRequestsBlocked'],sourceAndRuntimeHashesVerified=True)
(D/'metrics.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
with (D/'samples-and-results.csv').open('w',newline='',encoding='utf-8-sig') as f:
 fields=['id','kind','source','sourceRecord','sourceColumn','originalLabel','label','expectedText','sourceTextSha256','translationUsed','redactions','alsoMatchesUciRecord','trainingOrReferenceOverlap','labelStatus','file','fileSha256','localLevel','localWarning','actualExtractedText','localError','ocrConfidence','backendNoAiLevel','backendNoAiWarning','aiLevel','aiWarning','aiStatus','aiProvider','aiModel']
 w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
 for c in cases:
  i=c['id'];l=L[i];o=O[i];b=B[i];image=files.get(i,{})
  w.writerow(dict(c,redactions=json.dumps(c['redactions']),file=image.get('file'),fileSha256=image.get('sha256'),localLevel=l.get('level'),localWarning=l.get('flagged'),actualExtractedText=l.get('text'),localError=l.get('error') or l.get('errorKey'),ocrConfidence=l.get('ocrConfidence'),backendNoAiLevel=b.get('level'),backendNoAiWarning=b.get('flagged'),aiLevel=o.get('level'),aiWarning=o.get('flagged'),aiStatus=o.get('onlineStatus'),aiProvider=o.get('provider'),aiModel=o.get('model')))
with (D/'metrics.csv').open('w',newline='',encoding='utf-8-sig') as f:
 fields=['scope','group',*overall['local_browser'].keys()];w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for k,m in overall.items():w.writerow(dict(scope=k,group='all',**m))
 for kind,groups in perKind.items():
  for name,m in groups.items():w.writerow(dict(scope=name,group=kind,**m))
 for s,groups in perSource.items():
  for name,m in groups.items():w.writerow(dict(scope=name,group=s,**m))

BG='#f7f9fc';INK='#19344d';BLUE='#187b9b';CORAL='#c75863';GRAY='#60758a'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'text.color':INK,'text.parse_math':False,'figure.facecolor':BG,'axes.facecolor':BG,'axes.spines.top':False,'axes.spines.right':False})
when=datetime.fromisoformat(online['updatedAt'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=8))).strftime('%d %B %Y, %H:%M SGT')
def pct(x):return 'N/A' if x is None else f'{x:.2f}%'
def new(title,subtitle='',portrait=False):
 fig=plt.figure(figsize=(8.27,11.69) if portrait else (13.333,7.5))
 fig.text(.055,.95 if portrait else .925,title,fontsize=15 if portrait else 23,weight='bold')
 fig.text(.055,.92 if portrait else .875,subtitle,fontsize=8 if portrait else 10,color=GRAY)
 fig.text(.055,.025,'SURFARE | '+when+' | Dataset-source evaluation; not independent validation',fontsize=7,color=GRAY)
 return fig
def table(fig,headers,rows,rect,widths=None,fs=10):
 ax=fig.add_axes(rect);ax.axis('off');t=ax.table(cellText=rows,colLabels=headers,colWidths=widths,loc='center',cellLoc='left',colLoc='left');t.auto_set_font_size(False);t.set_fontsize(fs)
 for (i,j),cell in t.get_celld().items():
  cell.set_height(1/(len(rows)+1));cell.set_edgecolor('white');cell.set_facecolor(INK if i==0 else ('#e7eef5' if i%2 else '#f3f6fa'))
  if i==0:cell.set_text_props(color='white',weight='bold')
def block(fig,x,y,title,text,width=133,fs=10):
 fig.text(x,y,title,fontsize=13,weight='bold',va='top')
 fig.text(x,y-.047,'\n'.join('\n'.join(textwrap.wrap(p,width)) for p in text.split('\n')),fontsize=fs,va='top',linespacing=1.45)
def save(pdf,fig,name=None,page=None):
 if page is not None:fig.text(.94,.025,str(page),fontsize=8)
 pdf.savefig(fig)
 p=D/'report-pages';p.mkdir(exist_ok=True)
 if name:fig.savefig(D/name,dpi=180)
 fig.savefig(p/(name or f'sample-page-{page:02}.png'),dpi=75)
 plt.close(fig)

with PdfPages(D/'Surfare-200-Simple-Results.pdf') as pdf:
 fig=new('Surfare: 200 dataset-derived samples','Local first, then the same inputs with AI double-check. 50 per check type; 100 positive and 100 negative source labels.')
 rows=[]
 for label,key in [('Local checks: all 200','local_browser'),('AI double-check: completed only','ai_completed_subset'),('Online mode: all 200, including fallback','online_mode_including_fallback')]:
  m=overall[key];rows.append([label,m['n'],f"{m['positive']}/{m['negative']}",pct(m['accuracy']),pct(m['fpr']),pct(m['fnr'])])
 table(fig,['Mode','N','Pos / neg','Accuracy','False-positive rate','False-negative rate'],rows,(.055,.58,.89,.22),widths=[.36,.06,.12,.14,.16,.16],fs=10)
 ax=fig.add_axes([.09,.24,.44,.27]);x=np.arange(3);w=.34
 for offset,m,label,color in [(-w/2,metrics(pairedLocal),'Local, same completed cases',BLUE),(w/2,metrics(AI),'AI completed cases',CORAL)]:
  vals=[m['accuracy'],m['fpr'],m['fnr']];bars=ax.bar(x+offset,[v or 0 for v in vals],w,label=label,color=color)
  ax.bar_label(bars,labels=[pct(v) for v in vals],padding=3,fontsize=9)
 ax.set_xticks(x,['Accuracy','False positive','False negative']);ax.set_ylim(0,112);ax.set_ylabel('Percent');ax.legend(fontsize=8,frameon=False,loc='upper center',bbox_to_anchor=(.5,-.18))
 block(fig,.59,.51,'Availability matters',f"{len(AI)} / 200 external AI reviews completed.\nUnavailable / error: {sum(v for k,v in statuses.items() if k not in ['completed','not_checked'])}. Policy skips: {statuses.get('not_checked',0)}.\nChart compares the same {len(AI)} completed-review cases in both modes. Full-200 online results include local/backend fallback.",width=48,fs=11)
 fig.text(.06,.115,'Accuracy = correct warning decisions / all cases. False positive = legitimate case warned. False negative = source-positive case missed.',fontsize=9)
 fig.text(.06,.08,'These are traceable corpus records, not new invented messages. Training/reference overlap and unreviewed source labels limit the claims.',fontsize=10)
 fig.text(.06,.047,'An uncertain result counts as no warning for this alarm test; it does not confirm that a message or website is safe.',fontsize=9)
 save(pdf,fig,'results-overview.png',1)

 fig=new('Results by check and source','Each check type uses 50 different source records: 25 positives and 25 negatives. No test website was visited.')
 rows=[]
 for k in KINDS:
  a=perKind[k]['local'];b=perKind[k]['ai_completed'];rows.append([NAMES[k],pct(a['accuracy']),pct(a['fpr']),pct(a['fnr']),f"{b['n']}/50",pct(b['accuracy']),pct(b['fpr']),pct(b['fnr'])])
 table(fig,['Check','Local acc.','Local FP','Local FN','AI done','AI acc.*','AI FP*','AI FN*'],rows,(.055,.58,.89,.22),widths=[.19,.12,.11,.11,.11,.12,.12,.12],fs=9)
 sourceRows=[]
 short={'asea':'A.S.E.A Taglish','filipino-original':'Filipino SMS: original','filipino-merged':'Filipino SMS: merged','uci-sms':'UCI SMS: deduplicated copy','hinglish':'Hinglish corpus: UCI-matched English ham','imc25':'IMC25 public smishing reports','phiusiil':'PhiUSIIL URLs'}
 for s,n in manifest['counts'].items():sourceRows.append([short[s],n['positive'],n['negative'],n['positive']+n['negative']])
 table(fig,['Source file','Positive','Negative','Total'],sourceRows,(.055,.16,.47,.34),widths=[.64,.12,.12,.12],fs=8)
 a=overall['backend_without_ai_on_completed_subset'];b=overall['ai_completed_subset']
 block(fig,.56,.49,'What changed with AI?',f"Same {len(AI)} completed cases, backend with AI off: {pct(a['accuracy'])} accuracy. With AI: {pct(b['accuracy'])}.\nAI improved {changes['improved_vs_same_backend_without_ai']} outcomes and worsened {changes['worsened_vs_same_backend_without_ai']} versus that backend baseline.\n*AI rates use completed reviews only; this is the combined backend outcome, not an isolated AI model score. QR/images are controlled renderings of corpus records. “Image” here tests OCR text safety, not AI-image origin.",width=48,fs=10)
 fig.text(.06,.085,'Records, original labels, source links, row numbers, redactions and every result are in the Samples PDF and data ZIP.',fontsize=10)
 fig.text(.06,.055,'All seven source snapshots matched repository hashes. No detector rules, models or thresholds were changed for this test.',fontsize=9)
 save(pdf,fig,'results-by-check-and-source.png',2)

with PdfPages(D/'Surfare-200-Tested-Samples-and-Sources.pdf') as pdf:
 page=1;fig=new('Sources and interpretation','All 200 selected inputs, source labels and paired outcomes follow. This is an audit packet, not independent certification.',True)
 y=.875
 for s,data in manifest['sources'].items():
  lines=[s+' | '+data['name'],data['url'],'File: '+data['file'],'SHA-256: '+data['sha256']]
  for j,line in enumerate(lines):
   for part in textwrap.wrap(line,111):fig.text(.055,y,part,fontsize=7.6,va='top',weight='bold' if j==0 else 'normal');y-=.014
  y-=.012
 for line in textwrap.wrap('The seven source snapshots match the project manifest. Original source labels and record locators are retained. No test-site pages were visited. Source labels are not independent proof that every reported sender or website is fraudulent or legitimate.',111):
  fig.text(.055,y,line,fontsize=8.5,va='top');y-=.016
 y-=.02
 for line in textwrap.wrap('Some positive samples contain phishing addresses. Inspect their text only; do not open or scan their destinations during the presentation.',111):
  fig.text(.055,y,line,fontsize=8.5,va='top');y-=.016
 save(pdf,fig,page=page)
 page+=1;fig=new('Test method and evidence limits','Read this with the two-page results sheet. No production model, rule or threshold changes were made.',True);y=.875
 notes=[
  'Source records are present in the local published-corpus snapshots; individual sender authenticity and each label have not been independently adjudicated. Dataset provenance is not proof of real-world truth.',
  'CSV record numbers include the header as record 1, and refer to parsed records, not physical text lines. Hinglish JSON record numbers are one-based indexes in rows. Original-text hashes use the selected source cell after the repository CSV parser trims surrounding whitespace. Source columns and hashes are in the CSV.',
  'Hinglish samples were restricted to English legitimate messages matching the UCI ham corpus. Generic spam rows were not relabeled as verified scams. IMC25 uses the supplied English translation where present; source placeholders remain unchanged.',
  'All corpus sources overlap Surfare training/reference material. Cases are different from prior evaluation templates, but are not a proven unseen full-app holdout. Dates and source labels describe the source snapshot, not current website behavior.',
  'Original text was retained except recorded privacy redactions and whitespace cleanup. The PDF/CSV show the actual submitted text. QR and screenshot images were made for this test; original collected photographs were not available.',
  'Synthetic project-authored pools, feature-only dataset_phishing.csv, the excluded Vrbanic CSV, regulator/watchlists and the fingerprint-only domain index are outside this balanced corpus test.',
  'UCI/PhiUSIIL/IMC25/Hinglish source notices record CC BY 4.0; Filipino SMS records BSD-3-Clause. The repository flags unverified A.S.E.A terms and conflicting PhiUSIIL listing terms. This packet is for internal project review; source notices and the preserved Filipino license are in the data ZIP.'
 ]
 notes.append('Configured live providers: '+ '; '.join(p['providerId']+' / '+p['model'] for p in online['providers'])+'. Completed results retain their actual provider/model IDs in online.json. Availability and provider behavior are specific to this run.')
 notes.append('Frozen case-set SHA-256: '+manifest['caseSha256']+'. Local started '+local['startedAt']+'; online finished '+online['updatedAt']+'. All timestamps here are UTC; the results sheet uses Singapore time.')
 for paragraph in notes:
  for line in textwrap.wrap(paragraph,103):fig.text(.055,y,line,fontsize=8.5,va='top');y-=.014
  y-=.012
 save(pdf,fig,page=page)
 def display(r):
  if r.get('error') or r.get('errorKey') or r.get('flagged') is None:return 'ERROR'
  return {'high':'HIGH','suspicious':'SUSP','low':'LOW','unknown':'UNCERT','High risk':'HIGH','Suspicious':'SUSP','Low risk':'LOW','Insufficient evidence':'UNCERT'}.get(r.get('level'),str(r.get('level')))
 fig=None;y=0
 for c in cases:
  i=c['id'];l=L[i];o=O[i];b=B[i]
  lines=[f"{i} | {'POSITIVE' if c['label'] else 'NEGATIVE'} | {c['source']} record {c['sourceRecord']} | label: {c['originalLabel']}"]
  lines+=textwrap.wrap(c['expectedText'],109,replace_whitespace=False,drop_whitespace=False)
  lines.append(f"Local: {display(l)} | AI mode: {display(o)} [{o['onlineStatus']}] | Backend AI-off: {display(b)}")
  if c['redactions']:lines+=textwrap.wrap('Changes: '+', '.join(r['type']+(f" x{r['count']}" if 'count' in r else '') for r in c['redactions']),109)
  if c['translationUsed']:lines.append('Input is the source-provided English translation; original-language text was not separately evaluated.')
  if c['kind']=='image' and l.get('text','')!=c['expectedText']:
   lines+=textwrap.wrap('Actual OCR sent to AI (\\n is a line break): '+l.get('text','[no text]').replace('\n','\\n'),109)
  height=len(lines)*.0127+.018
  if fig is None or y-height<.06:
   if fig is not None:save(pdf,fig,page=page)
   page+=1;fig=new('All tested inputs and results','HIGH/SUSP = warning; LOW/UNCERT = no warning. Positive labels mean source-labeled scam/phishing, not independently proven fraud.',True);y=.875
  for j,line in enumerate(lines):
   # Wrap long headings too, preserving every source label and locator.
   for part in textwrap.wrap(line,109,replace_whitespace=False,drop_whitespace=False) or ['']:
    fig.text(.055,y,part,fontsize=8,va='top',weight='bold' if j==0 else 'normal');y-=.0127
  y-=.018
 if fig is not None:save(pdf,fig,page=page)

slide=['SURFARE: 200 DATASET-DERIVED INPUTS',when,'100 source-positive / 100 source-negative; 50 per check type. No newly authored message content.','Training/reference overlap: this is not independent real-world validation.','']
for name,key in [('Local browser','local_browser'),('AI completed subset','ai_completed_subset'),('Online mode including fallback','online_mode_including_fallback')]:
 m=overall[key];slide.append(f"{name}: N={m['n']} (+{m['positive']}/-{m['negative']}); accuracy={pct(m['accuracy'])}; FPR={pct(m['fpr'])}; FNR={pct(m['fnr'])}; TP/FP/TN/FN={m['tp']}/{m['fp']}/{m['tn']}/{m['fn']}.")
slide+=['','AI statuses: '+json.dumps(statuses),'Same-backend diagnostic: '+json.dumps(changes),'','PER CHECK TYPE']
for k in KINDS:
 a=perKind[k]['local'];b=perKind[k]['ai_completed'];slide.append(f"{NAMES[k]}: local accuracy/FPR/FNR {pct(a['accuracy'])}/{pct(a['fpr'])}/{pct(a['fnr'])}; AI completed {b['n']}/50, accuracy/FPR/FNR {pct(b['accuracy'])}/{pct(b['fpr'])}/{pct(b['fnr'])}.")
(D/'PPT-slide-text.txt').write_text('\n'.join(slide)+'\n',encoding='utf-8')
readme='''SURFARE DATASET-SOURCE EVALUATION - 200 LOCAL + SAME 200 AI-MODE INPUTS
The two-page Results PDF is intended for quick presentation. The Samples PDF contains every source input and result.
cases.json is the frozen 200-case selection; SHA-256 is in manifest.json. There are 200 distinct normalized template/domain groups and distinct input texts.
No detector predictions were used for selection. Hash-order quotas and exclusions are documented by corpus200-prepare.mjs.
samples-and-results.csv contains all source paths/record numbers, original labels, original text hashes, redactions, input texts, extraction outputs, and local/backend/AI results.
Positive = source-labeled scam/phishing. Negative = source-labeled legitimate/ham. Generic spam is excluded.
All source snapshots matched the repository manifest hashes. The records overlap model training/reference data, so this is not an independent or blind real-world test.
Hinglish samples are English UCI-matched ham; this avoids passing hand-written Hinglish examples off as collected messages.
sourceRecord indexes parsed CSV records including the header, or one-based JSON rows. Source file hashes identify the snapshots.
AI-mode outcome is the combined backend output. onlineStatus=completed means a provider review completed; unavailable reviews and policy skips are not counted as completed AI successes.
backend-local.json provides the same backend with AI disabled and network forbidden, so backend reference differences are not wrongly attributed entirely to AI.
Unknown/no warning on a positive counts as a missed warning. Uncertain negatives are counted as no warning, not verified safe. Extraction failures receive no correctness credit.
samples/ contains the exact 50 QR and 50 screenshot PNGs. These are controlled renderings of corpus content, not collected photographs.
Original dataset URLs were never visited. Phone/email/long identifiers/titled names were masked where recognized; these transformations can affect detection.
Provider IDs, models, timings, local extraction confidence and statuses are saved in the raw JSON.
Runtime fingerprints are in runtime-hashes.json. No model/rule/threshold changes were made during the run.
Licensed-source and overlap caveats are stated in the Samples PDF and source notices. This is an internal project evidence packet; individual message labels were not independently human-adjudicated.
Run the archived scripts from artifacts/ in the Surfare repository. The prepare step refuses to overwrite frozen cases. Online script resumes already recorded rows. Use a new run directory for a new full test.
Python dependencies: matplotlib, Pillow, OpenCV. Node dependencies: existing project workspace packages and Chrome via Playwright. Online credentials are intentionally excluded from this archive.
'''
(D/'DATA-README.txt').write_text(readme,encoding='utf-8')
with zipfile.ZipFile(D/'Surfare-200-Samples-Results-and-Charts.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['DATA-README.txt','cases.json','manifest.json','runtime-hashes.json','image-files.json','local.json','backend-local.json','online.json','metrics.json','metrics.csv','samples-and-results.csv','PPT-slide-text.txt','results-overview.png','results-by-check-and-source.png','Surfare-200-Simple-Results.pdf','Surfare-200-Tested-Samples-and-Sources.pdf']:
  z.write(D/name,name)
 for f in files.values():z.write(D/f['file'],'samples/'+f['file'])
 for name in ['corpus200-prepare.mjs','corpus200-render.py','corpus200-local.mjs','corpus200-online.mjs','corpus200-backend-baseline.mjs','corpus200-report.py']:
  z.write(ROOT/'artifacts'/name,'scripts/'+name)
 for file in ['backend/public/licenses/dataset-attribution.txt','backend/public/licenses/sms-model-attribution.txt','backend/public/licenses/filipino-sms-BSD-3-Clause.txt']:
  z.write(ROOT/file,'source-notices/'+pathlib.Path(file).name)
print(json.dumps(summary,indent=2));print('Results PDF: 2 pages. Samples PDF:',page,'pages.')
