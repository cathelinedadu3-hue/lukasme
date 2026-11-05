"""HORIZON SME TOOLS: FastAPI business service, backed by the Netlify PostgreSQL data service."""
import csv
import io
import os
from datetime import date
from decimal import Decimal
from typing import Annotated
from urllib.parse import urlparse
import httpx
from fastapi import FastAPI, Request, HTTPException, Header, Query
from fastapi.responses import Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from .security import SecurityMiddleware
from pydantic import BaseModel, Field
from .finance import overview, reports, cash_flow, estimate_tax

app = FastAPI(title='HORIZON SME TOOLS', version='1.0.0', description='Tenant-isolated business management API. Authentication uses verified Netlify Identity bearer tokens. No TRA filing integration is claimed.')

app.add_middleware(SecurityMiddleware)

@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, error: RequestValidationError):
    # Never echo rejected values (which may contain personal data or credentials).
    return JSONResponse({'detail': [{'loc': issue['loc'], 'type': issue['type'],
                                     'msg': 'Invalid value.'} for issue in error.errors()]}, status_code=422)

def origin():
    value = os.environ.get('SITE_ORIGIN', 'https://horizon-sme-tools.netlify.app').rstrip('/')
    parsed = urlparse(value)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
            or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        raise HTTPException(503, 'SITE_ORIGIN must be the HTTPS origin of the deployed Netlify frontend.')
    return value

async def gateway(request: Request, path: str, method='GET', body=None):
    authorization = request.headers.get('authorization', '')
    if not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Please sign in to access your workspace.')
    if not all(part.replace('_', '').replace('-', '').isalnum() for part in path.split('/') if part):
        raise HTTPException(400, 'Invalid resource path.')
    try:
        async with httpx.AsyncClient(timeout=35, follow_redirects=False) as client:
            response = await client.request(method, f'{origin()}/data/{path}', params=dict(request.query_params), headers={'Authorization': authorization}, json=body)
    except httpx.RequestError:
        raise HTTPException(503, 'The managed data service is unavailable. Retry shortly.')
    if response.status_code >= 400:
        try:
            detail = response.json().get('detail', 'Data service request failed.')
        except ValueError:
            detail = 'The data service returned an invalid response.'
        raise HTTPException(response.status_code, detail)
    try:
        return response.json()
    except ValueError:
        raise HTTPException(502, 'Invalid response from the data service.')

async def snapshot(request):
    return await gateway(request, 'snapshot')

def period(start, end):
    end = end or date.today()
    start = start or end.replace(day=1)
    if start > end:
        raise HTTPException(422, 'Start date must be before the end date.')
    return start.isoformat(), end.isoformat()

@app.get('/health')
async def health():
    return {'status': 'ok', 'service': 'HORIZON FastAPI', 'version': '1.0.0'}

@app.get('/api/overview', tags=['Dashboard'])
async def get_overview(request: Request, start: date | None = None, end: date | None = None):
    start, end = period(start, end)
    data = await snapshot(request)
    if 'ledger' not in data:
        raise HTTPException(403, 'Financial information requires accountant, owner or viewer access.')
    return overview(data, start, end)

@app.get('/api/reports', tags=['Accounting'])
async def get_reports(request: Request, start: date | None = None, end: date | None = None):
    start, end = period(start, end)
    data = await snapshot(request)
    if 'ledger' not in data:
        raise HTTPException(403, 'Financial information requires accountant, owner or viewer access.')
    return {'period': {'start': start, 'end': end}, 'financials': reports(data, start, end), 'cash_flow': cash_flow(data, start, end), 'disclaimer': 'Management accounts from recorded transactions. An accountant should review opening balances, adjustments, accruals, and tax provisions before statutory use.'}

class TaxRequest(BaseModel):
    kind: str = Field(pattern='^(VAT|PAYE|SDL|WCF|WHT|CIT|PRESUMPTIVE)$')
    base: Decimal = Field(ge=0, le=Decimal('10000000000000'), decimal_places=2)
    on: date

@app.post('/api/tax/estimate', tags=['Tax estimates'])
async def calculate_tax(request: Request, body: TaxRequest):
    data = await snapshot(request)
    rules = [r for r in data.get('tax_rules', []) if r['kind'] == body.kind and r['effective_from'] <= body.on.isoformat() <= r['effective_to']]
    if not rules:
        raise HTTPException(422, 'No sourced rule is configured for this tax and effective date. Add and professionally verify a rule first.')
    rule = max(rules, key=lambda r: r['version'])
    try:
        amount = estimate_tax(rule, body.base)
    except ValueError as error:
        raise HTTPException(422, str(error))
    return {'amount': amount, 'base': str(body.base), 'rule': rule, 'currency': 'TZS', 'disclaimer': 'Estimate using your configured rule. The source and applicability need professional verification. This is not an official TRA assessment or filing.'}

@app.get('/api/export', tags=['Exports'])
async def export_report(request: Request, format: str = Query('csv', pattern='^(csv|xlsx|pdf)$'), report: str = Query('all', pattern='^(all|profit|balance|cash)$'), start: date | None = None, end: date | None = None):
    start, end = period(start, end)
    data = await snapshot(request)
    if 'ledger' not in data:
        raise HTTPException(403, 'Financial exports are not available to staff.')
    values = reports(data, start, end)
    if report == 'profit':
        values = {key: value for key, value in values.items() if key in ('sales','cost_of_sales','gross_profit','expenses','net_profit')}
    elif report == 'balance':
        values = {key: value for key, value in values.items() if key not in ('sales','cost_of_sales','gross_profit','expenses','net_profit')}
    elif report == 'cash':
        values = cash_flow(data, start, end)
    rows = [['HORIZON SME TOOLS — Management accounts', 'TZS'], ['Period', f'{start} to {end}'], *[[key.replace('_', ' ').title(), value] for key, value in values.items()]]
    if format == 'csv':
        output = io.StringIO(); csv.writer(output).writerows(rows)
        content = output.getvalue().encode('utf-8-sig'); mime = 'text/csv'
    elif format == 'xlsx':
        from openpyxl import Workbook
        workbook = Workbook(); sheet = workbook.active; sheet.title = 'Financial report'
        for row in rows: sheet.append(row)
        sheet.column_dimensions['A'].width = 48; sheet.column_dimensions['B'].width = 32
        output = io.BytesIO(); workbook.save(output); content = output.getvalue(); mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    else:
        from reportlab.pdfgen import canvas
        output = io.BytesIO(); page = canvas.Canvas(output); page.setTitle('HORIZON Financial Report'); y = 800
        for row in rows:
            page.drawString(45, y, str(row[0])); page.drawRightString(550, y, str(row[1])); y -= 25
        page.setFont('Helvetica', 9); page.drawString(45, 80, 'Management accounts. Not an official tax assessment or audited financial statement.'); page.save(); content = output.getvalue(); mime = 'application/pdf'
    return Response(content, media_type=mime, headers={'Content-Disposition': f'attachment; filename="horizon-report.{format}"'})

@app.get('/api/invoices/{transaction_id}', tags=['Sales documents'])
async def invoice(transaction_id: str, request: Request):
    data = await snapshot(request)
    transaction = next((t for t in data.get('transactions', []) if t['id'] == transaction_id and t['kind'] == 'sale'), None)
    if not transaction:
        raise HTTPException(404, 'Sales document not found.')
    contact = next((c for c in data.get('contacts', []) if c['id'] == transaction.get('contact_id')), {})
    product = next((p for p in data.get('products', []) if p['id'] == transaction.get('product_id')), {})
    from reportlab.pdfgen import canvas
    output = io.BytesIO()
    page = canvas.Canvas(output)
    page.setTitle(f"HORIZON {transaction['reference']}")
    page.setFillColorRGB(.10, .16, .23)
    page.rect(0, 710, 600, 135, fill=1, stroke=0)
    page.setFillColorRGB(.86, .75, .55)
    page.setFont('Helvetica-Bold', 22)
    page.drawString(45, 790, 'HORIZON SME TOOLS')
    page.setFillColorRGB(1, 1, 1)
    page.setFont('Helvetica', 12)
    page.drawString(45, 752, 'SALES RECEIPT' if transaction['status'] == 'paid' else 'SALES INVOICE')
    page.setFillColorRGB(.15, .20, .27)
    page.setFont('Helvetica', 11)
    rows = [('Reference', transaction['reference']), ('Date', transaction['date']), ('Customer', contact.get('name', 'Walk-in customer')), ('Description', transaction['description']), ('Product / service', product.get('name', 'General sale')), ('Quantity', transaction.get('quantity') or 'Not applicable'), ('Amount (TZS)', transaction['amount']), ('Status', 'REVERSED' if transaction.get('reversed_at') else transaction['status'].upper())]
    y = 670
    for label, value in rows:
        page.drawString(45, y, label)
        page.drawRightString(550, y, str(value)[:70])
        y -= 39
    page.setFont('Helvetica', 9)
    page.drawString(45, 130, 'Amounts are recorded as entered. No tax rate has been assumed or added.')
    page.drawString(45, 112, 'This document is not a TRA EFD fiscal receipt or official tax filing.')
    page.save()
    return Response(output.getvalue(), media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="{transaction["reference"]}.pdf"'})

@app.get('/api/workspaces', tags=['Businesses'])
async def workspaces(request: Request):
    return await gateway(request, 'workspaces')

class Business(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    tin: str = Field(default='', max_length=50)
    address: str = Field(default='', max_length=500)

@app.post('/api/workspaces', status_code=201, tags=['Businesses'])
async def create_workspace(request: Request, body: Business):
    return await gateway(request, 'workspaces', 'POST', body.model_dump())

@app.api_route('/api/{path:path}', methods=['GET','POST','PATCH','DELETE'], tags=['Business records'])
async def records(path: str, request: Request):
    allowed = {'snapshot', 'business', 'contacts', 'products', 'employees', 'transactions', 'ledger', 'tax_rules', 'reminders', 'members', 'audit_logs', 'backups', 'backup_runs'}
    if path.split('/')[0] not in allowed:
        raise HTTPException(404, 'Endpoint not found.')
    body = None
    if request.method in ('POST','PATCH'):
        try:
            body = await request.json()
        except ValueError:
            raise HTTPException(422, 'Provide a valid JSON request body.')
    return await gateway(request, path, request.method, body)
