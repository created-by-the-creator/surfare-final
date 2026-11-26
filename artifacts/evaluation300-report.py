"""Three summary pages plus a full input/result appendix and machine-readable data."""
import collections, csv, hashlib, json, pathlib, textwrap, zipfile
from datetime import datetime, timezone, timedelta
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from PIL import Image

ROOT=pathlib.Path(__file__).resolve().parents[1];D=ROOT/'artifacts/evaluation-300'
read=lambda name:json.loads((D/name).read_text(encoding='utf-8'))
cases=read('cases.json');local=read('local.json');online=read('online.json');manifest=read('manifest.json')
assert len(cases)==len(local['rows'])==len(online['rows'])==300
assert hashlib.sha256((D/'cases.json').read_text(encoding='utf-8').encode('utf-8')).hexdigest()==manifest['caseSha256']
C={r['id']:r for r in cases};L={r['id']:r for r in local['rows']};O={r['id']:r for r in online['rows']}
assert set(C)==set(L)==set(O)
for r in cases:
 if r.get('file'):assert hashlib.sha256((D/r['file']).read_bytes()).hexdigest()==r['fileSha256']
KINDS=['text','links','qr','image'];NAMES={'text':'Messages','links':'Links','qr':'QR codes','image':'Screenshot text'}
def metric(rows):
 n=len(rows);pos=sum(r['label'] for r in rows);neg=n-pos
 valid=[r for r in rows if not r.get('error') and not r.get('errorKey') and r.get('flagged') is not None]
 tp=sum(r['label'] and r['flagged'] for r in valid);fp=sum(not r['label'] and r['flagged'] for r in valid);tn=sum(not r['label'] and not r['flagged'] for r in valid);fn=pos-tp
 return dict(n=n,positive=pos,negative=neg,tp=tp,fp=fp,tn=tn,fn=fn,failed=n-len(valid),unknown=sum(r.get('level') in ['unknown','Insufficient evidence'] for r in valid),accuracy=100*(tp+tn)/n if n else None,fpr=100*fp/neg if neg else None,fnr=100*fn/pos if pos else None)
LM={k:metric([r for r in local['rows'] if r['kind']==k]) for k in KINDS}
OM={k:metric([r for r in online['rows'] if r['kind']==k]) for k in KINDS}
AI={k:metric([r for r in online['rows'] if r['kind']==k and r.get('onlineStatus')=='completed']) for k in KINDS}
counts=dict(collections.Counter(r['onlineStatus'] for r in online['rows']))
summary=dict(scope=manifest['scope'],caseSha256=manifest['caseSha256'],caseHashNormalization='UTF-8 text with LF line endings',caseFileByteSha256=hashlib.sha256((D/'cases.json').read_bytes()).hexdigest(),caseFileModifiedAt=datetime.fromtimestamp((D/'cases.json').stat().st_mtime,timezone.utc).isoformat(),localStartedAt=local['startedAt'],onlineStartedAt=online['startedAt'],local=LM,onlineModeIncludingFallback=OM,onlineAICompletedOnly=AI,completedSubsetScope='Combined backend outcomes for cases with completed AI reviews, not isolated provider predictions.',onlineStatuses=counts,localExternalRequestsBlocked=local['externalRequestsBlocked'],providers=online['providers'],completedAt=online['updatedAt'])
(D/'metrics.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
with (D/'results.csv').open('w',newline='',encoding='utf-8-sig') as f:
 fields=['id','kind','labelMeaning','source','sourceId','category','provenance','expectedText','file','fileSha256','render','localLevel','localWarning','localExtractedText','localOcrConfidence','localElapsedMs','localError','onlineLevel','onlineWarning','onlineStatus','onlineProvider','onlineModel','onlineElapsedMs']
 w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
 for c in cases:
  l=L[c['id']];o=O[c['id']]
  w.writerow(dict(c,localLevel=l.get('level'),localWarning=l.get('flagged'),localExtractedText=l.get('text'),localOcrConfidence=l.get('ocrConfidence'),localElapsedMs=l.get('elapsedMs'),localError=l.get('error') or l.get('errorKey'),onlineLevel=o.get('level'),onlineWarning=o.get('flagged'),onlineStatus=o['onlineStatus'],onlineProvider=o.get('provider'),onlineModel=o.get('model'),onlineElapsedMs=o.get('elapsedMs')))
with (D/'metrics.csv').open('w',newline='',encoding='utf-8-sig') as f:
 fields=['scope','kind',*LM['text'].keys()];w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for scope,ms in [('local',LM),('online mode including fallback',OM),('completed AI only',AI)]:
  for k,m in ms.items():w.writerow(dict(scope=scope,kind=k,**m))

BG='#f7f9fc';INK='#19334d';BLUE='#177f9c';GREEN='#218868';RED='#c8515b';GRAY='#60758a'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'text.color':INK,'figure.facecolor':BG,'axes.facecolor':BG,'axes.spines.top':False,'axes.spines.right':False})
pdf=PdfPages(D/'Surfare-300-Local-300-Online.pdf');number=0
date=datetime.fromisoformat(online['updatedAt'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=8))).strftime('%d %B %Y, %H:%M SGT')
def new(title,subtitle='',portrait=False):
 global number
 number+=1
 fig=plt.figure(figsize=(8.27,11.69) if portrait else (13.333,7.5))
 fig.text(.055,.95 if portrait else .925,title,fontsize=15 if portrait else 23,weight='bold')
 fig.text(.055,.92 if portrait else .875,subtitle,fontsize=8 if portrait else 10,color=GRAY)
 fig.text(.055,.027,'SURFARE | '+date+' | Synthetic development evaluation',fontsize=7,color=GRAY)
 fig.text(.94,.027,str(number),fontsize=8)
 return fig
def save(fig,png=None):
 pdf.savefig(fig)
 p=D/'report-pages';p.mkdir(exist_ok=True);fig.savefig(p/f'page-{number:02}.png',dpi=75)
 if png:fig.savefig(D/png,dpi=180)
 plt.close(fig)
def table(fig,headers,rows,rect,widths=None,fs=10):
 ax=fig.add_axes(rect);ax.axis('off');t=ax.table(cellText=rows,colLabels=headers,colWidths=widths,loc='center',cellLoc='left',colLoc='left');t.auto_set_font_size(False);t.set_fontsize(fs)
 for (i,j),cell in t.get_celld().items():
  cell.set_height(1/(len(rows)+1));cell.set_edgecolor('white');cell.set_facecolor(INK if i==0 else ('#e6eef6' if i%2 else '#f1f5fa'))
  if i==0:cell.set_text_props(color='white',weight='bold')
def block(fig,x,y,title,text,width=128,fs=11):
 fig.text(x,y,title,fontsize=13,weight='bold',va='top')
 fig.text(x,y-.05,'\n'.join('\n'.join(textwrap.wrap(p,width)) for p in text.split('\n')),fontsize=fs,va='top',linespacing=1.45)
def pct(x):return 'N/A' if x is None else f'{x:.2f}%'

fig=new('300 local + 300 online checks','75 checks per modality, each with 38 warning / 37 no-warning labels. Same inputs in both modes.')
rows=[]
for k in KINDS:
 l=LM[k];o=OM[k]
 rows.append([NAMES[k],pct(l['accuracy']),pct(l['fpr']),pct(l['fnr']),pct(o['accuracy']),pct(o['fpr']),pct(o['fnr'])])
table(fig,['Check','Local accuracy','Local FPR','Local FNR','Online accuracy*','Online FPR*','Online FNR*'],rows,(.055,.44,.89,.36),widths=[.19,.15,.13,.13,.16,.12,.12],fs=10)
block(fig,.06,.36,'How to present these numbers',f"*Online-mode results include local fallback and policy skips. Completed external AI: {counts.get('completed',0)}/300; policy skips: {counts.get('not_checked',0)}; unavailable/error: {sum(v for k,v in counts.items() if k not in ['completed','not_checked'])}. Completed-AI-only figures are on page 2.\nThese measure agreement on whether to warn. Locally, 37 link controls and 17 QR controls stayed uncertain: counted as no warning, not proof of safety. All 300 inputs are synthetic development cases, derived from 150 distinct contents reused across formats. This is a reproducible demonstration, not independent real-world validation.",width=142,fs=11)
fig.text(.06,.12,'FPR = false alarms / 37 negatives. FNR = missed warnings / 38 positives. Accuracy = correct warning decisions / 75.',fontsize=10)
save(fig,'summary-table.png')

fig=new('Online availability and paired comparison','Live provider requests through the actual backend detect service; local browser decoding/OCR feeds the same content.')
ax=fig.add_axes([.07,.36,.43,.43]);import numpy as np
x=np.arange(4);w=.34
for delta,data,label,color in [(-w/2,LM,'Local',BLUE),(w/2,OM,'Online mode*',GREEN)]:
 vals=[data[k]['accuracy'] or 0 for k in KINDS];bars=ax.bar(x+delta,vals,w,label=label,color=color);ax.bar_label(bars,labels=[f'{v:.1f}%' for v in vals],padding=3,fontsize=8)
ax.set_xticks(x,['Message','Link','QR','Screenshot']);ax.set_ylim(0,112);ax.set_ylabel('Warning accuracy (%)');ax.legend(frameon=False,ncol=2,fontsize=8,loc='upper center',bbox_to_anchor=(.5,-.13))
rows=[]
for k in KINDS:
 m=AI[k];rows.append([NAMES[k],f"{m['n']}/75",f"{m['positive']}/{m['negative']}",pct(m['accuracy']),pct(m['fpr']),pct(m['fnr'])])
table(fig,['Completed subset','N','+/−','Accuracy','FPR','FNR'],rows,(.54,.43,.41,.34),widths=[.29,.12,.13,.16,.15,.15],fs=8)
block(fig,.06,.24,'What the online results establish',f"Completed AI reviews: {counts.get('completed',0)}. Statuses: "+', '.join(f'{k}={v}' for k,v in counts.items())+'. The completed subset still measures the combined app outcome, not isolated provider predictions. Its changing class counts appear above. Provider failures remain in the all-75 online-mode table on page 1.\nOnline scope is contextual safety review, not deployed-site UI or live website reputation. Test pages were not visited. “Image” means screenshot text safety; AI-generated-versus-real image accuracy is outside this labeled set.',width=145,fs=10)
save(fig,'performance-and-availability.png')

fig=new('Samples, provenance and reproducibility','Every input text/payload and its results appear in the appendix. Exact PNG files are in the accompanying data ZIP.')
for i,kind in enumerate(['image','image','qr','qr']):
 group=[c for c in cases if c['kind']==kind];c=group[0 if i%2==0 else 1]
 ax=fig.add_axes([.06+i*.23,.48,.21,.29]);ax.imshow(Image.open(D/c['file']).convert('RGBA'));ax.axis('off');ax.set_title(c['id']+' | '+('warning' if c['label'] else 'no warning'),fontsize=9)
block(fig,.06,.41,'Fixed test construction','75 synthetic messages; 75 authored URL structures; the same messages rendered as 75 light/dark screenshots; 75 QR images (40 message payloads + 35 URLs, upright/rotated). Labels and file hashes were frozen before this run. No application rules, thresholds or models changed, and no wrong result was removed.\nSources: G = backend/evaluation/generalization/cases.json; S = backend/tests/fixtures/semantic-smoke.json; X = backend/evaluation/local-messages/supplemental.json; N = artifacts/evaluation300-prepare.py. All except one new prize-fee case reuse authored development contents that may have influenced earlier changes. The appendix lists exact source IDs.\nScreenshot errors: six misses and one false alarm. OCR substitutions and inserted line breaks changed rule matching despite high OCR confidence.',width=151,fs=9)
fig.text(.06,.13,'Case SHA-256 (UTF-8/LF): '+manifest['caseSha256'],fontsize=8)
fig.text(.06,.09,'Formulas: accuracy=(TP+TN)/N; FPR=FP/(FP+TN); FNR=FN/(TP+FN). Extraction failures earn no correctness credit.',fontsize=9)
save(fig)

# The appendix lists each distinct input once and maps every physical test instance to it.
groups=collections.OrderedDict()
for c in cases:groups.setdefault(c['expectedText'],[]).append(c)
assert len(groups)==150
source_codes={'backend/evaluation/generalization/cases.json':'G','backend/tests/fixtures/semantic-smoke.json':'S','backend/evaluation/local-messages/supplemental.json':'X','artifacts/evaluation300-prepare.py':'N'}
def level(r):
 if r.get('error') or r.get('errorKey') or r.get('flagged') is None:return 'ERROR'
 return {'high':'HIGH','suspicious':'SUSP','low':'LOW','unknown':'UNCERT','High risk':'HIGH','Suspicious':'SUSP','Low risk':'LOW','Insufficient evidence':'UNCERT'}.get(r.get('level'),str(r.get('level')))
fig=None;y=0;appendix_page=0
for i,(text,instances) in enumerate(groups.items(),1):
 c=instances[0];lines=[f"R{i:03} | {'WARNING EXPECTED' if c['label'] else 'NO WARNING EXPECTED'} | {source_codes[c['source']]}:{c['sourceId']}"]
 lines+=textwrap.wrap(text,width=111,replace_whitespace=False,drop_whitespace=False)
 for item in instances:
  l=L[item['id']];o=O[item['id']]
  lines.append(f"  {item['id']}: local={level(l)}; online={level(o)} [{o['onlineStatus']}]")
  if item['kind']=='image' and l.get('text','')!=text:
   lines+=textwrap.wrap('  Actual OCR / online input (literal \\n = line break): '+l.get('text','[no text]').replace('\n','\\n'),width=111)
 height=len(lines)*.0127+.017
 if fig is None or y-height<.065:
  if fig is not None:save(fig)
  appendix_page+=1;fig=new('Appendix: full inputs and results',f'All 300 test instances mapped to 150 distinct contents | Appendix {appendix_page} | UNCERT = no warning, unverified',portrait=True);y=.88
 for j,line in enumerate(lines):
  fig.text(.055,y,line,fontsize=8.1,va='top',weight='bold' if j==0 else 'normal',color=INK if j==0 else '#294057');y-=.0127
 y-=.017
if fig is not None:save(fig)
pdf.close()

slide=['SURFARE: 300 LOCAL + 300 ONLINE CHECKS',date,'75 per modality; each 38 warning / 37 no-warning examples.','All cases synthetic; 150 distinct contents reused across formats. Not independent real-world validation.','']
for k in KINDS:slide.append(f"{NAMES[k]} | local accuracy/FPR/FNR: {pct(LM[k]['accuracy'])} / {pct(LM[k]['fpr'])} / {pct(LM[k]['fnr'])}; online mode including fallback: {pct(OM[k]['accuracy'])} / {pct(OM[k]['fpr'])} / {pct(OM[k]['fnr'])}; completed AI: {AI[k]['n']}/75.")
slide+=['','Online statuses: '+json.dumps(counts), 'Online-mode percentages include local fallback/policy skips; completed-AI-only scores are in metrics.csv and PDF page 2.','Screenshot text safety is measured. AI-image-origin accuracy is not measured.','All sample texts, labels, source IDs and results are included in the PDF appendix and results.csv.']
(D/'PPT-summary.txt').write_text('\n'.join(slide)+'\n',encoding='utf-8')
guide='''SURFARE 300 LOCAL + 300 ONLINE CHECKS

Contents
- cases.json: all 300 frozen labeled input instances, source IDs, image filenames and SHA-256 hashes.
- results.csv: all 300 paired local/online results; includes expected and actual OCR text.
- metrics.csv: local, online-mode including fallback, and completed-AI-only metrics by modality.
- local.json / online.json: raw detector outputs, statuses, timings and provider identifiers.
- samples/: exact 75 screenshot PNGs and 75 QR PNGs used in this run. The file column in cases.json and results.csv is the filename inside samples/.
- manifest.json and runtime-hashes.json: input-set hash, source hashes, source role and runtime fingerprints.
- Case-set hash uses UTF-8 text with line endings normalized to LF. metrics.json also includes the SHA-256 of the exact file bytes, which use Windows CRLF in this run.
- scripts/: archival copies of the evaluation harness; contains no credentials.

Interpretation
300 instances per mode = 75 messages, 75 links, 75 QR files and 75 screenshots.
Each modality has 38 expected warnings and 37 expected no-warning labels.
There are 150 distinct source texts/URLs, deliberately reused across formats and between local and online runs.
149 source contents reuse synthetic development examples; one prize-fee case was newly authored.
These are not independently collected real user submissions or independent real-world accuracy estimates.
Unknown/uncertain means no warning for the binary alarm decision, not verified safe.
The completed-AI subset still measures the combined backend outcome, not an isolated provider prediction.
Online mode can return local fallback. Use onlineStatus=completed to isolate external AI reviews.
Provider quota failures and policy skips are retained; none is relabeled a completed AI review.
The image task measures text safety after actual browser OCR; it does not measure AI-image origin classification.

Rerun in the Surfare source repository
Keep the scripts under artifacts/, install project dependencies, and make the configured providers available for online requests.
1. python artifacts/evaluation300-prepare.py
2. npm.cmd run dev --workspace frontend -- --host 127.0.0.1
3. node artifacts/evaluation300-local.mjs
4. node --env-file=backend/.dev.vars artifacts/evaluation300-online.mjs
5. python artifacts/evaluation300-report.py
Online run resumes existing online.json rows. Before a new full run, archive or rename the existing artifacts/evaluation-300 directory rather than mixing dates.
Preparing afresh regenerates the deterministic image assets in artifacts/evaluation-300/. Original assets from this run are preserved in samples/.
Python dependencies used: matplotlib, Pillow, opencv-python. Browser: desktop Chrome through Playwright.
Online requests consume configured service quota; provider behavior and results may change on a later run.
'''
(D/'DATA-README.txt').write_text(guide,encoding='utf-8')
# Archive frozen samples, original images, raw outputs and the runnable harness, without credentials.
with zipfile.ZipFile(D/'Surfare-600-Checks-Data.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['DATA-README.txt','cases.json','manifest.json','runtime-hashes.json','local.json','online.json','metrics.json','metrics.csv','results.csv','PPT-summary.txt','summary-table.png','performance-and-availability.png']:
  z.write(D/name,name)
 for c in cases:
  if c.get('file'):z.write(D/c['file'],'samples/'+c['file'])
 for name in ['evaluation300-prepare.py','evaluation300-local.mjs','evaluation300-online.mjs','evaluation300-report.py']:
  z.write(ROOT/'artifacts'/name,'scripts/'+name)
print(json.dumps(summary,indent=2));print('PDF pages:',number,'; distinct contents:',len(groups),'; test instances:',len(cases))
