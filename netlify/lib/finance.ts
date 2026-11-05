import Decimal from 'decimal.js';
Decimal.set({precision:40,rounding:Decimal.ROUND_HALF_UP});
type Row=Record<string,any>;
export type Snapshot=Record<string,Row[]>;
const d=(v:Decimal.Value=0)=>new Decimal(v??0);
const money=(v:Decimal.Value)=>d(v).toFixed(2);
export function balances(s:Snapshot,start?:string,end?:string){
 const transactions=new Map((s.transactions??[]).map(t=>[t.id,t]));const result:Record<string,Decimal>={};
 for(const e of s.ledger??[]){const t=transactions.get(e.transaction_id);if(!t||(start&&t.date<start)||(end&&t.date>end))continue;result[e.account]=(result[e.account]??d()).plus(e.debit).minus(e.credit);}
 return (account:string)=>result[account]??d();
}
export function reports(s:Snapshot,start?:string,end?:string){
 const p=balances(s,start,end),t=balances(s,undefined,end),revenue=p('revenue').neg(),cost=p('cost_of_sales'),expenses=p('expense').plus(p('payroll_expense'));
 const retained=t('revenue').neg().minus(t('cost_of_sales')).minus(t('expense')).minus(t('payroll_expense'));
 const assets=t('cash').plus(t('bank')).plus(t('receivable')).plus(t('inventory')),liabilities=t('payable').neg(),capital=t('equity').neg();
 return Object.fromEntries(Object.entries({sales:revenue,cost_of_sales:cost,gross_profit:revenue.minus(cost),expenses,net_profit:revenue.minus(cost).minus(expenses),cash:t('cash'),bank:t('bank'),inventory:t('inventory'),receivables:t('receivable'),payables:liabilities,assets,liabilities,capital,retained_earnings:retained,equity:capital.plus(retained),balance_check:assets.minus(liabilities).minus(capital).minus(retained)}).map(([k,v])=>[k,money(v)]));
}
export function cashFlow(s:Snapshot,start?:string,end?:string){
 const transactions=new Map((s.transactions??[]).map(t=>[t.id,t]));const result:Record<string,Decimal>={operating:d(),financing:d(),internal_transfers:d()};
 for(const e of s.ledger??[]){const t=transactions.get(e.transaction_id);if(!['cash','bank'].includes(e.account)||!t||(start&&t.date<start)||(end&&t.date>end))continue;const key=t.kind==='capital'?'financing':t.kind==='transfer'?'internal_transfers':'operating';result[key]=result[key].plus(e.debit).minus(e.credit);}
 result.net_cash_change=Object.values(result).reduce((a,b)=>a.plus(b),d());return Object.fromEntries(Object.entries(result).map(([k,v])=>[k,money(v)]));
}
export function overview(s:Snapshot,start:string,end:string){
 const chart=[];const finish=new Date(`${end}T00:00:00Z`);
 for(let n=5;n>=0;n--){const first=new Date(Date.UTC(finish.getUTCFullYear(),finish.getUTCMonth()-n,1)),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0));const period=reports(s,first.toISOString().slice(0,10),last>finish?end:last.toISOString().slice(0,10));chart.push({month:first.toLocaleDateString('en',{month:'short',timeZone:'UTC'}),sales:Number(period.sales),expenses:d(period.expenses).plus(period.cost_of_sales).toNumber()});}
 const active=(s.transactions??[]).filter(t=>!t.reversed_at);
 return {summary:reports(s,start,end),chart,recent:active.slice(0,5),low_stock:(s.products??[]).filter(p=>!p.deleted_at&&p.kind==='product'&&p.quantity<=p.reorder_level),transaction_count:active.filter(t=>start<=t.date&&t.date<=end).length,cash_flow:cashFlow(s,start,end)};
}
export function estimateTax(rule:Row,base:Decimal.Value){
 const value=d(base);if(!value.isFinite()||value.isNegative())throw Error('Tax base must be a non-negative finite amount.');
 if(['PAYE','PRESUMPTIVE'].includes(rule.kind)){
  if(!rule.brackets?.length)throw Error('A complete professionally verified bracket schedule is required.');
  if(rule.kind==='PAYE'){let total=d();for(const b of rule.brackets)total=total.plus(Decimal.max(Decimal.min(value,b.upper??value).minus(b.lower),0).times(b.rate));return money(total);}
  const b=rule.brackets.find((b:Row)=>value.gte(b.lower)&&(b.upper===null||value.lt(b.upper)));if(!b)throw Error('No matching turnover band.');return money(d(b.fixed??0).plus(value.minus(b.lower).times(b.rate)));
 }
 return money(Decimal.max(value.minus(rule.threshold??0),0).times(rule.rate));
}
