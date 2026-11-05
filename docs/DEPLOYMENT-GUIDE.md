# Netlify deployment

Deploy the existing repository using the connected Netlify continuous deployment configuration. The React/Vite frontend publishes `dist`; TypeScript Functions run from `netlify/functions`. No separately hosted backend is required. The earlier Python service is retained as reference source only.

Netlify manages PostgreSQL connection configuration, database branches and deployment-time migrations. Never expose connection values in frontend variables, logs or documentation. Never apply migrations manually or edit applied migrations. Define schema changes in `db/schema.ts` and generate new migrations with `npx drizzle-kit generate --name describe_the_change`.

Identity is activated. Its actual registration, email confirmation and provider policies must be verified against the deployed environment. Users must confirm their email before data access. Business membership determines application permissions independently of client metadata.

The deployed code does not use `BACKEND_URL` or `SITE_ORIGIN`. Remove obsolete copies from project environment settings. No replacement custom backend origin is needed. Browser API calls remain same-origin. Cross-site writes are rejected; no permissive CORS is configured.

For local development, install packages and run `netlify dev --port 8889`. `/api/connection` checks a real database query and Identity settings endpoint; an available response is only a service reachability check. Sign in and exercise the acceptance workflow before financial use.

Preview databases use automatically isolated branches. Preview archives use deploy-scoped Blobs, while production archives use private site-scoped Blobs. No production financial data should be changed merely to test a preview. Scheduled backups run on published production deployments only.

Before production release, verify confirmed account registration/login/recovery, owner/accountant/staff/viewer permissions, two-business isolation, posting/reversal concurrency and idempotency, exports, restore-copy, phone layouts and persistence through a redeploy. Review the explicit limitations in the security and quality documentation.
