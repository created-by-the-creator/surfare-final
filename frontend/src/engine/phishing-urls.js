import {PHISHING_URL_INDEX,PHISHING_URL_BYTES_BASE64} from './generated/phishing-url-data.js';
import {sha256Fingerprint} from './sha256.js';
let bytes;
function index(){
 if(bytes)return bytes;
 const decoded=atob(PHISHING_URL_BYTES_BASE64);
 if(decoded.length!==PHISHING_URL_INDEX.count*8)throw Error('Truncated offline URL reference');
 bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 return bytes;
}
export function matchesKnownPhishingUrl(value){
 let url;
 try{url=new URL(value);if(!['http:','https:'].includes(url.protocol))return false;}catch{return false;}
 const key=sha256Fingerprint(url.href);const data=index();
 const target=Uint8Array.from(key.match(/../g),v=>parseInt(v,16));
 let low=0,high=PHISHING_URL_INDEX.count-1;
 while(low<=high){
  const middle=(low+high)>>>1;let comparison=0;
  for(let i=0;i<8;i++){comparison=data[middle*8+i]-target[i];if(comparison)break;}
  if(comparison===0)return true;
  if(comparison<0)low=middle+1;else high=middle-1;
 }
 return false;
}
