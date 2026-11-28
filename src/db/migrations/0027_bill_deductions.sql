-- Bill deductions: TDS (income tax, GST), PRS, bank guarantee and hold
-- amounts (+ what was released later). Purely additive. Safe to re-run.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "tds_income" numeric(14, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "tds_gst" numeric(14, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "prs" numeric(14, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "bank_guarantee" numeric(14, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "bg_released" numeric(14, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "hold_amount" numeric(14, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "hold_released" numeric(14, 2) DEFAULT '0' NOT NULL;
