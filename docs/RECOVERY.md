# Backup and restore procedures

## Stored snapshots

The owner can create a backup in Business settings → Backup & recovery. A repeatable-read PostgreSQL transaction captures the business, contacts, products, employees, transactions, journal, rule versions, reminders, membership/audit history and backup metadata. The archive is written to a private Netlify Blob; its SHA-256 checksum and timestamp are stored in PostgreSQL.

On published production deploys, a scheduled function runs every five minutes. It selects one business whose latest backup is absent or older than 24 hours, oldest first. This bounds each invocation; monitor execution time and backup age. This schedule cannot guarantee a 24-hour recovery point beyond its throughput capacity, during prolonged outages, or for archives exceeding synchronous limits. There is no finite retention deletion policy in this initial implementation. Establish a retention policy, cost monitoring and failure alerts before production.

Preview backups use a deploy-scoped store and may not survive the next preview deployment. Production backups use a site-scoped private store and survive redeployments. PostgreSQL records are persistent on their respective managed branches. Copy or download a preview archive before redeploying if it must be preserved.

## Download verification

Open Backup & recovery and select Download. The server verifies the stored content against its checksum before returning it. Downloaded files contain business data; keep them in an approved encrypted location and never commit them. Application archives contain no Identity passwords or access/refresh tokens.

## Safe restore-copy drill

1. In a staging business, create products, contacts, capital, purchases and sales. Note record counts, inventory quantity, cash, profit, outstanding balances and the zero balance check.
2. Create a backup and download it.
3. Add a clearly identifiable test transaction after the backup.
4. Select Restore copy on the saved backup. The server creates a new business with fresh UUIDs, remaps related records, and grants only the requesting owner access.
5. Switch to the restored workspace. Confirm that the later transaction is absent, original snapshots match, all journal foreign keys resolve, and the balance check is zero.
6. Confirm that the original business is unchanged and that historical members have not gained access to the restored business.
7. Record the drill date, archive checksum, record counts, financial comparisons, duration and operator in your operational recovery log.

The included opt-in integration test automates a portion of this drill. It has not been run in this environment. A checksum match is not a full restoration test.

## Disaster recovery

The UI restores archives that have a metadata row and exist in the managed Blob store. It does not upload arbitrary JSON files or perform destructive in-place database restores. A complete site/database loss therefore requires an operator-led platform recovery: recover the managed database metadata or a compatible database backup, recover the corresponding private archives, then run and verify restore-copy. Maintain approved independent recovery material and confirm provider-level database backup/PITR retention separately. Application snapshots alone are not a claim of verified platform-wide disaster recovery.
