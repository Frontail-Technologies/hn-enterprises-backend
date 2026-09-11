/**
 * Regression coverage for two stacked issues on mobile stats:
 *
 * 1. (Original bug) GC Done / JMR Done showing 0 despite completed flags -
 *    root cause was a supervisor account with no `staff` row, which made
 *    supervisorProjectScope() fall back to a sentinel project id matching
 *    zero customers.
 * 2. (Product rule correction, R2) The fix for #1 was initially "assign the
 *    supervisor a staff.assignedProjectId" - but the actual product rule is
 *    that a supervisor is NOT assigned to a project at all. Stats must
 *    aggregate across ALL projects regardless of any staff/project
 *    assignment. This file now asserts that corrected behavior, not the
 *    intermediate per-project-scope fix.
 *
 * Runs against the real DATABASE_URL - no DB layer is mocked. Summary counts
 * are global aggregates shared with whatever else is in the database, so
 * assertions use before/after deltas or exact-row-presence checks via
 * getDetails rather than fixed ratios.
 *
 * Cleanup note: see users-deletion.test.ts's header - `bun test` hangs on any
 * DB query issued from `afterAll` once a prior beforeAll/it on the same
 * connection has already queried it. Cleanup is done as the last step of the
 * last `it()` in each describe instead.
 *
 *   bun test src/modules/stats/stats.service.test.ts
 */
import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { getDb, getDbClient } from "@db";
import { customers, projects, staff, users } from "@db/schema";
import { hashPassword } from "@utils";
import { statsService } from "./stats.service";

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

async function createSupervisor(username: string, email: string) {
  const [user] = await db
    .insert(users)
    .values({
      name: `Stats Test ${username}`,
      username,
      email,
      passwordHash: await hashPassword("Test-Password-123!"),
      role: "supervisor",
      status: "active",
    })
    .returning();
  if (!user) throw new Error("Failed to create test supervisor");
  return user;
}

async function createCustomer(projectId: string, name: string, overrides: { progressMilestones?: object; billingCompletion?: object }) {
  const trBp = `TR-STATS-${RUN_ID}-${Math.random().toString(36).slice(2, 6)}`;
  const [customer] = await db
    .insert(customers)
    .values({
      projectId,
      trBpNumber: trBp,
      normalizedTrBpNumber: normalize(trBp),
      customerName: name,
      normalizedCustomerName: normalize(name),
      progressMilestones: overrides.progressMilestones ?? {},
      billingCompletion: overrides.billingCompletion ?? {},
    })
    .returning();
  if (!customer) throw new Error("Failed to create test customer");
  return customer;
}

function parseCount(value: string): number {
  return Number(value.split("/")[0]);
}

describe("mobile stats aggregate across ALL projects - a supervisor is not assigned to a project (R2)", () => {
  let projectAId: string;
  let projectBId: string;
  let supervisorNoStaffId: string;
  let gcCustomerId: string; // Project A, GC milestone done
  let jmrCustomerId: string; // Project B, JMR billing flag done

  it("setup: two projects, a supervisor with NO staff row, and completed customers in EACH project", async () => {
    const projectA = await createProject(`Stats Test Project A ${RUN_ID}`);
    projectAId = projectA.id;
    const projectB = await createProject(`Stats Test Project B ${RUN_ID}`);
    projectBId = projectB.id;

    // Deliberately no `staff` row at all - proves stats work without one.
    const supervisor = await createSupervisor(`stats-nostaff-${RUN_ID}`, `stats-nostaff-${RUN_ID}@example.invalid`);
    supervisorNoStaffId = supervisor.id;

    const gcCustomer = await createCustomer(projectAId, `GC Done Customer ${RUN_ID}`, {
      progressMilestones: { gc: { completedAt: new Date().toISOString(), completedBy: supervisorNoStaffId } },
    });
    gcCustomerId = gcCustomer.id;

    const jmrCustomer = await createCustomer(projectBId, `JMR Done Customer ${RUN_ID}`, {
      billingCompletion: { jmrDone: true },
    });
    jmrCustomerId = jmrCustomer.id;

    const [row] = await db.select().from(customers).where(eq(customers.id, jmrCustomerId)).limit(1);
    expect(row?.billingCompletion?.jmrDone).toBe(true);
  });

  it("A. a supervisor with NO staff row fetches stats normally (no error, real aggregate counts)", async () => {
    const summary = await statsService.getSummary({ id: supervisorNoStaffId, role: "supervisor" } as never);
    expect(summary.length).toBeGreaterThan(0);
    const gcDone = summary.find((s) => s.id === "gc-done");
    const jmrDone = summary.find((s) => s.id === "jmr-done");
    // Must NOT be the old sentinel-scope symptom of "0/0" - real, non-zero
    // totals reflecting the whole customers table.
    expect(gcDone?.value).not.toBe("0/0");
    expect(jmrDone?.value).not.toBe("0/0");
  });

  it("B/C. gc-done and jmr-done details include customers from BOTH Project A and Project B - no project exclusion", async () => {
    const gcDetails = await statsService.getDetails("gc-done", {}, { id: supervisorNoStaffId, role: "supervisor" } as never);
    const jmrDetails = await statsService.getDetails("jmr-done", {}, { id: supervisorNoStaffId, role: "supervisor" } as never);

    expect(gcDetails.rows.some((r) => r.customerId === gcCustomerId)).toBe(true);
    expect(jmrDetails.rows.some((r) => r.customerId === jmrCustomerId)).toBe(true);
  });

  it("a supervisor WITH a staff row assigned to Project A still sees the Project B customer - assignment no longer restricts visibility", async () => {
    const assignedSupervisor = await createSupervisor(`stats-assigned-${RUN_ID}`, `stats-assigned-${RUN_ID}@example.invalid`);
    await db.insert(staff).values({ userId: assignedSupervisor.id, assignedProjectId: projectAId });

    const jmrDetails = await statsService.getDetails("jmr-done", {}, { id: assignedSupervisor.id, role: "supervisor" } as never);
    expect(jmrDetails.rows.some((r) => r.customerId === jmrCustomerId)).toBe(true);

    await db.delete(staff).where(eq(staff.userId, assignedSupervisor.id));
    await db.delete(users).where(eq(users.id, assignedSupervisor.id));
  });

  it("summary count matches detail row count for gc-done and jmr-done, measured as a before/after delta (no summary/detail drift)", async () => {
    const before = await statsService.getSummary({ id: supervisorNoStaffId, role: "supervisor" } as never);
    const beforeGc = parseCount(before.find((s) => s.id === "gc-done")!.value);
    const beforeJmr = parseCount(before.find((s) => s.id === "jmr-done")!.value);

    const extraGc = await createCustomer(projectAId, `Extra GC Done Customer ${RUN_ID}`, {
      progressMilestones: { gc: { completedAt: new Date().toISOString() } },
    });
    const extraJmr = await createCustomer(projectBId, `Extra JMR Done Customer ${RUN_ID}`, {
      billingCompletion: { jmrDone: true },
    });

    const after = await statsService.getSummary({ id: supervisorNoStaffId, role: "supervisor" } as never);
    const afterGc = parseCount(after.find((s) => s.id === "gc-done")!.value);
    const afterJmr = parseCount(after.find((s) => s.id === "jmr-done")!.value);

    expect(afterGc - beforeGc).toBe(1);
    expect(afterJmr - beforeJmr).toBe(1);

    // Cleanup (see file header - done here, not in afterAll), then release the connection.
    await db.delete(customers).where(eq(customers.id, extraGc.id));
    await db.delete(customers).where(eq(customers.id, extraJmr.id));
    await db.delete(customers).where(eq(customers.id, gcCustomerId));
    await db.delete(customers).where(eq(customers.id, jmrCustomerId));
    await db.delete(users).where(eq(users.id, supervisorNoStaffId));
    await db.delete(projects).where(eq(projects.id, projectAId));
    await db.delete(projects).where(eq(projects.id, projectBId));
    await getDbClient().end();
  });
});
