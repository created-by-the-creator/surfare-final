"""Format recorded Surfare test evidence; does not rerun or alter detector results."""
import csv
import hashlib
import json
import pathlib
import textwrap
import zipfile

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import FancyBboxPatch

ROOT = pathlib.Path(__file__).resolve().parents[1]
D = ROOT / 'artifacts/offline-improvement'
OUT = ROOT / "Surfare's Accuracy Results.pdf"
load = lambda p: json.loads(p.read_text(encoding='utf-8'))
data = load(D / 'improvement-metrics.json')
sets = data['results']
manifests = [load(ROOT / 'artifacts/corpus-evaluation-200/manifest.json'),
             load(D / 'confirmation/manifest.json')]
rows = list(csv.DictReader((D / 'updated-local-results.csv').open(encoding='utf-8-sig', newline='')))
assert len(rows) == 600
for folder, manifest in zip([ROOT / 'artifacts/corpus-evaluation-200', D / 'confirmation'], manifests):
    assert hashlib.sha256((folder / 'cases.json').read_bytes()).hexdigest() == manifest['caseSha256']
for key, group in [('after_200', 'development-200'), ('confirmation_400', 'confirmation-400')]:
    rr = [r for r in rows if r['set'] == group]
    tp = sum(r['label'] == 'True' and r['afterWarning'] == 'True' for r in rr)
    tn = sum(r['label'] == 'False' and r['afterWarning'] == 'False' for r in rr)
    fp = sum(r['label'] == 'False' and r['afterWarning'] == 'True' for r in rr)
    fn = sum(r['label'] == 'True' and r['afterWarning'] == 'False' for r in rr)
    m = sets[key]['overall']
    assert (tp, tn, fp, fn) == (m['tp'], m['tn'], m['fp'], m['fn'])

for name in ['segoeui.ttf', 'segoeuib.ttf']:
    font_manager.fontManager.addfont('C:/Windows/Fonts/' + name)
NAVY = '#132F4C'; TEAL = '#137C83'; INK = '#20364B'; GRAY = '#5A6B7C'
PALE = '#EFF5F7'; LINE = '#DCE5EA'; RED = '#A3484F'
plt.rcParams.update({'font.family': 'Segoe UI', 'font.size': 10, 'text.color': INK,
                     'text.parse_math': False, 'pdf.fonttype': 42})
pages = []

def txt(fig, x, y, text, size=10, color=INK, weight='normal', **kw):
    return fig.text(x, y, text, fontsize=size, color=color, weight=weight, va='top', **kw)

def para(fig, y, text, width=96, size=10, color=INK):
    lines = '\n'.join(textwrap.wrap(text, width, break_long_words=False, break_on_hyphens=False))
    txt(fig, .075, y, lines, size, color, linespacing=1.45)

def base(page, heading, subtitle):
    fig = plt.figure(figsize=(8.27, 11.69), facecolor='white')
    fig.add_artist(plt.Line2D([.075, .925], [.94, .94], transform=fig.transFigure, color=TEAL, lw=2))
    txt(fig, .075, .969, 'SURFARE  /  LOCAL DETECTOR EVALUATION', 9, TEAL, 'bold')
    txt(fig, .075, .918, heading, 25, NAVY, 'bold')
    txt(fig, .075, .873, subtitle, 10, GRAY, linespacing=1.4)
    fig.add_artist(plt.Line2D([.075, .925], [.052, .052], transform=fig.transFigure, color=LINE, lw=.8))
    txt(fig, .075, .037, '26 NOVEMBER 2026  |  Recorded offline results  |  Version 1.0', 8, GRAY)
    txt(fig, .925, .037, f'{page} / 2', 8, GRAY, ha='right')
    return fig

def section(fig, y, name):
    txt(fig, .075, y, name, 12, NAVY, 'bold')

def table(fig, rect, headers, values, widths, size=9.3):
    ax = fig.add_axes(rect); ax.axis('off')
    tab = ax.table(cellText=values, colLabels=headers, colWidths=widths,
                   bbox=[0, 0, 1, 1], cellLoc='left', colLoc='left')
    tab.auto_set_font_size(False); tab.set_fontsize(size)
    for (r, c), cell in tab.get_celld().items():
        cell.set_edgecolor('white'); cell.set_linewidth(1)
        cell.set_facecolor(NAVY if r == 0 else (PALE if r % 2 else '#F8FAFB'))
        cell.PAD = .085
        cell.get_text().set_color('white' if r == 0 else INK)
        if r == 0: cell.get_text().set_weight('bold')
    return tab

def pct(v): return f'{v:g}%'

fig = base(1, "Surfare's Accuracy Results", 'Messages, links, QR codes and screenshot text\nProject benchmark report | AI double-check excluded')
m = sets['confirmation_400']['overall']
for x, value, label, detail in [(.075, '92.25%', 'ACCURACY', '369 of 400 correct'),
                                (.366, '7.5%', 'FALSE-POSITIVE RATE', '15 of 200 benign flagged'),
                                (.657, '8.0%', 'FALSE-NEGATIVE RATE', '16 of 200 risky missed')]:
    fig.add_artist(FancyBboxPatch((x, .724), .268, .103, boxstyle='round,pad=0.006,rounding_size=0.009',
                                  facecolor=PALE, edgecolor='none', transform=fig.transFigure))
    txt(fig, x+.014, .817, label, 8, GRAY, 'bold')
    txt(fig, x+.014, .794, value, 25, TEAL, 'bold')
    txt(fig, x+.014, .748, detail, 8.5, GRAY)
txt(fig, .075, .704, 'Headline results: 400 additional source-derived cases; 200 risky and 200 benign.', 9, GRAY)

section(fig, .669, '01  Comparison with the earlier local detector')
vals=[]
for label, key in [('Earlier version / 200 cases', 'before_200'),
                    ('Updated / same 200 cases', 'after_200'),
                    ('Updated / 400 additional cases', 'confirmation_400')]:
    a=sets[key]['overall']; vals.append([label, pct(a['accuracy']), pct(a['fpr']), pct(a['fnr'])])
table(fig, [.075,.521,.85,.119], ['Evaluation', 'Accuracy', 'False positive', 'False negative'], vals,
      [.43,.17,.20,.20], 9)
txt(fig, .075, .505, 'The original 200 cases were used in development. Their inputs and labels were unchanged.', 8.8, GRAY)

section(fig, .468, '02  Results on the 400 additional cases')
ax=fig.add_axes([.235,.271,.63,.155])
names=['Messages','Links','QR codes','Screenshot text']; kinds=['text','links','qr','image']
values=[sets['confirmation_400']['byKind'][k]['accuracy'] for k in kinds]
bars=ax.barh(names, values, color=[TEAL, NAVY, TEAL, TEAL], height=.51)
ax.invert_yaxis(); ax.set_xlim(0,112); ax.set_xticks([0,25,50,75,100], ['0%','25%','50%','75%','100%'])
ax.set_axisbelow(True); ax.grid(axis='x', color=LINE, lw=.7)
ax.tick_params(axis='both',length=0,labelsize=9,colors=GRAY)
for spine in ax.spines.values():spine.set_visible(False)
ax.bar_label(bars, labels=[pct(v) for v in values], padding=5, fontsize=10, color=INK)
txt(fig, .075, .442, 'Accuracy by input type | 100 cases each; 50 risky + 50 benign', 9, GRAY)

table(fig, [.075,.156,.85,.09], ['Actual dataset label', 'Warning issued', 'No warning'],
      [['Risky / 200', '184 correct detections', '16 missed warnings'],
       ['Benign / 200', '15 false alarms', '185 correct non-alerts']], [.34,.33,.33], 9.2)
para(fig, .129, 'Scope: source datasets overlap training or reference material. These scores measure agreement with source labels, not independently verified real-world accuracy.', width=103, size=9.3)
pages.append(fig)

fig=base(2, 'Method & evidence', 'How the benchmark was measured, what it was compared with,\nand the limits that must accompany the results.')
section(fig, .816, '03  Measurement procedure')
method=[
 '1. Select labeled source records using fixed seeds, quotas and template/domain grouping; selection does not use detector predictions.',
 '2. Test the local path with external requests blocked. Use 200 development cases, then 400 additional groups disjoint from those cases and the earlier audit.',
 '3. Compare each verdict with its source label. High risk or Suspicious = warning; Low risk or Unknown = no warning. Unknown is not proof of safety.',
 '4. Count correct alerts, correct non-alerts, false alarms and missed warnings. All 600 final cases completed without execution failures.'
]
for y,t in zip([.788,.749,.710,.671],method):para(fig,y,t,100,9.5)
para(fig,.630,'Accuracy = correct / total; false-positive rate = benign flagged / total benign; false-negative rate = risky missed / total risky. Multiply each ratio by 100 for a percentage.',100,9.5)

section(fig, .578, '04  Error rates by detector / 400-case set')
table(fig,[.075,.441,.85,.111],['Detector','Correct / 100','Accuracy','False positive','False negative'],
      [[name, str(sets['confirmation_400']['byKind'][k]['tp']+sets['confirmation_400']['byKind'][k]['tn']),
        pct(sets['confirmation_400']['byKind'][k]['accuracy']),pct(sets['confirmation_400']['byKind'][k]['fpr']),
        pct(sets['confirmation_400']['byKind'][k]['fnr'])] for name,k in zip(names,kinds)],
      [.27,.18,.15,.20,.20],8.8)

section(fig,.419,'05  Traceable source records')
sources=[('asea','A.S.E.A Taglish'),('filipino-original','Filipino Spam SMS / original'),
         ('filipino-merged','Filipino Spam SMS / merged'),('uci-sms','UCI SMS Spam Collection'),
         ('hinglish','Hinglish corpus / UCI-matched English ham'),('imc25','IMC25 public smishing reports'),
         ('phiusiil','PhiUSIIL phishing URLs')]
vals=[]
for key,label in sources:
    counts=[sum(man['counts'][key].values()) for man in manifests]
    vals.append([label,str(counts[0]),str(counts[1])])
tab=table(fig,[.075,.223,.85,.169],['Source (click name for repository)','200-case set','400-case set'],vals,[.66,.17,.17],8.7)
for i,(key,_) in enumerate(sources,1):tab[i,0].get_text().set_url(manifests[0]['sources'][key]['url'])

section(fig,.202,'06  Interpretation & reproducibility')
para(fig,.179,'This is an internal benchmark, not independent certification. Known-URL matches test reference coverage; they do not establish detection of unseen phishing sites. QR and screenshot samples are controlled renderings of source content. Individual source labels were not independently verified.',102,9)
para(fig,.119,'The earlier 400-case audit scored 85% and informed development; it is not the final set. The evidence archive retains all 600 final samples/results, source row IDs, labels, hashes, manifests and that audit. Independent, human-reviewed testing is the next validation step.',102,9)
pages.append(fig)

with PdfPages(OUT) as pdf:
    meta=pdf.infodict(); meta['Title']="Surfare's Accuracy Results";meta['Author']='Surfare Project'
    meta['Subject']='Offline detector benchmark: measurements, comparison, provenance and limitations'
    for i,fig in enumerate(pages,1):
        pdf.savefig(fig)
        fig.savefig(D/f'accuracy-results-page-{i}.png',dpi=140,facecolor='white')
        plt.close(fig)
assert OUT.read_bytes().startswith(b'%PDF-')
answer=('We compared Surfare\'s local warnings with the original dataset labels across messages, links, QR codes and screenshot text. '
        'We measured correct results, false alarms and missed warnings, and compared the updated detector with its earlier version. '
        'It scored 95.5% on the original 200 cases and 92.25% on 400 additional cases, with 7.5% false positives and 8% false negatives on the latter. '
        'Because the sources overlap training or reference data, these are internal benchmark results, not independent real-world validation.')
(D/'Judges-short-answer.txt').write_text(answer+'\n',encoding='utf-8')
# Preserve the complete sample archive and add the newly titled report and short answer.
archive=D/'Surfare-Accuracy-Results-and-Evidence.zip'
with zipfile.ZipFile(D/'Surfare-Updated-Local-Results-and-Samples.zip') as old, zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as new:
    for info in old.infolist():
        if info.filename!='Surfare-Improved-Local-Checks.pdf':new.writestr(info,old.read(info.filename))
    new.write(OUT,OUT.name)
    new.write(D/'Judges-short-answer.txt','Judges-short-answer.txt')
print(json.dumps({'pdf':str(OUT),'pages':len(pages),'sampleRowsVerified':len(rows),'evidenceArchive':str(archive)},indent=2))
