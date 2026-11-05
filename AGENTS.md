# Project architecture

HORIZON SME TOOLS is a React/Vite frontend, separate Python FastAPI business service, and authenticated Netlify managed-PostgreSQL data service. Never replace persistence with localStorage, JSON files, memory, SQLite, or an external database. Only theme and selected business may be local preferences.

## Key directories

- `src/App.tsx`: application navigation, account dialogs, module forms, dashboard, reports, and settings.
- `src/styles.css`: the navy/gold design system, light/dark variables, responsive layouts and reduced-motion rules.
- `src/types.ts`: frontend types, formatting, and same-origin API helper.
- `backend/app/main.py`: FastAPI gateway, financial and tax API, exports, sales PDFs.
- `backend/app/finance.py`: pure decimal accounting/reporting/tax calculations.
- `netlify/functions/api.mts`: same-origin authenticated proxy to `BACKEND_URL`; refuses cross-site writes.
- `netlify/functions/data.mts`: independent Identity verification, tenant/RBAC enforcement, validated CRUD, transactional journal/stock posting, reversal and private backup/restore.
- `netlify/functions/daily-backup.mts`: production-only scheduled backup worker.
- `db/schema.ts`: canonical PostgreSQL schema; `drizzle.config.ts` sets deploy-managed migration output.
- `netlify/database/migrations`: generated, ordered migrations. Never edit an applied migration.
- `backend/tests` and `e2e`: tests; `docs`: operational documentation.

## Conventions and invariants

Keep interfaces accessible, mobile-first, and free from fake data. Use the existing typography, restrained colors, icons and empty states. Respect reduced motion. UI functions declared inside App must be invoked directly when they contain controlled inputs; recreating their component identity loses input focus. Shared Toolbar is top-level for this reason.

All data operations must verify the confirmed Identity account and server-side business membership; never trust client metadata for roles. Owners alone manage permissions, rule versions, business settings and backups. Staff cannot read financial journals or employee data. Bearer tokens must not be logged. No customer data belongs in documentation or tests. Keep `/api/*` same-origin; no permissive CORS.

Financial amounts use PostgreSQL NUMERIC and Python Decimal. Monetary API inputs are bounded and validated to two decimal places. Journal writes, stock changes and audit records share a database transaction. Acquire the business row lock before product row locks. Preserve the same locking order in all future mutation paths. Every posting has a tenant-scoped idempotency key. Never hard-delete a financial transaction; reverse its entries. Do not mutate stock or cost through a product edit.

Tax rates are never embedded or guessed. Rule versions are immutable, effective-dated, sourced to official domains and require professional verification. Adding a source URL does not establish that the source was independently checked. PAYE uses marginal bands and presumptive tax uses fixed-plus-excess turnover schedules. The UI must call every result an estimate. No TRA submission/EFD integration is present.

Backups are private Netlify Blobs, and backup metadata is relational. Restore into a new business with new UUIDs and a new owner membership; do not resurrect historical team access. Preview archives are deploy-scoped; production archives are site-scoped. Keep their data isolated.

The full requested security/native-mobile/statutory-payroll scope is not yet certified or complete; preserve the explicit boundaries in README and security documentation. Do not claim tests, restoration or external hosting were verified unless they actually ran.
