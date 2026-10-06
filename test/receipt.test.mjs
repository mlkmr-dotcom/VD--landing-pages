import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_events.sql',import.meta.url),'utf8'));
 const DB={prepare(text){let args=[];return {bind(...v){args=v;return this;},async run(){const r=sql.prepare(text).run(...args);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
 const pending=[],ctx={waitUntil(p){pending.push(p)}};
 return {sql,DB,pending,ctx};
}
const host='chez.votredentisterie.com',path='/';
const lead=(extra={},hostname=host)=>new Request('https://'+hostname+'/api/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({'nom_et_prénom':'Test QA',email_:'qa@example.com','numéro_de_téléphone':'4505550100',event_id:'dcub-fictive-12345678',landing_path:path,ab_variant:'a',...extra})});
async function scenario(mode,fn){const s=setup(),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;await Promise.resolve();if(mode==='timeout')throw new Error('fictive timeout');return new Response('{}',{status:mode==='500'?500:200})};try{await fn({...s,env:{DB:s.DB,VISITOR_SALT:'fake',DEDUPE_REQUIRED:'1',GHL_WEBHOOK_URL:'https://hook.test/x'},calls:()=>calls});await Promise.all(s.pending);}finally{globalThis.fetch=original;s.sql.close();}}
test('20 replays concurrents : un seul relais, pas de succès pour les doublons',()=>scenario('ok',async s=>{const responses=await Promise.all(Array.from({length:20},()=>worker.fetch(lead(),s.env,s.ctx)));assert.equal(s.calls(),1);assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===409).length,19);assert.equal(s.sql.prepare('SELECT state FROM lead_receipts').get().state,'accepted');}));
test('replay après succès avec données changées : jamais de second relais',()=>scenario('ok',async s=>{await worker.fetch(lead(),s.env,s.ctx);const r=await worker.fetch(lead({email_:'changed@example.com'}),s.env,s.ctx);assert.equal(r.status,409);assert.equal(s.calls(),1);}));
for(const mode of ['timeout','500'])test(mode+' : réservation conservée, aucune relance',()=>scenario(mode,async s=>{const first=await worker.fetch(lead(),s.env,s.ctx);assert.equal(first.status,502);assert.equal((await worker.fetch(lead(),s.env,s.ctx)).status,409);assert.equal(s.calls(),1);assert.equal(s.sql.prepare('SELECT state FROM lead_receipts').get().state,mode==='timeout'?'uncertain':'rejected');}));
test('D1 absent : refus avant le webhook',async()=>{let calls=0;const real=globalThis.fetch;globalThis.fetch=async()=>{calls++;return new Response('{}')};try{const r=await worker.fetch(lead(),{DEDUPE_REQUIRED:'1',GHL_WEBHOOK_URL:'https://hook.test/x'},{waitUntil(){}});assert.equal(r.status,503);assert.equal(calls,0);}finally{globalThis.fetch=real;}});
test('aperçu sans marqueur et dry run : aucune réservation ni relais',()=>scenario('ok',async s=>{for(const [hostname,extra]of[['preview.workers.dev',{}],[host,{LEAD_DRY_RUN:'1'}]]){const r=await worker.fetch(lead({},hostname),{...s.env,...extra},s.ctx);assert.equal((await r.json()).dryRun,true);}assert.equal(s.calls(),0);assert.equal(s.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name='lead_receipts'").get().n,0);}));
test('registre : référence opaque et état uniquement, aucune donnée contact',()=>scenario('ok',async s=>{await worker.fetch(lead(),s.env,s.ctx);const row=s.sql.prepare('SELECT * FROM lead_receipts').get();assert.deepEqual(Object.keys(row),['event_id','state','created_at','updated_at']);assert.doesNotMatch(JSON.stringify(row),/example.com|4505550100|Test QA/);}));
