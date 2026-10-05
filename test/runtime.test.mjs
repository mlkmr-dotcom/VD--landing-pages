import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
// All browser network and analytics APIs are mocked; no real lead or message.
const code=readFileSync(new URL('../src/shared/lp.js',import.meta.url),'utf8');
async function scenario(name, options={}){
  const listeners={},requests=[],beacons=[],dataLayer=[],clarityCalls=[],storage=new Map();
  const elements=[]; elements.namedItem=name=>elements.find(el=>el.name===name)||null;
  const button={disabled:false},form={elements,hidden:false,reportValidity:()=>options.valid!==false,
    querySelector:()=>button,appendChild:el=>elements.push(el),addEventListener(){},setAttribute(){},reset(){}};
  const title={textContent:'Votre demande a été envoyée.'},note={textContent:'Confirmation normale'};
  const success={hidden:true,querySelector:s=>s==='h3'?title:s==='p'?note:null,focus(){},scrollIntoView(){}},error={hidden:true};
  const page={dataset:{language:'fr-CA'}},doc={readyState:'complete',referrer:'',visibilityState:'visible',
    documentElement:{scrollHeight:1000},body:{scrollHeight:1000},
    querySelector:s=>s==='#vd-page form#dc-form'?form:null,
    getElementById:id=>({'vd-page':page,'dc-success':success,'dc-form-error':error}[id]||null),
    createElement:()=>({}),addEventListener(){}};
  const win={__dcLp:{pageId:'vd-iberville-general',pagePath:'/',variant:'a',test:'vd-iberville-2026-10',measure:{}},
    location:{search:options.search||'',hostname:'chez.votredentisterie.com'},dataLayer,clarity:(...args)=>clarityCalls.push(args),
    sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null},
    crypto:{randomUUID:()=> 'offline-example-id'},navigator:{sendBeacon:(path,body)=>{beacons.push(path);return true;}},
    addEventListener:(event,handler)=>{listeners[event]=handler;},removeEventListener(){},
    setInterval:()=>1,clearInterval(){},setTimeout:()=>1,innerHeight:600,
    fetch:async(path,request)=>{requests.push({path,request});
      if(options.networkError)throw new Error('offline simulated failure');
      return {ok:options.httpOk!==false,json:async()=>options.response??{ok:true,accepted:true}};}};
  vm.runInNewContext(code,{window:win,document:doc,URL,URLSearchParams,Blob,Date,JSON,Math},{timeout:1000});
  const submit=()=>listeners.submit({target:form,preventDefault(){},stopImmediatePropagation(){}});
  submit();if(options.doubleSubmit)submit();
  for(let i=0;i<8;i++)await Promise.resolve();
  const events=dataLayer.filter(x=>x.event==='vd_lp_form_success');
  assert.equal(events.length,options.expectedEvents??1,name);
  const leadMeasures=clarityCalls.filter(c=>c[0]==='event'&&c[1]==='lead_accepted');
  const upgrades=clarityCalls.filter(c=>c[0]==='upgrade'&&c[1]==='lead');
  assert.equal(leadMeasures.length,options.expectedEvents??1,name+' Clarity lead');
  assert.equal(upgrades.length,options.expectedEvents??1,name+' Clarity upgrade');
  if(options.qaMessage)assert.match(title.textContent,/aucune demande envoyée/);
  if(options.expectedEvents===undefined)assert.equal(title.textContent,'Votre demande a été envoyée.');
  assert.equal(requests.length,options.valid===false?0:1,name+' number of POST requests');
  if(events.length){
    const payload=JSON.parse(requests[0].request.body),event=events[0];
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
