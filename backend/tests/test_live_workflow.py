"""Opt-in integration tests. Run ONLY against an isolated staging site with disposable accounts."""
import asyncio
import os
from datetime import date
from uuid import uuid4
import httpx
import pytest

SITE = os.getenv('HORIZON_TEST_SITE', '').rstrip('/')
TOKEN = os.getenv('HORIZON_TEST_TOKEN', '')
OTHER_TOKEN = os.getenv('HORIZON_OTHER_TEST_TOKEN', '')
pytestmark = pytest.mark.skipif(not (SITE and TOKEN and os.getenv('HORIZON_INTEGRATION_CONFIRM') == 'isolated_staging'), reason='Requires explicitly isolated staging site and authenticated test account')

@pytest.mark.asyncio
async def test_persistent_accounting_stock_idempotency_concurrency_and_restore():
    # Direct data-service calls let the test prove constraints cannot be bypassed around Python.
    async with httpx.AsyncClient(base_url=SITE, headers={'Authorization': f'Bearer {TOKEN}'}, timeout=45) as c:
        b = await c.post('/data/workspaces', json={'name': f'Integration {uuid4().hex[:8]}'})
        assert b.status_code == 201
        business = b.json()['id']
        suffix = f'?business={business}'
        async def create(path, body):
            r = await c.post(f'/data/{path}{suffix}', json=body)
            assert r.status_code in (200, 201), r.text
            return r.json()
        p = await create('products', {'name': 'Integration stock item', 'sku': uuid4().hex, 'price': 50, 'cost': 0, 'quantity': 0})
        customer = await create('contacts', {'name': 'Integration customer', 'kind': 'customer'})
        supplier = await create('contacts', {'name': 'Integration supplier', 'kind': 'supplier'})
        employee = await create('employees', {'name': 'Integration employee', 'position': 'Test', 'salary': 25})
        async def post(kind, amount, **extra):
            return await create('transactions', {'kind': kind, 'amount': amount, 'description': f'Integration {kind}', 'date': date.today().isoformat(), 'account': 'cash', 'status': 'paid', 'idempotency_key': str(uuid4()), **extra})
        await post('capital', 1000)
        await post('purchase', 200, product_id=p['id'], quantity=10, contact_id=supplier['id'])
        key = str(uuid4())
        sale = await post('sale', 100, product_id=p['id'], quantity=2, idempotency_key=key)
        duplicate = await post('sale', 100, product_id=p['id'], quantity=2, idempotency_key=key)
        assert duplicate['id'] == sale['id']
        await post('sale', 50, product_id=p['id'], quantity=1, status='pending', contact_id=customer['id'])
        await post('receipt', 50, contact_id=customer['id'])
        await post('expense', 25)
        await post('payroll', 25, employee_id=employee['id'])
        snapshot = (await c.get(f'/data/snapshot{suffix}')).json()
        assert snapshot['products'][0]['quantity'] == 7
        assert len(snapshot['transactions']) == 7
        # Reconnect in a separate client: persistence must not depend on process/session memory.
        async with httpx.AsyncClient(base_url=SITE, headers={'Authorization': f'Bearer {TOKEN}'}, timeout=45) as second:
            persisted = (await second.get(f'/data/snapshot{suffix}')).json()
            assert len(persisted['transactions']) == 7
        invalid = await c.post(f'/data/transactions{suffix}', json={'kind': 'sale', 'amount': 900, 'description': 'Oversell', 'date': date.today().isoformat(), 'product_id': p['id'], 'quantity': 8, 'idempotency_key': str(uuid4())})
        assert invalid.status_code == 409
        # Competing sales for the last stock: only one may commit.
        payload = {'kind': 'sale', 'amount': 300, 'description': 'Concurrent sale', 'date': date.today().isoformat(), 'product_id': p['id'], 'quantity': 7}
        responses = await asyncio.gather(*[c.post(f'/data/transactions{suffix}', json={**payload, 'idempotency_key': str(uuid4())}) for _ in range(2)])
        assert sorted(r.status_code for r in responses) == [201, 409]
        if OTHER_TOKEN:
            denied = await c.get(f'/data/snapshot{suffix}', headers={'Authorization': f'Bearer {OTHER_TOKEN}'})
            assert denied.status_code == 403
        backup = await create('backups', {})
        downloaded = await c.get(f'/data/backups/{backup["id"]}{suffix}')
        assert downloaded.status_code == 200
        assert downloaded.json()['format'] == 'horizon-backup-v1'
        restored = await c.post(f'/data/backups/{backup["id"]}/restore{suffix}', json={})
        assert restored.status_code == 201
        assert restored.json()['id'] != business
        copy = (await c.get(f'/data/snapshot?business={restored.json()["id"]}')).json()
        assert len(copy['transactions']) == len(downloaded.json()['data']['transactions'])
        assert len(copy['ledger']) == len(downloaded.json()['data']['ledger'])
        assert len(copy['members']) == 1
        assert all(r['business_id'] == restored.json()['id'] for r in copy['transactions'])
