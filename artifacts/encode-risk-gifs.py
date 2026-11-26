"""Encode the generated 6x4 sprite sheet into looping GIFs and still fallbacks."""
from PIL import Image
from pathlib import Path
import shutil

root=Path(__file__).resolve().parents[1]
work=root/'artifacts/risk-animation';work.mkdir(exist_ok=True)
source=Path('C:/Users/kaixe/.codex/generated_images/01a21692-0587-7512-8c43-7d1b43850439/exec-807399d2-3097-48f7-8cc8-e030948eb269.png')
shutil.copy2(source,work/'surfy-risk-sprite.png')
sheet=Image.open(source).convert('RGBA');assert sheet.size==(1536,1024)
out=root/'frontend/public/assets/risk';out.mkdir(exist_ok=True)
for row,name in enumerate(['calm','caution','alert','curious']):
 frames=[sheet.crop((col*256,row*256,(col+1)*256,(row+1)*256)) for col in range(6)]
 # A common palette avoids frame-to-frame color flicker. Index 255 is transparent.
 palette_image=Image.new('RGB',(256*6,256),'white')
 for i,frame in enumerate(frames):palette_image.paste(frame.convert('RGB'),(i*256,0))
 palette=palette_image.quantize(colors=255,method=Image.Quantize.MEDIANCUT)
 encoded=[]
 for frame in frames:
  indexed=frame.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE)
  alpha=frame.getchannel('A');indexed.paste(255,mask=alpha.point(lambda x:255 if x<128 else 0))
  indexed.info['transparency']=255;encoded.append(indexed)
 sequence=[encoded[i] for i in [0,1,2,3,4,5,4,3,2,1]]
 sequence[0].save(out/f'surfy-{name}.gif',save_all=True,append_images=sequence[1:],duration=[700,150,150,150,150,400,150,150,150,150],loop=0,disposal=2,transparency=255,optimize=False)
 with Image.open(out/f'surfy-{name}.gif') as gif:
  assert gif.n_frames==10 and gif.info.get('loop')==0
  gif.convert('RGBA').save(out/f'surfy-{name}-still.png')
  print(name,gif.n_frames,'frames',sum(gif.seek(i) or gif.info.get('duration',0) for i in range(gif.n_frames)),'ms', (out/f'surfy-{name}.gif').stat().st_size,'bytes')
(work/'asset-notes.txt').write_text('Built-in image_gen used with the four existing Surfy cutouts as character references.\nPrompt: precise 6-column by 4-row transparent sprite sheet, 1536x1024. Row 1 pleased thumbs-up and head nod; row 2 friendly hand gesture; row 3 gentle stop hands and concerned head tilt; row 4 curious head tilt and magnifying glass. Preserve orange skin, red collared shirt, black shorts, barefoot character identity and illustration style. Small smooth movement; no labels or scenery.\nSource: surfy-risk-sprite.png.\nEncoding: equal 256px cells, common GIF palette, ten-frame forward/back loop, 2.5 seconds per loop, transparent GIF background. PNG first-frame fallback for reduced motion.\nRuntime files: frontend/public/assets/risk/surfy-{calm,caution,alert,curious}.gif and -still.png.\n',encoding='utf-8')
