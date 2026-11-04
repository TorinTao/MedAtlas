import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=await mkdtemp(path.join(tmpdir(),'medatlas-scope-'));
try {
 const runtime=path.resolve('tests/support/upload-runtime.mjs');
 await build({stdin:{contents:`export * as route from './app/api/papers/route.ts';export {normalizePaper} from './modules/catalog/papers.ts';export {env} from './tests/support/upload-runtime.mjs';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:path.join(temp,'routes.mjs'),external:['node:*'],plugins:[{name:'runtime',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:runtime}))}}]});
 const {route,normalizePaper,env}=await import(pathToFileURL(path.join(temp,'routes.mjs')));
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
 console.log('PASS exact collection restoration beyond global 500-row limit and invalid input rejection');
} finally {await rm(temp,{recursive:true,force:true})}
