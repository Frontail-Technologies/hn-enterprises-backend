import { and, ne, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers } from "@db/schema";
import { accessibleProjectIds } from "@modules/projects/project-access.service";
import type { AuthTokenPayload } from "@types";

/**
 * Is this meter number already on another customer? Compared trimmed and
 * case-insensitive. Customers outside the user's projects are reported only as
 * "on another project" (no name), so supervisors don't see other projects' data.
 */
export async function findMeterOwner(meterNo: string, excludeCustomerId: string | undefined, currentUser: AuthTokenPayload) {
  const value = meterNo.trim();
  if (!value) return null;
  const [row] = await getDb()
    .select({ id: customers.id, name: customers.customerName, trBpNumber: customers.trBpNumber, projectId: customers.projectId })
    .from(customers)
    .where(
      and(
        sql`lower(trim(${customers.commissioningConversion}->>'meterNo')) = lower(${value})`,
        excludeCustomerId ? ne(customers.id, excludeCustomerId) : undefined,
      ),
    )
    .limit(1);
  if (!row) return null;
  const projectIds = await accessibleProjectIds(currentUser);
  const visible = projectIds === null || (row.projectId != null && projectIds.includes(row.projectId));
  return visible
    ? { customerId: row.id, name: row.name ?? "", trBpNumber: row.trBpNumber ?? "", otherProject: false }
    : { customerId: null, name: "", trBpNumber: "", otherProject: true };
}
