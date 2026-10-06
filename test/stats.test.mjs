import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { renderStats } from '../src/stats.js';
import { PAGES } from '../src/config.js';

const [pagePath,page]=Object.entries(PAGES)[0];
const day='2026-10-05';
function database(events) {
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../migrations/0001_events.sql',import.meta.url),'utf8'));
 const insert=sqlite.prepare('INSERT INTO events (ts,day,page,test,variant,kind,visitor,device,source,qa) VALUES (?,?,?,?,?,?,?,?,?,?)');
 events.forEach((e,i)=>insert.run(e.ts??i+1,e.day??day,e.page??pagePath,e.test??page.test.id,e.variant??'a',e.kind,e.visitor??'visitor-one',e.device??'mobile',e.source??'google',e.qa??0));
 const results=[];
 const db={
  prepare(sql){return {sql,bind(...args){return {async all(){const rows=sqlite.prepare(sql).all(...args);results.push({sql,rows});return {results:rows};}};}};},
  async batch(statements){statements.forEach(s=>sqlite.exec(s.sql));return [];}
 };
 return {db,results,close:()=>sqlite.close()};
}
async function stats(events){
 const d=database(events);
 const url=new URL('https://example.invalid/stats?from='+day+'&to='+day+'&page='+encodeURIComponent(pagePath));
 try {
  const response=await renderStats(new Request(url,{headers:{'x-stats-key':'fixture-only'}}),{STATS_KEY:'fixture-only',DB:d.db},url);
  assert.equal(response.status,200);
  return {html:await response.text(),queries:d.results};
 } finally {d.close();}
}
function variants(r){return r.queries.find(q=>q.sql.includes('0 visitors')).rows;}
test('Repeated forms and telephone clicks cannot inflate the binary form rate',async()=>{
 const r=await stats([{kind:'view'},...Array.from({length:3},()=>({kind:'lead'})),...Array.from({length:15},()=>({kind:'tel'}))]);
 const a=variants(r)[0];assert.equal(a.leads,3);assert.equal(a.converted_visitors,1);assert.equal(a.tel,15);
 assert.match(r.html,/100\.0 %/);assert.doesNotMatch(r.html,/Demandes \+ appels|Contacts \(demandes|Décision : [AB] gagne/);
});
test('A success without a preceding matching exposure remains a raw receipt only',async()=>{
 const r=await stats([{kind:'lead'},{kind:'view',visitor:'another-visitor'}]);
 assert.equal(variants(r)[0].leads,1);assert.equal(variants(r)[0].converted_visitors,0);
});
test('An exposure after the receipt cannot retroactively qualify it',async()=>{
 const r=await stats([{kind:'lead',ts:10},{kind:'view',ts:20}]);
 assert.equal(variants(r)[0].converted_visitors,0);
});
test('QA events, other experiments, empty visitors and cross-variant exposures are excluded',async()=>{
 const r=await stats([{kind:'view',variant:'a'},{kind:'lead',variant:'b'},{kind:'lead',qa:1},{kind:'lead',test:'previous-test'},{kind:'view',visitor:''},{kind:'lead',visitor:''}]);
 const a=variants(r).find(x=>x.variant==='a'),b=variants(r).find(x=>x.variant==='b');
 assert.equal(a.leads,1);assert.equal(a.converted_visitors,0);assert.equal(b.converted_visitors,0);
 const exposures=r.queries.find(q=>q.sql.includes('COUNT(*) visitors')).rows;
 assert.equal(exposures.find(x=>x.variant==='a').visitors,1);
});
test('Source and device rates require an exposure in their own group',async()=>{
 const r=await stats([{kind:'view'},{kind:'lead',source:'meta',device:'desktop'}]);
 assert.equal(variants(r)[0].converted_visitors,1);
 assert.equal(r.queries.find(q=>q.sql.includes('GROUP BY source')).rows.find(x=>x.source==='meta').converted_visitors,0);
 assert.equal(r.queries.find(q=>q.sql.includes('GROUP BY device, variant')).rows.find(x=>x.device==='desktop').converted_visitors,0);
});
test('Empty data shows no winner and explicitly distinguishes the CRM receipt',async()=>{
 const r=await stats([]);assert.match(r.html,/Pas encore de données/);assert.match(r.html,/visiteurs-jours/);assert.match(r.html,/réception CRM/);assert.doesNotMatch(r.html,/NaN|Infinity/);
});

