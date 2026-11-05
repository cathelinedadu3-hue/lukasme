import { boundedRequest, RequestSizeError } from '../lib/security.js';
import type { Config,Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { z } from 'zod';
import data from './data.mts';
import { reports,cashFlow,overview,estimateTax,type Snapshot } from '../lib/finance.js';
import { csv,pdf,spreadsheet } from '../lib/documents.js';
export default async(req:Request,context:Context)=>{
 const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid calendar date');
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 try{
  if(!['GET','HEAD'].includes(req.method)&&(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('x-horizon-request')!=='workspace'))return json({detail:'Cross-site request rejected.'},403);
  if(!['GET','HEAD'].includes(req.method))req=await boundedRequest(req);
  const url=new URL(req.url),path=url.pathname.replace(/^\/api\/?/,'');
  if(path==='connection'&&req.method==='GET'){
   let database=false,authentication=false;
   const checks=await Promise.allSettled([(async()=>getDatabase().sql`SELECT 1 AS connected`)(),fetch(new URL('/.netlify/identity/settings',context.site.url??url.origin),{signal:AbortSignal.timeout(10000)})]);
   database=checks[0].status==='fulfilled';authentication=checks[1].status==='fulfilled'&&checks[1].value.ok;
   return json({configured:database&&authentication,database,authentication,service:'Netlify Functions',storage:'Netlify Managed PostgreSQL'});
  }
  const headers=new Headers(req.headers);
  if(!headers.has('authorization')){const cookie=headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('nf_jwt='));if(cookie)headers.set('authorization',`Bearer ${decodeURIComponent(cookie.slice(7))}`);}
  headers.delete('cookie');
  const callData=(resource:string,method='GET')=>{const target=new URL(url);target.pathname=`/data/${resource}`;return data(new Request(target,{method,headers}),context);};
  const calculated=['overview','reports','export','tax/estimate'].includes(path)||path.startsWith('invoices/');
  if(!calculated){const target=new URL(url);target.pathname=`/data/${path}`;return data(new Request(target,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:await req.arrayBuffer()}),context);}
  if(req.method!==(path==='tax/estimate'?'POST':'GET'))return json({detail:'Method not allowed.'},405);
  const source=await callData('snapshot');if(!source.ok)return source;const snapshot=await source.json() as Snapshot;
  if(path==='tax/estimate'){
   if(!snapshot.tax_rules)return json({detail:'Financial access is required.'},403);
   const input=z.object({kind:z.enum(['VAT','PAYE','SDL','WCF','WHT','CIT','PRESUMPTIVE']),base:z.union([z.string().regex(/^\d+(\.\d{1,2})?$/),z.number().finite().nonnegative().max(1e13).refine(n=>Math.abs(n*100-Math.round(n*100))<.001)]).refine(v=>Number(v)<=1e13),on:day}).parse(await req.json());
   const rule=snapshot.tax_rules.filter(r=>r.kind===input.kind&&r.effective_from<=input.on&&r.effective_to>=input.on).sort((a,b)=>b.version-a.version)[0];
   if(!rule)return json({detail:'No sourced rule is configured for this tax and effective date. Add and professionally verify a rule first.'},422);
   return json({amount:estimateTax(rule,input.base),base:String(input.base),rule,currency:'TZS',disclaimer:'Estimate using your configured rule. Source and applicability require professional verification. This is not an official TRA assessment or filing.'});
  }
  const download=(content:Uint8Array|ArrayBuffer|string,mime:string,name:string)=>new Response(content as BodyInit,{headers:{'Content-Type':mime,'Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(path.startsWith('invoices/')){
   const id=z.string().uuid().parse(path.split('/')[1]);const t=snapshot.transactions.find(t=>t.id===id&&t.kind==='sale');if(!t)return json({detail:'Sales document not found.'},404);
   const customer=snapshot.contacts.find(c=>c.id===t.contact_id),product=snapshot.products.find(p=>p.id===t.product_id);
   return download(await pdf(t.status==='paid'?'Sales receipt':'Sales invoice',[['Reference',t.reference],['Date',t.date],['Customer',customer?.name??'Walk-in customer'],['Description',t.description],['Product / service',product?.name??'General sale'],['Quantity',String(t.quantity||'Not applicable')],['Amount (TZS)',t.amount],['Status',t.reversed_at?'REVERSED':t.status.toUpperCase()]],'Not a TRA EFD fiscal receipt or official tax filing. No tax rate has been assumed.'),'application/pdf',`${t.reference}.pdf`);
  }
  if(!snapshot.ledger)return json({detail:'Financial information requires accountant, owner or viewer access.'},403);
  const today=new Date().toISOString().slice(0,10),end=day.parse(url.searchParams.get('end')??today),start=day.parse(url.searchParams.get('start')??`${end.slice(0,7)}-01`);
  if(start>end)return json({detail:'Start date must be before the end date.'},422);
  if(path==='overview')return json(overview(snapshot,start,end));
  const financials=reports(snapshot,start,end),flow=cashFlow(snapshot,start,end),disclaimer='Management accounts. An accountant must review opening balances, adjustments, accruals and tax provisions before statutory use.';
  if(path==='reports')return json({period:{start,end},financials,cash_flow:flow,disclaimer});
  const format=z.enum(['csv','xlsx','pdf']).parse(url.searchParams.get('format')??'csv'),report=z.enum(['all','profit','balance','cash','ledger']).parse(url.searchParams.get('report')??'all');
  const profit=['sales','cost_of_sales','gross_profit','expenses','net_profit'];const values=report==='cash'?flow:Object.fromEntries(Object.entries(financials).filter(([k])=>report==='all'||(report==='profit'?profit.includes(k):!profit.includes(k))));
  const dateLabel=(value:string)=>new Date(value.slice(0,10)+'T00:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
  const amount=(value:string)=>{const [whole,fraction='00']=String(value).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+fraction.padEnd(2,'0');};
  const transactions=new Map(snapshot.transactions.map(t=>[t.id,t]));
  const ledgerRows=snapshot.ledger.filter(entry=>{const t=transactions.get(entry.transaction_id);return t&&t.date>=start&&t.date<=end;}).map(entry=>[entry.account.replaceAll('_',' '),amount(entry.debit),amount(entry.credit),dateLabel(entry.created_at)]);
  const columns=report==='ledger'?['Account','Debit (TZS)','Credit (TZS)','Recorded']:['Account','Amount (TZS)'];
  const reportRows=report==='ledger'?ledgerRows:Object.entries(values).map(([k,v])=>[k.replaceAll('_',' '),amount(v)]);
  const title={all:'Financial report',profit:'Profit & loss statement',balance:'Balance sheet',cash:'Cash flow statement',ledger:'General ledger'}[report];
  const workspaceResponse=await callData('workspaces');if(!workspaceResponse.ok)return workspaceResponse;
  const workspaces=await workspaceResponse.json();const business=workspaces.find((w:{id:string})=>w.id===url.searchParams.get('business'));
  const subtitle=`${business?.name??'Business workspace'} · ${dateLabel(start)} - ${dateLabel(end)}`;
  const rows=[[title,'TZS'],[subtitle],columns,...reportRows];
  if(format==='csv')return download(csv(rows),'text/csv;charset=utf-8','horizon-report.csv');
  if(format==='xlsx')return download(await spreadsheet(rows),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','horizon-report.xlsx');
  return download(await pdf(title,reportRows,disclaimer,{subtitle,columns}),'application/pdf','horizon-report.pdf');
 }catch(error){
  if(error instanceof RequestSizeError)return json({detail:'Request body is too large.'},413);
  if(error instanceof z.ZodError)return json({detail:error.issues.map(i=>i.message).join('; ')},422);
  if(error instanceof SyntaxError)return json({detail:'Provide a valid JSON body.'},422);
  return json({detail:'The Netlify service is unavailable. Retry shortly.'},503);
 }
};
export const config:Config={path:'/api/*'};
