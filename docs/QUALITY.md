# Quality and release validation

Native TypeScript tests passed during the migration: accounting balance/profit, settlements, reversals, period opening balances, exact large decimals, tax mechanics, document exports, anonymous API rejection and cross-site mutation rejection. TypeScript checking included frontend and Netlify Functions. A real managed-database query and local `/api/connection` check succeeded. The 12 desktop/phone browser checks passed in Chromium. Safari/WebKit execution was unavailable because required system libraries could not be installed with the available permissions. These checks do not certify signed-in workflows or production readiness. The platform performs deployment build/migration validation separately.

## Automated suites

The deployed TypeScript suite runs with `npm test`; `npm run typecheck` checks the complete application. The earlier Python tests are retained as reference only. From a Python virtual environment, install `backend/requirements.txt`, then run `cd backend && pytest`. `test_finance.py` checks double-entry balance, exact rounding, period filters, stock cost, transfers, reversal effects, empty workspaces and tax calculation mechanics with explicitly synthetic, non-statutory fixtures. `test_api.py` checks unauthenticated access, period validation, staff financial restrictions, missing tax rules, tenant denial propagation and export signatures.

`test_live_workflow.py` is skipped unless `HORIZON_TEST_SITE`, an ephemeral `HORIZON_TEST_TOKEN`, and `HORIZON_INTEGRATION_CONFIRM=isolated_staging` are configured. Optionally provide a second account's `HORIZON_OTHER_TEST_TOKEN` to exercise cross-tenant denial; that portion is skipped when missing and must not be reported as verified. Run only against an isolated staging site. The suite creates a dedicated business, posts capital/purchases/sales/payroll, checks persisted records in another connection, retries an idempotency key, attempts overselling, races two sales against the same stock, downloads a backup, and restores it into an independent business. It intentionally leaves auditable staging records; never run it on customer production data.

Install the Playwright browser on a development machine and run `npx playwright test` with `HORIZON_E2E_URL` set to a deployed preview. The configuration does not launch a server. The suite covers desktop and mobile navigation, honest empty states, theme persistence, authentication dialogs, keyboard dismissal, tax boundaries and horizontal layout. It does not substitute for a full signed-in browser workflow.

## Required acceptance matrix

Complete registration, email confirmation, recovery, login, refresh and logout against the real Identity service. Confirm revoked business membership is rejected immediately and no other tenant's related record IDs can be used. Exercise owner, accountant, staff and viewer roles, including direct HTTP attempts to bypass hidden UI modules. Staff must not receive employee, journal, tax-rule, membership, audit or backup data.

Create, edit and archive customers, suppliers, employees and products. Refuse duplicate SKUs, invalid money, nonexistent foreign IDs, archive of stocked products, archive of unsettled contacts, and stock edits outside postings. Post every transaction kind and verify a zero balance check after each. Test pending sales/purchases, partial settlements, overpayments, concurrent stock sales, duplicate idempotency retries, safe and unsafe reversals, refresh persistence and backend/network outages. Verify historical financial statements after reversals, which restate the original accounting date.

Check gross and net profit, cash, bank, inventory, receivables, payables, equity and cash flow against an independently calculated journal. Validate every tax band boundary and rule-date/version selection against professionally reviewed official FY 2026/27 guidance; synthetic unit tests establish mechanics only. Test missing/expired rules, exemptions and eligibility assumptions. Review payroll limitations before any statutory payroll use.

Download and open PDF, CSV and Excel reports, sales PDF documents and journal CSVs. Verify CSV formula neutralization for user-entered text. Run the restore-copy drill in RECOVERY.md and inspect foreign-key consistency and owner-only access. Test scheduled production backup behavior separately; scheduled functions do not run in deploy previews.

On Android/iOS browsers, tablets and desktop, test keyboard focus, screen-reader labels, contrast, reduced-motion behavior, both themes, all navigation, filters, forms, validation, errors and loading feedback. Verify that Netlify service failures result in a visible 503 and never silently fall back to local storage or fabricated records.

Production release also requires the missing MFA/session/encryption controls, security review, scale testing, recovery monitoring and the official tax verification described in SECURITY.md.
