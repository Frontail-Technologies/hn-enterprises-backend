/**
 * Regression coverage for the personal-activity rule (R3): unlike Customers/
 * Stats/Complaints (global across all projects for a supervisor, R2), the
 * Recent Activity feed is personal - a supervisor sees only events where
 * activity_events.actorId is their own user id, regardless of project. A
 * requested query.actorId is ignored for non-admin roles (a supervisor can
 * never read another user's personal feed by passing their id); admin/
 * super_admin remain fully unrestricted unless they themselves supply an
 * explicit actorId filter.
 *
 * Runs against the real DATABASE_URL - no DB layer is mocked.
 *
 * Cleanup note: see users-deletion.test.ts's header - `bun test` hangs on any
 * DB query issued from `afterAll` once a prior beforeAll/it on the same
 * connection has already queried it. Cleanup is done as the last step of the
 * last `it()` in each describe instead.
 *
 *   bun test src/modules/activity/activity.service.test.ts
 */
import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { getDb, getDbClient } from "@db";
import { activityEvents, users } from "@db/schema";
import { hashPassword } from "@utils";
import { activityService } from "./activity.service";

const db = getDb();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function createUser(role: "supervisor" | "admin", username: string) {
  const [user] = await db
    .insert(users)
    .values({
      name: `Activity Test ${username}`,
      username,
      email: `${username}@example.invalid`,
      passwordHash: await hashPassword("Test-Password-123!"),
      role,
      status: "active",
    })
    .returning();
  if (!user) throw new Error(`Failed to create test ${role}`);
  return user;
}

describe("Recent Activity is personal for a supervisor, unrestricted for admin (R3)", () => {
  let supervisorAId: string;
  let supervisorBId: string;
  let adminId: string;
  let sourceIdA: string;
  let sourceIdB: string;
  let sourceIdOnBehalf: string;

  it("setup: two supervisors, an admin, and one activity event each", async () => {
    const supervisorA = await createUser("supervisor", `activity-super-a-${RUN_ID}`);
    supervisorAId = supervisorA.id;
    const supervisorB = await createUser("supervisor", `activity-super-b-${RUN_ID}`);
    supervisorBId = supervisorB.id;
    const admin = await createUser("admin", `activity-admin-${RUN_ID}`);
    adminId = admin.id;

    sourceIdA = `activity-test-a-${RUN_ID}`;
    sourceIdB = `activity-test-b-${RUN_ID}`;
    sourceIdOnBehalf = `activity-test-onbehalf-${RUN_ID}`;

    await activityService.record({
      type: "system",
      action: "test.activity_a",
      actorId: supervisorAId,
      entityType: "test",
      entityId: sourceIdA,
      sourceType: "test",
      sourceId: sourceIdA,
      title: "Activity by Supervisor A",
    });

    await activityService.record({
      type: "system",
      action: "test.activity_b",
      actorId: supervisorBId,
      entityType: "test",
      entityId: sourceIdB,
      sourceType: "test",
      sourceId: sourceIdB,
      title: "Activity by Supervisor B",
    });

    // Supervisor A acting ON BEHALF OF Supervisor B - actorId is A (who
    // performed it), onBehalfOfUserId is B (who it was for). Must show up in
    // A's feed (they performed it), never scoped by onBehalfOf.
    await activityService.record({
      type: "system",
      action: "test.activity_on_behalf",
      actorId: supervisorAId,
      onBehalfOfUserId: supervisorBId,
      entityType: "test",
      entityId: sourceIdOnBehalf,
      sourceType: "test",
      sourceId: sourceIdOnBehalf,
      title: "Activity by Supervisor A on behalf of Supervisor B",
    });

    const [row] = await db.select().from(activityEvents).where(eq(activityEvents.sourceId, sourceIdA)).limit(1);
    expect(row?.actorId).toBe(supervisorAId);
  });

  it("As Supervisor A: sees own activity (including the on-behalf-of-B event) but NOT Supervisor B's own activity", async () => {
    const { rows } = await activityService.list({ search: RUN_ID, limit: "1000" }, { id: supervisorAId, role: "supervisor", sessionId: "test" });
    const titles = rows.map((r) => r.title);
    expect(titles).toContain("Activity by Supervisor A");
    expect(titles).toContain("Activity by Supervisor A on behalf of Supervisor B");
    expect(titles).not.toContain("Activity by Supervisor B");
  });

  it("As Supervisor B: sees own activity but NOT Supervisor A's activity (including the one done on B's behalf)", async () => {
    const { rows } = await activityService.list({ search: RUN_ID, limit: "1000" }, { id: supervisorBId, role: "supervisor", sessionId: "test" });
    const titles = rows.map((r) => r.title);
    expect(titles).toContain("Activity by Supervisor B");
    expect(titles).not.toContain("Activity by Supervisor A");
    expect(titles).not.toContain("Activity by Supervisor A on behalf of Supervisor B");
  });

  it("A supervisor cannot read another user's feed by passing an explicit actorId filter", async () => {
    const { rows } = await activityService.list(
      { search: RUN_ID, actorId: supervisorBId, limit: "1000" },
      { id: supervisorAId, role: "supervisor", sessionId: "test" },
    );
    const titles = rows.map((r) => r.title);
    // Still locked to A's own feed, ignoring the requested actorId=B.
    expect(titles).toContain("Activity by Supervisor A");
    expect(titles).not.toContain("Activity by Supervisor B");
  });

  it("As Admin: sees both Supervisor A and Supervisor B's activity, unrestricted", async () => {
    const { rows } = await activityService.list({ search: RUN_ID, limit: "1000" }, { id: adminId, role: "admin", sessionId: "test" });
    const titles = rows.map((r) => r.title);
    expect(titles).toContain("Activity by Supervisor A");
    expect(titles).toContain("Activity by Supervisor B");
    expect(titles).toContain("Activity by Supervisor A on behalf of Supervisor B");
  });

  it("Admin's own explicit actorId filter still narrows correctly", async () => {
    const { rows } = await activityService.list(
      { search: RUN_ID, actorId: supervisorBId, limit: "1000" },
      { id: adminId, role: "admin", sessionId: "test" },
    );
    const titles = rows.map((r) => r.title);
    expect(titles).toContain("Activity by Supervisor B");
    expect(titles).not.toContain("Activity by Supervisor A");

    // Cleanup (see file header - done here, not in afterAll), then release the connection.
    await db.delete(activityEvents).where(eq(activityEvents.sourceId, sourceIdA));
    await db.delete(activityEvents).where(eq(activityEvents.sourceId, sourceIdB));
    await db.delete(activityEvents).where(eq(activityEvents.sourceId, sourceIdOnBehalf));
    await db.delete(users).where(eq(users.id, supervisorAId));
    await db.delete(users).where(eq(users.id, supervisorBId));
    await db.delete(users).where(eq(users.id, adminId));
    await getDbClient().end();
  });
});
