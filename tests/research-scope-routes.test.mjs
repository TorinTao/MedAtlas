import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=await mkdtemp(path.join(tmpdir(),'medatlas-scope-'));
try {
 const runtime=path.resolve('tests/support/upload-runtime.mjs');
 await build({stdin:{contents:`export * as route from './app/api/papers/route.ts';export {putPapers} from './platform/storage/papers.ts';export {normalizePaper} from './modules/catalog/papers.ts';export {env} from './tests/support/upload-runtime.mjs';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:path.join(temp,'routes.mjs'),external:['node:*'],plugins:[{name:'runtime',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:runtime}))}}]});
 const {route,putPapers,normalizePaper,env}=await import(pathToFileURL(path.join(temp,'routes.mjs')));
 for(let i=0;i<510;i++){
  const p=normalizePaper({id:`scope-${i}`,title:`Stored paper ${i}`,year:2025,url:'https://example.org/paper'});
  await env.DB.prepare('INSERT INTO papers (id,title,data,updated_at) VALUES (?,?,?,?)').bind(p.id,p.title,JSON.stringify(p),new Date(i*1000).toISOString()).run();
 }
 const request=ids=>new Request('https://local.test/api/papers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
 const restored=await route.POST(request(['scope-0','scope-509']));
 assert.equal(restored.status,200);
 assert.deepEqual(new Set((await restored.json()).papers.map(p=>p.id)),new Set(['scope-0','scope-509']));
 assert.equal((await route.POST(request([5]))).status,400);
 assert.equal((await route.POST(request(Array(501).fill('scope-0')))).status,400);
 assert.deepEqual((await (await route.POST(request(['missing']))).json()).papers,[]);
 const original=normalizePaper({id:'scope-abstract',title:'Medical imaging agent',year:2025,abstract:'The original PubMed abstract.'});
 await putPapers([original]);
 await putPapers([{...original,abstract:''}]);
 const preserved=(await (await route.POST(request(['scope-abstract']))).json()).papers[0];
 assert.equal(preserved.abstract,'The original PubMed abstract.');
 await putPapers([{...original,abstract:'A corrected abstract.'}]);
 const corrected=(await (await route.POST(request(['scope-abstract']))).json()).papers[0];
 assert.equal(corrected.abstract,'A corrected abstract.');
 const oldSeed=normalizePaper({id:'W4416035470',title:'3MDBench: Medical Multimodal Multi-agent Dialogue Benchmark',year:2025,abstract:'A stored abstract.'});
 oldSeed.analysis={question:'已保存的研究问题',method:'评测',datasets:[],findings:['结果'],limitations:['局限'],evidence:[],depth:'摘要',sourceUrl:'https://example.org/paper',analyzedAt:new Date().toISOString()};
 await env.DB.prepare('INSERT INTO papers (id,title,data,updated_at) VALUES (?,?,?,?)').bind(oldSeed.id,oldSeed.title,JSON.stringify(oldSeed),'1960-01-01T00:00:00.000Z').run();
 const duplicate=normalizePaper({id:'scope-duplicate',title:'Stored paper 509',year:2025,url:'https://example.org/paper'});
 await env.DB.prepare('INSERT INTO papers (id,title,data,updated_at) VALUES (?,?,?,?)').bind(duplicate.id,duplicate.title,JSON.stringify(duplicate),'2026-01-01T00:00:00.000Z').run();
 const library=(await (await route.GET()).json()).papers;
 assert.equal(library.find(p=>p.id==='W4416035470')?.analysis?.question,'已保存的研究问题');
 console.log('PASS exact collection restoration, stored abstracts, and seed reading hydration');
} finally {await rm(temp,{recursive:true,force:true})}
