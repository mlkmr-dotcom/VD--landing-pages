import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
// All browser network and analytics APIs are mocked; no real lead or message.
const code=readFileSync(new URL('../src/shared/lp.js',import.meta.url),'utf8');
async function scenario(name, options={}){
  const listeners={},requests=[],beacons=[],dataLayer=[],clarityCalls=[],storage=new Map();
  let generatedIds=0; const elements=[]; elements.namedItem=name=>elements.find(el=>el.name===name)||null;
  const button={disabled:false},form={elements,hidden:false,reportValidity:()=>options.valid!==false,
    querySelector:()=>button,appendChild:el=>elements.push(el),addEventListener(){},setAttribute(){},reset(){}};
  const title={textContent:'Votre demande a été envoyée.'},note={textContent:'Confirmation normale'};
  const success={hidden:true,querySelector:s=>s==='h3'?title:s==='p'?note:null,focus(){},scrollIntoView(){}},error={hidden:true,firstChild:{nodeType:3,nodeValue:'Default error'}};
  const page={dataset:{language:'fr-CA'}},doc={readyState:'complete',referrer:options.referrer||'',visibilityState:'visible',
    documentElement:{scrollHeight:1000},body:{scrollHeight:1000},
    querySelector:s=>s==='#vd-page form#dc-form'?form:null,
    getElementById:id=>({'vd-page':page,'dc-success':success,'dc-form-error':error}[id]||null),
    createElement:()=>({}),addEventListener(){}};
  const win={__dcLp:{pageId:'vd-iberville-general',pagePath:'/',variant:'a',test:'vd-iberville-2026-10',measure:{}},
    location:{search:options.search||'',hostname:'chez.votredentisterie.com'},dataLayer,clarity:(...args)=>clarityCalls.push(args),
    sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null},
    crypto:{randomUUID:()=> 'offline-example-id-'+(++generatedIds)},navigator:{sendBeacon:(path,body)=>{beacons.push(path);return true;}},
    addEventListener:(event,handler)=>{listeners[event]=handler;},removeEventListener(){},
    setInterval:()=>1,clearInterval(){},setTimeout:()=>1,innerHeight:600,
    fetch:async(path,request)=>{requests.push({path,request});
      if(options.networkError)throw new Error('offline simulated failure');
      const simulated=options.responses?.[requests.length-1];
      return {ok:simulated?simulated.httpOk!==false:options.httpOk!==false,json:async()=>simulated?.response??options.response??{ok:true,accepted:true}};}};
  vm.runInNewContext(code,{window:win,document:doc,URL,URLSearchParams,Blob,Date,JSON,Math},{timeout:1000});
  const submit=()=>listeners.submit({target:form,preventDefault(){},stopImmediatePropagation(){}});
  submit();if(options.doubleSubmit)submit();
  for(let i=0;i<8;i++)await Promise.resolve();
  if(options.retry){if(options.changeBeforeRetry)elements.push({name:'extra',type:'text',value:'changed fictive payload'});submit();for(let i=0;i<8;i++)await Promise.resolve();}
  if(options.thirdChangedRetry){elements.push({name:'changed',type:'text',value:'different fictive payload'});submit();for(let i=0;i<8;i++)await Promise.resolve();}
  const events=dataLayer.filter(x=>x.event==='vd_lp_form_success');
  assert.equal(events.length,options.expectedEvents??1,name);
  const leadMeasures=clarityCalls.filter(c=>c[0]==='event'&&c[1]==='lead_accepted');
  const upgrades=clarityCalls.filter(c=>c[0]==='upgrade'&&c[1]==='lead');
  assert.equal(leadMeasures.length,options.expectedEvents??1,name+' Clarity lead');
  assert.equal(upgrades.length,options.expectedEvents??1,name+' Clarity upgrade');
  if(options.restored){assert.match(error.firstChild.nodeValue,/pas pu confirmer/);assert.doesNotMatch(error.firstChild.nodeValue,/déjà été tentée|réessayer/);}
  if(options.duplicate)assert.match(error.firstChild.nodeValue,/vérifier sa réception/);
  if(options.qaMessage)assert.match(title.textContent,/aucune demande envoyée/);
  if(options.expectedEvents===undefined)assert.equal(title.textContent,'Votre demande a été envoyée.');
  assert.equal(requests.length,options.valid===false?0:options.thirdChangedRetry?3:options.retry?2:1,name+' number of POST requests');
  if(options.retry){const [a,b]=requests.map(r=>JSON.parse(r.request.body).event_id);if(options.changeBeforeRetry)assert.notEqual(a,b);else assert.equal(a,b);}
  if(events.length){
    const payload=JSON.parse(requests[0].request.body),event=events[0];
    if(options.referrer)assert.equal(payload.referrer_host,new URL(options.referrer).hostname);
    assert.equal(event.event_id,payload.event_id);assert.equal(event.clinic_id,'vd-iberville');
    assert.equal(event.lp_page_id,'vd-iberville-general');assert.equal(event.tracking_schema,'vd_lp_success_v1');
    assert.deepEqual(Object.keys(event).sort(),['event','event_id','clinic_id','service','language','page_path','lp_page_id','tracking_schema','ab_test','ab_variant'].sort());
  }
  return {name,passed:true,postRequests:requests.length,successEvents:events.length,realNetworkRequests:0};
}

const cases=[['accepted'],['invalid form',{valid:false,expectedEvents:0}],
 ['HTTP rejection',{httpOk:false,expectedEvents:0}],['logical rejection',{response:{ok:false,accepted:false},expectedEvents:0}],
 ['not accepted',{response:{ok:true,accepted:false},expectedEvents:0}],
 ['dry run',{response:{ok:true,accepted:true,dryRun:true},expectedEvents:0,qaMessage:true}],
 ['server QA',{response:{ok:true,accepted:true,qa:true},expectedEvents:0,qaMessage:true}],
 ['browser QA',{search:'?dc_qa=1',expectedEvents:0,qaMessage:true}],
 ['variant preview',{search:'?dc_variant=b',expectedEvents:0,qaMessage:true}],
 ['isolated dry run result',{response:{ok:true,accepted:false,dryRun:true,qa:true},expectedEvents:0,qaMessage:true}],
 ['network failure',{networkError:true,expectedEvents:0}],['double submit while pending',{doubleSubmit:true}]];
for(const [name,options]of cases)test('browser runtime: '+name,()=>scenario(name,options));

test('browser runtime: source organique dans le formulaire',()=>scenario('organic',{referrer:'https://www.google.com/search?q=example'}));

test('browser runtime: reprise identique après réseau perdu',()=>scenario('retry',{retry:true,networkError:true,expectedEvents:0}));
test('browser runtime: nouvelle référence si contenu modifié',()=>scenario('changed retry',{retry:true,changeBeforeRetry:true,networkError:true,expectedEvents:0}));

test('référence déjà tentée : message prudent et aucune conversion',()=>scenario('duplicate',{duplicate:true,httpOk:false,response:{ok:false,error:'duplicate_request'},expectedEvents:0}));

test('message de panne cohérent sans proposer un renvoi bloqué',()=>scenario('failure message',{networkError:true,restored:true,expectedEvents:0}));
test('message 409 remplacé après contenu modifié puis nouvel échec',()=>scenario('restored message',{retry:true,thirdChangedRetry:true,restored:true,expectedEvents:0,responses:[{httpOk:false,response:{ok:false,error:'upstream'}},{httpOk:false,response:{ok:false,error:'duplicate_request'}},{httpOk:false,response:{ok:false,error:'upstream'}}]}));

for(const search of ['?dc_variant','?dc_variant=','?%64c_variant=b','?dc_qa=%31']) test('aperçu sans valeur ou encodé : aucune conversion '+search,()=>scenario('preview marker',{search,expectedEvents:0,qaMessage:true,response:{ok:true,accepted:false,dryRun:true,qa:true}}));
