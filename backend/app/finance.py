"""Exact-decimal financial projections from the immutable double-entry journal."""
from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal('0')
def decimal(value):
    return Decimal(str(value or 0))
def currency(value):
    return str(decimal(value).quantize(Decimal('.01'), rounding=ROUND_HALF_UP))
def balances(snapshot, start=None, end=None):
    transactions = {t['id']: t for t in snapshot.get('transactions', [])}
    result = defaultdict(lambda: ZERO)
    for entry in snapshot.get('ledger', []):
        transaction = transactions.get(entry['transaction_id'])
        if transaction is None:
            continue
        day = transaction['date'][:10]
        if start and day < start or end and day > end:
            continue
        result[entry['account']] += decimal(entry['debit']) - decimal(entry['credit'])
    return result

def reports(snapshot, start=None, end=None):
    period = balances(snapshot, start, end)
    total = balances(snapshot, end=end)
    revenue = -period['revenue']
    cost = period['cost_of_sales']
    expenses = period['expense'] + period['payroll_expense']
    lifetime_profit = -total['revenue'] - total['cost_of_sales'] - total['expense'] - total['payroll_expense']
    assets = total['cash'] + total['bank'] + total['receivable'] + total['inventory']
    liabilities = -total['payable']
    capital = -total['equity']
    rows = {
        'sales': revenue, 'cost_of_sales': cost, 'gross_profit': revenue - cost,
        'expenses': expenses, 'net_profit': revenue - cost - expenses,
        'cash': total['cash'], 'bank': total['bank'], 'inventory': total['inventory'],
        'receivables': total['receivable'], 'payables': liabilities,
        'assets': assets, 'liabilities': liabilities, 'capital': capital,
        'retained_earnings': lifetime_profit, 'equity': capital + lifetime_profit,
        'balance_check': assets - liabilities - capital - lifetime_profit,
    }
    return {key: currency(value) for key, value in rows.items()}

def cash_flow(snapshot, start=None, end=None):
    transactions = {t['id']: t for t in snapshot.get('transactions', [])}
    result = defaultdict(lambda: ZERO)
    for entry in snapshot.get('ledger', []):
        if entry['account'] not in ('cash', 'bank'):
            continue
        t = transactions.get(entry['transaction_id'])
        if not t or start and t['date'] < start or end and t['date'] > end:
            continue
        category = 'financing' if t['kind'] == 'capital' else 'internal_transfers' if t['kind'] == 'transfer' else 'operating'
        result[category] += decimal(entry['debit']) - decimal(entry['credit'])
    result['net_cash_change'] = sum(result.values(), ZERO)
    return {key: currency(value) for key, value in result.items()}

def overview(snapshot, start, end):
    summary = reports(snapshot, start, end)
    months = []
    today = date.fromisoformat(end)
    for offset in reversed(range(6)):
        absolute = today.year * 12 + today.month - 1 - offset
        year, month = absolute // 12, absolute % 12 + 1
        first = date(year, month, 1)
        next_absolute = absolute + 1
        next_first = date(next_absolute // 12, next_absolute % 12 + 1, 1)
        from datetime import timedelta
        last = min(next_first - timedelta(days=1), today)
        period = reports(snapshot, first.isoformat(), last.isoformat())
        months.append({'month': first.strftime('%b'), 'sales': float(period['sales']), 'expenses': float(period['expenses']) + float(period['cost_of_sales'])})
    active = [t for t in snapshot.get('transactions', []) if not t.get('reversed_at')]
    products = [p for p in snapshot.get('products', []) if not p.get('deleted_at') and p['kind'] == 'product']
    return {'summary': summary, 'chart': months, 'recent': active[:5], 'low_stock': [p for p in products if p['quantity'] <= p['reorder_level']], 'transaction_count': len([t for t in active if start <= t['date'] <= end]), 'cash_flow': cash_flow(snapshot, start, end)}

def estimate_tax(rule, base):
    """Estimates from user-sourced versions. No statutory rates are embedded."""
    value = decimal(base)
    if not value.is_finite() or value < 0:
        raise ValueError('Tax base must be a non-negative finite amount.')
    if rule['kind'] in ('PAYE', 'PRESUMPTIVE'):
        bands = rule.get('brackets', [])
        if not bands:
            raise ValueError('A verified complete bracket schedule is required for this tax.')
        if rule['kind'] == 'PAYE':
            result = ZERO
            for band in bands:
                lower = decimal(band['lower'])
                upper = decimal(band['upper']) if band.get('upper') is not None else value
                result += max(min(value, upper) - lower, ZERO) * decimal(band['rate'])
            return currency(result)
        for band in bands:
            lower = decimal(band['lower'])
            if value >= lower and (band.get('upper') is None or value < decimal(band['upper'])):
                return currency(decimal(band.get('fixed')) + (value - lower) * decimal(band['rate']))
        raise ValueError('No matching band in the configured turnover schedule.')
    return currency(max(value - decimal(rule.get('threshold')), ZERO) * decimal(rule['rate']))
