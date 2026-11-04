import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const temp=await mkdtemp(path.join(tmpdir(),'paper-link-route-'));
try {
 const runtime=path.resolve('tests/support/upload-runtime.mjs');
 await build({stdin:{contents:`export {POST} from './app/api/workspace/import-link/route.ts';export * from './tests/support/upload-runtime.mjs';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:path.join(temp,'route.mjs'),external:['node:*'],plugins:[{name:'test-runtime',setup(b){
 b.onResolve({filter:/^(cloudflare:workers|next\/headers|next\/navigation)$/},()=>({path:runtime}));
 b.onResolve({filter:/composition\/workspace$/},()=>({path:'import-stub',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function importPaperLink(user,url){if(url==="fail")throw Error("secret-provider-detail");return {user,url}}',loader:'js'}));
 }}]});
 const {POST,asUser}=await import(pathToFileURL(path.join(temp,'route.mjs')));
 const request=body=>new Request('https://local.test/api/workspace/import-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await asUser(null,()=>POST(request({url:'https://arxiv.org/abs/2401.12345'})))).status,401);
 assert.equal((await asUser('owner',()=>POST(request({url:42})))).status,400);
 const failed=await asUser('failure-owner',()=>POST(request({url:'fail'})));
 assert.equal(failed.status,502);assert.ok(!(await failed.text()).includes('secret-provider-detail'));
 for(let i=0;i<12;i++){
   const response=await asUser('owner',()=>POST(request({url:'https://arxiv.org/abs/2401.12345'})));
   assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
   assert.equal((await response.json()).user,'owner');
 }
 assert.equal((await asUser('owner',()=>POST(request({url:'https://arxiv.org/abs/2401.12345'})))).status,429);
 assert.equal((await asUser('other',()=>POST(request({url:'https://arxiv.org/abs/2401.12345'})))).status,200);
 console.log('PASS import route authentication, body validation, private cache, per-user quota, and sanitized failures');
} finally {await rm(temp,{recursive:true,force:true});}
