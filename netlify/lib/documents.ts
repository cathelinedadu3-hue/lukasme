import { PDFDocument,StandardFonts,rgb } from 'pdf-lib';
import { zipSync,strToU8 } from 'fflate';
export type PdfLayout={subtitle?:string;columns?:string[];widths?:number[]};
export async function pdf(title:string,rows:string[][],notice:string,layout:PdfLayout={}){
 const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const clean=(v:string)=>String(v).normalize('NFKD').replace(/[^\x20-\x7E]/g,' ');
 const navy=rgb(.095,.135,.195),line=rgb(.18,.23,.29),text=rgb(.76,.81,.88),muted=rgb(.54,.63,.73),gold=rgb(.81,.69,.47);
 const width=595.28,height=841.89,left=28,right=width-28,available=right-left;
 const columns=layout.columns??['Description','Details'];
 const widths=layout.widths??(columns.length===4?[.27,.27,.27,.19]:[.53,.47]);
 const wrap=(value:string,max:number,size:number)=>{
  const result:string[]=[];let current='';
  for(const char of clean(value)){if(font.widthOfTextAtSize(current+char,size)>max&&current){result.push(current);current='';}current+=char;}result.push(current);return result;
 };
 let page:ReturnType<typeof doc.addPage>,y=0;
 const draw=(value:string,x:number,baseline:number,size=9,color=text,strong=false)=>page.drawText(clean(value),{x,y:baseline,size,font:strong?bold:font,color});
 const rule=(baseline:number)=>page.drawLine({start:{x:left,y:baseline},end:{x:right,y:baseline},thickness:.5,color:line});
 const footer=()=>{
  rule(76);const lines=wrap(notice,available-20,7);
  lines.forEach((v,i)=>draw(v,left+12,60-i*10,7,muted));
  draw(String(doc.getPageCount()),right-10,22,7,muted);
 };
 const heading=()=>{
  page=doc.addPage([width,height]);page.drawRectangle({x:0,y:0,width,height,color:navy});
  // The same geometric H mark used by the application logo.
  for(const [x1,y1,x2,y2] of [[31,793,31,812],[46,793,46,812],[31,801,38.5,806],[38.5,806,46,801],[31,795,38.5,800],[38.5,800,46,795]])page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:1.7,color:gold});
  draw('HORIZON',58,805,13,text,true);draw('S M E   T O O L S',58,792,5.5,text,true);
  const titleLines=wrap(title,290,15);
  titleLines.forEach((v,i)=>draw(v,right-bold.widthOfTextAtSize(v,15),805-i*18,15,text,true));
  const subtitleLines=wrap(layout.subtitle??'',available,8);
  subtitleLines.forEach((v,i)=>draw(v,right-font.widthOfTextAtSize(v,8),768-i*11,8,muted));
  y=Math.min(744,755-subtitleLines.length*11-titleLines.length*4);rule(y);y-=25;
  let x=left+12;columns.forEach((label,i)=>{draw(label,x,y,7,muted);x+=available*widths[i];});y-=12;rule(y);
 };
 heading();
 for(const row of rows.length?rows:[['No records in this period',...columns.slice(1).map(()=>'')]]){
  const cells=columns.map((_,i)=>wrap(row[i]??'',available*widths[i]-24,9));
  const rowHeight=Math.max(30,Math.max(...cells.map(c=>c.length))*12+18);
  const maxLines=48;
  const lineCount=Math.max(...cells.map(c=>c.length));
  // Split unusually long cells across pages instead of truncating their contents.
  for(let offset=0;offset<lineCount;offset+=maxLines){
   const count=Math.min(maxLines,lineCount-offset),h=Math.min(rowHeight,count*12+18);
   if(y-h<94){footer();heading();}
   let x=left+12;cells.forEach((lines,i)=>{lines.slice(offset,offset+count).forEach((v,j)=>draw(v,x,y-19-j*12));x+=available*widths[i];});
   y-=h;rule(y);
  }
 }
 footer();doc.setTitle(clean(title));doc.setAuthor('HORIZON SME TOOLS');return doc.save();
}
export async function spreadsheet(rows:string[][]){
 const xml=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
 const files:Record<string,string>={
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Financial report" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="52" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/></cols><sheetData>'+rows.map((r,i)=>`<row r="${i+1}">${r.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`).join('')}</row>`).join('')+'</sheetData></worksheet>'
 };
 return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+v)])));
}
export function csv(rows:string[][]){return '\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');}
