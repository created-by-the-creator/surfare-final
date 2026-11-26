import hashlib,json,pathlib,textwrap
import cv2
from PIL import Image,ImageDraw,ImageFont
root=pathlib.Path(__file__).resolve().parents[1];d=root/'artifacts/offline-improvement/confirmation'
cases=json.loads((d/'cases.json').read_text(encoding='utf-8'));font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',30)
files={}
for r in cases:
 if r['kind']=='image':
  image=Image.new('RGB',(1100,540),'white');draw=ImageDraw.Draw(image)
  draw.multiline_text((40,45),'\n'.join(textwrap.wrap(r['expectedText'],62)),font=font,fill='black',spacing=14)
 elif r['kind']=='qr':
  q=cv2.QRCodeEncoder_create().encode(r['expectedText']);q=cv2.copyMakeBorder(q,4,4,4,4,cv2.BORDER_CONSTANT,value=255);q=cv2.resize(q,None,fx=8,fy=8,interpolation=cv2.INTER_NEAREST)
  image=Image.fromarray(q)
 else:continue
 name=r['id']+'.png';image.save(d/name)
 files[r['id']]={'file':name,'sha256':hashlib.sha256((d/name).read_bytes()).hexdigest()}
(d/'image-files.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
print('Rendered',len(files),'files from source records. Frozen source cases unchanged.')
