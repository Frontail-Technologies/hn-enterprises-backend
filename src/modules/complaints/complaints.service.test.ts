/**
 * Regression coverage for the product rule correction (R2): a supervisor is
 * NOT assigned to a project, so `complaintsService.list()` must never
 * exclude complaints based on a supervisor's staff.assignedProjectId - that
 * scoping (via the now-removed resolveAssignedProjectId/query.supervisorId
 * path) has been deleted entirely. Complaints from every project are visible
 * to every authenticated role; only the explicit customerId/status/search
 * filters narrow the list.
 *
 * Runs against the real DATABASE_URL - no DB layer is mocked.
 *
 * Cleanup note: see users-deletion.test.ts's header - `bun test` hangs on any
 * DB query issued from `afterAll` once a prior beforeAll/it on the same
 * connection has already queried it. Cleanup is done as the last step of the
 * last `it()` in each describe instead.
 *
 *   bun test src/modules/complaints/complaints.service.test.ts
 */
import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { getDb, getDbClient } from "@db";
import { complaints, customers, projects, users } from "@db/schema";
import { hashPassword } from "@utils";
import { complaintsService } from "./complaints.service";

const db = getDb();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

async function createProject(name: string) {
  const [project] = await db.insert(projects).values({ name, normalizedName: normalize(name) }).returning();
  if (!project) throw new Error("Failed to create test project");
  return project;
}

async function createCustomer(projectId: string, name: string) {
  const trBp = `TR-COMPLAINT-${RUN_ID}-${Math.random().toString(36).slice(2, 6)}`;
  const [customer] = await db
    .insert(customers)
    .values({
      projectId,
      trBpNumber: trBp,
      normalizedTrBpNumber: normalize(trBp),
      customerName: name,
      normalizedCustomerName: normalize(name),
    })
    .returning();
  if (!customer) throw new Error("Failed to create test customer");
  return customer;
}

describe("complaints are visible across ALL projects for every role - a supervisor is not assigned to a project (R2)", () => {
  let projectAId: string;
  let projectBId: string;
  let adminId: string;
  let complaintAId: string;
  let complaintBId: string;

  it("setup: two projects, a customer + complaint in EACH", async () => {
    const projectA = await createProject(`Complaints Test Project A ${RUN_ID}`);
    projectAId = projectA.id;
    const projectB = await createProject(`Complaints Test Project B ${RUN_ID}`);
    projectBId = projectB.id;

    const [admin] = await db
      .insert(users)
      .values({
        name: `Complaints Test Admin ${RUN_ID}`,
        username: `complaints-admin-${RUN_ID}`,
        email: `complaints-admin-${RUN_ID}@example.invalid`,
        passwordHash: await hashPassword("Test-Password-123!"),
        role: "admin",
        status: "active",
      })
      .returning();
    if (!admin) throw new Error("Failed to create test admin");
    adminId = admin.id;

    const customerA = await createCustomer(projectAId, `Complaint Customer A ${RUN_ID}`);
    const customerB = await createCustomer(projectBId, `Complaint Customer B ${RUN_ID}`);

    const complaintA = await complaintsService.create(
      { customerId: customerA.id, title: `Leak Project A ${RUN_ID}`, description: "Test complaint A" },
      adminId,
    );
    complaintAId = complaintA.id;

    const complaintB = await complaintsService.create(
      { customerId: customerB.id, title: `Leak Project B ${RUN_ID}`, description: "Test complaint B" },
      adminId,
    );
    complaintBId = complaintB.id;
  });

  it("D. list() with no filters returns complaints from BOTH Project A and Project B - no project exclusion", async () => {
    const { rows } = await complaintsService.list({ limit: "1000" });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(complaintAId);
    expect(ids).toContain(complaintBId);
  });

  it("E. an explicit customerId filter still narrows correctly (explicit filters remain valid)", async () => {
    const { rows } = await complaintsService.list({ customerId: undefined, limit: "1000" });
    // Sanity: unfiltered still contains both (guards against the filter test
    // below passing only because the list is empty).
    expect(rows.map((r) => r.id)).toContain(complaintAId);

    const complaintA = await db.query.complaints.findFirst({ where: eq(complaints.id, complaintAId) });
    const filtered = await complaintsService.list({ customerId: complaintA!.customerId, limit: "1000" });
    expect(filtered.rows.map((r) => r.id)).toEqual([complaintAId]);
  });

  it("statusCounts() aggregates across all projects too (same rule, no per-supervisor scope)", async () => {
    const before = await complaintsService.statusCounts();
    const totalBefore = Object.values(before).reduce((sum, n) => sum + n, 0);
    expect(totalBefore).toBeGreaterThanOrEqual(2);

    // Cleanup (see file header - done here, not in afterAll), then release the connection.
    await db.delete(complaints).where(eq(complaints.id, complaintAId));
    await db.delete(complaints).where(eq(complaints.id, complaintBId));
    await db.delete(customers).where(eq(customers.projectId, projectAId));
    await db.delete(customers).where(eq(customers.projectId, projectBId));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(projects).where(eq(projects.id, projectAId));
    await db.delete(projects).where(eq(projects.id, projectBId));
    await getDbClient().end();
  });
});
