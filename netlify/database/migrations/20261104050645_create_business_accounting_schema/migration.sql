CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"blob_key" text NOT NULL,
	"checksum" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"tin" text,
	"address" text,
	"currency" text DEFAULT 'TZS' NOT NULL,
	"fiscal_year" text DEFAULT '2026/27' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"tin" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_kind" CHECK ("kind" IN ('customer','supplier'))
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"position" text NOT NULL,
	"salary" numeric(20,2) NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positive_salary" CHECK ("salary">=0)
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account" text NOT NULL,
	"debit" numeric(20,2) DEFAULT '0' NOT NULL,
	"credit" numeric(20,2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_one_side" CHECK (("debit">0 AND "credit"=0) OR ("credit">0 AND "debit"=0))
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valid_role" CHECK ("role" IN ('owner','accountant','staff','viewer'))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"kind" text DEFAULT 'product' NOT NULL,
	"price" numeric(20,2) NOT NULL,
	"cost" numeric(20,2) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 5 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_amounts" CHECK ("price">=0 AND "cost">=0 AND "quantity">=0 AND "reorder_level">=0)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY,
	"window" integer NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" date NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date NOT NULL,
	"rate" numeric(10,6) NOT NULL,
	"threshold" numeric(20,2) DEFAULT '0' NOT NULL,
	"source" text NOT NULL,
	"notes" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_valid_rate" CHECK ("rate">=0 AND "rate"<=1 AND "threshold">=0 AND "effective_to">="effective_from")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(20,2) NOT NULL,
	"cost" numeric(20,2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(20,2) DEFAULT '0' NOT NULL,
	"date" date NOT NULL,
	"account" text NOT NULL,
	"status" text NOT NULL,
	"contact_id" uuid,
	"product_id" uuid,
	"employee_id" uuid,
	"quantity" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positive_transaction" CHECK ("amount">0 AND "cost">=0 AND "tax_amount">=0),
	CONSTRAINT "transaction_kind" CHECK ("kind" IN ('sale','purchase','expense','payroll','capital','transfer','receipt','payment')),
	CONSTRAINT "transaction_account" CHECK ("account" IN ('cash','bank')),
	CONSTRAINT "transaction_status" CHECK ("status" IN ('paid','pending'))
);
--> statement-breakpoint
CREATE INDEX "contacts_tenant" ON "contacts" ("business_id");--> statement-breakpoint
CREATE INDEX "ledger_tenant" ON "ledger" ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_user_business" ON "members" ("business_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_email_business" ON "members" ("business_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "product_sku_tenant" ON "products" ("business_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_version" ON "tax_rules" ("business_id","kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_idempotency" ON "transactions" ("business_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "transactions_tenant_date" ON "transactions" ("business_id","date");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_transaction_id_transactions_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_employee_id_employees_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id");