"""Generate the slide-ready PDF, PNG charts, CSV and plain-text slide copy."""
import csv, hashlib, json, math, pathlib, textwrap
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

ROOT=pathlib.Path(__file__).resolve().parents[1]
D=ROOT/'artifacts/evaluation'
load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
local=load('artifacts/evaluation/local.json')
online=load('artifacts/evaluation/online.json')
origin=load('artifacts/evaluation/online-image-origin.json')
manifest=load('backend/datasets/manifest.json')
saved=load('backend/reports/dataset-training.json')
fresh=load('artifacts/evaluation/reproduced-training/reports/dataset-training.json')
core=load('backend/evaluation/local-messages/latest.json')
general=load('backend/evaluation/generalization/latest.json')
NAMES={'text':'Messages','links':'Links','qr':'QR codes','image':'Screenshot text'}
KINDS=list(NAMES)
def metrics(rows):
    # An unavailable pipeline does not earn a correct non-warning decision.
    valid=[r for r in rows if not r.get('error') and not r.get('errorKey') and r.get('flagged') is not None]
    tp=sum(r['label'] and r['flagged'] for r in valid)
    fp=sum(not r['label'] and r['flagged'] for r in valid)
    tn=sum(not r['label'] and not r['flagged'] for r in valid)
    fn=sum(r['label'] and not r['flagged'] for r in valid)
    pos=sum(r['label'] for r in rows);neg=len(rows)-pos
    return dict(n=len(rows),positive=pos,negative=neg,tp=tp,fp=fp,tn=tn,fn=fn,failed=len(rows)-len(valid),unknown=sum(r.get('level') in ['unknown','Insufficient evidence'] for r in valid),accuracy=100*(tp+tn)/len(rows) if rows else None,fpr=100*fp/neg if neg else None,fnr=100*fn/pos if pos else None)
LM={k:metrics([r for r in local['rows'] if r['kind']==k]) for k in KINDS}
OM={k:metrics([r for r in online['rows'] if r['kind']==k and r.get('onlineStatus')=='completed']) for k in KINDS}
fallback={k:metrics([r for r in online['rows'] if r['kind']==k]) for k in KINDS}
cm=dict(n=100,positive=50,negative=50,tp=core['scams']['caught'],fn=core['scams']['missed'],fp=core['legitimate']['falseAlarms'],tn=50-core['legitimate']['falseAlarms'])
cm.update(accuracy=100*(cm['tp']+cm['tn'])/100,fpr=100*cm['fp']/50,fnr=100*cm['fn']/50)
def pct(n):return 'N/A' if n is None else f'{n:.2f}%'
def cer(a,b):
    a=' '.join(a.split());b=' '.join(b.split());v=list(range(len(b)+1))
    for i,c in enumerate(a,1):
        w=[i]
        for j,d in enumerate(b,1):w.append(min(w[-1]+1,v[j]+1,v[j-1]+(c!=d)))
        v=w
    return v[-1],len(a)
ocr=[r for r in local['rows'] if r['kind']=='image']
errs=sum(cer(r['expectedText'],r['text'])[0] for r in ocr)
chars=sum(cer(r['expectedText'],r['text'])[1] for r in ocr)
qr=[r for r in local['rows'] if r['kind']=='qr']
qrexact=sum(r['expectedText'] in r['qrValues'] for r in qr)
hashes={name:{'saved':hashlib.sha256((ROOT/'backend/lib/models'/name).read_bytes()).hexdigest(),'reproduced':hashlib.sha256((D/'reproduced-training/lib/models'/name).read_bytes()).hexdigest()} for name in ['taglish-intent-model.json','url-risk-model.json']}
result=dict(date='2026-11-26',timezone='Asia/Singapore',local=LM,onlineCompletedOnly=OM,onlineAppIncludingFallback=fallback,existingMessageRegression=cm,ocrCharacterErrorRate=errs/chars,qrExactDecoding=dict(correct=qrexact,total=len(qr)),modelHashes=hashes,onlineCompleted=sum(r.get('onlineStatus')=='completed' for r in online['rows']),onlineAttempted=len(online['rows']))
(D/'metrics.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
with (D/'slide-data.csv').open('w',newline='',encoding='utf-8') as f:
    writer=csv.DictWriter(f,fieldnames=['scope','task','n','positive','negative','tp','fp','tn','fn','accuracy','fpr','fnr','unknown','failed'])
    writer.writeheader()
    for scope,data in [('Local paired synthetic',LM),('Online completed only',OM),('Online app including fallback',fallback)]:
        for k,m in data.items():writer.writerow(dict(scope=scope,task=NAMES[k],**m))
    writer.writerow(dict(scope='Existing overlapping corpus regression',task='Messages',**cm))
with (D/'case-results.csv').open('w',newline='',encoding='utf-8-sig') as f:
    cols=['mode','id','kind','label','flagged','level','onlineStatus','ocrConfidence','elapsedMs','text','expectedText']
    w=csv.DictWriter(f,fieldnames=cols,extrasaction='ignore');w.writeheader()
    for mode,rows in [('local',local['rows']),('online',online['rows'])]:
        for r in rows:w.writerow(dict(mode=mode,**r))

BG='#f7f9fc';INK='#173049';BLUE='#167b9a';GREEN='#1c956d';RED='#c84e56';ORANGE='#da9431'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'text.color':INK,'axes.labelcolor':INK,'axes.spines.top':False,'axes.spines.right':False,'axes.spines.left':False,'axes.spines.bottom':False,'figure.facecolor':BG,'axes.facecolor':BG,'savefig.facecolor':BG})
pdf=PdfPages(D/'Surfare-Evaluation-and-Training-Report.pdf')
page_no=0
def page(title,subtitle=''):
    global page_no
    page_no+=1
    fig=plt.figure(figsize=(13.333,7.5))
    fig.text(.055,.925,title,fontsize=23,weight='bold')
    fig.text(.055,.875,subtitle,fontsize=10,color='#536b82')
    fig.text(.055,.035,'SURFARE  |  Evaluation & training record  |  26 November 2026, Singapore',fontsize=8,color='#667c92')
    fig.text(.94,.035,str(page_no),fontsize=9)
    return fig
def finish(fig,png=None):
    pdf.savefig(fig)
    previews=D/'report-pages'
    previews.mkdir(exist_ok=True)
    fig.savefig(previews/f'page-{page_no:02}.png',dpi=80)
    if png:fig.savefig(D/png,dpi=180)
    plt.close(fig)
def block(fig,x,y,title,body,width=67,fs=12):
    fig.text(x,y,title,fontsize=14,weight='bold',va='top')
    lines=[]
    for p in body.split('\n'):
        lines.extend(textwrap.wrap(p,width=width) or [''])
    fig.text(x,y-.055,'\n'.join(lines),fontsize=fs,va='top',linespacing=1.5)
def table(fig,headers,rows,rect=(.055,.22,.89,.59),widths=None,fs=11):
    ax=fig.add_axes(rect);ax.axis('off')
    t=ax.table(cellText=rows,colLabels=headers,colWidths=widths,loc='center',cellLoc='left',colLoc='left')
    t.auto_set_font_size(False);t.set_fontsize(fs)
    for (i,j),c in t.get_celld().items():
        c.set_edgecolor('white');c.set_height(1/(len(rows)+1))
        c.set_facecolor(INK if i==0 else ('#eaf0f7' if i%2 else '#f4f7fb'))
        if i==0:c.set_text_props(color='white',weight='bold')
    return t

fig=page('Surfare: what the tests measured','Local checks, live online checks, model training and ready-to-use presentation data')
block(fig,.06,.79,'Measured today',f"48 paired synthetic checks: 12 messages, 12 links, 12 QR images and 12 text screenshots.\n316 frontend and 347 backend tests passed. No application models or detection rules were changed.\nOnline contextual reviews completed: {result['onlineCompleted']}/{result['onlineAttempted']}. Provider failures and fallback results remain visible.",width=61)
block(fig,.55,.79,'The main finding','On this small set, local text, link and QR warning decisions matched all expected labels. Screenshot text checks missed three danger examples after OCR changed wording.\nThese are development measurements, with reused authored cases; they do not establish real-world accuracy.',width=55)
block(fig,.06,.36,'Was Surfare trained on datasets?','Yes. Surfare combines a trained SMS model, trained text/URL advisory models, hand-written rules, exact reference matching, OCR/QR extraction and optional external AI.\nTraining was reproduced separately today: the URL artifact matches; the current text-training pipeline does not reproduce the saved text artifact.',width=127,fs=12)
finish(fig)

fig=page('Local accuracy, false positives and false negatives','Binary warning decision: High risk or Suspicious = warning; Low risk or uncertain = no warning')
rows=[[NAMES[k],m['n'],f"{m['positive']}/{m['negative']}",pct(m['accuracy']),pct(m['fpr']),pct(m['fnr']),m['unknown']] for k,m in LM.items()]
table(fig,['Task','N','Pos / neg','Accuracy','False positive','False negative','Uncertain'],rows,rect=(.055,.40,.89,.39),widths=[.22,.06,.12,.14,.16,.16,.14])
block(fig,.06,.32,'Read these figures correctly','Each task has six positive and six negative examples. “Accuracy” is agreement on whether to warn, not verified truth about a sender or website. The six ordinary links and QR links were uncertain, not declared safe.\nImages here mean screenshot text safety after real OCR. AI-generated-versus-real image accuracy is not available from these examples.',width=127,fs=11)
finish(fig,'local-metrics-table.png')

fig=page('Local checks: warning performance','Paired authored development examples; 12 inputs per task; zero external requests during local runs')
ax=fig.add_axes([.09,.25,.84,.53]);x=np.arange(4);w=.23
for j,(field,label,color) in enumerate([('accuracy','Accuracy',BLUE),('fpr','False positive rate',ORANGE),('fnr','False negative rate',RED)]):
    v=[LM[k][field] for k in KINDS];bars=ax.bar(x+(j-1)*w,v,w,label=label,color=color)
    ax.bar_label(bars,labels=[f'{n:.1f}%' for n in v],padding=4,fontsize=10)
ax.set_xticks(x,[NAMES[k] for k in KINDS]);ax.set_ylim(0,115);ax.set_ylabel('Percent');ax.legend(loc='upper center',bbox_to_anchor=(.5,-.12),ncol=3,frameon=False)
fig.text(.06,.12,'Small sample: one example changes accuracy by 8.33 points and a class error rate by 16.67 points.',fontsize=11)
finish(fig,'local-performance-chart.png')

fig=page('Local confusion matrices','Counts preserve the denominators behind the percentages. Positive means a warning is expected.')
for i,k in enumerate(KINDS):
    m=LM[k];ax=fig.add_axes([.065+i*.237,.32,.20,.42]);v=np.array([[m['tp'],m['fn']],[m['fp'],m['tn']]])
    ax.imshow(v,cmap='Blues',vmin=0,vmax=6)
    ax.set_title(NAMES[k],fontsize=12,weight='bold');ax.set_xticks([0,1],['Warn','No warn']);ax.set_yticks([0,1],['Positive','Negative'] if i==0 else ['',''])
    for a in range(2):
        for b in range(2):ax.text(b,a,str(v[a,b]),ha='center',va='center',fontsize=22,color='white' if v[a,b]>3 else INK)
fig.text(.06,.16,'The three screenshot misses are visible in the upper-right cell. There were no observed false alarms.',fontsize=12)
finish(fig,'local-confusion-matrices.png')

fig=page('Why screenshot checks missed examples','The screenshot and typed-message pairs contain the same authored source text')
misses=[r for r in ocr if r['label'] and not r['flagged']]
for i,r in enumerate(misses):
    block(fig,.06,.79-i*.18,r['id']+'  |  '+r['name'],f"Source: {r['expectedText']}\nOCR: {r['text']}",width=135,fs=10)
fig.text(.06,.17,f"OCR character error rate: {100*errs/chars:.2f}% across {chars} normalized source characters. Exact QR payload recovery: {qrexact}/{len(qr)}.",fontsize=11)
fig.text(.06,.12,'Small text changes can remove a rule match despite high OCR confidence. No fixes were applied during this evaluation.',fontsize=11)
finish(fig)

fig=page('Online checks on the paired inputs','Live external contextual AI through the real backend detect service; local browser OCR and QR extraction retained')
rows=[]
for k in KINDS:
    attempted=sum(r['kind']==k for r in online['rows']);m=OM[k]
    rows.append([NAMES[k],f"{m['n']}/{attempted}",f"{m['positive']} / {m['negative']}",pct(m['accuracy']),pct(m['fpr']),pct(m['fnr'])])
table(fig,['Task','AI completed','Pos / neg*','Accuracy*','False positive*','False negative*'],rows,rect=(.055,.43,.89,.36),fs=10)
block(fig,.06,.35,'Availability is part of the result',f"Completed reviews: {result['onlineCompleted']}/48 submissions. Six QR .example/credential-style URLs were kept local by policy; two QR requests were unavailable after HTTP 429 provider limits. *Rates use completed reviews only. QR completed cases are four negatives, so online QR false negatives cannot be estimated.\nThe CSV includes warning decisions with local fallback. This tests the backend and live providers, not the deployed UI or destination reputation; test pages were not visited.",width=136,fs=10)
finish(fig,'online-metrics-table.png')

fig=page('Local and online: same authored inputs','Completed online reviews only; see the availability table before interpreting any improvement')
ax=fig.add_axes([.09,.28,.84,.49]);x=np.arange(4);w=.31
for delta,data,label,color in [(-w/2,LM,'Local',BLUE),(w/2,OM,'Online completed',GREEN)]:
    vals=[data[k]['accuracy'] or 0 for k in KINDS];bars=ax.bar(x+delta,vals,w,label=label,color=color)
    ax.bar_label(bars,labels=[pct(data[k]['accuracy']) for k in KINDS],padding=4,fontsize=10)
ax.set_xticks(x,[NAMES[k] for k in KINDS]);ax.set_ylim(0,115);ax.set_ylabel('Warning accuracy (%)');ax.legend(frameon=False,ncol=2,loc='upper center',bbox_to_anchor=(.5,-.13))
fig.text(.06,.14,'Online QR: four negative cases only; no positive-case detection measurement. Six policy skips and two unavailable.',fontsize=10)
fig.text(.06,.10,'This small reused development set cannot establish that online checks are generally more accurate.',fontsize=11)
finish(fig,'local-online-comparison.png')

fig=page('Keep the larger benchmarks separate','Existing frozen development cases were rerun with the actual offline browser checker')
gm=general['messages'];gl=general['links']
rows=[['Corpus-labeled messages','100 (50 / 50)',pct(cm['accuracy']),pct(cm['fpr']),pct(cm['fnr'])],['Authored scam / legitimate messages',f"{gm['positive']+gm['negative']} ({gm['positive']} / {gm['negative']})",pct(100*(gm['caught']+gm['negative']-gm['falseAlarms'])/(gm['positive']+gm['negative'])),pct(100*gm['falseAlarms']/gm['negative']),pct(100*(gm['positive']-gm['caught'])/gm['positive'])],['Authored URL structures','100 (50 / 50)',pct(100*(gl['caught']+gl['negative']-gl['falseAlarms'])/100),pct(100*gl['falseAlarms']/gl['negative']),pct(100*(gl['positive']-gl['caught'])/gl['positive'])]]
table(fig,['Benchmark','N (pos / neg)','Accuracy','False positive','False negative'],rows,rect=(.055,.45,.89,.34),widths=[.34,.20,.15,.15,.16],fs=10)
block(fig,.06,.36,'Interpretation','The 100 corpus-labeled messages overlap model training/reference sources, are redacted and contain disputed source labels. Seven source-labeled scams were missed; the labels remain unchanged.\nThe authored challenge includes 19 scams, 28 legitimate messages and three separate commercial-spam controls (all unflagged). The 47 scam/legitimate cases appear above. URL labels mean reviewable structure, not verified maliciousness. Do not pool these sets or add the paired inputs as independent evidence.',width=132,fs=11)
finish(fig)

fig=page('How Surfare became the current system','Training and inference are different stages; the application combines several kinds of evidence')
block(fig,.06,.79,'1. Prepare source data','Text: normalize Unicode, map source labels, remove exact duplicates and conflicting messages; exclude generic spam and unknown intent from the scam model. Use IMC25 translations when present.\nGroup normalized templates with URLs/numbers masked. URL data: normalize URLs, remove invalid/duplicate/conflicting rows, group by registrable domain.',width=63,fs=11)
block(fig,.55,.79,'2. Train compact classifiers','Current script: deterministic SHA-256 group splits, approximately 80% train / 10% validation / 10% test. The imported legacy SMS model documents 70% / 15% / 15%.\nText features: word unigrams and bigrams. URL features: words, host trigrams, TLD, length, digits, hyphens and risk tokens.',width=60,fs=11)
block(fig,.06,.40,'3. Select and validate','Text compares feature-ratio and TF-IDF multinomial naive Bayes; selects validation recall, then precision. URL uses feature-ratio weights. Thresholds maximize validation recall subject to a 2% validation false-alarm target.\nThe target is a selection constraint, not a guarantee on test data.',width=63,fs=11)
block(fig,.55,.40,'4. Run the application','Local: OCR / QR decode -> shared rules, SMS signal and reference matches -> warning. Dataset text/URL models are advisory and do not independently change risk scores.\nOnline: external AI reviews meaning with grounded quotes; local warnings survive failures. Sightengine genai is separate image-origin review.',width=60,fs=11)
finish(fig)

fig=page('Datasets used for classifier training','Counts are source-file rows, not unique training rows; overlapping records are deduplicated')
role={
'asea':('A.S.E.A Taglish', '4,839','Scam + legitimate; exact text reference too'),
'filipino-spam-sms':('Filipino Spam SMS (Yissuh, 2023)','625','Legitimate only for current scam model'),
'filipino-spam-merged':('Filipino Spam SMS merged','873','Legitimate only; overlaps original'),
'sms-spam-collection-dedup':('SMS Spam Collection, deduplicated','5,159','Legitimate only for current scam model'),
'hinglish-scam-text':('Hinglish text corpus','3,787','Legitimate only; English source overlap'),
'imc25-smishing':('IMC25 smishing reports','33,869','Scam positives; translations when available'),
'curated-synthetic':('Project-authored training examples','36','12 scam + 18 legitimate; 6 spam excluded'),
'phiusiil':('PhiUSIIL phishing URLs','235,795','Lexical URL model + exact URL reference')}
table(fig,['Source','Raw rows','Current role'],list(role.values()),rect=(.055,.25,.89,.55),widths=[.36,.13,.51],fs=10)
block(fig,.06,.19,'Imported SMS model','UCI SMS Spam Collection (Almeida & Hidalgo, 2011) plus Filipino Spam SMS (Alexander / Yissuh, 2023). Its original raw frozen training split and retraining script are absent from this import; the source attribution and fitted weights remain.',width=145,fs=10)
finish(fig)

fig=page('Reference lists and data that are not model training','The complete manifest, paths, counts and recorded roles are also exported as dataset-inventory.csv')
rows=[['PhishDestroy domain fingerprints','231,725','Exact phishing-domain reference'],['PAGCOR reported websites','359','Exact reported gambling reference'],['PAGCOR fake-certification websites','3','Exact impersonation reference'],['PAGCOR registered domains','414','Point-in-time registered gambling reference'],['Locally reviewed gambling hosts','2','Project watchlist'],['SEC stopped-lender names','58','Text match regulatory reference'],['Locally reviewed messages','4','User-supplied review examples; not training-script input'],['dataset_phishing.csv','11,431','Reference only; no raw URL, unused for training/inference'],['Vrbanic phishing CSV','Not active','Excluded; not used for training']]
table(fig,['Reference / file','Rows','Role'],rows,rect=(.055,.27,.89,.54),widths=[.36,.13,.51],fs=10)
block(fig,.06,.20,'Other models and mechanisms','OCR uses pre-trained English and Filipino Tesseract language packs; QR decoding uses jsQR. External contextual AI and Sightengine are provider-trained services; their full training corpora are not recorded here and were not trained by this repository. Feedback is not automatically used for training.',width=145,fs=10)
finish(fig)

fig=page('Internal component scores and reproducibility','Component results are separate from full-app warning accuracy and from the online reviews')
rows=[]
for label,data in [('Saved text model',saved['text']),('Rebuilt text model',fresh['text']),('Saved / rebuilt URL model',saved['url'])]:
    e=data['evaluation']['test'];n=e['count']
    rows.append([label,n,pct(100*(e['tp']+e['tn'])/n),pct(100*e['fp']/(e['fp']+e['tn'])),pct(100*e['fn']/(e['tp']+e['fn'])),e['abstained']])
table(fig,['Component / source','Test N','Accuracy','False positive','False negative','Abstained'],rows,rect=(.055,.48,.89,.31),widths=[.29,.10,.16,.16,.16,.13],fs=10)
block(fig,.06,.39,'What reproduced','The URL model is byte-for-byte identical. Text audit source counts agree, but current normalization/grouping produces a different partition and fitted text model. Saved text scores are recorded historical component metrics, not a fresh confirmation of that exact holdout.\nNo runtime artifacts were overwritten. Rebuilt outputs remain in artifacts/evaluation/reproduced-training. The repository does not preserve enough versioned training context to attribute the text mismatch to a specific earlier change.',width=133,fs=11)
finish(fig)

fig=page('Training partitions and preprocessing counts','Exact row counts from saved and reproduced reports; positives are source-labeled scam / phishing examples')
rows=[]
for label,data in [('Saved text',saved['text']),('Rebuilt text',fresh['text']),('URL (both)',fresh['url'])]:
    for split,p in data['partition']['splits'].items():
        rows.append([label,split.title(),f"{p['rows']:,}",f"{p['positive']:,}",f"{p['negative']:,}",f"{p['groups']:,}"])
table(fig,['Artifact','Split','Rows','Positive','Negative','Groups'],rows,rect=(.055,.31,.89,.49),fs=10)
block(fig,.06,.23,'Cleaning audit','Text: 14,073 duplicate rows; 256 conflicting messages; excluded deduplicated categories: 1,905 generic spam and 22 unreviewed. URL: 235,795 inputs; one invalid row; 888 duplicates; one conflicting URL. Both pipelines report zero groups crossing splits and zero text challenge-template overlaps. Audit counts describe stages and should not be summed as disjoint exclusions.',width=145,fs=10)
finish(fig)

fig=page('Training configuration and threshold selection','The current pipeline trains compact statistical models; it does not fine-tune the external AI providers')
rows=[]
for label,folder in [('Saved','backend/lib/models'),('Rebuilt','artifacts/evaluation/reproduced-training/lib/models')]:
    for name,task in [('taglish-intent-model.json','Text'),('url-risk-model.json','URL')]:
        model=load(folder+'/'+name)
        rows.append([label+' '+task,model['method'],model['vocabularySize'],f"{model['threshold']:.6f}",model['minFeatures'],f"{model['minCoverage']:.0%}"])
table(fig,['Artifact','Selected method','Vocabulary','Threshold','Min features','Coverage'],rows,rect=(.055,.47,.89,.33),widths=[.15,.27,.13,.17,.14,.14],fs=9)
block(fig,.06,.39,'What the fitted values represent','Feature-ratio weights use add-one-smoothed log ratios of feature occurrence by class, with a log class-prior intercept. Text vocabulary is capped at 6,000 features; URL vocabulary at 4,000. Runtime requires sufficient feature coverage before flagging.\nThe text pipeline also compares binary TF-IDF L2 multinomial naive Bayes, then chooses by validation recall and precision under the 2% FPR ceiling. Tests are read for reporting after model selection. Scores are not calibrated probabilities. The legacy SMS model has threshold 16, at least three words and 35% known-word coverage; its training procedure is documented but cannot be reproduced fully from this import.',width=137,fs=11)
finish(fig)

fig=page('Training sizes and error trade-offs','Current reproducible training run; no thresholds were tuned to today’s paired examples')
ax=fig.add_axes([.10,.30,.36,.48]);x=np.arange(2);bottom=np.zeros(2)
for split,color in [('train',BLUE),('validation',ORANGE),('test',GREEN)]:
    vals=[fresh[k]['partition']['splits'][split]['rows'] for k in ['text','url']]
    ax.bar(x,vals,bottom=bottom,label=split.title(),color=color);bottom+=vals
ax.set_xticks(x,['Text','URL']);ax.set_ylabel('Rows after cleaning');ax.legend(frameon=False,fontsize=9)
for i,n in enumerate(bottom):ax.text(i,n+2500,f'{int(n):,}',ha='center')
ax.set_ylim(0,max(bottom)*1.16)
ax=fig.add_axes([.58,.30,.35,.48]);x=np.arange(2);w=.30
for delta,field,label,color in [(-w/2,'fpr','False positive',ORANGE),(w/2,'fnr','False negative',RED)]:
    vals=[]
    for k in ['text','url']:
        e=fresh[k]['evaluation']['test'];vals.append(100*e['fp']/(e['fp']+e['tn']) if field=='fpr' else 100*e['fn']/(e['tp']+e['fn']))
    bars=ax.bar(x+delta,vals,w,label=label,color=color);ax.bar_label(bars,fmt='%.2f%%',padding=3)
ax.set_xticks(x,['Text','URL']);ax.set_ylabel('Held-out component error (%)');ax.set_ylim(0,55);ax.legend(frameon=False,fontsize=9)
fig.text(.06,.15,'The lexical URL classifier has many misses. Exact references and application rules serve additional roles.',fontsize=12)
finish(fig,'training-and-component-errors.png')

fig=page('Image origin: what can be reported','AI-image identification is distinct from detecting a dangerous message inside a screenshot')
block(fig,.06,.79,'Local image-origin checks','Local file metadata and Content Credentials can provide evidence, but missing metadata does not establish whether an image is real or AI-generated. The repository supplies no balanced, independently labeled AI-image-versus-real-photo benchmark.\nAccuracy: N/A. False-positive rate: N/A. False-negative rate: N/A.',width=65,fs=12)
rr=origin['result']
block(fig,.55,.79,'Live provider control',f"A single program-rendered screenshot (not generated with an AI model) was submitted through the Sightengine image-detect service.\nHTTP status: {origin['httpStatus']}. Review status: {rr.get('status','unknown')}. Reason: {rr.get('reason','none')}. Score: {rr.get('detection',{}).get('aiGeneratedScore','not returned')}.\nOne negative screenshot and zero positive AI photos cannot yield meaningful image-origin accuracy/FPR/FNR.",width=59,fs=12)
block(fig,.06,.32,'What is needed for those percentages','Collect known real camera originals and known AI-generated originals across multiple generators, image types and compression levels. Preserve origin labels; reserve untouched test images; report uncertain results and provider failures. No image-origin accuracy number is invented in this report.',width=131,fs=12)
finish(fig)

fig=page('Metric definitions and evaluation boundaries','Use these definitions when copying the charts into a presentation')
block(fig,.06,.79,'Definitions','TP: positive example with warning. FN: positive without warning. FP: negative with warning. TN: negative without warning.\nAccuracy = (TP + TN) / N x 100.\nFalse-positive rate = FP / (FP + TN) x 100.\nFalse-negative rate = FN / (TP + FN) x 100.\nFPR is not FP divided by every test, and is not one minus precision.',width=64,fs=12)
block(fig,.55,.79,'Limits of the measurements','Unknown results count as no warning for this binary alarm task and are shown separately; an uncertain negative is not certified safe. Extraction errors receive no correctness credit.\nOnline completed-only rates omit unavailable reviews; app-with-fallback figures in CSV include their resulting warning decisions. No independent campaigns, camera-photo distribution, or future provider reliability were measured.',width=60,fs=12)
block(fig,.06,.31,'Sample size and dependence','Each paired group has only 12 cases. Even 12/12 correct has a Wilson 95% interval of roughly 75.8% to 100%, assuming independent cases. The paired tasks deliberately reuse messages/URLs and are correlated, so do not merge them into one general accuracy claim. The cases were not used to modify the detector during this run.',width=131,fs=11)
finish(fig)

fig=page('Evidence files and rerun instructions','All evidence comes from this workspace; credentials and raw training messages are excluded from the report')
block(fig,.06,.79,'Run the checks','npm.cmd test\nnpm.cmd run backend:test\npython artifacts/evaluation-prepare.py\nnode artifacts/evaluation-browser.mjs\nnode --env-file=backend/.dev.vars artifacts/evaluation-online.mjs\nnode backend/scripts/train-dataset-models.mjs --out artifacts/evaluation/reproduced-training\npython artifacts/evaluation-report.py',width=110,fs=10)
block(fig,.06,.37,'Sources and traceability','Run the frontend dev server at 127.0.0.1:5173 before the browser step. Online evaluation makes external requests and consumes configured provider quota.\nPrimary records: backend/datasets/manifest.json; backend/reports/dataset-training.json; backend/docs/DETECTION.md; backend/public/licenses/sms-model-attribution.txt; backend/scripts/train-dataset-models.mjs; backend/evaluation/{local-messages,generalization}/latest.json.\nRaw paired cases, local/online JSON, per-case CSV, dataset inventory, model hashes, chart PNGs and slide text are beside this PDF. Full-suite logs are in artifacts/evaluation-*-tests.log.',width=145,fs=10)
finish(fig)
pdf.close()

with (D/'dataset-inventory.csv').open('w',newline='',encoding='utf-8') as f:
    fields=['id','path','rows','status','sha256','note'];w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(manifest['datasets'])
text=['SURFARE - SLIDE-READY RESULTS','26 November 2026 (Asia/Singapore)','', 'Slide: Local paired development checks (12 cases each; 6 positive / 6 negative)']
for k,m in LM.items():text.append(f"{NAMES[k]}: accuracy {pct(m['accuracy'])}; FPR {pct(m['fpr'])}; FNR {pct(m['fnr'])}; TP/FP/TN/FN={m['tp']}/{m['fp']}/{m['tn']}/{m['fn']}; uncertain={m['unknown']}.")
text+=['','Slide: Live online paired checks',f"External reviews completed {result['onlineCompleted']}/{result['onlineAttempted']}; six QR policy skips and two HTTP-429-related unavailable reviews; completed-only metrics:"]
for k,m in OM.items():text.append(f"{NAMES[k]}: n={m['n']} ({m['positive']} positive / {m['negative']} negative); accuracy {pct(m['accuracy'])}; FPR {pct(m['fpr'])}; FNR {pct(m['fnr'])}.")
text+=['','Slide: Larger existing message regression',f"100 corpus-labeled messages: accuracy {pct(cm['accuracy'])}, FPR {pct(cm['fpr'])}, FNR {pct(cm['fnr'])}. Training/reference overlap and noisy labels; not independent real-world accuracy.",'','Slide: How Surfare was trained','Surfare is a hybrid of trained compact classifiers, contextual rules, exact reference matching, OCR/QR extraction, and optional external AI.','Imported SMS model: UCI SMS Spam Collection + Filipino Spam SMS.','Current text model: A.S.E.A; legitimate samples from Filipino original/merged, SMS Spam Collection and Hinglish; IMC25 scam samples; authored augmentation.','URL model: PhiUSIIL raw URLs. dataset_phishing.csv is not used to train the runtime models.','Dataset text/URL models are advisory; rule/reference evidence determines risk alongside the SMS signal.','URL training reproduces exactly; current text preprocessing does not reproduce the saved text model. No runtime models changed.','','Limitations to include','Small reused synthetic development sets; warning accuracy does not verify website or sender safety.','Image means screenshot text safety. AI-image-origin accuracy, FPR and FNR: N/A without a suitable labeled image set.','316 frontend and 347 backend tests passed; test pass rate is not detector accuracy.']
(D/'PPT-slide-summary.txt').write_text('\n'.join(text)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
print('PDF pages:',page_no)
