import httpx
import pytest
from fastapi import HTTPException
from app import main

@pytest.mark.asyncio
async def test_authentication_is_required_for_records():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
        response = await client.get('/api/workspaces')
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_invalid_reporting_period_rejected_before_query():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
        response = await client.get('/api/reports?start=2026-12-01&end=2026-11-01')
    assert response.status_code == 422

@pytest.mark.asyncio
async def test_staff_cannot_get_financial_reports(monkeypatch):
    async def restricted_snapshot(_request):
        return {'contacts': [], 'transactions': [], 'products': []}
    monkeypatch.setattr(main, 'snapshot', restricted_snapshot)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
        for path in ['/api/overview', '/api/reports', '/api/export']:
            response = await client.get(path)
            assert response.status_code == 403

@pytest.mark.asyncio
async def test_unconfigured_tax_is_not_assumed(monkeypatch):
    async def empty_snapshot(_request):
        return {'tax_rules': []}
    monkeypatch.setattr(main, 'snapshot', empty_snapshot)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
        response = await client.post('/api/tax/estimate', json={'kind': 'VAT', 'base': '1000', 'on': '2026-11-04'})
    assert response.status_code == 422
    assert 'No sourced rule' in response.json()['detail']

@pytest.mark.asyncio
async def test_tenant_denial_propagates_without_data(monkeypatch):
    async def forbidden(*args, **kwargs):
        raise HTTPException(403, 'You do not have access to this business.')
    monkeypatch.setattr(main, 'gateway', forbidden)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
        response = await client.get('/api/products?business=unavailable')
    assert response.status_code == 403
    assert 'data' not in response.json()

@pytest.mark.asyncio
async def test_export_formats_have_expected_signatures(monkeypatch):
    async def empty_snapshot(_request):
        return {'ledger': [], 'transactions': []}
    monkeypatch.setattr(main, 'snapshot', empty_snapshot)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
        for format, signature in [('pdf', b'%PDF'), ('xlsx', b'PK'), ('csv', b'\xef\xbb\xbf')]:
            response = await client.get(f'/api/export?format={format}')
            assert response.status_code == 200
            assert response.content.startswith(signature)

@pytest.mark.asyncio
async def test_chunked_oversize_body_rejected_with_security_headers():
    async def chunks():
        yield b'x' * 1_000_001
        yield b'x' * 1_000_000
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
        response = await client.post('/api/workspaces', content=chunks())
    assert response.status_code == 413
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['x-content-type-options'] == 'nosniff'

@pytest.mark.asyncio
async def test_validation_errors_do_not_echo_submitted_values():
    sensitive = 'private-submitted-value'
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
        response = await client.post('/api/tax/estimate', json={'kind': sensitive, 'base': sensitive, 'on': sensitive})
    assert response.status_code == 422
    assert sensitive not in response.text
    assert 'input' not in response.text
