-- Seed "Project Types" with the types already used on projects. Safe to re-run.
INSERT INTO master_values (category, value, normalized_value, status)
SELECT DISTINCT ON (lower(btrim(p.project_type))) 'project_types'::master_value_category, btrim(p.project_type), lower(btrim(p.project_type)), 'active'::master_value_status
FROM projects p
WHERE coalesce(btrim(p.project_type), '') <> ''
ON CONFLICT DO NOTHING;
