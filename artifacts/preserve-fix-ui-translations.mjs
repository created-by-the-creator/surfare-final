import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const git=(...args)=>execFileSync('git',['-c','safe.directory=C:/Users/kaixe/Desktop/surfare-final',...args],{encoding:'utf8'});
const backup={before:git('rev-parse','HEAD').trim(),target:git('rev-parse','origin/master').trim(),files:[]};
for(const lang of ['en','tl','taglish']){
 const path=`frontend/src/i18n/${lang}.json`;
 const base=JSON.parse(git('show',`HEAD:${path}`));
 const localText=await fs.readFile(path,'utf8');const local=JSON.parse(localText);
 const incoming=JSON.parse(git('show',`origin/master:${path}`));
 const changed=Object.keys({...base,...local}).filter(key=>base[key]!==local[key]);
 const conflicts=changed.filter(key=>incoming[key]!==base[key]&&incoming[key]!==local[key]);
 backup.files.push({path,localText,local,base,incoming,changed,conflicts});
}
await fs.writeFile('artifacts/fix-ui-translation-backup.json',JSON.stringify(backup,null,2));
console.log(JSON.stringify({before:backup.before,target:backup.target,files:backup.files.map(({path,changed,conflicts})=>({path,localChanges:changed.length,conflicts}))},null,2));
if(backup.files.some(file=>file.conflicts.length))process.exitCode=1;
