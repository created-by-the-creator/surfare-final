import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWithBackup} from '../server/services/ai-generation.js';
const env={OPENROUTER_API_KEY:'test-openrouter-switching',GEMINI_API_KEY:'test-gemini-switching'};
const options={env,instruction:'Test',input:'Test',schema:{type:'object',properties:{ok:{type:'boolean'}}},timeoutMs:2000};
const success=(url,request)=>url.includes('openrouter.ai')
 ? Response.json({model:JSON.parse(request.body).model,choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]})
 : Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]});
for(const hedgeAfterMs of [undefined,60000])test(`switches both directions, remembers healthy provider, and respects cooldown (hedge ${hedgeAfterMs})`,async t=>{
 let now=100000,limited='openrouter';t.mock.method(Date,'now',()=>now);const calls=[];
 const fetcher=async(url,request)=>{const provider=url.includes('openrouter.ai')?'openrouter':'gemini';calls.push(provider);return provider===limited?Response.json({}, {status:429,headers:{'Retry-After':'2'}}):success(url,request);};
 const run=()=>generateWithBackup({...options,hedgeAfterMs,fetcher});
 assert.equal((await run()).provider,'gemini');assert.deepEqual(calls,['openrouter','gemini']);
 calls.length=0;assert.equal((await run()).provider,'gemini');assert.deepEqual(calls,['gemini']);
 now+=3000;limited='gemini';calls.length=0;assert.equal((await run()).provider,'openrouter');assert.deepEqual(calls,['gemini','openrouter']);
 now+=3000;limited='openrouter';calls.length=0;assert.equal((await run()).provider,'gemini');assert.deepEqual(calls,['openrouter','gemini']);
});
for(const retryAfter of ['3','Thu, 01 Jan 1970 00:01:43 GMT',null])test(`both providers limited stop without loops and recover after Retry-After ${retryAfter}`,async t=>{
 let now=100000,limited=true;t.mock.method(Date,'now',()=>now);let calls=0;
 const fetcher=async(url,request)=>{calls++;return limited?Response.json({}, {status:429,headers:retryAfter?{'Retry-After':retryAfter}:{}}):success(url,request);};
 const run=()=>generateWithBackup({...options,fetcher});
 assert.equal((await run()).status,'unavailable');assert.equal(calls,3);
 assert.equal((await run()).status,'unavailable');assert.equal(calls,3,'cooling providers are not retried');
 limited=false;now+=retryAfter?3001:60001;assert.equal((await run()).status,'completed');assert.equal(calls,4);
});
test('cooldowns do not leak between credentials',async()=>{
 let limited=true;const calls=[];const fetcher=async(url,request)=>{calls.push(url);return limited?Response.json({}, {status:429}):success(url,request);};
 await generateWithBackup({...options,fetcher});limited=false;calls.length=0;
 const result=await generateWithBackup({...options,env:{OPENROUTER_API_KEY:'another-openrouter-test-key'},fetcher});
 assert.equal(result.provider,'openrouter');assert.equal(calls.length,1);
});
