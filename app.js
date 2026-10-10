import { FIELDS, validateDataset, esc, money, costSum, modelDetail, photoCopy } from './dataset.mjs';
const MODELS={clef:{name:'Clef',mark:'C'},flash:{name:'Clef Flash',mark:'C'},openai:{name:'OpenAI Decisions',mark:'O'}};
const state={data:null,tab:'compare',model:'clef',selected:'',query:'',difference:'all',photo:0,focus:false};
const $=s=>document.querySelector(s);
const fieldsOf=(c,id)=>c.models[id]?.fields??{};
const differences=c=>FIELDS.filter(k=>fieldsOf(c,state.model)[k]!==fieldsOf(c,'openai')[k]);
const currentCases=()=>state.data.cases.filter(c=>{
 const q=state.query.trim().toLowerCase();
 const text=[c.id,c.label,c.sourceLabel,...Object.values(c.models).flatMap(m=>Object.values(m.fields??{}))].join(' ').toLowerCase();
 const diff=differences(c);
 return (!q||text.includes(q))&&(state.difference==='all'||(state.difference==='same'?diff.length===0:diff.includes(state.difference)));
});
function updateSummary(){
 const cases=state.data.cases,photoCount=cases.reduce((s,c)=>s+c.photos.length,0);
 $('#photoCount').textContent=photoCount;
 $('#summary').innerHTML=`<div class="stat"><strong>${cases.length}<span class="small"> cases</span></strong><span class="label">${photoCount} ${state.data.datasetType==='synthetic'?'illustrations':'images'} · 3 models</span><span class="small">Dataset ${esc(state.data.recordedDate||'dataset')}</span></div><div class="stat"><strong>${money(costSum(cases,state.model))}</strong><span class="label">${MODELS[state.model].name} · input estimate</span><span class="small">USD · ${cases.length} ${state.data.datasetType==='synthetic'?'fictional rows':'saved rows'}</span></div><div class="stat"><strong>${money(costSum(cases,'openai'))}</strong><span class="label">OpenAI · input estimate</span><span class="small">USD · ${cases.length} ${state.data.datasetType==='synthetic'?'fictional rows':'saved rows'}</span></div>`;
}
function photoHTML(c){
 const copy=photoCopy(state.data);
 const p=c.photos[state.photo]||c.photos[0];
 if(!p)return '<div class="photo-fail">No image is available for this case.</div>';
 return `<div class="photo-head"><b>${esc(copy.heading)}</b><span>${Math.min(state.photo+1,c.photos.length)} / ${c.photos.length}</span></div><div class="main-photo-wrap"><img src="${esc(p.src)}" alt="${esc(p.alt)}" data-error="photo" /></div><div class="thumbs" aria-label="Case images">${c.photos.map((p,i)=>`<button class="${i===state.photo?'active':''}" data-photo="${i}" aria-label="Show image ${i+1}" aria-pressed="${i===state.photo}"><img src="${esc(p.src)}" alt="" /></button>`).join('')}</div><p class="photo-caption">${esc(copy.caption)}</p>`;
}
function metricsHTML(m){
 return `<div class="metrics"><div class="cost"><strong>${money(m?.estimatedCostUsd)}</strong><small>USD · estimated input cost</small><small>Actual charge: ${m?.actualCostUsd==null?'not available':money(m.actualCostUsd)}</small></div><div class="timing">${m?.latencyMs==null?'Unavailable':m.latencyMs.toLocaleString()+' ms'}<small>${m?.inputTokens==null?'Tokens not available':m.inputTokens.toLocaleString()+' input tokens'}</small></div></div>`;
}
function resultHTML(c,id,highlight=true){
 const m=c.models[id]; if(!m)return `<div class="empty"><h2>${MODELS[id].name}</h2><p>Saved output is unavailable.</p></div>`;
 const diff=highlight?differences(c):[];
 return `<div class="result-top"><div><h3 class="model-title"><span class="model-mark">${MODELS[id].mark}</span>${MODELS[id].name}</h3><span class="recorded">${esc(modelDetail(state.data))}</span></div><span class="recorded">${m.status==='recorded'?'REPLAY':esc(m.status||'UNAVAILABLE')}</span></div><dl class="fields">${FIELDS.map(k=>`<div class="field ${diff.includes(k)?'different':''}"><dt>${k}${diff.includes(k)?' ↔':''}</dt><dd>${esc(m.fields[k]??'Not available')}</dd></div>`).join('')}</dl>${metricsHTML(m)}`;
}
function render(){
 if(!state.data)return; updateSummary();
 const cases=currentCases();
 $('#caseCount').textContent=`Showing ${cases.length} of ${state.data.cases.length} cases`;
 $('.view-meta span:last-child').textContent=`Comparing ${MODELS[state.model].name} with OpenAI · amber = different`;
 document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===state.tab);b.setAttribute('aria-selected',String(b.dataset.tab===state.tab));b.tabIndex=b.dataset.tab===state.tab?0:-1});
 $('#view').setAttribute('aria-labelledby','tab-'+state.tab);
 if(!cases.length){$('#view').innerHTML='<div class="empty"><h2>No matching cases</h2><p>Try another search or difference filter.</p><button class="outline" data-reset>Clear filters</button></div>';$('#focusCase').textContent='No matching cases';return;}
 if(!cases.some(c=>c.id===state.selected)){state.selected=cases[0].id;state.photo=0;}
 const c=cases.find(c=>c.id===state.selected),idx=cases.indexOf(c);
 $('#focusCase').textContent=`${c.label} · ${idx+1} / ${cases.length}`;
 for(const id of ['#focusPrevious','#focusNext'])$(id).disabled=cases.length<2;
 if(state.tab==='photos'){
  $('#view').innerHTML=`<div class="gallery">${cases.map(c=>`<button class="gallery-card" data-case="${esc(c.id)}" aria-label="Compare ${esc(c.label)}"><div class="gallery-image">${c.photos[0]?`<img loading="lazy" src="${esc(c.photos[0].src)}" alt="${esc(c.photos[0].alt)}" data-error="photo"><span class="image-count">${c.photos.length} image${c.photos.length===1?'':'s'}</span>`:'<div class="photo-fail">Image unavailable</div>'}</div><div class="gallery-copy"><strong>${esc(c.label)}</strong>${differences(c).length?'<span class="diff-dot" aria-label="Answers differ"></span>':''}<p>${esc(c.optionSet)} · ${esc(c.sourceLabel)}</p></div></button>`).join('')}</div>`;
 }else if(state.tab==='clef'||state.tab==='openai'){
  const id=state.tab==='clef'?state.model:'openai';
  $('#view').innerHTML=`<div class="results-grid">${cases.map(c=>`<article class="result-card single-result ${id==='openai'?'openai':''}"><div class="case-head"><div><h2>${esc(c.label)}</h2><p class="sub">${esc(c.optionSet)}</p></div><button class="mini-link" data-case="${esc(c.id)}">Compare ↗</button></div>${resultHTML(c,id,false)}</article>`).join('')}</div>`;
 }else{
  const diff=differences(c);
  $('#view').innerHTML=`<div class="layout"><aside class="case-list" aria-label="Choose a case">${cases.map(t=>`<button class="case-item ${t.id===c.id?'selected':''}" data-case="${esc(t.id)}" aria-current="${t.id===c.id?'true':'false'}">${t.photos[0]?`<img loading="lazy" src="${esc(t.photos[0].src)}" alt="">`:''}<span><strong>${esc(t.label)}${differences(t).length?'<i class="diff-dot"></i>':''}</strong><small>${esc(fieldsOf(t,state.model).Trade??'Unavailable')}</small></span></button>`).join('')}</aside><div class="detail"><div class="case-head"><div><h2>${esc(c.label)} <span class="recorded">/ ${esc(c.sourceLabel)}</span></h2><p class="sub">${esc(c.batch)} · ${esc(c.optionSet)} · dataset images</p></div><div class="case-nav"><button data-prev aria-label="Previous case">←</button><span>${idx+1} / ${cases.length}</span><button data-next aria-label="Next case">→</button></div></div><div class="comparison"><article class="photo-card">${photoHTML(c)}</article><article class="result-card">${resultHTML(c,state.model)}</article><article class="result-card openai">${resultHTML(c,'openai')}</article></div><div class="comparison-note"><span class="note-tag">${diff.length?diff.length+' differing field'+(diff.length===1?'':'s'):'All fields agree'}</span><span>${diff.length?esc(diff.join(' · ')):'Agreement does not establish correctness.'}</span></div></div></div>`;
 }
 document.querySelectorAll('img[data-error]').forEach(img=>img.addEventListener('error',()=>{const fail=document.createElement('div');fail.className='photo-fail';fail.textContent='Image could not load. Dataset outputs remain available.';img.replaceWith(fail)},{once:true}));
}
function selectCase(id){state.selected=id;state.photo=0;state.tab='compare';render();}
function nextCase(dir){if(!state.data)return;const cases=currentCases();if(!cases.length)return;const idx=cases.findIndex(c=>c.id===state.selected);selectCase(cases[(idx+dir+cases.length)%cases.length].id);}
function reset(){state.query='';state.difference='all';state.model='clef';state.selected=state.data.cases[0]?.id||'';state.photo=0;$('#search').value='';$('#difference').value='all';$('#clefModel').value='clef';render();}
function focusView(v){state.focus=v;state.tab='compare';document.body.classList.toggle('focused',v);$('#focus').setAttribute('aria-pressed',String(v));$('#focus').textContent=v?'⤢ Exit focus':'⛶ Focus view';render();}
function about(){
 const data=state.data,cs=data.cases,synthetic=data.datasetType==='synthetic';
 $('#provenance').innerHTML=`<p>${synthetic?'Fictional demonstration data and original illustrations. These are not measured provider results; cost, tokens and latency are unavailable.':'This replays saved dataset rows. Selecting cases or models does not run inference, upload images or incur model charges.'}</p>
 <h3>Dataset provenance</h3><p>${esc(data.sourceTitle)} · version ${esc(data.sourceVersion)} · ${esc(data.recordedDate)}</p>
 ${(data.provenance??[]).map(note=>`<p>${esc(note)}</p>`).join('')}
 <h3>Estimated cost and actual charge</h3><table class="cost-table"><thead><tr><th>Model</th><th>Input estimate</th><th>Actual charge</th></tr></thead><tbody>${['clef','flash','openai'].map(id=>`<tr><td>${MODELS[id].name}</td><td>${money(costSum(cs,id))}</td><td>${cs.length&&cs.every(c=>typeof c.models[id].actualCostUsd==='number')?money(cs.reduce((sum,c)=>sum+c.models[id].actualCostUsd,0)):'Not available'}</td></tr>`).join('')}</tbody></table>
 <p>Totals cover only the loaded dataset. Missing values remain unavailable; estimates are separate from recorded actual charges. This viewer does not verify invoices, current pricing or measurement methodology.</p>
 <h3>Read differences carefully</h3><p>Agreement and disagreement do not measure accuracy. Output categories, any policy processing and timing methodology belong in the dataset provenance. Human review is required; this app does not dispatch work.</p>
 <h3>Images and privacy</h3><p>${esc(data.photosNote)}</p><p>Use only authorized data. Review pixels, metadata, provenance and file history before public sharing. The adapter validates format, not consent or anonymization.</p>
 <p>The static viewer reads its local dataset and assets. It has no live model integration.</p>`;
 $('#about').showModal();
}
document.addEventListener('click',e=>{const b=e.target.closest?.('button');if(!b)return;if(b.dataset.tab){state.tab=b.dataset.tab;render()}if(b.dataset.case)selectCase(b.dataset.case);if(b.hasAttribute('data-photo')){state.photo=Number(b.dataset.photo);render()}if(b.hasAttribute('data-prev'))nextCase(-1);if(b.hasAttribute('data-next'))nextCase(1);if(b.hasAttribute('data-reset'))reset()});
$('#search').addEventListener('input',e=>{state.query=e.target.value;render()});$('#difference').addEventListener('change',e=>{state.difference=e.target.value;render()});$('#clefModel').addEventListener('change',e=>{state.model=e.target.value;render()});$('#reset').addEventListener('click',reset);$('#focus').addEventListener('click',()=>focusView(!state.focus));$('#exitFocus').addEventListener('click',()=>focusView(false));$('#focusPrevious').addEventListener('click',()=>nextCase(-1));$('#focusNext').addEventListener('click',()=>nextCase(1));$('#provenanceButton').addEventListener('click',about);$('#closeAbout').addEventListener('click',()=>$('#about').close());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.focus)focusView(false);if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||$('#about').open)return;if(e.target.closest?.('[role="tablist"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){const buttons=[...document.querySelectorAll('[data-tab]')],idx=buttons.indexOf(e.target),next=e.key==='Home'?0:e.key==='End'?3:(idx+(e.key==='ArrowRight'?1:-1)+4)%4;e.preventDefault();buttons[next].click();buttons[next].focus();return;}if(state.tab==='compare'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();nextCase(e.key==='ArrowRight'?1:-1)}});
fetch('./dataset.json').then(r=>{if(!r.ok)throw new Error('Dataset missing');return r.json()}).then(data=>{state.data=validateDataset(data);document.title=data.title;if(data.datasetType==='synthetic'){$('.intro .eyebrow').textContent='SYNTHETIC DATA · DEMONSTRATION ONLY';$('.lede').textContent='Fictional cases demonstrate the interface. No provider tests were run.';$('.private').textContent='Synthetic demo';$('.privacy-note').textContent='Original schematic illustrations and fictional outputs. No real property photos or measured costs.';}else{$('.intro .eyebrow').textContent='SAVED DATASET · REPLAY ONLY';$('.lede').textContent='Explore saved dataset outputs. No inference runs in this viewer.';$('.private').textContent='Local replay';$('.privacy-note').textContent=data.photosNote;}state.selected=data.cases[0]?.id||'';render()}).catch(()=>{$('#view').innerHTML='<div class="empty"><h2>Saved results could not load</h2><p>Reload this page to try again. No model requests were made.</p><button class="outline" id="reload">Reload</button></div>';$('#reload').onclick=()=>location.reload();$('#caseCount').textContent='Data unavailable';document.querySelectorAll('.controls input,.controls select,.controls button,#focus,#provenanceButton').forEach(x=>x.disabled=true)});
