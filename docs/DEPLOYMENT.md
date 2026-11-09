# Netlify deployment

Deploy the existing repository using the connected Netlify continuous deployment configuration. The React/Vite frontend publishes `dist`; TypeScript Functions run from `netlify/functions`. No separately hosted backend is required. The earlier Python service is retained as reference source only.

Netlify manages PostgreSQL connection configuration, database branches and deployment-time migrations. Never expose connection values in frontend variables, logs or documentation. Never apply migrations manually or edit applied migrations. Define schema changes in `db/schema.ts` and generate new migrations with `npx drizzle-kit generate --name describe_the_change`.

Identity activation is requested by the deployment feature marker. A successful frontend deployment alone does not prove that Identity was enabled. Verify that `/.netlify/identity/settings` returns HTTP 200 with a JSON settings object and that `/api/connection` reports both database and authentication available. Its actual registration, email confirmation and provider policies must be verified against the deployed environment. Users must confirm their email before data access. Business membership determines application permissions independently of client metadata.

The deployed code does not use `BACKEND_URL` or `SITE_ORIGIN`. Remove obsolete copies from project environment settings. No replacement custom backend origin is needed. Browser API calls remain same-origin. Cross-site writes are rejected; no permissive CORS is configured.

For local development, install packages and run `netlify dev --port 8889`. `/api/connection` checks a real database query and Identity settings endpoint; an available response is only a service reachability check. Sign in and exercise the acceptance workflow before financial use.

Preview databases use automatically isolated branches. Preview archives use deploy-scoped Blobs, while production archives use private site-scoped Blobs. No production financial data should be changed merely to test a preview. Scheduled backups run on published production deployments only.

Before production release, verify confirmed account registration/login/recovery, owner/accountant/staff/viewer permissions, two-business isolation, posting/reversal concurrency and idempotency, exports, restore-copy, phone layouts and persistence through a redeploy. Review the explicit limitations in the security and quality documentation.

## Diagnosing an unavailable workspace

Keep production publicly reachable when customers use application sign-in. A Netlify team-login site gate is separate from Identity and can block server-to-server Identity checks. Application sign-in and database membership continue to protect business records on a public site.

Check `/api/connection` first. A successful database check with failed authentication points to Identity availability rather than an external backend or database credential. A 404 at `/.netlify/identity/settings` means the required Identity endpoint is unavailable; confirm Identity activation on the deployment before testing accounts. HTML responses indicate a site-access gate or routing failure and must never count as successful Identity checks. No custom Identity API key or external backend URL is required by this application.

The client retries a failed availability check every 30 seconds while the page is visible. This does not suppress the unavailable state. The data service distinguishes authentication outages (503) from rejected or expired sessions (401), and verifies the confirmed account before opening a database connection or checking business membership.

After activation, test registration with an email address whose confirmation inbox is available, confirmation, login, business creation, saved records after refresh, logout/login, and denial of a second account accessing the first business. Reachability and synthetic error tests do not establish that this complete journey passed.
