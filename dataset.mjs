// Shared validation for the local adapter and browser. No provider or network calls.
export const FIELDS = ['Trade', 'Urgency', 'Visible symptom', 'More information', 'Clarification reason', 'Hazard flags'];
export const MODEL_IDS = ['clef', 'flash', 'openai'];
const METRICS = ['inputTokens', 'estimatedCostUsd', 'actualCostUsd', 'latencyMs'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed, label) {
  if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) throw Error(`Unexpected ${label} fields`);
}
function string(value, label, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`Invalid ${label}`);
}
export function validateDataset(data) {
  keys(data, ['schemaVersion','datasetType','title','recordedDate','sourceTitle','sourceVersion','sourceUrl','photosNote','provenance','cases'], 'dataset');
  if (data.schemaVersion !== 1 || !['recorded','synthetic'].includes(data.datasetType) || !Array.isArray(data.cases) || data.cases.length > 1000) throw Error('Unsupported dataset');
  for (const key of ['title','recordedDate','sourceTitle','sourceVersion','photosNote']) string(data[key],key);
  if (data.sourceUrl != null) throw Error('Source links are excluded from this dataset contract');
  if (data.provenance !== undefined) {
    if (!Array.isArray(data.provenance) || data.provenance.length > 20) throw Error('Invalid provenance');
    data.provenance.forEach(value => string(value,'provenance'));
  }
  const ids = new Set();
  for (const c of data.cases) {
    keys(c,['id','label','sourceLabel','optionSet','batch','photos','models'],'case');
    if (typeof c.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(c.id) || ids.has(c.id)) throw Error('Invalid or duplicate case ID');
    ids.add(c.id);
    for (const key of ['label','sourceLabel','optionSet','batch']) string(c[key],key,300);
    if (!Array.isArray(c.photos) || c.photos.length > 24) throw Error('Invalid photos');
    for (const p of c.photos) {
      keys(p,['src','alt','kind','publicApproved'],'photo');
      if (typeof p.src !== 'string' || !/^assets\/[A-Za-z0-9_/-]+\.(svg|png|jpg|jpeg|webp)$/.test(p.src) || p.src.includes('..') || p.src.includes('//')) throw Error('Unsafe asset path');
      string(p.alt,'photo alt'); string(p.kind,'photo kind',100);
      if (typeof p.publicApproved !== 'boolean') throw Error('Invalid photo approval');
      if (data.datasetType === 'synthetic' && p.kind !== 'synthetic illustration') throw Error('Synthetic datasets require illustration labels');
    }
    keys(c.models,MODEL_IDS,'models');
    for (const id of MODEL_IDS) {
      const m = c.models[id];
      keys(m,['status','fields',...METRICS],'model');
      if (!['recorded','synthetic example','unavailable'].includes(m.status)) throw Error('Invalid model status');
      if (data.datasetType === 'synthetic' && m.status !== 'synthetic example') throw Error('Synthetic outputs must be labeled fictional');
      if (data.datasetType === 'recorded' && m.status === 'synthetic example') throw Error('Recorded datasets cannot contain fictional output statuses');
      keys(m.fields,FIELDS,'output');
      for (const key of FIELDS) {
        if (m.fields[key] === undefined || m.fields[key] === null) m.fields[key] = null;
        else string(m.fields[key],key);
      }
      for (const key of METRICS) {
        if (m[key] == null) m[key] = null;
        else if (typeof m[key] !== 'number' || !Number.isFinite(m[key]) || m[key] < 0) throw Error(`Invalid numeric value: ${key}`);
        if (data.datasetType === 'synthetic' && m[key] !== null) throw Error('Synthetic metrics must remain unavailable');
      }
      if (m.inputTokens !== null && !Number.isSafeInteger(m.inputTokens)) throw Error('Invalid token count');
    }
  }
  return data;
}
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Not available';
  if (Number.isInteger(value)) return '$' + value.toFixed(2);
  const formatted = value.toFixed(8).replace(/0+$/,'').replace(/\.$/,'');
  return '$' + (formatted === '0' ? '0.00' : formatted);
}
export const costSum = (cases,id) => cases.length && cases.every(c => typeof c.models[id]?.estimatedCostUsd === 'number' && Number.isFinite(c.models[id].estimatedCostUsd))
  ? cases.reduce((sum,c) => sum + Math.round(c.models[id].estimatedCostUsd * 1e8),0) / 1e8 : null;
export const modelDetail = data => data.datasetType === 'synthetic' ? 'Fictional example · no provider call' : 'Saved dataset output · no live inference';
export const photoCopy = data => data.datasetType === 'synthetic'
  ? {heading:'Synthetic illustration',caption:'Original schematic illustration · fictional example. No real photo or provider test.'}
  : {heading:'Dataset image',caption:data.photosNote};
