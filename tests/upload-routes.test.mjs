import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const temp = await mkdtemp(path.join(tmpdir(),'medatlas-upload-routes-'));
const runtime = path.resolve('tests/support/upload-runtime.mjs');
try {
 await build({stdin:{contents:`export * as upload from './app/api/upload/route.ts';export * as file from './app/api/upload/[id]/route.ts';export * as analysis from './app/api/upload/[id]/analyze/route.ts';export * as workspace from './app/api/workspace/route.ts';export * from './tests/support/upload-runtime.mjs';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:path.join(temp,'routes.mjs'),external:['node:*'],plugins:[{name:'local-runtime',setup(b){b.onResolve({filter:/^(cloudflare:workers|next\/headers|next\/navigation)$/},()=>({path:runtime}))}}]});
 const {upload,file,analysis,workspace,asUser,objects,failures}=await import(pathToFileURL(path.join(temp,'routes.mjs')));
 const bytes=new TextEncoder().encode('%PDF-1.4\n'+ 'Synthetic route storage check. '.repeat(8));
 const text='Synthetic extracted text for upload validation. No patient data. '.repeat(5);
 function request(pages='2',name='test.pdf',data=bytes,bodyText=text){const f=new FormData();f.set('file',new File([data],name,{type:'application/pdf'}));f.set('text',bodyText);f.set('pages',pages);return new Request('https://local.test/api/upload',{method:'POST',body:f})}
 const ctx=id=>({params:Promise.resolve({id})});const get=new Request('https://local.test/api/upload/id');
 assert.equal((await asUser(null,()=>upload.POST(request()))).status,401);
 console.log('PASS anonymous uploads rejected');
 for(const pages of ['NaN','1.5','0','101'])assert.equal((await asUser('invalid-user',()=>upload.POST(request(pages)))).status,400);
 assert.equal((await asUser('invalid-user',()=>upload.POST(request('2','fake.pdf',new Uint8Array(200))))).status,400);
 assert.equal((await asUser('invalid-user',()=>upload.POST(request('2','test.pdf',bytes,' '.repeat(200))))).status,400);
 assert.equal((await asUser('invalid-user',()=>upload.POST(request('2','large.pdf',new Uint8Array(20_000_001))))).status,400);
 console.log('PASS invalid size, signature, text and page counts rejected');
 const response=await asUser('owner',()=>upload.POST(request()));assert.equal(response.status,200);const saved=await response.json();assert.equal(objects.size,2);
 const view=await asUser('owner',()=>file.GET(get,ctx(saved.id)));assert.equal(view.status,200);assert.equal(view.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(new Uint8Array(await view.arrayBuffer()),bytes);
 const extracted=await asUser('owner',()=>file.GET(new Request('https://local.test/api/upload/id?text'),ctx(saved.id)));assert.equal(await extracted.text(),text.trim());
 const work=await asUser('owner',()=>workspace.GET());assert.ok((await work.json()).uploads.some(item=>item.id===saved.id));
 console.log('PASS save PDF/text, byte-for-byte download and workspace listing');
 for(const user of [null,'other-user']){
  assert.equal((await asUser(user,()=>file.GET(get,ctx(saved.id)))).status,404);
  assert.equal((await asUser(user,()=>file.DELETE(get,ctx(saved.id)))).status,404);
  assert.equal((await asUser(user,()=>analysis.GET(get,ctx(saved.id)))).status,404);
  assert.equal((await asUser(user,()=>analysis.POST(get,ctx(saved.id)))).status,404);
 }
 assert.equal(objects.size,2);console.log('PASS cross-user read/delete/analysis blocked');
 const key=[...objects.keys()].find(k=>k.endsWith('.pdf')).replace(/\.pdf$/,'.analysis.json');objects.set(key,JSON.stringify({question:'Synthetic cached analysis'}));
 assert.equal((await asUser('owner',()=>analysis.GET(get,ctx(saved.id)))).status,200);
 assert.equal((await asUser('owner',()=>file.DELETE(get,ctx(saved.id)))).status,200);assert.equal(objects.size,0);
 assert.equal((await asUser('owner',()=>file.GET(get,ctx(saved.id)))).status,404);
 assert.equal((await asUser('owner',()=>workspace.GET()).then(r=>r.json())).uploads.length,0);
 console.log('PASS deletion removes PDF, text, cached analysis and workspace record');
 for(const kind of ['put','insert']){failures[kind]=true;assert.equal((await asUser(`failure-${kind}`,()=>upload.POST(request()))).status,503);assert.equal(objects.size,0);failures[kind]=false;}
 const retry=await asUser('failure-put',()=>upload.POST(request()));assert.equal(retry.status,200);await asUser('failure-put',async()=>file.DELETE(get,ctx((await retry.json()).id)));
 console.log('PASS failed storage/database write cleaned up; retry succeeds');
 for(let i=0;i<5;i++){const r=await asUser('quota-user',()=>upload.POST(request()));assert.equal(r.status,200);await asUser('quota-user',async()=>file.DELETE(get,ctx((await r.json()).id)));}
 assert.equal((await asUser('quota-user',()=>upload.POST(request()))).status,429);assert.equal(objects.size,0);
 console.log('PASS daily upload quota enforced');
} finally {await rm(temp,{recursive:true,force:true});}
