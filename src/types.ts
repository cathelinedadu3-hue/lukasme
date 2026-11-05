export type Row = Record<string, any>;
export type Workspace = { id:string; name:string; tin:string; address:string; currency:string; fiscal_year:string; role:string };
export type Field = {key:string;label:string;type?:string;required?:boolean;options?:{value:string;label:string}[];hint?:string;min?:string;max?:string;step?:string};
export type FormSpec = {title:string;description:string;resource:string;fields:Field[];initial?:Row;id?:string};
export const emptySnapshot:Record<string,Row[]> = {contacts:[],products:[],employees:[],transactions:[],ledger:[],tax_rules:[],reminders:[],members:[],audit_logs:[],backup_runs:[]};
// Hide signs only in the UI; retain signed values for accounting and exports.
export const money=(value:unknown,compact=false)=>new Intl.NumberFormat('en-TZ',{minimumFractionDigits:compact?0:2,maximumFractionDigits:compact?1:2,notation:compact?'compact':'standard',signDisplay:'never'}).format(Number(value)||0);
export const dateLabel=(value:string)=>new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
export async function api(path:string, options:RequestInit={}){
 const r=await fetch(`/api/${path}`,{...options,cache:'no-store',credentials:'same-origin',mode:'same-origin',headers:{'Content-Type':'application/json','X-Horizon-Request':'workspace',...options.headers}});
 if(!r.ok){if(r.status>=500)throw new Error('The service is temporarily unavailable. Please try again shortly.');let message='The request could not be completed.';try{const data=await r.json();message=typeof data.detail==='string'?data.detail:'Please check the information entered and try again.';}catch{message=`Service unavailable (${r.status}). Please retry.`;}throw new Error(message);}
 return r.status===204?null:r.json();
}
