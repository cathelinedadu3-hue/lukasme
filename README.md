# HORIZON SME TOOLS

A responsive business workspace for Tanzania Mainland with sales, stock purchases, customers, suppliers, expenses, cash and bank, management accounts, employees, gross payroll payments, configurable tax estimates, in-app reminders, team permissions, audit history and private backups. Workspaces start empty; no tax rates or financial records are seeded.

## Netlify architecture

React 19 and Vite serve the interface. TypeScript Netlify Functions provide the entire deployed API. `/api/*` calls the authenticated PostgreSQL data handler directly within the function process. Financial statements and tax estimates use decimal.js with 40-digit precision and half-up currency rounding. PostgreSQL NUMERIC handles posting and weighted-average stock allocation. Netlify Identity handles registration, confirmation, login and recovery. Private Netlify Blobs contain backup archives.

No external backend, Python runtime, Render or Railway deployment is required. The `backend/` directory retains the earlier Python implementation and reference tests for comparison; it is not part of the deployed request path. Its Docker/Compose files are historical optional reference material.

Existing relational records and applied migrations are preserved. Customers and suppliers share typed contacts; sales, purchases, expenses, payroll, cash and bank events share typed transactions and their immutable double-entry ledger. One transaction currently supports one optional product. Reports are calculated from the journal; reminders supply in-app notifications. This migration does not claim multi-item invoices, saved statutory returns or a full statutory payroll engine.

## Development and deployment

Use Node 22+, run `npm install`, then `netlify dev --port 8889`. Netlify supplies its database connection and Identity runtime. Neither `BACKEND_URL` nor `SITE_ORIGIN` is read by the deployed application. No database credential belongs in a Vite variable. Deploy the repository through the connected Netlify continuous deployment workflow; Functions and migrations deploy with the frontend. Existing applied migrations must never be edited or removed.

`/api/connection` checks database reachability and Identity settings availability. It does not certify authenticated workflows. Preview databases are automatically isolated branches. Preview backup files use deploy-scoped storage; production backups use private site-scoped storage.

## First business workflow

1. Register, confirm your email and sign in.
2. Create a business, then record owner capital.
3. Add contacts and zero-stock products; record stock purchases before sales.
4. Record sales, expenses and customer/supplier settlements. Reports update from balanced journal entries.
5. Configure professionally verified tax rules and compliance reminders.
6. Add team memberships by email; access activates for matching confirmed accounts. This action does not send invitations.
7. Create a backup and verify a restore copy in staging.

## Verification and release boundaries

Run `npm test` for native accounting, tax, export and API denial tests; `npm run typecheck` checks frontend and Functions. `npx playwright test` runs desktop and mobile acceptance checks with a Netlify dev server or `HORIZON_E2E_URL`.

Database reachability and Identity activation were checked during migration. Local automated checks do not certify production readiness. Real registration/login, authenticated CRUD for every role, concurrency, backup restoration and persistence across redeployments still require deployed acceptance testing with controlled accounts. No security audit or statutory certification is claimed.

Passwords are managed by Identity; custom Argon2id storage, application MFA and provider refresh-rotation guarantees are not implemented or certified. Gross payroll postings do not deduct statutory contributions. Tax results are estimates using configured effective-dated rules, not TRA assessments, EFD receipts or submissions. Native mobile packages, offline synchronization, bank feeds and push/email reminders are not included. Full snapshots remain unsuitable for very large businesses; paginated collection APIs are available, but the dashboard currently reads full snapshots.

See [deployment](docs/DEPLOYMENT.md), [API](docs/API.md), [security](docs/SECURITY.md), [recovery](docs/RECOVERY.md) and [quality](docs/QUALITY.md) documentation.
