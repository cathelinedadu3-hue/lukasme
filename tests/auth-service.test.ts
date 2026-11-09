import { test } from 'node:test';
import assert from 'node:assert/strict';
import api from '../netlify/functions/api.mts';

const origin='https://example.netlify.app';
const context={site:{url:origin},deploy:{context:'deploy-preview'}} as any;

test('Identity outages never become expired sessions or request validation errors',async t=>{
 const cases:[string,()=>Promise<Response>,number][]=[
  ['missing Identity',async()=>new Response('Not found',{status:404}),503],
  ['site access gate',async()=>new Response('<html>Sign in</html>',{status:401,headers:{'Content-Type':'text/html'}}),503],
  ['Identity unavailable',async()=>Response.json({error:'unavailable'},{status:503}),503],
  ['network failure',async()=>{throw new TypeError('network failure')},503],
  ['malformed JSON',async()=>new Response('{',{headers:{'Content-Type':'application/json'}}),503],
  ['null user',async()=>Response.json(null),503],
  ['expired session',async()=>Response.json({error:'invalid token'},{status:401}),401],
  ['unconfirmed user',async()=>Response.json({id:'synthetic-user',email:'synthetic@example.com'}),401],
 ];
 for(const [name,fetcher,status] of cases)await t.test(name,async t=>{
  t.mock.method(globalThis,'fetch',fetcher);
  const response=await api(new Request(`${origin}/api/workspaces`,{headers:{Authorization:'Bearer synthetic-test-token'}}),context);
  assert.equal(response.status,status);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();
  if(status===503)assert.match(body.detail,/Authentication/);
  assert.doesNotMatch(JSON.stringify(body),/synthetic-test-token/);
 });
});
