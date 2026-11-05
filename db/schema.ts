import { pgTable, uuid, text, timestamp, integer, numeric, date, jsonb, uniqueIndex, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
export const businesses = pgTable('businesses', {
 id: uuid().primaryKey().defaultRandom(), name: text().notNull(), tin: text(), address: text(), currency: text().notNull().default('TZS'), fiscalYear: text('fiscal_year').notNull().default('2026/27'), updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(), createdAt: timestamp('created_at', {withTimezone:true}).notNull().defaultNow()
});
export const members = pgTable('members', {
 id: uuid().primaryKey().defaultRandom(), businessId: uuid('business_id').notNull().references(()=>businesses.id), userId: text('user_id').notNull(), email: text().notNull(), role: text().notNull().default('viewer'), updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('members_user_business').on(t.businessId,t.userId),uniqueIndex('members_email_business').on(t.businessId,t.email),check('valid_role',sql`${t.role} IN ('owner','accountant','staff','viewer')`)]);
export const contacts = pgTable('contacts', {
 id: uuid().primaryKey().defaultRandom(), businessId: uuid('business_id').notNull().references(()=>businesses.id), kind:text().notNull(), name:text().notNull(), email:text(), phone:text(), address:text(), tin:text(), deletedAt:timestamp('deleted_at',{withTimezone:true}), updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(), createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[index('contacts_tenant').on(t.businessId),check('contact_kind',sql`${t.kind} IN ('customer','supplier')`)]);
export const products = pgTable('products', {
 id:uuid().primaryKey().defaultRandom(), businessId:uuid('business_id').notNull().references(()=>businesses.id), name:text().notNull(), sku:text().notNull(), kind:text().notNull().default('product'), price:numeric({precision:20,scale:2}).notNull(), cost:numeric({precision:20,scale:2}).notNull(), quantity:integer().notNull().default(0), reorderLevel:integer('reorder_level').notNull().default(5), deletedAt:timestamp('deleted_at',{withTimezone:true}), updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(), createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('product_sku_tenant').on(t.businessId,t.sku),check('product_amounts',sql`${t.price}>=0 AND ${t.cost}>=0 AND ${t.quantity}>=0 AND ${t.reorderLevel}>=0`)]);
export const employees = pgTable('employees', {
 id:uuid().primaryKey().defaultRandom(), businessId:uuid('business_id').notNull().references(()=>businesses.id), name:text().notNull(), email:text(), position:text().notNull(), salary:numeric({precision:20,scale:2}).notNull(), accountNumber:text('account_number').notNull().default(''), bankName:text('bank_name').notNull().default(''), deletedAt:timestamp('deleted_at',{withTimezone:true}), updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(), createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[check('positive_salary',sql`${t.salary}>=0`)]);
export const transactions = pgTable('transactions', {
 id:uuid().primaryKey().defaultRandom(), businessId:uuid('business_id').notNull().references(()=>businesses.id), reference:text().notNull(), kind:text().notNull(), description:text().notNull(), amount:numeric({precision:20,scale:2}).notNull(), cost:numeric({precision:20,scale:2}).notNull().default('0'), taxAmount:numeric('tax_amount',{precision:20,scale:2}).notNull().default('0'), date:date().notNull(), account:text().notNull(), status:text().notNull(), contactId:uuid('contact_id').references(()=>contacts.id), productId:uuid('product_id').references(()=>products.id), employeeId:uuid('employee_id').references(()=>employees.id), accountNumber:text('account_number').notNull().default(''), bankName:text('bank_name').notNull().default(''), quantity:integer().notNull().default(0), createdBy:text('created_by').notNull(), idempotencyKey:uuid('idempotency_key').notNull(), reversedAt:timestamp('reversed_at',{withTimezone:true}), createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('transaction_idempotency').on(t.businessId,t.idempotencyKey),index('transactions_tenant_date').on(t.businessId,t.date),check('positive_transaction',sql`${t.amount}>0 AND ${t.cost}>=0 AND ${t.taxAmount}>=0`),check('transaction_kind',sql`${t.kind} IN ('sale','purchase','expense','payroll','capital','transfer','receipt','payment')`),check('transaction_account',sql`${t.account} IN ('cash','bank')`),check('transaction_status',sql`${t.status} IN ('paid','pending')`)]);
export const ledger = pgTable('ledger', {
 id:uuid().primaryKey().defaultRandom(), businessId:uuid('business_id').notNull().references(()=>businesses.id), transactionId:uuid('transaction_id').notNull().references(()=>transactions.id), account:text().notNull(), debit:numeric({precision:20,scale:2}).notNull().default('0'), credit:numeric({precision:20,scale:2}).notNull().default('0'), createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[index('ledger_tenant').on(t.businessId),check('ledger_one_side',sql`(${t.debit}>0 AND ${t.credit}=0) OR (${t.credit}>0 AND ${t.debit}=0)`)]);
export const taxRules = pgTable('tax_rules', {
 id:uuid().primaryKey().defaultRandom(),businessId:uuid('business_id').notNull().references(()=>businesses.id),kind:text().notNull(),version:integer().notNull(),effectiveFrom:date('effective_from').notNull(),effectiveTo:date('effective_to').notNull(),rate:numeric({precision:10,scale:6}).notNull(),threshold:numeric({precision:20,scale:2}).notNull().default('0'),brackets:jsonb().notNull().default([]),source:text().notNull(),notes:text().notNull(),createdBy:text('created_by').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex('tax_version').on(t.businessId,t.kind,t.version),check('tax_valid_rate',sql`${t.rate}>=0 AND ${t.rate}<=1 AND ${t.threshold}>=0 AND ${t.effectiveTo}>=${t.effectiveFrom}`)]);
export const reminders=pgTable('reminders',{
 id:uuid().primaryKey().defaultRandom(),businessId:uuid('business_id').notNull().references(()=>businesses.id),title:text().notNull(),dueDate:date('due_date').notNull(),completed:integer().notNull().default(0),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(), createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
export const auditLogs=pgTable('audit_logs',{
 id:uuid().primaryKey().defaultRandom(),businessId:uuid('business_id').notNull().references(()=>businesses.id),userId:text('user_id').notNull(),action:text().notNull(),entityId:text('entity_id'),details:jsonb(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
export const rateLimits=pgTable('rate_limits',{
 key:text().primaryKey(),window:integer().notNull(),count:integer().notNull().default(1)
});
export const backupRuns=pgTable('backup_runs',{
 id:uuid().primaryKey().defaultRandom(),businessId:uuid('business_id').notNull().references(()=>businesses.id),blobKey:text('blob_key').notNull(),checksum:text().notNull(),status:text().notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
});
