from PIL import Image
from pathlib import Path
root=Path.cwd();out=root/'frontend/public/assets/animated'
for name in ['tablet','lifeguard','surfer']:
 sheet=Image.open(root/f'artifacts/mascot-frames/{name}-sheet.png').convert('RGBA')
 frames=[sheet.crop((col*512,row*512,(col+1)*512,(row+1)*512)) for row in range(2) for col in range(3)]
 if name=='lifeguard':
  boxes=[f.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox() for f in frames]
  bounds=(max(0,min(b[0] for b in boxes)-12),max(0,min(b[1] for b in boxes)-12),min(512,max(b[2] for b in boxes)+12),min(512,max(b[3] for b in boxes)+12))
  frames=[f.crop(bounds) for f in frames]
 w,h=frames[0].size
 palette_source=Image.new('RGB',(w*6,h),'white')
 for i,f in enumerate(frames):palette_source.paste(f,(w*i,0),f)
 palette=palette_source.quantize(colors=255,method=Image.Quantize.MEDIANCUT)
 encoded=[]
 for f in frames:
  rgb=Image.new('RGB',f.size,'white');rgb.paste(f,mask=f.getchannel('A'))
  indexed=rgb.quantize(palette=palette,dither=Image.Dither.NONE)
  indexed.paste(255,mask=f.getchannel('A').point(lambda a:255 if a<128 else 0));indexed.info['transparency']=255
  encoded.append(indexed)
 encoded[0].save(out/f'surfy-{name}.gif',save_all=True,append_images=encoded[1:],duration=[650,180,120,180,180,700],loop=0,disposal=2,transparency=255,optimize=False)
 frames[0].save(out/f'surfy-{name}-still.png')
 with Image.open(out/f'surfy-{name}.gif') as gif:print(name,gif.size,gif.n_frames,(out/f'surfy-{name}.gif').stat().st_size)
