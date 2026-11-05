# Business API

The browser calls same-origin TypeScript Netlify Functions at `/api/*`. The API invokes the authenticated PostgreSQL handler directly, without a Python service or outbound backend proxy. Identity tokens come from the SDK session cookie or an explicit bearer header. Browser mutations require a matching Origin and `X-Horizon-Request: workspace`. Direct `/data/*` clients require explicit bearer authentication. Never log tokens.

Every business-specific request needs `?business=<workspace UUID>`. The data service verifies confirmed email and current business membership independently on each request. No client-selected role is authoritative.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/connection` | Real database query and Identity settings reachability; not authenticated workflow certification. |
| GET / POST | `/api/workspaces` | List current memberships / create a business with an owner membership. |
| PATCH | `/api/business` | Update business name, TIN and address (owner). |
| GET | `/api/snapshot` | Consistent relational snapshot; staff payloads omit protected modules. |
| GET / POST | `/api/contacts` | List / create customers and suppliers. |
| PATCH / DELETE | `/api/contacts/{id}` | Edit / soft-archive. Outstanding balances must be settled first. |
| GET / POST | `/api/products` | List / create zero-stock products or services. |
| PATCH / DELETE | `/api/products/{id}` | Edit descriptive fields / archive zero-stock items. Stock and cost cannot be edited. |
| GET / POST | `/api/employees` | Employee register and monthly gross salary. |
| PATCH / DELETE | `/api/employees/{id}` | Update / soft-archive employee. |
| GET / POST | `/api/transactions` | List / post sale, purchase, expense, payroll, capital, transfer, receipt or payment. |
| DELETE | `/api/transactions/{id}` | Reverse journal effect and applicable stock movements. Never erase the original. |
| GET | `/api/ledger` | Immutable journal entries (excluding staff). |
| GET | `/api/overview` | Exact-decimal KPIs and six-month chart. |
| GET | `/api/reports` | Profit and loss, balance sheet, cash flow, balance check. |
| GET | `/api/export` | Financial report export; `format=csv|xlsx|pdf`, `report=all|profit|balance|cash`. |
| GET | `/api/invoices/{transaction_id}` | PDF sales invoice/receipt, explicitly not a TRA EFD fiscal receipt. |
| GET / POST | `/api/tax_rules` | List / create immutable, sourced tax-rule versions (owner writes). |
| POST | `/api/tax/estimate` | Apply a configured rule to a base and effective date. |
| GET / POST | `/api/reminders` | List / create in-app compliance reminders. |
| PATCH | `/api/reminders/{id}` | Set completed to 0 or 1. |
| GET / POST | `/api/members` | List / add email-based membership (owner writes). |
| DELETE | `/api/members/{id}` | Remove non-owner access. |
| GET | `/api/audit_logs` | Read-only business audit history. |
| GET / POST | `/api/backups` | List / create private snapshot (owner). |
| GET | `/api/backups/{id}` | Download and verify the stored archive checksum. |
| POST | `/api/backups/{id}/restore` | Restore a new business copy with fresh IDs and owner-only membership. |

Financial routes accept optional ISO `start` and `end` dates. Defaults cover the current calendar month. Balance-sheet amounts are cumulative through the end date; profit and loss and cash-flow amounts cover the selected period. Reversals restate the original transaction's accounting date rather than creating a separate dated adjustment.

## Transaction fields

`kind`, `description`, positive `amount`, ISO `date`, `account` (`cash` or `bank`), `status` (`paid` or `pending`) and UUID `idempotency_key`. Optional fields are `contact_id`, `product_id`, `employee_id`, and integer `quantity`.

Stock purchases require a product and positive quantity. Sales with stock products check availability and post weighted-average cost of sales from exact journal valuation. Services have no stock effect. Pending sales/expenses/purchases require the corresponding active customer or supplier. Customer receipts and supplier payments require an existing balance and cannot exceed it. Payroll records a gross payment against an employee. Transfer `account` is the source; the destination is the other cash/bank account. Capital credits owner equity. Amounts are recorded as entered; VAT is not automatically separated from revenue.

Journal pairs: sale → cash/receivable versus revenue; cost of stock sold → cost of sales versus inventory; purchase → inventory versus cash/payable; expense/payroll → expense versus cash/payable; capital → cash versus equity; receipt → cash versus receivable; supplier payment → payable versus cash; transfer → bank versus cash or vice versa. Reversals swap debit and credit. Reversals that would create negative stock/valuation or invalidate settlements are refused.

## Tax rules

Rules have `kind`, positive `version`, `effective_from`, `effective_to`, fractional `rate`, monetary `threshold`, `brackets`, official `source` URL and legal-basis `notes`. Versions cannot be edited or deleted. For overlapping effective dates, the highest version wins. Sources must use an approved official HTTPS domain; a source URL is not proof of independent verification.

For PAYE, supply ordered, contiguous marginal `brackets` beginning at zero. Each band has `lower`, `upper` (null for the final band), decimal `rate` and `fixed`. PAYE sums marginal amounts and ignores `fixed`. Presumptive tax selects the matching turnover band and applies `fixed + (base - lower) × rate`. Other supported taxes use `max(base - threshold, 0) × rate`. Complex exemptions, VAT apportionment, PAYE benefit definitions, turnover eligibility and corporate adjustments must be resolved before entering the taxable base. Rates, thresholds and scopes are never automatically inferred.

Error statuses: 401 unauthenticated/expired/unconfirmed; 403 insufficient membership/role; 404 missing record; 409 duplicates/stock conflict/unsafe reversal; 422 invalid fields/rules; 429 rate limit; 503 unavailable Netlify service. Error messages do not contain database SQL or credential values.

Collection GET routes support optional `q` text search and `page` / `page_size` (1–100) pagination. When `page` is supplied the response is `{items,total,page,page_size}`; otherwise existing array responses are preserved. An individual UUID route returns one record or 404. Search columns and table names are server allowlisted. The dashboard snapshot remains a complete consistent read; large-business aggregation is still a scaling limitation.
