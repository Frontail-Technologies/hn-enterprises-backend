CREATE TYPE "public"."project_document_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'active', 'in_progress', 'on_hold', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('active', 'in_progress', 'not_started', 'on_hold', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."customer_document_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('active', 'inactive', 'on_hold', 'archived');--> statement-breakpoint
CREATE TYPE "public"."lmc_pipe_size" AS ENUM('20_mm', '32_mm', '63_mm', '90_mm', '125_mm', 'other');--> statement-breakpoint
CREATE TYPE "public"."lmc_pipe_status" AS ENUM('not_started', 'in_progress', 'laying_completed', 'testing_pending', 'testing_completed', 'purging_completed', 'not_required', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('previewed', 'confirmed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_row_status" AS ENUM('valid', 'warning', 'invalid', 'imported', 'rejected');--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"site_id" uuid,
	"document_type" text NOT NULL,
	"reference_number" text,
	"document_date" timestamp with time zone,
	"expiry_date" timestamp with time zone,
	"amount" numeric(14, 2),
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text,
	"status" "project_document_status" DEFAULT 'submitted' NOT NULL,
	"remarks" text,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"code" text,
	"normalized_code" text,
	"city" text,
	"normalized_city" text,
	"address" text,
	"latitude" numeric(10, 6),
	"longitude" numeric(10, 6),
	"planned_connections" integer,
	"supervisor_name" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"remarks" text,
	"status" "site_status" DEFAULT 'active' NOT NULL,
	"imported_source" jsonb,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"code" text,
	"normalized_code" text,
	"city" text,
	"normalized_city" text,
	"client" text,
	"consultant" text,
	"contractor" text,
	"project_type" text,
	"area_location" text,
	"description" text,
	"start_date" timestamp with time zone,
	"planned_end_date" timestamp with time zone,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"contract_value" numeric(14, 2),
	"project_manager" text,
	"imported_source" jsonb,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"reference_number" text,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text,
	"status" "customer_document_status" DEFAULT 'submitted' NOT NULL,
	"remarks" text,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_lmc_pipe_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"pipe_size" "lmc_pipe_size" NOT NULL,
	"length_metres" numeric(12, 3),
	"laying_date" timestamp with time zone,
	"testing_date" timestamp with time zone,
	"purging_date" timestamp with time zone,
	"laying_status" "lmc_pipe_status" DEFAULT 'not_started' NOT NULL,
	"testing_status" "lmc_pipe_status" DEFAULT 'not_started' NOT NULL,
	"purging_status" "lmc_pipe_status" DEFAULT 'not_started' NOT NULL,
	"joint_fitting_details" text,
	"remarks" text,
	"evidence" jsonb,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tr_bp_number" text NOT NULL,
	"normalized_tr_bp_number" text NOT NULL,
	"mobile_number" text,
	"customer_name" text NOT NULL,
	"normalized_customer_name" text NOT NULL,
	"full_address" text,
	"city" text,
	"connection_type" text,
	"house_type" text,
	"scheme" text,
	"plumber_name" text,
	"supervisor_name" text,
	"gi_report_number" text,
	"gc_report_number" text,
	"conversion_report_number" text,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"survey" jsonb,
	"gi_measurements" jsonb,
	"valves_regulators" jsonb,
	"fittings_accessories" jsonb,
	"lmc_pipeline_work" jsonb,
	"mdpe_fittings" jsonb,
	"commissioning_conversion" jsonb,
	"billing_completion" jsonb,
	"custom_fields" jsonb,
	"imported_fields" jsonb,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text DEFAULT 'master_sheet' NOT NULL,
	"file_name" text NOT NULL,
	"status" "import_batch_status" DEFAULT 'previewed' NOT NULL,
	"summary" jsonb NOT NULL,
	"created_by" uuid,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"status" "import_row_status" DEFAULT 'valid' NOT NULL,
	"raw_data" jsonb NOT NULL,
	"normalized_data" jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"matched_project_id" uuid,
	"matched_site_id" uuid,
	"imported_customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "current_session_id" uuid;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_site_id_project_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."project_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sites" ADD CONSTRAINT "project_sites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sites" ADD CONSTRAINT "project_sites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sites" ADD CONSTRAINT "project_sites_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_site_id_project_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."project_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_lmc_pipe_records" ADD CONSTRAINT "customer_lmc_pipe_records_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_lmc_pipe_records" ADD CONSTRAINT "customer_lmc_pipe_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_site_id_project_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."project_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_documents_project_idx" ON "project_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_documents_site_idx" ON "project_documents" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "project_documents_type_idx" ON "project_documents" USING btree ("document_type");--> statement-breakpoint
CREATE UNIQUE INDEX "project_sites_project_code_idx" ON "project_sites" USING btree ("project_id","normalized_code");--> statement-breakpoint
CREATE UNIQUE INDEX "project_sites_project_name_idx" ON "project_sites" USING btree ("project_id","normalized_name");--> statement-breakpoint
CREATE INDEX "project_sites_project_idx" ON "project_sites" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_sites_status_idx" ON "project_sites" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_normalized_code_idx" ON "projects" USING btree ("normalized_code");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_normalized_name_city_idx" ON "projects" USING btree ("normalized_name","normalized_city");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_city_idx" ON "projects" USING btree ("normalized_city");--> statement-breakpoint
CREATE INDEX "customer_documents_customer_idx" ON "customer_documents" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_documents_project_idx" ON "customer_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "customer_documents_type_idx" ON "customer_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "customer_lmc_pipe_records_customer_idx" ON "customer_lmc_pipe_records" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_lmc_pipe_records_customer_pipe_size_idx" ON "customer_lmc_pipe_records" USING btree ("customer_id","pipe_size");--> statement-breakpoint
CREATE INDEX "customer_lmc_pipe_records_pipe_size_idx" ON "customer_lmc_pipe_records" USING btree ("pipe_size");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_normalized_tr_bp_idx" ON "customers" USING btree ("normalized_tr_bp_number");--> statement-breakpoint
CREATE INDEX "customers_project_idx" ON "customers" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "customers_site_idx" ON "customers" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "customers_mobile_idx" ON "customers" USING btree ("mobile_number");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("normalized_customer_name");--> statement-breakpoint
CREATE INDEX "import_batches_status_idx" ON "import_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_batches_created_by_idx" ON "import_batches" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "import_rows_batch_idx" ON "import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_rows_status_idx" ON "import_rows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_rows_row_number_idx" ON "import_rows" USING btree ("row_number");--> statement-breakpoint
CREATE INDEX "refresh_tokens_session_idx" ON "refresh_tokens" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "users_current_session_idx" ON "users" USING btree ("current_session_id");