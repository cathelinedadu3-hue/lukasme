"""Synthetic accounting and tax fixtures. Test rates are NOT Tanzania tax guidance."""
from decimal import Decimal
import pytest
from app.finance import reports, cash_flow, estimate_tax, currency, overview


def fixture():
    data = {'transactions': [], 'ledger': [], 'products': []}
    def post(id, kind, debit, credit, amount, day='2026-11-04'):
        if not any(t['id'] == id for t in data['transactions']):
            data['transactions'].append({'id': id, 'kind': kind, 'date': day})
        data['ledger'].extend([{'transaction_id': id, 'account': debit, 'debit': amount, 'credit': '0'}, {'transaction_id': id, 'account': credit, 'debit': '0', 'credit': amount}])
    post('capital', 'capital', 'cash', 'equity', '1000')
    post('purchase', 'purchase', 'inventory', 'cash', '200')
    post('sale', 'sale', 'cash', 'revenue', '300')
    post('sale', 'sale', 'cost_of_sales', 'inventory', '80')
    post('expense', 'expense', 'expense', 'cash', '50')
    post('payroll', 'payroll', 'payroll_expense', 'cash', '100')
    return data, post


def test_double_entry_balance_and_profit():
    data, _ = fixture()
    result = reports(data)
    assert result['gross_profit'] == '220.00'
    assert result['net_profit'] == '70.00'
    assert result['cash'] == '950.00'
    assert result['inventory'] == '120.00'
    assert result['assets'] == '1070.00'
    assert result['equity'] == '1070.00'
    assert result['balance_check'] == '0.00'


def test_receivables_and_settlements_do_not_duplicate_revenue():
    data, post = fixture()
    post('credit_sale', 'sale', 'receivable', 'revenue', '125.20')
    post('receipt', 'receipt', 'bank', 'receivable', '100.10')
    result = reports(data)
    assert result['sales'] == '425.20'
    assert result['receivables'] == '25.10'
    assert result['bank'] == '100.10'
    assert result['balance_check'] == '0.00'


def test_transfer_does_not_change_cash_flow_or_profit():
    data, post = fixture()
    before = reports(data)
    post('transfer', 'transfer', 'bank', 'cash', '200')
    after = reports(data)
    assert after['net_profit'] == before['net_profit']
    assert Decimal(after['cash']) + Decimal(after['bank']) == Decimal(before['cash'])
    assert cash_flow(data)['internal_transfers'] == '0.00'


def test_reversal_cancels_ledger_effect():
    data, post = fixture()
    post('expense', 'expense', 'cash', 'expense', '50')
    assert reports(data)['expenses'] == '100.00'
    assert reports(data)['balance_check'] == '0.00'


def test_period_filters_and_opening_balances():
    data, post = fixture()
    post('earlier', 'capital', 'bank', 'equity', '11.25', '2026-10-31')
    result = reports(data, '2026-11-01', '2026-11-30')
    assert result['bank'] == '11.25'
    assert result['sales'] == '300.00'
    assert result['balance_check'] == '0.00'


def test_exact_rounding():
    assert currency(Decimal('0.1') + Decimal('0.2')) == '0.30'
    assert currency('1.005') == '1.01'


def test_empty_workspace_is_zero_and_never_seeded():
    result = overview({'transactions': [], 'ledger': [], 'products': []}, '2026-11-01', '2026-11-30')
    assert all(Decimal(v) == 0 for v in result['summary'].values())
    assert all(month['sales'] == 0 for month in result['chart'])
    assert result['recent'] == []


def test_configured_rate_and_threshold_only():
    rule = {'kind': 'VAT', 'rate': '.137', 'threshold': '30'}
    assert estimate_tax(rule, '130') == '13.70'
    assert estimate_tax(rule, '10') == '0.00'


def test_progressive_marginal_band_boundaries():
    # Artificial bands test mechanics, not statutory rates or thresholds.
    rule = {'kind': 'PAYE', 'brackets': [{'lower': '0', 'upper': '100', 'rate': '0'}, {'lower': '100', 'upper': '300', 'rate': '.1'}, {'lower': '300', 'upper': None, 'rate': '.2'}]}
    assert estimate_tax(rule, '100') == '0.00'
    assert estimate_tax(rule, '300') == '20.00'
    assert estimate_tax(rule, '350') == '30.00'


def test_presumptive_fixed_plus_excess():
    rule = {'kind': 'PRESUMPTIVE', 'brackets': [{'lower': '0', 'upper': '100', 'rate': '0', 'fixed': '0'}, {'lower': '100', 'upper': None, 'rate': '.05', 'fixed': '7'}]}
    assert estimate_tax(rule, '140') == '9.00'


@pytest.mark.parametrize('value', ['-1', 'NaN', 'Infinity'])
def test_invalid_tax_base_rejected(value):
    with pytest.raises(ValueError):
        estimate_tax({'kind': 'VAT', 'rate': '.1', 'threshold': 0}, value)


def test_progressive_tax_requires_bands():
    with pytest.raises(ValueError):
        estimate_tax({'kind': 'PAYE', 'rate': '.1'}, '100')
