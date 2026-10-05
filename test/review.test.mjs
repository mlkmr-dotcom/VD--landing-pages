import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
const HOST='chez.votredentisterie.com', PATH='/';
const input={'nom_et_prénom':'Test QA',email_:'test@example.com','numéro_de_téléphone':'4505550100',event_id:'dcub-example-test0001',landing_path:PATH,ab_variant:'a'};
function post(host,data=input){return new Request('https://'+host+'/api/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});}
test('host non production sans marqueur QA : ni webhook ni publicités',async()=>{
 const real=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('preview must not transmit');};
 try{for(const host of ['example.workers.dev','version-example.workers.dev','localhost']){
  const env={GHL_WEBHOOK_URL:'https://hook.test/x',LEAD_DRY_RUN:'0',ASSETS:{fetch:async()=>new Response('<html>preview</html>')}};
  const res=await worker.fetch(post(host),env,{waitUntil(){}});
  assert.deepEqual(await res.json(),{ok:true,accepted:false,dryRun:true,qa:true});
  const page=await worker.fetch(new Request('https://'+host+PATH),env,{waitUntil(){}});
  assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);
 }assert.equal(calls,0);}finally{globalThis.fetch=real;}
});
test('formulaire organique sans UTM conserve la même source que sa visite',async()=>{
 const records=[],pending=[];
 const DB={batch:async()=>[],prepare(sql){return {bind(...args){return {run:async()=>records.push({sql,args})}}};}};
 const env={GHL_WEBHOOK_URL:'https://hook.test/x',DB,VISITOR_SALT:'fake-test-salt'};
 const ctx={waitUntil(p){pending.push(p);}};
 const real=globalThis.fetch;globalThis.fetch=async()=>new Response('{}');
 try{
 const res=await worker.fetch(post(HOST,{...input,referrer_host:'www.google.com'}),env,ctx);
 assert.equal((await res.json()).accepted,true);
 await Promise.all(pending);
 assert.equal(records.length,1);assert.equal(records[0].args[5],'lead');assert.equal(records[0].args[8],'google_organic');assert.equal(records[0].args[12],0);
 }finally{globalThis.fetch=real;}
});
