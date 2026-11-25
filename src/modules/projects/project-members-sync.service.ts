import { sql } from "drizzle-orm";
import { getDb } from "@db";
import { forgetProjectAccess } from "./project-access.service";

/**
 * Add the people already linked inside these projects as members: plumbers
 * set on their customers and supervisors set on their sites. Used after a
 * customer import, so the supervisors' mobile app shows the imported
 * plumbers straight away. Idempotent, and it never re-adds someone an admin
 * took off that project (their removed row is history, and the admin's call).
 */
export async function syncProjectMembersFromLinks(projectIds: string[], actorId: string | null) {
  const ids = [...new Set(projectIds.filter(Boolean))];
  if (!ids.length) return;
  const idList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
  const db = getDb();
  await db.execute(sql`
    INSERT INTO project_members (project_id, member_type, plumber_id, added_by)
    SELECT DISTINCT c.project_id, 'plumber'::project_member_type, c.plumber_id, ${actorId}::uuid
    FROM customers c
    WHERE c.project_id IN (${idList}) AND c.plumber_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = c.project_id AND m.plumber_id = c.plumber_id)
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO project_members (project_id, member_type, user_id, added_by)
    SELECT DISTINCT ps.project_id, 'supervisor'::project_member_type, ps.supervisor_id, ${actorId}::uuid
    FROM project_sites ps
    JOIN users u ON u.id = ps.supervisor_id AND u.role = 'supervisor'
    WHERE ps.project_id IN (${idList})
      AND NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = ps.project_id AND m.user_id = ps.supervisor_id)
    ON CONFLICT DO NOTHING
  `);
  forgetProjectAccess();
}
