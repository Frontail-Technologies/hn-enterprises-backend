ALTER TYPE "public"."customer_document_status" ADD VALUE 'in_review' BEFORE 'approved';--> statement-breakpoint
ALTER TYPE "public"."customer_document_status" ADD VALUE 'sent_back' BEFORE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."customer_document_status" ADD VALUE 'completed';--> statement-breakpoint
ALTER TYPE "public"."customer_status" ADD VALUE 'draft' BEFORE 'active';--> statement-breakpoint
ALTER TYPE "public"."customer_status" ADD VALUE 'pending' BEFORE 'active';--> statement-breakpoint
ALTER TYPE "public"."customer_status" ADD VALUE 'completed' BEFORE 'archived';--> statement-breakpoint
ALTER TABLE "customer_documents" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD COLUMN "issue_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD COLUMN "expiry_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD COLUMN "amount" numeric(14, 2);