-- A material transaction can be reversed (or corrected, which reverses it)
-- only once, even if two admins click at the same moment. Safe to re-run.
CREATE UNIQUE INDEX IF NOT EXISTS "material_transactions_one_reversal_idx"
  ON "material_transactions" ("related_transaction_id")
  WHERE "link_type" = 'reversal';
