# Security and financial release boundaries

## Implemented controls

Netlify Identity verifies account email, authenticates users, supports recovery and refreshes SDK sessions. Passwords never pass through application database tables. Every data request is revalidated with the Identity user endpoint and authorized using a server-maintained business membership. Business owners manage member roles. Memberships for pending emails activate only after a matching verified account signs in. Revoking membership removes data access even if an Identity token is still live.

The same-origin API rejects browser writes without its custom request header and matching Origin. The data handler accepts independently verified bearer authentication; the API extracts the session token without forwarding unrelated cookies. There is no permissive CORS configuration. React renders text without HTML injection. A restrictive content-security policy, frame denial, MIME protections, limited permissions and referrer policy are configured. Parameterized SQL and Zod schemas validate all writes; business IDs and related entity IDs are checked on the server. User input cannot select table/column names outside hardcoded schema allowlists.

Authenticated data access has a PostgreSQL-backed limit of 120 requests per minute per user, shared across server instances. Identity login throttling is delegated to the provider and must be reviewed separately. No application passwords, admin tokens or database credentials are committed. All deployed backend operations execute in Netlify Functions.

Financial writes lock the business before updating stock, validate availability, and commit the transaction, balanced journal and audit record together. Idempotency keys protect repeat submissions. PostgreSQL NUMERIC and decimal.js preserve accounting precision. Stock value is derived from inventory journal entries and cost of sales is allocated using PostgreSQL numeric arithmetic. Products cannot be switched between stock/service kinds. Contact records with unpaid balances and products with stock cannot be archived. History is kept through reversals and soft deletion.

Private backups use managed storage with checksums. Checksums detect archive corruption; they are not a substitute for access control. Restore-copy remaps record IDs and intentionally does not revive historical member access. Platform encryption at rest and TLS protect database/backup storage; no custom field-level envelope encryption has been implemented.

## Security hardening verification — 4 November 2026

This review did not establish a numerical security score. A claim of “95% secure” requires a defined audit standard, scoped controls and independent evidence; passing automated checks does not measure the percentage of attacks prevented.

The API proxy, direct data function and Python service now bound actual streamed request bytes to 2,000,000 before parsing or forwarding, including requests without Content-Length. Invalid or excessive length headers are rejected. Python validation responses omit submitted values, and rejected requests receive no-store and MIME/frame protections. The Python gateway accepts only an HTTPS origin without credentials, path, query or fragment. Browser policy now includes HSTS, disables object embedding and disallows base tags. Frontend API fetches explicitly use same-origin mode/credentials and no-store caching. Account/business changes clear form values and tax results along with the existing workspace state cleanup.

FastAPI/Starlette and Python test dependencies were upgraded after the initial dependency audit identified known advisories. Final verification passed TypeScript checking, 19 JavaScript tests and 22 Python tests. One live Python workflow test was skipped because its required live test configuration was unavailable. Both the full npm dependency audit and pip-audit against backend requirements reported no known vulnerabilities at review time. These results cover source-level automated checks; deployed browser headers, real Identity lifecycle behavior, concurrent tenant isolation and recovery were not verified by this review. Framework dependency upgrades also require validation when deploying the separate Python service.

## Required before production certification

Application MFA, custom Argon2id password storage, independent refresh-token rotation/replay detection, administrator-enforced idle-session expiration, and custom field-level encryption are not implemented by this source. Password hashing and session behavior belong to the configured Identity provider; do not assert a specific hashing algorithm or rotation guarantee without provider verification. If these exact controls are mandatory, extend the authentication architecture and test it before release.

This application has not undergone a security audit, penetration test, load test, live restoration drill or full deployed tenant-isolation verification in this run. Testing source is included; successful execution is a release prerequisite. The initial snapshot/report path reads business records in full. Collection endpoints now support opt-in pagination/search. Very large dashboard snapshots still need server-side aggregation and asynchronous export/backup jobs before hitting serverless time and response limits. Backup scheduling handles one due business per five-minute invocation; sustained capacity is at most 288 businesses per day and must be monitored and expanded for larger usage.

The mobile interface is responsive web software, not separately packaged Android/iOS software. Native secure storage, biometric unlock, offline synchronization and push delivery are not included. Reminders are in-app. Team membership creation does not send email invitations.

## Tanzania Mainland FY 2026/27

No tax rate, deadline or threshold has been invented or preloaded. The official FY 2026/27 legislation has not been independently validated in this run. Business owners must enter rules citing official TRA, Ministry of Finance, WCF or official legislation sources and obtain professional verification of applicability. Every tax result is labelled an estimate. Nothing in this application files a TRA return, issues an EFD fiscal receipt, or represents an official assessment.

The estimator supports flat-rate/threshold rules, progressive PAYE marginal bands and presumptive turnover schedules. It does not decide taxpayer eligibility, tax residency, exemptions, input-VAT recoverability, fringe benefits, payroll pension treatment, multiple withholding categories or corporate adjustments. The user must supply an appropriate taxable base and appropriate rule versions. Gross payroll postings do not automatically deduct statutory contributions or post tax liabilities. Tax estimates do not automatically change the accounting ledger.
