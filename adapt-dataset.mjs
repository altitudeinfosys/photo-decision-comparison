import fs from 'node:fs';
import path from 'node:path';
import { validateDataset } from './dataset.mjs';
const [input,output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node adapt-dataset.mjs input.json new-output.json');
if (path.resolve(input) === path.resolve(output)) throw Error('Input must be preserved; choose a new output path');
const data = validateDataset(JSON.parse(fs.readFileSync(input,'utf8')));
fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
console.log(`Validated ${data.cases.length} cases. No provider calls made. Original input preserved.`);
