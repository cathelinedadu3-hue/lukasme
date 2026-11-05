import type { Config,Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
export default async(_req:Request,context:Context)=>{
 if(context.deploy.context!=='production')return;
 const c=await getDatabase().pool.connect();
 try{
  // Oldest successful backup first. Each invocation processes one business, bounding execution time.
  const result=await c.query("SELECT b.* FROM businesses b LEFT JOIN (SELECT business_id,MAX(created_at) last_backup FROM backup_runs GROUP BY business_id) r ON r.business_id=b.id WHERE r.last_backup IS NULL OR r.last_backup < NOW()-INTERVAL '24 hours' ORDER BY r.last_backup NULLS FIRST LIMIT 1");
  for(const business of result.rows){
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const data:Record<string,unknown>={};
   for(const table of ['contacts','products','employees','transactions','ledger','tax_rules','reminders','members','audit_logs','backup_runs'])data[table]=(await c.query(`SELECT * FROM ${table} WHERE business_id=$1 ORDER BY created_at DESC`,[business.id])).rows;
   await c.query('COMMIT');const content=JSON.stringify({format:'horizon-backup-v1',business,data,created_at:new Date().toISOString()});const key=`${business.id}/${crypto.randomUUID()}.json`;const checksum=createHash('sha256').update(content).digest('hex');
   await getStore('horizon-backups').set(key,content);await c.query("INSERT INTO backup_runs(business_id,blob_key,checksum,status) VALUES($1,$2,$3,'completed')",[business.id,key,checksum]);
  }
  await c.query('DELETE FROM rate_limits WHERE "window"<$1',[Math.floor(Date.now()/60000)-60]);
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
};
export const config:Config={schedule:'*/5 * * * *'};
