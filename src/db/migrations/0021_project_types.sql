-- "Project Types" master list (Masters screen), used by the project form's
-- Project Type selector. Run this file first, then 0022 (a new enum value
-- can only be used after it is committed).
ALTER TYPE "master_value_category" ADD VALUE IF NOT EXISTS 'project_types';
