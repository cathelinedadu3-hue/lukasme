import { test } from 'node:test';
import assert from 'node:assert/strict';
import api from '../netlify/functions/api.mts';
import data from '../netlify/functions/data.mts';
const context={site:{url:'https://example.netlify.app'},deploy:{context:'deploy-preview'}} as any;
const origin='https://example.netlify.app';
test('all business and calculated GET endpoints reject anonymous access',async()=>{for(const path of ['workspaces','snapshot','contacts','products','employees','transactions','ledger','tax_rules','reminders','members','audit_logs','backups','backup_runs','overview','reports','export','invoices/00000000-0000-4000-8000-000000000001']){const r=await api(new Request(`${origin}/api/${path}?business=00000000-0000-4000-8000-000000000001`),context);assert.equal(r.status,401,path);}});
test('every mutation rejects cross-origin requests before data access',async()=>{for(const method of ['POST','PATCH','DELETE'])for(const path of ['workspaces','contacts','products','employees','transactions','members','tax_rules','business','backups','tax/estimate']){const r=await api(new Request(`${origin}/api/${path}`,{method,headers:{Origin:'https://attacker.example','X-Horizon-Request':'workspace'},body:'{}'}),context);assert.equal(r.status,403,`${method} ${path}`);}});
test('same-origin writes still require verified login',async()=>{for(const path of ['workspaces','transactions','tax/estimate']){const r=await api(new Request(`${origin}/api/${path}`,{method:'POST',headers:{Origin:origin,'X-Horizon-Request':'workspace'},body:'{}'}),context);assert.equal(r.status,401);}});
test('direct data writes reject foreign Origin',async()=>{const r=await data(new Request(`${origin}/data/transactions`,{method:'POST',headers:{Origin:'https://attacker.example'},body:'{}'}),context);assert.equal(r.status,403);});
test('unsupported methods on calculation endpoints return 405',async()=>{const r=await api(new Request(`${origin}/api/reports`,{method:'POST',headers:{Origin:origin,'X-Horizon-Request':'workspace'},body:'{}'}),context);assert.equal(r.status,405);});

test('API and direct data endpoints bound actual bytes without Content-Length',async()=>{
 for(const [handler,prefix] of [[api,'api'],[data,'data']] as const){
  const response=await handler(new Request(`${origin}/${prefix}/workspaces`,{method:'POST',headers:{Origin:origin,'X-Horizon-Request':'workspace'},body:'x'.repeat(2_000_001)}),context);
  assert.equal(response.status,413);
  assert.equal(response.headers.get('cache-control'),'no-store');
 }
});
test('API rejects invalid body length headers before parsing',async()=>{
 const response=await api(new Request(`${origin}/api/workspaces`,{method:'POST',headers:{Origin:origin,'X-Horizon-Request':'workspace','Content-Length':'invalid'},body:'{}'}),context);
 assert.equal(response.status,413);
});
