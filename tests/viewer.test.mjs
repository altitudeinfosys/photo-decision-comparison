import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { FIELDS, validateDataset, esc, money, costSum, modelDetail, photoCopy } from '../dataset.mjs';
const root = new URL('../',import.meta.url);
const base = JSON.parse(fs.readFileSync(new URL('dataset.json',root),'utf8'));
const clone = () => structuredClone(base);
function recorded() {
 const data=clone();data.datasetType='recorded';data.cases.forEach(c=>Object.values(c.models).forEach(m=>m.status='recorded'));return data;
}
function browserContext(data) {
 const nodes=new Map(),listeners=new Map();
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',value:'',dataset:{},classList:{toggle(){}},setAttribute(){},addEventListener(){},showModal(){},close(){}});return nodes.get(selector)};
 const context=vm.createContext({FIELDS,validateDataset,esc,money,costSum,modelDetail,photoCopy,document:{querySelector:node,querySelectorAll:()=>[],addEventListener(name,handler){listeners.set(name,handler)},body:{classList:{toggle(){}}},activeElement:{tagName:'BODY'}},fetch:()=>({then(){return this},catch(){}}),console});
 vm.runInContext(fs.readFileSync(new URL('app.js',root),'utf8').replace(/^import[^\n]+\n/,''),context);
 context.fixture=data;vm.runInContext('state.data=fixture;state.selected=fixture.cases[0].id;',context);
 return {node,run:code=>vm.runInContext(code,context),fire:(name,event)=>listeners.get(name)(event)};
}
test('three synthetic examples: illustrations, fictional statuses and null metrics',()=>{
 const data=validateDataset(clone());assert.equal(data.cases.length,3);
 for(const c of data.cases){assert.ok(c.photos.every(p=>p.kind==='synthetic illustration'&&p.publicApproved));for(const m of Object.values(c.models)){assert.equal(m.status,'synthetic example');for(const key of ['inputTokens','latencyMs','actualCostUsd','estimatedCostUsd'])assert.equal(m[key],null)}}
});
test('string IDs/labels required; attribute-like IDs and duplicates rejected',()=>{
 for(const value of ['x" onclick="alert(1)',{},1,'','a/b']){const d=clone();d.cases[0].id=value;assert.throws(()=>validateDataset(d),/ID/)}
 const d=clone();d.cases[1].id=d.cases[0].id;assert.throws(()=>validateDataset(d),/ID/);
 for(const key of ['label','sourceLabel','optionSet','batch']){const bad=clone();bad.cases[0][key]={};assert.throws(()=>validateDataset(bad))}
});
test('typed fields, strict allowlist and local asset paths reject raw metadata and links',()=>{
 for(const value of [{},42,[]]){const d=clone();d.cases[0].models.clef.fields.Trade=value;assert.throws(()=>validateDataset(d))}
 const d=clone();d.rawRequest={};assert.throws(()=>validateDataset(d),/Unexpected/);
 const link=clone();link.sourceUrl='javascript:alert(1)';assert.throws(()=>validateDataset(link),/links/);
 for(const value of ['../private.jpg','assets/../photo.jpg','https://example.invalid/a.jpg','assets/a.svg#fragment','assets//a.svg']){const bad=clone();bad.cases[0].photos[0].src=value;assert.throws(()=>validateDataset(bad),/path/)}
});
test('all case attributes and gallery aria-labels escape hostile strings',()=>{
 const d=clone();d.cases[0].label='A" autofocus onfocus="alert(1) <img>';d.cases[0].id='unsafe" onclick="alert(1)';
 const b=browserContext(d); // bypass validation to test escaping independently
 for(const tab of ['photos','clef','openai','compare']){b.run(`state.tab='${tab}';render()`);const html=b.node('#view').innerHTML;assert.ok(html.includes('data-case="unsafe&quot; onclick=&quot;alert(1)"'));assert.ok(!html.includes('data-case="unsafe" onclick="'));assert.ok(!html.includes('A" autofocus onfocus="'))}
 b.run("state.tab='photos';render()");assert.ok(b.node('#view').innerHTML.includes('aria-label="Compare A&quot; autofocus onfocus=&quot;alert(1) &lt;img&gt;"'));
});
test('synthetic illustration and model copy never claims measured provider output',()=>{
 assert.equal(photoCopy(base).heading,'Synthetic illustration');assert.match(photoCopy(base).caption,/fictional/);assert.match(modelDetail(base),/Fictional/);
 const b=browserContext(clone());b.run('render()');const html=b.node('#view').innerHTML;assert.match(html,/Synthetic illustration/);assert.match(html,/no provider call/);assert.doesNotMatch(html,/metadata removed|Private display copy| · saved output/);
});
test('numeric zero costs display $0.00; null/missing remain unavailable',()=>{
 assert.equal(money(0),'$0.00');assert.equal(money(1),'$1.00');assert.equal(money(.0012),'$0.0012');for(const value of [null,undefined,NaN,'0'])assert.equal(money(value),'Not available');assert.equal(costSum(base.cases,'clef'),null);
 const d=recorded();d.cases.forEach(c=>c.models.clef.estimatedCostUsd=0);assert.equal(costSum(d.cases,'clef'),0);const b=browserContext(d);b.run('render()');assert.match(b.node('#summary').innerHTML,/\$0\.00/);d.cases[0].models.clef.estimatedCostUsd=null;assert.equal(costSum(d.cases,'clef'),null);
});
test('recorded About uses escaped dataset provenance and generic limitations',()=>{
 const d=recorded();d.provenance=['Example source <script>unsafe</script>'];d.photosNote='Owner-supplied notes';const b=browserContext(d);b.run('about()');const html=b.node('#provenance').innerHTML;assert.ok(html.includes(esc(d.provenance[0])));assert.match(html,/replays saved dataset rows/);assert.doesNotMatch(html,/frozen options|recorded photo tests|Source labels Sample|historical \d+/);assert.ok(!html.includes('<script>unsafe'));
});
test('synthetic measurements and invalid recorded metrics are rejected',()=>{
 const d=clone();d.cases[0].models.clef.estimatedCostUsd=0;assert.throws(()=>validateDataset(d),/Synthetic metrics/);for(const value of [-1,Infinity,'0']){const bad=recorded();bad.cases[0].models.clef.estimatedCostUsd=value;assert.throws(()=>validateDataset(bad),/numeric/)}
});
test('adapter normalizes missing metrics and preserves input/existing output',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'comparison-adapter-'));
 try{const input=path.join(tmp,'input.json'),output=path.join(tmp,'output.json'),d=clone();delete d.cases[0].models.clef.inputTokens;const original=JSON.stringify(d);fs.writeFileSync(input,original);const execute=(a,b)=>spawnSync(process.execPath,[new URL('adapt-dataset.mjs',root).pathname,a,b],{encoding:'utf8'});assert.equal(execute(input,output).status,0);assert.equal(fs.readFileSync(input,'utf8'),original);assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).cases[0].models.clef.inputTokens,null);assert.notEqual(execute(input,output).status,0);assert.notEqual(execute(input,input).status,0)}finally{fs.rmSync(tmp,{recursive:true,force:true})}
});

test('delegated keyboard/click handlers tolerate non-element event targets',()=>{const b=browserContext(clone());assert.doesNotThrow(()=>b.fire('click',{target:{}}));assert.doesNotThrow(()=>b.fire('keydown',{target:{},key:'Escape'}));});
