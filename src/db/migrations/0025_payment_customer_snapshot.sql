-- Expenses keep the customer's name, so "Deleted customer (name)" can be shown
-- after the customer is deleted. Backfills the name for existing expenses.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "customer_name_snapshot" text;
UPDATE payments p SET customer_name_snapshot = c.customer_name
FROM customers c
WHERE c.id = p.customer_id AND p.customer_name_snapshot IS NULL;
