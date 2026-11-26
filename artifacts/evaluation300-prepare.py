"""Freeze 300 labeled input instances before examining any new detector outputs."""
import collections, hashlib, json, pathlib, textwrap
import cv2
from PIL import Image, ImageDraw, ImageFont

ROOT=pathlib.Path(__file__).resolve().parents[1]
D=ROOT/'artifacts/evaluation-300'
D.mkdir(exist_ok=True)
read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
sources=[('backend/evaluation/generalization/cases.json',read('backend/evaluation/generalization/cases.json')['messages']),('backend/tests/fixtures/semantic-smoke.json',read('backend/tests/fixtures/semantic-smoke.json')),('backend/evaluation/local-messages/supplemental.json',read('backend/evaluation/local-messages/supplemental.json')['cases'])]
pool=[];seen=set()
for source,rows in sources:
 for i,r in enumerate(rows):
  if r.get('label')=='spam':continue
  key=' '.join(r['text'].lower().split())
  if key in seen:continue
  seen.add(key)
  pool.append(dict(text=r['text'],positive=r.get('label')=='scam' or r.get('expected')=='High risk',source=source,sourceId=r.get('id',r.get('name',str(i+1))),category=r.get('category',r.get('name','message safety')),provenance='Reused project-authored synthetic development case'))
pool.append(dict(text='You won our cash draw. Buy a gift card and send me its redeem code to pay the prize release fee.',positive=True,source='artifacts/evaluation300-prepare.py',sourceId='new-prize-fee-001',category='prize advance-fee request',provenance='New project-authored synthetic test case; label set before this run'))
def choose(pool,pos,neg):
 ordered=sorted(pool,key=lambda r:hashlib.sha256((r['source']+':'+r['sourceId']).encode()).hexdigest())
 a=[r for r in ordered if r['positive']][:pos];b=[r for r in ordered if not r['positive']][:neg]
 assert len(a)==pos and len(b)==neg
 return [r for i in range(max(pos,neg)) for r in ([a[i]] if i<pos else [])+([b[i]] if i<neg else [])]
messages=choose(pool,38,37)
source='backend/evaluation/generalization/cases.json'
links=choose([dict(text=r['text'],positive=r['label']=='review',source=source,sourceId=r['id'],category=r['category'],provenance='Reused project-authored URL-structure development case; not a verified malicious/benign website') for r in read(source)['links']],38,37)
qrpayloads=choose(choose(messages,20,20)+choose(links,18,17),38,37)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',30)
cases=[]
for kind,items in [('text',messages),('links',links),('image',messages),('qr',qrpayloads)]:
 for i,r in enumerate(items):
  item=dict(id=f'{kind}-{i+1:03}',kind=kind,label=r['positive'],expectedText=r['text'],source=r['source'],sourceId=r['sourceId'],category=r['category'],provenance=r['provenance'],labelMeaning='Warning expected' if r['positive'] else 'No warning expected')
  if kind=='image':
   dark=i%3==1;im=Image.new('RGB',(1000,440),'#171b22' if dark else 'white')
   ImageDraw.Draw(im).multiline_text((35,45),'\n'.join(textwrap.wrap(r['text'],55)),font=font,fill='white' if dark else 'black',spacing=14)
   item.update(file=f'{kind}-{i+1:03}.png',render='dark screenshot' if dark else 'light screenshot')
   im.save(D/item['file'])
  elif kind=='qr':
   q=cv2.QRCodeEncoder_create().encode(r['text']);q=cv2.copyMakeBorder(q,4,4,4,4,cv2.BORDER_CONSTANT,value=255)
   q=cv2.resize(q,None,fx=8,fy=8,interpolation=cv2.INTER_NEAREST)
   if i%3==1:q=cv2.rotate(q,cv2.ROTATE_90_CLOCKWISE)
   item.update(file=f'{kind}-{i+1:03}.png',render='90-degree QR' if i%3==1 else 'upright QR')
   cv2.imwrite(str(D/item['file']),q)
  if item.get('file'):item['fileSha256']=hashlib.sha256((D/item['file']).read_bytes()).hexdigest()
  cases.append(item)
assert len(cases)==300
assert all(len({r['expectedText'] for r in cases if r['kind']==k})==75 for k in ['text','links','image','qr'])
payload=json.dumps(cases,ensure_ascii=False,indent=2)+'\n'
(D/'cases.json').write_text(payload,encoding='utf-8')
meta=dict(scope='300 local + same 300 online input instances, 75 per modality, each 38 positive / 37 negative. 150 unique source texts/URLs reused across modalities; not 600 independent examples.',labelPolicy='Source development labels frozen before observing this run. URL positives indicate reviewable structure, not verified malicious websites. All cases synthetic; 149 reused source contents, one newly authored.',caseSha256=hashlib.sha256(payload.encode()).hexdigest(),sourceHashes={s:hashlib.sha256((ROOT/s).read_bytes()).hexdigest() for s,_ in sources},counts=dict(collections.Counter(r['kind'] for r in cases)))
(D/'manifest.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
print(json.dumps(meta,indent=2))
