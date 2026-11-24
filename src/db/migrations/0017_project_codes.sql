-- Give every project without a code an automatic one (PRJ-0001, PRJ-0002, ...
-- in creation order, after any PRJ-#### codes already in use). New projects
-- get theirs when created (projects.service.ts nextProjectCode). Only fills
-- empty codes; projects that already have a code keep it. Safe to re-run.
WITH numbered AS (
  SELECT id,
         row_number() OVER (ORDER BY created_at, id)
           + coalesce((SELECT max(substring(code from '^PRJ-([0-9]+)$')::int) FROM projects), 0) AS n
  FROM projects
  WHERE code IS NULL OR btrim(code) = ''
)
UPDATE projects p
SET code = 'PRJ-' || lpad(numbered.n::text, 4, '0'),
    normalized_code = lower('PRJ-' || lpad(numbered.n::text, 4, '0')),
    updated_at = now()
FROM numbered
WHERE p.id = numbered.id;
