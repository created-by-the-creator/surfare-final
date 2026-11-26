from pathlib import Path
root=Path(__file__).resolve().parents[1]
s=(root/'artifacts/offline-audit-prepare.mjs').read_text(encoding='utf-8')
s=s.replace('artifacts/offline-improvement/audit','artifacts/offline-improvement/confirmation')
s=s.replace('surfare-offline-reserved-audit-v1-2026-11-26','surfare-offline-confirmation-v1-2026-11-26')
s=s.replace("for(const file of ['artifacts/corpus-evaluation-200/cases.json',","for(const file of ['artifacts/offline-improvement/audit/cases.json','artifacts/corpus-evaluation-200/cases.json',")
s=s.replace("const used=new Set(JSON.parse(fs.readFileSync('artifacts/corpus-evaluation-200/cases.json','utf8')).map(r=>r.group));", "const used=new Set(['artifacts/corpus-evaluation-200/cases.json','artifacts/offline-improvement/audit/cases.json'].flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')).map(r=>r.group)));")
(root/'artifacts/offline-confirmation-prepare.mjs').write_text(s,encoding='utf-8')
render=(root/'artifacts/offline-audit-render.py').read_text(encoding='utf-8').replace('artifacts/offline-improvement/audit','artifacts/offline-improvement/confirmation')
(root/'artifacts/offline-confirmation-render.py').write_text(render,encoding='utf-8')
