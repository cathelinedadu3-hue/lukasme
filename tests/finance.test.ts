import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reports,cashFlow,overview,estimateTax,type Snapshot } from '../netlify/lib/finance.js';
import { csv,pdf,spreadsheet } from '../netlify/lib/documents.js';
import { PDFDocument } from 'pdf-lib';
import { unzipSync,strFromU8 } from 'fflate';
function fixture(){const s:Snapshot={transactions:[],ledger:[],products:[]};const post=(id:string,kind:string,debit:string,credit:string,amount:string,date='2026-11-04')=>{if(!s.transactions.some(t=>t.id===id))s.transactions.push({id,kind,date});s.ledger.push({transaction_id:id,account:debit,debit:amount,credit:'0'},{transaction_id:id,account:credit,debit:'0',credit:amount});};post('capital','capital','cash','equity','1000');post('purchase','purchase','inventory','cash','200');post('sale','sale','cash','revenue','300');post('sale','sale','cost_of_sales','inventory','80');post('expense','expense','expense','cash','50');post('payroll','payroll','payroll_expense','cash','100');return {s,post};}
test('journal yields balanced accounts and correct weighted stock profit',()=>{const {s}=fixture();const r=reports(s);assert.equal(r.gross_profit,'220.00');assert.equal(r.net_profit,'70.00');assert.equal(r.cash,'950.00');assert.equal(r.inventory,'120.00');assert.equal(r.assets,'1070.00');assert.equal(r.equity,'1070.00');assert.equal(r.balance_check,'0.00');});
test('credit settlement and transfers do not double count revenue or profit',()=>{const {s,post}=fixture();post('credit','sale','receivable','revenue','125.20');post('settle','receipt','bank','receivable','100.10');post('transfer','transfer','bank','cash','200');const r=reports(s);assert.equal(r.sales,'425.20');assert.equal(r.receivables,'25.10');assert.equal(r.bank,'300.10');assert.equal(r.balance_check,'0.00');assert.equal(cashFlow(s).internal_transfers,'0.00');});
test('reversal cancels original effect',()=>{const {s,post}=fixture();post('expense','expense','cash','expense','50');assert.equal(reports(s).expenses,'100.00');assert.equal(reports(s).balance_check,'0.00');});
test('period reporting retains opening balances',()=>{const {s,post}=fixture();post('opening','capital','bank','equity','11.25','2026-10-31');const r=reports(s,'2026-11-01','2026-11-30');assert.equal(r.bank,'11.25');assert.equal(r.sales,'300.00');assert.equal(r.balance_check,'0.00');});
test('large decimal balances remain exact and zero workspace is empty',()=>{const {s,post}=fixture();post('large','capital','bank','equity','99999999999999999.99');post('cent','capital','bank','equity','0.01');assert.equal(reports(s).bank,'100000000000000000.00');const o=overview({transactions:[],ledger:[],products:[]},'2026-11-01','2026-11-30');assert.equal(o.summary.sales,'0.00');assert.deepEqual(o.recent,[]);assert.equal(o.chart.length,6);});
test('synthetic flat tax uses thresholds and half-up rounding',()=>{assert.equal(estimateTax({kind:'VAT',rate:'.137',threshold:'30'},'130'),'13.70');assert.equal(estimateTax({kind:'VAT',rate:'.1'},'10.05'),'1.01');});
test('synthetic PAYE bands and presumptive fixed-plus-excess schedules',()=>{const brackets=[{lower:'0',upper:'100',rate:'0',fixed:'0'},{lower:'100',upper:'300',rate:'.1',fixed:'7'},{lower:'300',upper:null,rate:'.2',fixed:'27'}];assert.equal(estimateTax({kind:'PAYE',brackets},'100'),'0.00');assert.equal(estimateTax({kind:'PAYE',brackets},'350'),'30.00');assert.equal(estimateTax({kind:'PRESUMPTIVE',brackets},'140'),'11.00');for(const base of ['-1','NaN','Infinity'])assert.throws(()=>estimateTax({kind:'VAT',rate:'.1'},base));assert.throws(()=>estimateTax({kind:'PAYE'},'100'));});
test('exports are valid documents and neutralize spreadsheet formulas',async()=>{const rows=[['Amount','1.20'],['=unsafe','+unsafe']];assert.match(csv(rows),/'=unsafe/);const bytes=await pdf('Report',rows,'Management accounts only.');assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);const buffer=await spreadsheet(rows);const files=unzipSync(buffer);assert.ok(files['xl/workbook.xml']);const sheet=strFromU8(files['xl/worksheets/sheet1.xml']);assert.match(sheet,/<t xml:space="preserve">1.20<\/t>/);assert.match(sheet,/t="inlineStr"/);assert.ok(!sheet.includes('<f>'));});

test('ledger PDFs paginate four columns and retain document branding',async()=>{
 const rows=Array.from({length:80},(_,i)=>[`inventory ${i}`,'1,200.00','0.00','04 Nov 2026']);
 const bytes=await pdf('General ledger',rows,'Management accounts require accountant review.',{subtitle:'Synthetic test business | 01 Nov 2026 - 04 Nov 2026',columns:['Account','Debit (TZS)','Credit (TZS)','Recorded']});
 const document=await PDFDocument.load(bytes);
 assert.equal(document.getTitle(),'General ledger');
 assert.equal(document.getAuthor(),'HORIZON SME TOOLS');
 assert.ok(document.getPageCount()>1);
 for(const page of document.getPages()){
  assert.equal(page.getWidth(),595.28);
  assert.equal(page.getHeight(),841.89);
 }
});
