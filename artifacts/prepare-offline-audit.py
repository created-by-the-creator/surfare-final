from pathlib import Path
root=Path(__file__).resolve().parents[1]
(root/'artifacts/offline-improvement').mkdir(exist_ok=True)
s=(root/'artifacts/corpus200-prepare.mjs').read_text(encoding='utf-8')
replacements=[
 ('artifacts/corpus-evaluation-200','artifacts/offline-improvement/audit'),
 ('surfare-corpus-200-v1-2026-11-26','surfare-offline-reserved-audit-v1-2026-11-26'),
 ("'backend/evaluation/local-messages/messages.json',","'artifacts/corpus-evaluation-200/cases.json','backend/evaluation/local-messages/messages.json',"),
 ("take('asea',true,25);take('asea',false,6);take('imc25',true,38);","take('asea',true,50);take('asea',false,12);take('imc25',true,76);"),
 ('take(source,false,14)','take(source,false,28)'),
 ("take('phiusiil',true,37);take('phiusiil',false,38);","take('phiusiil',true,74);take('phiusiil',false,76);"),
 ('slice(0,25)','slice(0,50)'),('slice(25,50)','slice(50,100)'),('slice(50)','slice(100)'),
 ('urlPositive.slice(25)','urlPositive.slice(50)'),('urlNegative.slice(25)','urlNegative.slice(50)'),
 ('positive.length!==25','positive.length!==50'),('negative.length!==25','negative.length!==50'),
 ('i<25;i++','i<50;i++'),('cases.length!==200','cases.length!==400'),('size!==200','size!==400'),
 ('200 distinct dataset-derived source groups; 50 per modality, each 25 positive and 25 negative','400 new dataset-derived source groups; 100 per modality, each 50 positive and 50 negative'),
 ("const used=new Set();const selected=[];","const used=new Set(JSON.parse(fs.readFileSync('artifacts/corpus-evaluation-200/cases.json','utf8')).map(r=>r.group));const selected=[];"),
]
for a,b in replacements:
 assert a in s,a
 s=s.replace(a,b)
(root/'artifacts/offline-audit-prepare.mjs').write_text(s,encoding='utf-8')
render=(root/'artifacts/corpus200-render.py').read_text(encoding='utf-8').replace("root/'artifacts/corpus-evaluation-200'","root/'artifacts/offline-improvement/audit'")
(root/'artifacts/offline-audit-render.py').write_text(render,encoding='utf-8')
