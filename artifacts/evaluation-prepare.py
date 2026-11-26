import json, pathlib, textwrap
import cv2
from PIL import Image, ImageDraw, ImageFont

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'artifacts' / 'evaluation'
out.mkdir(exist_ok=True)
messages = json.loads((root/'backend/tests/fixtures/semantic-smoke.json').read_text(encoding='utf-8'))
challenge = json.loads((root/'backend/evaluation/generalization/cases.json').read_text(encoding='utf-8'))
# Fixed first six per class, before observing outputs. URL targets are never visited.
links = [r for label in ['review','no_warning'] for r in [x for x in challenge['links'] if x['label']==label][:6]]
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 30)
cases=[]
for i,r in enumerate(messages):
    filename=f'message-{i+1:02}.png'
    im=Image.new('RGB',(1000,440),'white')
    ImageDraw.Draw(im).multiline_text((35,45), '\n'.join(textwrap.wrap(r['text'],55)),font=font,fill='black',spacing=14)
    im.save(out/filename)
    cases.append(dict(id=f'message-{i+1:02}',kind='text',label=r['expected']=='High risk',text=r['text'],name=r['name']))
    cases.append(dict(id=f'ocr-{i+1:02}',kind='image',label=r['expected']=='High risk',text=r['text'],file=filename,name=r['name']))
for i,r in enumerate(links):
    filename=f'qr-{i+1:02}.png'
    qr=cv2.QRCodeEncoder_create().encode(r['text'])
    qr=cv2.copyMakeBorder(qr,4,4,4,4,cv2.BORDER_CONSTANT,value=255)
    qr=cv2.resize(qr,None,fx=10,fy=10,interpolation=cv2.INTER_NEAREST)
    cv2.imwrite(str(out/filename),qr)
    cases.append(dict(id=f'link-{i+1:02}',kind='links',label=r['label']=='review',text=r['text'],sourceId=r['id']))
    cases.append(dict(id=f'qr-{i+1:02}',kind='qr',label=r['label']=='review',text=r['text'],file=filename,sourceId=r['id']))
(out/'cases.json').write_text(json.dumps(cases,indent=2,ensure_ascii=False),encoding='utf-8')
print(f'Prepared {len(cases)} fixed synthetic cases; {len(messages)} screenshots and {len(links)} QR files.')
