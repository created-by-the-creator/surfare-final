import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {OFFLINE_PACK_BYTES,OFFLINE_STORAGE_BYTES,OFFLINE_RESOURCES} from '../frontend/src/offline/resources.js';
const root='frontend/dist';const files=[];
function scan(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())scan(f);else files.push({file:f.replaceAll('\\','/'),bytes:fs.statSync(f).size});}}
scan(root);
const sw=fs.readFileSync(root+'/sw.js','utf8');
const urls=[...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map(m=>m[1]);
const pre=urls.map(p=>files.find(f=>f.file===root+'/'+p.replace(/^\//,''))).filter(Boolean);
const wasm=files.filter(f=>f.file.includes('/assets/')&&f.file.endsWith('.wasm'));
const total=files.reduce((s,f)=>s+f.bytes,0);
const compressed=f=>/\.(js|css|html|json|svg|txt|wasm)$/.test(f.file)?zlib.gzipSync(fs.readFileSync(f.file)).length:f.bytes;
const report={measuredAt:new Date().toISOString(),units:'Decimal MB = 1,000,000 bytes; sizes exclude browser/OS installation overhead.',sameWebBuildOnMobileAndDesktop:true,precacheEntries:urls.length,precacheBytes:pre.reduce((s,f)=>s+f.bytes,0),ocrDownloadBytes:OFFLINE_PACK_BYTES,ocrDecodedStorageBytes:OFFLINE_STORAGE_BYTES,optionalWasm:wasm,allBuildBytes:total,corePlusOcrBytes:total-wasm.reduce((s,f)=>s+f.bytes,0),allFilesGzipEstimateBytes:files.reduce((s,f)=>s+compressed(f),0),corePlusOcrGzipEstimateBytes:files.filter(f=>!wasm.includes(f)).reduce((s,f)=>s+compressed(f),0),remaining:files.filter(f=>!pre.includes(f)&&!OFFLINE_RESOURCES.some(r=>f.file===root+r.url)&&!wasm.includes(f))};
fs.writeFileSync('artifacts/download-size.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
