CREATE TYPE "public"."custom_field_access" AS ENUM('admin_only', 'supervisor_view', 'supervisor_edit');--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD COLUMN "supervisor_access" "custom_field_access" DEFAULT 'admin_only' NOT NULL;