import csv,hashlib,json,pathlib,textwrap,zipfile
from datetime import datetime,timezone,timedelta
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[1];D=ROOT/'artifacts/offline-improvement'
load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
before=load('artifacts/corpus-evaluation-200/local.json')
after=load('artifacts/offline-improvement/benchmark-results.json')
confirmation=load('artifacts/offline-improvement/confirmation-results.json')
assert len(before['rows'])==len(after['rows'])==200 and len(confirmation['rows'])==400
oldCases=load('artifacts/corpus-evaluation-200/cases.json');devCases=load('artifacts/offline-improvement/audit/cases.json');newCases=load('artifacts/offline-improvement/confirmation/cases.json')
assert not ({r['group'] for r in newCases}&{r['group'] for r in oldCases+devCases})
for r in after['rows']:
 b=next(x for x in before['rows'] if x['id']==r['id']);assert r['expectedText']==b['expectedText'] and r['label']==b['label']
for folder in ['artifacts/corpus-evaluation-200','artifacts/offline-improvement/confirmation']:
 m=load(folder+'/manifest.json');assert hashlib.sha256((ROOT/folder/'cases.json').read_bytes()).hexdigest()==m['caseSha256']
for p,h in load('artifacts/offline-improvement/runtime-final.json').items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h
for p,h in load('artifacts/corpus-evaluation-200/runtime-hashes.json').items():
 if p.startswith('backend/'):
  assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,'Online/backend runtime changed: '+p
KINDS=['text','links','qr','image'];NAMES={'text':'Messages','links':'Links','qr':'QR codes','image':'Screenshot text'}
def metrics(rows):
 pos=sum(r['label'] for r in rows);neg=len(rows)-pos
 valid=[r for r in rows if r.get('flagged') is not None and not r.get('error') and not r.get('errorKey')]
 tp=sum(r['label'] and r['flagged'] for r in valid);fp=sum(not r['label'] and r['flagged'] for r in valid);tn=sum(not r['label'] and not r['flagged'] for r in valid);fn=pos-tp
 return dict(n=len(rows),positive=pos,negative=neg,tp=tp,fp=fp,tn=tn,fn=fn,failed=len(rows)-len(valid),unknown=sum(r.get('level')=='unknown' for r in valid),accuracy=100*(tp+tn)/len(rows),fpr=100*fp/neg if neg else None,fnr=100*fn/pos if pos else None)
summaries={name:dict(overall=metrics(data['rows']),byKind={k:metrics([r for r in data['rows'] if r['kind']==k]) for k in KINDS}) for name,data in [('before_200',before),('after_200',after),('confirmation_400',confirmation)]}
summary=dict(checkedAt=confirmation['updatedAt'],results=summaries,method='Same frozen 200 development cases, then 400 different normalized-template/domain groups selected without using their predictions. The earlier 400-case audit was used for development and is not presented as an untouched test.',limitations=['All source datasets overlap model training or reference data; this is not independent population accuracy.','Known-URL gains measure expanded source-reference coverage, not proof of identifying unseen phishing sites.','Source labels and privacy redactions can be noisy. Unknown results count as no warning, not verified safety.','Screenshot and QR inputs are controlled renderings of source text, not independently collected camera images.'],initialDevelopmentAuditAccuracy=85,networkRequestsBlocked=dict(benchmark=after['externalRequestsBlocked'],confirmation=confirmation['externalRequestsBlocked']),backendRuntimeChanged=False,modelWeightsOrThresholdsChanged=False,validation=dict(frontendTests=328,backendTests=347,extensionTests=5,frontendBuild='passed',extensionBuild='passed'))
(D/'improvement-metrics.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
with (D/'updated-local-results.csv').open('w',newline='',encoding='utf-8-sig') as f:
 fields=['set','id','kind','source','sourceRecord','originalLabel','label','expectedText','actualExtractedText','beforeLevel','beforeWarning','afterLevel','afterWarning','signals']
 w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
 baseline={r['id']:r for r in before['rows']}
 for name,data in [('development-200',after),('confirmation-400',confirmation)]:
  for r in data['rows']:
   b=baseline.get(r['id']) if name=='development-200' else None
   w.writerow(dict(r,set=name,actualExtractedText=r.get('text'),beforeLevel=b.get('level') if b else '',beforeWarning=b.get('flagged') if b else '',afterLevel=r.get('level'),afterWarning=r.get('flagged'),signals='; '.join(s['id'] for s in r['signals'])))
with (D/'improvement-metrics.csv').open('w',newline='',encoding='utf-8-sig') as f:
 fields=['set','task',*summaries['before_200']['overall'].keys()];w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for name,s in summaries.items():
  w.writerow(dict(set=name,task='all',**s['overall']))
  for k,m in s['byKind'].items():w.writerow(dict(set=name,task=k,**m))

BG='#f7f9fc';INK='#19344d';BLUE='#187b9b';GREEN='#20886b';RED='#c65b65';GRAY='#62758a'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'text.color':INK,'text.parse_math':False,'figure.facecolor':BG,'axes.facecolor':BG,'axes.spines.top':False,'axes.spines.right':False})
when=datetime.fromisoformat(confirmation['updatedAt'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=8))).strftime('%d %B %Y, %H:%M SGT')
def new(title,sub):
 fig=plt.figure(figsize=(13.333,7.5));fig.text(.055,.925,title,fontsize=24,weight='bold');fig.text(.055,.87,sub,fontsize=10,color=GRAY);fig.text(.055,.03,'SURFARE | '+when+' | Offline checks only',fontsize=8,color=GRAY);return fig
def table(fig,headers,rows,rect,widths=None):
 ax=fig.add_axes(rect);ax.axis('off');t=ax.table(cellText=rows,colLabels=headers,colWidths=widths,loc='center',cellLoc='left',colLoc='left');t.auto_set_font_size(False);t.set_fontsize(10)
 for (i,j),c in t.get_celld().items():
  c.set_height(1/(len(rows)+1));c.set_edgecolor('white');c.set_facecolor(INK if i==0 else ('#e8eff6' if i%2 else '#f2f6fa'))
  if i==0:c.set_text_props(color='white',weight='bold')
def pct(n):return f'{n:.2f}%'
with PdfPages(D/'Surfare-Improved-Local-Checks.pdf') as pdf:
 fig=new('Improved local checks','Original labels and inputs retained. External requests blocked; app/OCR assets served locally. No online AI calls were made.')
 rows=[]
 for label,key in [('Before: saved development set','before_200'),('After: same development set','after_200'),('Additional confirmation cases','confirmation_400')]:
  m=summaries[key]['overall'];rows.append([label,m['n'],pct(m['accuracy']),pct(m['fpr']),pct(m['fnr']),f"{m['tp']}/{m['fp']}/{m['tn']}/{m['fn']}"])
 table(fig,['Evaluation','N','Accuracy','False positive','False negative','TP / FP / TN / FN'],rows,(.055,.56,.89,.25),[.35,.06,.15,.14,.14,.16])
 ax=fig.add_axes([.10,.23,.80,.26]);x=np.arange(3);width=.24
 for shift,key,label,color in [(-width,'before_200','Before (200)',RED),(0,'after_200','After (200)',BLUE),(width,'confirmation_400','Confirmation (400)',GREEN)]:
  m=summaries[key]['overall'];values=[m['accuracy'],m['fpr'],m['fnr']];bars=ax.bar(x+shift,values,width,label=label,color=color);ax.bar_label(bars,fmt='%.2f%%',padding=3,fontsize=9)
 ax.set_xticks(x,['Accuracy','False-positive rate','False-negative rate']);ax.set_ylim(0,112);ax.set_ylabel('Percent');ax.legend(frameon=False,ncol=3,fontsize=9,loc='upper center',bbox_to_anchor=(.5,-.17))
 fig.text(.06,.105,'The 200 cases were used during development. Confirmation cases use different template/domain groups, but their source corpora still overlap training/references.',fontsize=9)
 fig.text(.06,.065,'These are dataset-label warning results, not a guarantee of 90% accuracy on future real-world submissions. Uncertain means unverified, not safe.',fontsize=10)
 pdf.savefig(fig);fig.savefig(D/'local-improvement-chart.png',dpi=180);plt.close(fig)

 fig=new('What improved, and what remains','The backend and online providers were left unchanged. Improvements apply to the browser/extension local assessment path.')
 rows=[]
 for k in KINDS:
  a=summaries['after_200']['byKind'][k];b=summaries['confirmation_400']['byKind'][k];rows.append([NAMES[k],pct(a['accuracy']),pct(a['fpr']),pct(a['fnr']),pct(b['accuracy']),pct(b['fpr']),pct(b['fnr'])])
 table(fig,['Check','200 acc.','200 FP','200 FN','400 acc.','400 FP','400 FN'],rows,(.055,.48,.89,.32),[.22,.13,.13,.13,.13,.13,.13])
 copy='Full PhiUSIIL phishing-URL coverage is available offline as 100,057 exact URL fingerprints, with conflicting labels excluded. This improves recognition of known dataset addresses.\nThe existing trained text model now contributes a guarded Suspicious review signal. Ordinary notices and protective advice have additional safeguards. Model weights and thresholds were not changed.\nOCR line wraps and a limited I/vertical-bar confusion are handled while preserving original evidence quotes. Typed-message boundaries and strong independent findings remain.\nThe first 400-case development audit scored 85%; it was used to refine the model integration. It is not the final confirmation set. All misses and false alarms remain in the CSV.\nChecks passed: 328 frontend tests, 347 backend tests, 5 extension tests, frontend build and extension build. A separate independently collected and human-reviewed test set is still needed.'
 fig.text(.06,.405,'\n'.join('\n'.join(textwrap.wrap(p,145)) for p in copy.split('\n')),fontsize=10,va='top',linespacing=1.45)
 pdf.savefig(fig);fig.savefig(D/'local-results-by-detector.png',dpi=180);plt.close(fig)

slides=['SURFARE LOCAL-CHECK IMPROVEMENTS',when,'']
for name,key in [('Before / same 200 cases','before_200'),('After / same 200 cases','after_200'),('400 additional confirmation cases','confirmation_400')]:
 m=summaries[key]['overall'];slides.append(f"{name}: accuracy {pct(m['accuracy'])}; false-positive rate {pct(m['fpr'])}; false-negative rate {pct(m['fnr'])}; N={m['n']}.")
slides+=['','Case labels and inputs unchanged. Online backend/providers unchanged.','Known-address lookup coverage contributes to these results. All source corpora overlap training/reference data; not independent population accuracy.','The 200 cases and first 400-case audit were used for development. The 400 confirmation groups are disjoint from both.']
(D/'PPT-updated-local-results.txt').write_text('\n'.join(slides)+'\n',encoding='utf-8')
readme='''SURFARE OFFLINE DETECTOR IMPROVEMENTS

The PDF and PNG charts show the unchanged 200-case development benchmark before/after, plus a 400-case confirmation set.
updated-local-results.csv contains all 600 final evaluated cases, with source record numbers, original labels, actual extracted text, outcomes and signal IDs.
development-200/ contains the original cases and before-results. Its labels and input text were not replaced to improve scores.
confirmation-400/ contains 400 different normalized-template/domain groups, disjoint from both the 200-case benchmark and the earlier 400-case development audit.
development-audit-400/ preserves the first integration's 85% audit result. That cohort was then used for development and is not claimed as untouched confirmation data.
All source corpora overlap Surfare training or reference material. Exact URL matches cover the full source-labeled phishing class, not only test addresses. This is not an independent real-world validation or a universal 90% accuracy guarantee.
Unknown results count as no warning for this binary alert task, not as proof of safety. Source labels may be noisy, and privacy redactions can affect detection.
QR and screenshot PNGs are controlled renderings of corpus content, not independently collected camera images. Source and file hashes are retained in the accompanying manifests.
Some samples contain phishing addresses: inspect the text without opening or scanning their destinations.
The original model weights and thresholds, online providers and backend runtime were unchanged. The local classifier has additional context safeguards, an exact offline URL index, and OCR matching normalization with original-character evidence maps.
production-offline-smoke.json records a production service-worker reload with Chrome networking disabled, followed by local message/URL checks with zero API requests.
Source notices and the full preserved Filipino dataset license are under documentation/. Use the data for internal project review and retain source attribution and limitations.
'''
(D/'DATA-README.txt').write_text(readme,encoding='utf-8')
with zipfile.ZipFile(D/'Surfare-Updated-Local-Results-and-Samples.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['DATA-README.txt','Surfare-Improved-Local-Checks.pdf','improvement-metrics.json','improvement-metrics.csv','updated-local-results.csv','PPT-updated-local-results.txt','local-improvement-chart.png','local-results-by-detector.png','benchmark-results.json','confirmation-results.json','runtime-final.json']:
  z.write(D/name,name)
 for folder,label in [('artifacts/corpus-evaluation-200','development-200'),('artifacts/offline-improvement/confirmation','confirmation-400')]:
  for file in ['cases.json','manifest.json','image-files.json']:z.write(ROOT/folder/file,label+'/'+file)
  for f in load(folder+'/image-files.json').values():z.write(ROOT/folder/f['file'],label+'/samples/'+f['file'])
 z.write(ROOT/'artifacts/corpus-evaluation-200/local.json','development-200/before-results.json')
 for file in ['cases.json','manifest.json']:z.write(D/'audit'/file,'development-audit-400/'+file)
 z.write(D/'audit-results.json','development-audit-400/initial-integration-results.json')
 z.write(ROOT/'backend/docs/DETECTION.md','documentation/DETECTION.md')
 for name in ['dataset-attribution.txt','sms-model-attribution.txt','filipino-sms-BSD-3-Clause.txt']:
  z.write(ROOT/'backend/public/licenses'/name,'documentation/'+name)
 if (D/'production-offline-smoke.json').exists():z.write(D/'production-offline-smoke.json','production-offline-smoke.json')
print(json.dumps(summary,indent=2))
