import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
const identity = new AsyncLocalStorage();
export const asUser = (id, fn) => identity.run(id, fn);
export async function headers() { const id = identity.getStore(); return new Headers(id ? {'oai-authenticated-user-id':id,'oai-authenticated-user-email':`${id}@example.test`} : {}); }
export function redirect() { throw new Error('Unexpected redirect in upload route'); }
const sqlite = new DatabaseSync(':memory:');
for (const file of ['0000_smart_william_stryker.sql','0001_square_valkyrie.sql','0002_military_zzzax.sql','0003_brown_iceman.sql']) sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
export const objects = new Map();
export const failures = { put: false, insert: false };
function prepare(sql, values = []) {
 const stmt = () => { if(failures.insert && /^insert into "uploads"/i.test(sql)) throw new Error('Test database failure'); return sqlite.prepare(sql); };
 return { bind: (...v) => prepare(sql,v),
  async run(){const result=stmt().run(...values);return {success:true,meta:{changes:Number(result.changes)}}},
  async first(){return stmt().get(...values)||null},
  async all(){return {results:stmt().all(...values),success:true}},
  async raw(){const s=stmt();s.setReturnArrays(true);return s.all(...values)}
 };
}
export const env = { DB: {prepare,async batch(statements){return Promise.all(statements.map(statement=>statement.run()))}}, BUCKET: {
 async put(key, data) { if(failures.put && key.endsWith('.txt')) throw new Error('Test R2 failure');objects.set(key,data); },
 async get(key) {if(!objects.has(key))return null;const value=objects.get(key);return {body:value,async text(){return String(value)},async json(){return JSON.parse(String(value))}}},
 async delete(key){objects.delete(key)}
}};
