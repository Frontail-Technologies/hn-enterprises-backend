CREATE TYPE "public"."plumber_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."plumber_type" AS ENUM('individual', 'team');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'half_day', 'leave');--> statement-breakpoint
CREATE TYPE "public"."dpr_status" AS ENUM('draft', 'submitted', 'approved');--> statement-breakpoint
CREATE TYPE "public"."planning_task_id" AS ENUM('survey', 'gi', 'gc', 'laying', 'valve', 'pre', 'conversion', 'jmr', 'testing', 'route', 'commissioning');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('cash', 'upi', 'neft', 'bank_transfer', 'cheque', 'other');--> statement-breakpoint
CREATE TYPE "public"."bill_stage" AS ENUM('gi', 'gc', 'commissioning', 'conversion', 'other');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('draft', 'submitted', 'completed', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."material_transaction_type" AS ENUM('purchase', 'pbg_issue', 'pbg_consumption', 'issue', 'return', 'adjustment', 'consumption');--> statement-breakpoint
CREATE TYPE "public"."payment_category" AS ENUM('worker_payment', 'supervisor_payment', 'plumber_payment', 'rent', 'material_expense', 'other_expense');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."wage_category" AS ENUM('high_skilled', 'skilled', 'unskilled');--> statement-breakpoint
CREATE TYPE "public"."wage_status" AS ENUM('pending', 'approved', 'paid');--> statement-breakpoint
CREATE TYPE "public"."staff_payment_account_type" AS ENUM('bank_account', 'upi', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."staff_salary_type" AS ENUM('monthly', 'daily_wage', 'work_basis', 'contract');--> statement-breakpoint
CREATE TYPE "public"."custom_field_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."custom_field_value_type" AS ENUM('text', 'number', 'date', 'amount', 'yes_no', 'dropdown');--> statement-breakpoint
CREATE TYPE "public"."holiday_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."holiday_type" AS ENUM('national', 'restricted', 'company');--> statement-breakpoint
CREATE TYPE "public"."master_value_category" AS ENUM('payment_types', 'connection_types', 'house_types', 'schemes', 'document_categories', 'staff_roles', 'bank_types', 'upi_types', 'material_categories');--> statement-breakpoint
CREATE TYPE "public"."master_value_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."announcement_status" AS ENUM('draft', 'sent');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('work', 'attendance', 'survey', 'system');--> statement-breakpoint
CREATE TYPE "public"."work_progress_status" AS ENUM('not_started', 'pending', 'in_progress', 'completed', 'sent_back', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."work_stage" AS ENUM('survey', 'workable', 'plumbing_gi', 'gc', 'commissioning', 'conversion');--> statement-breakpoint
CREATE TYPE "public"."complaint_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TABLE "plumbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"type" "plumber_type" DEFAULT 'individual' NOT NULL,
	"contact_number" text,
	"status" "plumber_status" DEFAULT 'active' NOT NULL,
	"remarks" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"author_id" uuid,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"check_in_at" timestamp with time zone,
	"check_out_at" timestamp with time zone,
	"check_in_location" jsonb,
	"check_out_location" jsonb,
	"remarks" text,
	"marked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dpr_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"date" date NOT NULL,
	"supervisor_id" uuid NOT NULL,
	"status" "dpr_status" DEFAULT 'draft' NOT NULL,
	"remarks" text,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"date" date NOT NULL,
	"supervisor_id" uuid NOT NULL,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"received_by" uuid,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"bill_number" text NOT NULL,
	"normalized_bill_number" text NOT NULL,
	"stage" "bill_stage" DEFAULT 'other' NOT NULL,
	"bill_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"total_amount" numeric(14, 2) NOT NULL,
	"tax" numeric(14, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "bill_status" DEFAULT 'draft' NOT NULL,
	"remarks" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"type" "material_transaction_type" NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"quantity_delta" numeric(14, 3) NOT NULL,
	"reference_no" text,
	"vendor_name" text,
	"rate" numeric(14, 2),
	"bill_amount" numeric(14, 2),
	"plumber_id" uuid,
	"supervisor_name" text,
	"supervisor_id" uuid,
	"site_id" uuid,
	"store_label" text,
	"customer_id" uuid,
	"report_no" text,
	"condition" text,
	"adjustment_type" text,
	"vehicle_no" text,
	"vehicle_qty" numeric(14, 3),
	"transaction_date" timestamp with time zone NOT NULL,
	"evidence" jsonb,
	"remarks" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"category" text,
	"unit" text NOT NULL,
	"reorder_level" numeric(14, 3) DEFAULT '0' NOT NULL,
	"current_balance" numeric(14, 3) DEFAULT '0' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "payment_category" NOT NULL,
	"plumber_id" uuid,
	"paid_to" text,
	"site_id" uuid,
	"customer_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"status" "payment_status" DEFAULT 'draft' NOT NULL,
	"purpose" text,
	"remarks" text,
	"evidence" jsonb,
	"submitted_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plumber_id" uuid NOT NULL,
	"month" text NOT NULL,
	"category" "wage_category" NOT NULL,
	"wage_rate" numeric(12, 2) NOT NULL,
	"days_worked" numeric(6, 2) NOT NULL,
	"pf" numeric(12, 2) DEFAULT '0' NOT NULL,
	"esic" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "wage_status" DEFAULT 'pending' NOT NULL,
	"remarks" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_project_id" uuid,
	"salary_type" "staff_salary_type" DEFAULT 'monthly' NOT NULL,
	"monthly_salary" numeric(12, 2) DEFAULT '0' NOT NULL,
	"allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_account_type" "staff_payment_account_type" DEFAULT 'bank_account' NOT NULL,
	"bank_type" text,
	"bank_name" text,
	"account_holder_name" text,
	"account_number" text,
	"ifsc_code" text,
	"upi_type" text,
	"upi_id" text,
	"salary_effective_from" timestamp with time zone,
	"last_salary_revision_date" timestamp with time zone,
	"next_salary_review_date" timestamp with time zone,
	"remarks" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"record_id" text,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"group_name" text NOT NULL,
	"width" integer DEFAULT 150 NOT NULL,
	"value_type" "custom_field_value_type" DEFAULT 'text' NOT NULL,
	"dropdown_options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"status" "custom_field_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"type" "holiday_type" DEFAULT 'national' NOT NULL,
	"status" "holiday_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "master_value_category" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"description" text,
	"status" "master_value_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"image_url" text,
	"image_file_name" text,
	"status" "announcement_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"category" "notification_category" DEFAULT 'system' NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"route" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_progress_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"supervisor_id" uuid NOT NULL,
	"stage" "work_stage" NOT NULL,
	"status" "work_progress_status" NOT NULL,
	"next_required_action" text,
	"remarks" text,
	"evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_by_admin_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" "complaint_priority" DEFAULT 'medium' NOT NULL,
	"status" "complaint_status" DEFAULT 'open' NOT NULL,
	"supervisor_remark" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_sites" ADD COLUMN "supervisor_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "plumber_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "supervisor_id" uuid;--> statement-breakpoint
ALTER TABLE "plumbers" ADD CONSTRAINT "plumbers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plumbers" ADD CONSTRAINT "plumbers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr_records" ADD CONSTRAINT "dpr_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr_records" ADD CONSTRAINT "dpr_records_site_id_project_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."project_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr_records" ADD CONSTRAINT "dpr_records_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_plans" ADD CONSTRAINT "site_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_plans" ADD CONSTRAINT "site_plans_site_id_project_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."project_sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_plans" ADD CONSTRAINT "site_plans_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transactions" ADD CONSTRAINT "material_transactions_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transactions" ADD CONSTRAINT "material_transactions_plumber_id_plumbers_id_fk" FOREIGN KEY ("plumber_id") REFERENCES "public"."plumbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transactions" ADD CONSTRAINT "material_transactions_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transactions" ADD CONSTRAINT "material_transactions_site_id_project_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."project_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transactions" ADD CONSTRAINT "material_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_transactions" ADD CONSTRAINT "material_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_plumber_id_plumbers_id_fk" FOREIGN KEY ("plumber_id") REFERENCES "public"."plumbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_site_id_project_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."project_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_records" ADD CONSTRAINT "wage_records_plumber_id_plumbers_id_fk" FOREIGN KEY ("plumber_id") REFERENCES "public"."plumbers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_records" ADD CONSTRAINT "wage_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_records" ADD CONSTRAINT "wage_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_assigned_project_id_projects_id_fk" FOREIGN KEY ("assigned_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_values" ADD CONSTRAINT "master_values_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_values" ADD CONSTRAINT "master_values_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_progress_updates" ADD CONSTRAINT "work_progress_updates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_progress_updates" ADD CONSTRAINT "work_progress_updates_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_created_by_admin_id_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plumbers_normalized_name_idx" ON "plumbers" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "plumbers_status_idx" ON "plumbers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_notes_customer_idx" ON "customer_notes" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_user_date_idx" ON "attendance" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "dpr_records_site_date_supervisor_idx" ON "dpr_records" USING btree ("site_id","date","supervisor_id");--> statement-breakpoint
CREATE INDEX "dpr_records_site_idx" ON "dpr_records" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "dpr_records_project_idx" ON "dpr_records" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "dpr_records_date_idx" ON "dpr_records" USING btree ("date");--> statement-breakpoint
CREATE INDEX "dpr_records_status_idx" ON "dpr_records" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "site_plans_site_date_supervisor_idx" ON "site_plans" USING btree ("site_id","date","supervisor_id");--> statement-breakpoint
CREATE INDEX "site_plans_site_idx" ON "site_plans" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_plans_project_idx" ON "site_plans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "site_plans_date_idx" ON "site_plans" USING btree ("date");--> statement-breakpoint
CREATE INDEX "bill_payments_bill_idx" ON "bill_payments" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_normalized_bill_number_idx" ON "bills" USING btree ("normalized_bill_number");--> statement-breakpoint
CREATE INDEX "bills_customer_idx" ON "bills" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bills_status_idx" ON "bills" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bills_stage_idx" ON "bills" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "material_transactions_material_idx" ON "material_transactions" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "material_transactions_type_idx" ON "material_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "material_transactions_plumber_idx" ON "material_transactions" USING btree ("plumber_id");--> statement-breakpoint
CREATE INDEX "material_transactions_supervisor_idx" ON "material_transactions" USING btree ("supervisor_id");--> statement-breakpoint
CREATE INDEX "material_transactions_site_idx" ON "material_transactions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "material_transactions_customer_idx" ON "material_transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "material_transactions_date_idx" ON "material_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_normalized_name_idx" ON "materials" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "materials_category_idx" ON "materials" USING btree ("category");--> statement-breakpoint
CREATE INDEX "payments_category_idx" ON "payments" USING btree ("category");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_plumber_idx" ON "payments" USING btree ("plumber_id");--> statement-breakpoint
CREATE INDEX "payments_site_idx" ON "payments" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "payments_date_idx" ON "payments" USING btree ("payment_date");--> statement-breakpoint
CREATE UNIQUE INDEX "wage_records_plumber_month_idx" ON "wage_records" USING btree ("plumber_id","month");--> statement-breakpoint
CREATE INDEX "wage_records_month_idx" ON "wage_records" USING btree ("month");--> statement-breakpoint
CREATE INDEX "wage_records_status_idx" ON "wage_records" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_user_id_idx" ON "staff" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_module_idx" ON "audit_logs" USING btree ("module");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_definitions_key_idx" ON "custom_field_definitions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "holidays_date_idx" ON "holidays" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "master_values_category_value_idx" ON "master_values" USING btree ("category","normalized_value");--> statement-breakpoint
CREATE INDEX "master_values_category_idx" ON "master_values" USING btree ("category");--> statement-breakpoint
CREATE INDEX "announcements_status_idx" ON "announcements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_token_idx" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "work_progress_updates_customer_created_idx" ON "work_progress_updates" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "work_progress_updates_supervisor_idx" ON "work_progress_updates" USING btree ("supervisor_id");--> statement-breakpoint
CREATE INDEX "work_progress_updates_stage_idx" ON "work_progress_updates" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "work_progress_updates_status_idx" ON "work_progress_updates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "complaints_customer_idx" ON "complaints" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "complaints_status_idx" ON "complaints" USING btree ("status");--> statement-breakpoint
ALTER TABLE "project_sites" ADD CONSTRAINT "project_sites_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_plumber_id_plumbers_id_fk" FOREIGN KEY ("plumber_id") REFERENCES "public"."plumbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_sites_supervisor_idx" ON "project_sites" USING btree ("supervisor_id");--> statement-breakpoint
CREATE INDEX "customers_plumber_idx" ON "customers" USING btree ("plumber_id");--> statement-breakpoint
CREATE INDEX "customers_supervisor_idx" ON "customers" USING btree ("supervisor_id");