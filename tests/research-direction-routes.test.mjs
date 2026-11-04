import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=await mkdtemp(path.join(tmpdir(),'medatlas-directions-'));
const request=body=>new Request('https://local.test/api/research/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
try {
 const runtime=path.resolve('tests/support/upload-runtime.mjs');
 await build({stdin:{contents:`export * as route from './app/api/research/history/route.ts';export {asUser} from './tests/support/upload-runtime.mjs';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:path.join(temp,'history.mjs'),external:['node:*'],plugins:[{name:'runtime',setup(b){b.onResolve({filter:/^(cloudflare:workers|next\/headers|next\/navigation)$/},()=>({path:runtime}))}}]});
 const {route,asUser}=await import(pathToFileURL(path.join(temp,'history.mjs')));
 assert.equal((await asUser(null,()=>route.GET())).status,401);
 const a={query:'chest reports',paperIds:['a']},b={query:'pathology agents',paperIds:['b']};
 for(const record of [a,b])assert.equal((await asUser('owner',()=>route.POST(request(record)))).status,200);
 await asUser('owner',()=>route.POST(request({...a,paperIds:['a-new']})));
 const rows=(await (await asUser('owner',()=>route.GET())).json()).directions;
 assert.equal(rows.length,2);assert.deepEqual(rows.find(r=>r.query===a.query).paperIds,['a-new']);
 assert.deepEqual((await (await asUser('other',()=>route.GET())).json()).directions,[]);
 assert.equal((await asUser('owner',()=>route.POST(request({...a,paperIds:[]})))).status,400);
 console.log('PASS persistent direction labels, same-query refresh and account isolation');
 const searchRuntime=path.resolve('tests/support/research-search-runtime.mjs');
 await build({stdin:{contents:`export {POST} from './app/api/research/route.ts';export * from './tests/support/research-search-runtime.mjs';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:path.join(temp,'search.mjs'),external:['node:*'],plugins:[{name:'external-fixtures',setup(b){b.onResolve({filter:/(composition\/(catalog|research)|platform\/storage\/papers)$/},()=>({path:searchRuntime}))}}]});
 const search=await import(pathToFileURL(path.join(temp,'search.mjs')));
 const result=await search.POST(request({query:'chest report generation'}));assert.equal(result.status,200);
 assert.deepEqual((await result.json()).papers.map(p=>p.id),['fresh-external']);assert.equal(search.calls.local,0);assert.equal(search.calls.external,1);
 search.setUnavailable(true);assert.equal((await search.POST(request({query:'chest report generation'}))).status,502);assert.equal(search.calls.local,0);
 console.log('PASS external retrieval on every search; no existing-library fallback on failure');
} finally {await rm(temp,{recursive:true,force:true})}
