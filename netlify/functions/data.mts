import { boundedRequest, RequestSizeError } from '../lib/security.js';
import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { database } from '../../db/index.js';
import { businesses, members } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getStore, getDeployStore } from '@netlify/blobs';

class HttpError extends Error { constructor(public status:number,message:string){ super(message); } }
function schemas(){
const uuid=z.string().uuid();
const money=z.coerce.number().finite().min(0).max(1e13).refine(n=>Math.abs(n*100-Math.round(n*100))<0.001,'Use at most two decimal places');
const label=z.string().trim().min(1).max(200);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid date');
const contactSchema=z.object({kind:z.enum(['customer','supplier']),name:label,email:z.union([z.string().email(),z.literal('')]).optional(),phone:z.string().max(40).optional(),address:z.string().max(500).optional(),tin:z.string().max(50).optional()});
const productSchema=z.object({name:label,sku:label,kind:z.enum(['product','service']).default('product'),price:money,cost:money,quantity:z.coerce.number().int().min(0).max(1e8).default(0),reorder_level:z.coerce.number().int().min(0).default(5)});
const employeeSchema=z.object({name:label,email:z.union([z.string().email(),z.literal('')]).optional(),position:label,salary:money,account_number:z.string().trim().regex(/^[0-9]{4,34}$|^$/,'Use 4–34 digits for the account number.').default(''),bank_name:z.string().trim().max(100).default('')}).refine(v=>Boolean(v.account_number)===Boolean(v.bank_name),'Enter both an account number and bank, or leave both empty.');
const txSchema=z.object({kind:z.enum(['sale','purchase','expense','payroll','capital','transfer','receipt','payment']),description:label,amount:money.refine(v=>v>0,'Amount must be positive'),date:day,account:z.enum(['cash','bank']).default('cash'),status:z.enum(['paid','pending']).default('paid'),contact_id:uuid.nullable().optional(),product_id:uuid.nullable().optional(),employee_id:uuid.nullable().optional(),quantity:z.coerce.number().int().min(0).max(1e8).default(0),idempotency_key:uuid});
const bracketSchema=z.object({lower:money,upper:money.nullable(),rate:z.coerce.number().min(0).max(1),fixed:money.default(0)});
const taxSchema=z.object({kind:z.enum(['VAT','PAYE','SDL','WCF','WHT','CIT','PRESUMPTIVE']),version:z.coerce.number().int().positive(),effective_from:day,effective_to:day,rate:z.coerce.number().min(0).max(1),threshold:money.default(0),brackets:z.array(bracketSchema).max(30).default([]),source:z.string().url().refine(v=>{const parsed=new URL(v);const h=parsed.hostname;if(parsed.protocol!=='https:'||parsed.username||parsed.password)return false;return h==='tra.go.tz'||h.endsWith('.tra.go.tz')||h==='mof.go.tz'||h.endsWith('.mof.go.tz')||h==='wcf.go.tz'||h.endsWith('.wcf.go.tz')||h==='oagmis.oag.go.tz'},'Provide an official TRA, Ministry of Finance, WCF or legislation URL'),notes:z.string().trim().min(10).max(2000)}).refine(v=>v.effective_to>=v.effective_from,'Invalid effective period').superRefine((v,ctx)=>{if(['PAYE','PRESUMPTIVE'].includes(v.kind)){if(!v.brackets.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Progressive taxes require a complete verified bracket schedule.'});let previous=0;for(let i=0;i<v.brackets.length;i++){const b=v.brackets[i];if(b.lower!==previous||(b.upper!==null&&b.upper<=b.lower)||(b.upper===null&&i!==v.brackets.length-1))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Bands must start at zero, be contiguous, and finish with an open-ended band.'});previous=b.upper??Infinity;}if(v.brackets.length&&v.brackets.at(-1)?.upper!==null)ctx.addIssue({code:z.ZodIssueCode.custom,message:'The final band must have upper: null.'});}});
return {uuid,contactSchema,productSchema,employeeSchema,txSchema,taxSchema,label,day};
}
const allowedTables=['contacts','products','employees','transactions','ledger','tax_rules','reminders','members','audit_logs','backup_runs'];
function blobStore(context:Context){return context.deploy.context==='production'?getStore('horizon-backups'):getDeployStore();}
async function identity(req:Request,context:Context){
 const bearer=req.headers.get('authorization');
 if(!bearer?.startsWith('Bearer '))throw new HttpError(401,'Please sign in to access your workspace.');
 if(!context.site.url)throw new HttpError(503,'Identity site configuration is unavailable.');
 const identityOrigin=new URL(context.site.url);identityOrigin.protocol='https:';
 const r=await fetch(`${identityOrigin.origin}/.netlify/identity/user`,{headers:{Authorization:bearer},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new HttpError(401,'Your session has expired. Please sign in again.');
 const u=await r.json(); if(!u.id||!u.email||!u.confirmed_at)throw new HttpError(401,'Confirm your email before continuing.');return {id:String(u.id),email:String(u.email).toLowerCase()};
}
async function audit(c:any,business:string,user:string,action:string,id?:string){await c.query('INSERT INTO audit_logs(business_id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',[business,user,action,id??null]);}
async function snapshot(c:any,business:string){
 const out:Record<string,unknown>={};
 for(const table of allowedTables){const result=await c.query(`SELECT * FROM ${table} WHERE business_id=$1 ORDER BY created_at DESC`,[business]);out[table]=result.rows;}
 return out;
}
export default async(req:Request,context:Context)=>{
 const {uuid,contactSchema,productSchema,employeeSchema,txSchema,taxSchema,label,day}=schemas();
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data,(key,value)=>['date','due_date','effective_from','effective_to'].includes(key)&&value?String(value).slice(0,10):value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 let c:any;
 try{
 if(!['GET','HEAD'].includes(req.method)){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new HttpError(403,'Cross-site request rejected.');req=await boundedRequest(req);}
 const user=await identity(req,context);
 const db=getDatabase(); c=await db.pool.connect();
 const window=Math.floor(Date.now()/60000);
 const limit=await c.query('INSERT INTO rate_limits(key,"window",count) VALUES($1,$2,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits."window"=EXCLUDED."window" THEN rate_limits.count+1 ELSE 1 END,"window"=EXCLUDED."window" RETURNING count',[user.id,window]);
 if(limit.rows[0].count>120)throw new HttpError(429,'Too many requests. Please try again in a minute.');
 const url=new URL(req.url), path=url.pathname.replace(/^\/data\/?/,'').split('/').filter(Boolean), resource=path[0]??'workspaces',id=path[1];
 if(resource==='workspaces'){
  if(req.method==='GET'){
   await c.query("UPDATE members SET user_id=$1 WHERE email=$2 AND user_id=$3",[user.id,user.email,`pending:${user.email}`]);
   const rows=await database().select({id:businesses.id,name:businesses.name,tin:businesses.tin,address:businesses.address,currency:businesses.currency,fiscal_year:businesses.fiscalYear,role:members.role}).from(businesses).innerJoin(members,eq(members.businessId,businesses.id)).where(eq(members.userId,user.id));return json(rows);
  }
  if(req.method==='POST'){
   const body=z.object({name:label,tin:z.string().max(50).default(''),address:z.string().max(500).default('')}).parse(await req.json());
   await c.query('BEGIN');const b=await c.query('INSERT INTO businesses(name,tin,address) VALUES($1,$2,$3) RETURNING *',[body.name,body.tin,body.address]);
   await c.query("INSERT INTO members(business_id,user_id,email,role) VALUES($1,$2,$3,'owner')",[b.rows[0].id,user.id,user.email]);await audit(c,b.rows[0].id,user.id,'business.created',b.rows[0].id);await c.query('COMMIT');return json({...b.rows[0],role:'owner'},201);
  }
 }
 const business=uuid.parse(url.searchParams.get('business'));
 const membership=await c.query('SELECT * FROM members WHERE business_id=$1 AND user_id=$2',[business,user.id]);
 if(!membership.rows[0])throw new HttpError(403,'You do not have access to this business.');
 const role=membership.rows[0].role;
 if(req.method!=='GET'&&role==='viewer')throw new HttpError(403,'Your role has read-only access.');
 if(['members','tax_rules','backups','business'].includes(resource)&&req.method!=='GET'&&role!=='owner')throw new HttpError(403,'Only the business owner can perform this action.');
 if(['employees','ledger','tax_rules','audit_logs','backups','backup_runs','members'].includes(resource)&&role==='staff')throw new HttpError(403,'This module requires accountant or owner access.');
 if(resource==='snapshot'&&req.method==='GET'){
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const data=await snapshot(c,business);await c.query('COMMIT');if(role==='staff'){for(const k of ['employees','ledger','tax_rules','members','audit_logs','backup_runs'])delete data[k];data.transactions=(data.transactions as any[]).filter(t=>['sale','receipt'].includes(t.kind));}return json(data);
 }
 if(resource==='business'&&req.method==='PATCH'){
  const b=z.object({name:label,tin:z.string().max(50),address:z.string().max(500)}).parse(await req.json());
  await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);const r=await c.query('UPDATE businesses SET name=$1,tin=$2,address=$3 WHERE id=$4 RETURNING *',[b.name,b.tin,b.address,business]);await audit(c,business,user.id,'business.updated',business);await c.query('COMMIT');return json(r.rows[0]);
 }
 if(resource==='backups'){
  if(role!=='owner')throw new HttpError(403,'Only the owner can access backups.');
  if(req.method==='GET'){
   if(id){uuid.parse(id);const r=await c.query('SELECT * FROM backup_runs WHERE id=$1 AND business_id=$2',[id,business]);if(!r.rows[0])throw new HttpError(404,'Backup not found.');const archive=await blobStore(context).get(r.rows[0].blob_key,{type:'text'});if(!archive)throw new HttpError(404,'Backup archive not found.');if(createHash('sha256').update(String(archive)).digest('hex')!==r.rows[0].checksum)throw new HttpError(409,'Backup checksum verification failed.');return new Response(String(archive),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
   return json((await c.query('SELECT * FROM backup_runs WHERE business_id=$1 ORDER BY created_at DESC',[business])).rows);
  }
  if(req.method==='POST'&&id&&path[2]==='restore'){
   uuid.parse(id);const backup=(await c.query('SELECT * FROM backup_runs WHERE id=$1 AND business_id=$2',[id,business])).rows[0];if(!backup)throw new HttpError(404,'Backup not found.');
   const content=await blobStore(context).get(backup.blob_key,{type:'text'});if(!content||createHash('sha256').update(String(content)).digest('hex')!==backup.checksum)throw new HttpError(409,'Backup verification failed.');
   const archive=JSON.parse(String(content));if(archive.format!=='horizon-backup-v1'||archive.business.id!==business)throw new HttpError(422,'Invalid backup.');
   await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);const restored=(await c.query('INSERT INTO businesses(name,tin,address,currency,fiscal_year) VALUES($1,$2,$3,$4,$5) RETURNING *',[`${archive.business.name} · restored`,archive.business.tin,archive.business.address,archive.business.currency,archive.business.fiscal_year])).rows[0];
   await c.query("INSERT INTO members(business_id,user_id,email,role) VALUES($1,$2,$3,'owner')",[restored.id,user.id,user.email]);
   const mapping=new Map<string,string>();const tables=['contacts','products','employees','transactions','ledger','tax_rules','reminders','audit_logs'];
   for(const table of tables)for(const row of archive.data[table]??[])mapping.set(row.id,crypto.randomUUID());
   for(const table of tables){for(const row of archive.data[table]??[]){
    const clone:any={...row,id:mapping.get(row.id),business_id:restored.id};
    for(const key of ['transaction_id','contact_id','product_id','employee_id'])if(clone[key])clone[key]=mapping.get(clone[key]);
    if(clone.details)clone.details=JSON.stringify(clone.details);if(clone.brackets)clone.brackets=JSON.stringify(clone.brackets);
    const keys=Object.keys(clone);if(keys.some(k=>!/^[a-z_]+$/.test(k)))throw new HttpError(422,'Invalid backup fields.');
    await c.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(clone));
   }}
   await audit(c,restored.id,user.id,'backup.restored',id);await c.query('COMMIT');return json({...restored,role:'owner'},201);
  }
  if(req.method==='POST'){
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const b=(await c.query('SELECT * FROM businesses WHERE id=$1',[business])).rows[0];const data=await snapshot(c,business);await c.query('COMMIT');
   const content=JSON.stringify({format:'horizon-backup-v1',business:b,data,created_at:new Date().toISOString()});const key=`${business}/${crypto.randomUUID()}.json`;const checksum=createHash('sha256').update(content).digest('hex');await blobStore(context).set(key,content);
   const r=await c.query("INSERT INTO backup_runs(business_id,blob_key,checksum,status) VALUES($1,$2,$3,'completed') RETURNING *",[business,key,checksum]);await audit(c,business,user.id,'backup.created',r.rows[0].id);return json(r.rows[0],201);
  }
 }
 if(resource==='members'&&req.method==='POST'){
  const b=z.object({email:z.string().email(),role:z.enum(['accountant','staff','viewer'])}).parse(await req.json());
  const target={id:`pending:${b.email.toLowerCase()}`};
  await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);const r=await c.query('INSERT INTO members(business_id,user_id,email,role) VALUES($1,$2,$3,$4) RETURNING *',[business,target.id,b.email.toLowerCase(),b.role]);await audit(c,business,user.id,'member.added',r.rows[0].id);await c.query('COMMIT');return json(r.rows[0],201);
 }
 if(resource==='members'&&id&&req.method==='DELETE'){
  uuid.parse(id);await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);const r=await c.query("DELETE FROM members WHERE id=$1 AND business_id=$2 AND role<>'owner' RETURNING id",[id,business]);if(!r.rows[0])throw new HttpError(404,'Member not found or owner cannot be removed.');await audit(c,business,user.id,'member.removed',id);await c.query('COMMIT');return json({ok:true});
 }
 if(resource==='transactions'&&req.method==='POST'){
  const b=txSchema.parse(await req.json());
  if(role==='staff'&&!['sale','receipt'].includes(b.kind))throw new HttpError(403,'Staff can record sales and customer receipts only.');
  if(['payroll','capital','transfer','receipt','payment'].includes(b.kind)&&b.status!=='paid')throw new HttpError(422,'This transaction type must be paid.');
  if(['receipt','payment'].includes(b.kind)&&!b.contact_id)throw new HttpError(422,'Choose the customer or supplier for this settlement.');
  if(b.kind==='payroll'&&!b.employee_id)throw new HttpError(422,'Choose an employee.');
  if(b.kind==='purchase'&&!b.product_id)throw new HttpError(422,'Stock purchases require a product. Record other spending as an expense.');
  if(b.status==='pending'&&!b.contact_id)throw new HttpError(422,'Pending transactions require a customer or supplier.');
  if(b.status==='pending'&&!['sale','purchase','expense'].includes(b.kind))throw new HttpError(422,'This transaction cannot be pending.');
  await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);
  const existing=await c.query('SELECT * FROM transactions WHERE business_id=$1 AND idempotency_key=$2',[business,b.idempotency_key]);if(existing.rows[0]){await c.query('COMMIT');return json(existing.rows[0]);}
  if(b.contact_id){const contact=await c.query('SELECT kind FROM contacts WHERE id=$1 AND business_id=$2 AND deleted_at IS NULL',[b.contact_id,business]);if(!contact.rows[0])throw new HttpError(422,'Contact not found in this business.');const expected=['sale','receipt'].includes(b.kind)?'customer':'supplier';if(contact.rows[0].kind!==expected)throw new HttpError(422,`Choose a ${expected}.`);}
  let payrollAccount='',payrollBank='';
  if(b.employee_id){const e=await c.query('SELECT id,account_number,bank_name FROM employees WHERE id=$1 AND business_id=$2 AND deleted_at IS NULL',[b.employee_id,business]);if(!e.rows[0])throw new HttpError(422,'Employee not found.');if(b.kind==='payroll'&&b.account==='bank'){payrollAccount=e.rows[0].account_number;payrollBank=e.rows[0].bank_name;if(!payrollAccount||!payrollBank)throw new HttpError(422,'Add an account number and bank to this employee before recording bank payroll.');}}
  if(b.product_id&&!['sale','purchase'].includes(b.kind))throw new HttpError(422,'Products are only supported on sales and stock purchases.');
  let cost='0';
  if(b.product_id){
   const p=await c.query('SELECT * FROM products WHERE id=$1 AND business_id=$2 AND deleted_at IS NULL FOR UPDATE',[b.product_id,business]);const product=p.rows[0];if(!product)throw new HttpError(422,'Product not found.');if(b.quantity<=0)throw new HttpError(422,'Product quantity must be positive.');
   if(product.kind==='product'){
    if(b.kind==='sale'&&product.quantity<b.quantity)throw new HttpError(409,'Not enough stock for this sale.');
    const valuation=(await c.query("SELECT COALESCE(SUM(l.debit-l.credit),0)::text AS value FROM ledger l JOIN transactions t ON t.id=l.transaction_id WHERE t.business_id=$1 AND t.product_id=$2 AND l.account='inventory'",[business,product.id])).rows[0].value;
    if(b.kind==='sale'){
     cost=(await c.query('SELECT ROUND($1::numeric*$2::numeric/$3::numeric,2)::text AS cost',[valuation,b.quantity,product.quantity])).rows[0].cost;
     await c.query('UPDATE products SET quantity=quantity-$1,cost=CASE WHEN quantity-$1=0 THEN 0 ELSE ROUND(($2::numeric-$3::numeric)/(quantity-$1),2) END WHERE id=$4',[b.quantity,valuation,cost,product.id]);
    }else{
     await c.query('UPDATE products SET cost=ROUND(($1::numeric+$2::numeric)/(quantity+$3),2),quantity=quantity+$3 WHERE id=$4',[valuation,b.amount,b.quantity,product.id]);
    }
   }else if(b.kind==='purchase')throw new HttpError(422,'Services cannot be purchased into stock.');
  }else if(b.quantity)throw new HttpError(422,'Quantity requires a product.');
  if(['receipt','payment'].includes(b.kind)){
   const desired=b.kind==='receipt'?'receivable':'payable';
   const balance=await c.query(`SELECT COALESCE(SUM(CASE WHEN l.account='receivable' THEN l.debit-l.credit ELSE l.credit-l.debit END),0) AS balance FROM ledger l JOIN transactions t ON t.id=l.transaction_id WHERE t.business_id=$1 AND t.contact_id=$2 AND l.account=$3`,[business,b.contact_id,desired]);
   if(Number(balance.rows[0].balance)<b.amount)throw new HttpError(422,'Settlement exceeds the outstanding balance.');
  }
  const ref=`HZ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
  const inserted=await c.query('INSERT INTO transactions(business_id,reference,kind,description,amount,cost,date,account,status,contact_id,product_id,employee_id,quantity,created_by,idempotency_key,account_number,bank_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',[business,ref,b.kind,b.description,b.amount,cost,b.date,b.account,b.status,b.contact_id??null,b.product_id??null,b.employee_id??null,b.quantity,user.id,b.idempotency_key,payrollAccount,payrollBank]);
  const t=inserted.rows[0];const entries:{account:string;debit:string;credit:string}[]=[];
  const pair=(debit:string,credit:string,amount:string)=>{entries.push({account:debit,debit:amount,credit:'0'},{account:credit,debit:'0',credit:amount});};
  const amount=String(b.amount);
  switch(b.kind){
   case 'sale':pair(b.status==='pending'?'receivable':b.account,'revenue',amount);if(Number(cost)>0)pair('cost_of_sales','inventory',cost);break;
   case 'purchase':pair('inventory',b.status==='pending'?'payable':b.account,amount);break;
   case 'expense':pair('expense',b.status==='pending'?'payable':b.account,amount);break;
   case 'payroll':pair('payroll_expense',b.account,amount);break;
   case 'capital':pair(b.account,'equity',amount);break;
   case 'transfer':pair(b.account==='cash'?'bank':'cash',b.account,amount);break;
   case 'receipt':pair(b.account,'receivable',amount);break;
   case 'payment':pair('payable',b.account,amount);break;
  }
  for(const e of entries)await c.query('INSERT INTO ledger(business_id,transaction_id,account,debit,credit) VALUES($1,$2,$3,$4,$5)',[business,t.id,e.account,e.debit,e.credit]);
  await audit(c,business,user.id,`${b.kind}.posted`,t.id);await c.query('COMMIT');return json(t,201);
 }
 if(resource==='transactions'&&id&&req.method==='DELETE'){
  if(!['owner','accountant'].includes(role))throw new HttpError(403,'Accountant or owner access required.');uuid.parse(id);
  await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);
  const t=(await c.query('SELECT * FROM transactions WHERE id=$1 AND business_id=$2 FOR UPDATE',[id,business])).rows[0];if(!t||t.reversed_at)throw new HttpError(409,'Transaction not found or already reversed.');
  if(t.status==='pending'&&t.contact_id){
   const account=t.kind==='sale'?'receivable':'payable';const balance=(await c.query("SELECT COALESCE(SUM(CASE WHEN l.account='receivable' THEN l.debit-l.credit ELSE l.credit-l.debit END),0) AS value FROM ledger l JOIN transactions t ON t.id=l.transaction_id WHERE t.business_id=$1 AND t.contact_id=$2 AND l.account=$3",[business,t.contact_id,account])).rows[0].value;
   if(Number(balance)<Number(t.amount))throw new HttpError(409,'Reverse related settlements before reversing this unpaid transaction.');
  }
  if(t.product_id){const p=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[t.product_id])).rows[0];if(p.kind==='product'){
   const valuation=(await c.query("SELECT COALESCE(SUM(l.debit-l.credit),0)::text AS value FROM ledger l JOIN transactions t ON t.id=l.transaction_id WHERE t.business_id=$1 AND t.product_id=$2 AND l.account='inventory'",[business,p.id])).rows[0].value;
   const newQuantity=p.quantity+(t.kind==='sale'?t.quantity:-t.quantity);
   const delta=t.kind==='sale'?t.cost:String(-Number(t.amount));
   if(newQuantity<0||Number(valuation)+Number(delta)<-0.001)throw new HttpError(409,'This reversal would create negative stock or stock value. Reverse later stock movements first.');
   if(newQuantity===0&&Math.abs(Number(valuation)+Number(delta))>0.001)throw new HttpError(409,'Reverse later stock movements first to preserve stock valuation.');
   await c.query('UPDATE products SET quantity=$1,cost=CASE WHEN $1::integer=0 THEN 0 ELSE ROUND(($2::numeric+$3::numeric)/$1::integer,2) END WHERE id=$4',[newQuantity,valuation,delta,p.id]);
  }}
  await c.query('INSERT INTO ledger(business_id,transaction_id,account,debit,credit) SELECT business_id,transaction_id,account,credit,debit FROM ledger WHERE transaction_id=$1',[id]);
  await c.query('UPDATE transactions SET reversed_at=NOW() WHERE id=$1',[id]);await audit(c,business,user.id,'transaction.reversed',id);await c.query('COMMIT');return json({ok:true});
 }
 if(['contacts','products','employees','reminders','tax_rules'].includes(resource)){
  const schema=resource==='contacts'?contactSchema:resource==='products'?productSchema:resource==='employees'?employeeSchema:resource==='tax_rules'?taxSchema:z.object({title:label,due_date:day});
  if(req.method==='POST'){
   if(role==='staff'&&resource!=='contacts')throw new HttpError(403,'Accountant or owner access required.');
   const b:any=schema.parse(await req.json());
   if(resource==='products'&&b.quantity!==0)throw new HttpError(422,'Create products with zero opening stock, then record a stock purchase.');
   if(resource==='tax_rules'){b.created_by=user.id;b.brackets=JSON.stringify(b.brackets);}
   await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);const keys=Object.keys(b),values=Object.values(b);const r=await c.query(`INSERT INTO ${resource}(business_id,${keys.join(',')}) VALUES($1,${keys.map((_,i)=>`$${i+2}`).join(',')}) RETURNING *`,[business,...values]);await audit(c,business,user.id,`${resource}.created`,r.rows[0].id);await c.query('COMMIT');return json(r.rows[0],201);
  }
  if(id&&req.method==='PATCH'){
   uuid.parse(id);if(role==='staff')throw new HttpError(403,'Accountant or owner access required.');
   if(resource==='tax_rules')throw new HttpError(409,'Tax rules are immutable. Create a new version.');
   const b:any=resource==='reminders'?z.object({completed:z.number().int().min(0).max(1)}).parse(await req.json()):schema.parse(await req.json());
   await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);
   if(resource==='products'){
    const p=(await c.query('SELECT * FROM products WHERE id=$1 AND business_id=$2 FOR UPDATE',[id,business])).rows[0];if(!p)throw new HttpError(404,'Product not found.');if(b.quantity!==p.quantity||Number(b.cost)!==Number(p.cost))throw new HttpError(422,'Stock changed while editing. Refresh and try again.');if(b.kind!==p.kind)throw new HttpError(422,'The item type is permanent. Create a separate product or service instead.');delete b.quantity;delete b.cost;
   }
   if(resource==='contacts'){const old=(await c.query('SELECT kind FROM contacts WHERE id=$1 AND business_id=$2',[id,business])).rows[0];if(old&&b.kind!==old.kind)throw new HttpError(422,'Contact type cannot be changed.');}
   const keys=Object.keys(b);const r=await c.query(`UPDATE ${resource} SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${keys.length+1} AND business_id=$${keys.length+2} RETURNING *`,[...Object.values(b),id,business]);if(!r.rows[0])throw new HttpError(404,'Record not found.');await audit(c,business,user.id,`${resource}.updated`,id);await c.query('COMMIT');return json(r.rows[0]);
  }
  if(id&&req.method==='DELETE'&&['contacts','products','employees'].includes(resource)){
   uuid.parse(id);if(role==='staff')throw new HttpError(403,'Accountant or owner access required.');await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=$1 FOR UPDATE',[business]);if(resource==='products'){const p=(await c.query('SELECT quantity FROM products WHERE id=$1 AND business_id=$2 FOR UPDATE',[id,business])).rows[0];if(p?.quantity>0)throw new HttpError(409,'A product with stock cannot be archived. Sell or reverse its stock movements first.');}if(resource==='contacts'){const balance=(await c.query("SELECT COALESCE(SUM(l.debit-l.credit),0) AS value FROM ledger l JOIN transactions t ON t.id=l.transaction_id WHERE t.business_id=$1 AND t.contact_id=$2 AND l.account IN ('receivable','payable')",[business,id])).rows[0].value;if(Number(balance)!==0)throw new HttpError(409,'Settle this contact’s outstanding balance before archiving.');}const r=await c.query(`UPDATE ${resource} SET deleted_at=NOW() WHERE id=$1 AND business_id=$2 AND deleted_at IS NULL RETURNING id`,[id,business]);if(!r.rows[0])throw new HttpError(404,'Record not found.');await audit(c,business,user.id,`${resource}.archived`,id);await c.query('COMMIT');return json({ok:true});
  }
 }
 if(allowedTables.includes(resource)&&req.method==='GET'){
  const values:any[]=[business];let where=`business_id=$1${resource==='transactions'&&role==='staff'?" AND kind IN ('sale','receipt')":''}`;
  if(id){uuid.parse(id);values.push(id);where+=` AND id=$${values.length}`;}
  const search=z.string().max(200).parse(url.searchParams.get('q')??'');
  const searchColumn:Record<string,string>={contacts:'name',products:'name',employees:'name',transactions:'description',reminders:'title',members:'email',audit_logs:'action',tax_rules:'kind'};
  if(search&&searchColumn[resource]){values.push(`%${search.replace(/[\\%_]/g,'\\$&')}%`);where+=` AND ${searchColumn[resource]} ILIKE $${values.length}`;}
  if(url.searchParams.has('page')){
   const page=z.coerce.number().int().min(1).max(1000000).parse(url.searchParams.get('page'));
   const size=z.coerce.number().int().min(1).max(100).parse(url.searchParams.get('page_size')??50);
   const total=(await c.query(`SELECT COUNT(*)::integer AS count FROM ${resource} WHERE ${where}`,values)).rows[0].count;
   const result=await c.query(`SELECT * FROM ${resource} WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,size,(page-1)*size]);
   return json({items:result.rows,total,page,page_size:size});
  }
  const result=await c.query(`SELECT * FROM ${resource} WHERE ${where} ORDER BY created_at DESC,id DESC`,values);
  if(id&&!result.rows[0])throw new HttpError(404,'Record not found.');return json(id?result.rows[0]:result.rows);
 }
 throw new HttpError(404,'Endpoint not found.');
 }catch(error:any){
 if(c)await c.query('ROLLBACK').catch(()=>{});
 if(error instanceof RequestSizeError)return json({detail:'Request body is too large.'},413);
 if(error instanceof SyntaxError)return json({detail:'Provide a valid JSON body.'},422);
 if(error instanceof z.ZodError)return json({detail:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},422);
 if(error instanceof HttpError)return json({detail:error.message},error.status);
 if(error?.code==='23505')return json({detail:'This record already exists. Use a unique SKU, email, or rule version.'},409);
 return json({detail:'The data service could not complete this request. Please retry.'},503);
 }finally{c?.release();}
};
export const config:Config={path:'/data/*'};
