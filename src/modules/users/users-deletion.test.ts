/**
 * Integration tests for safe supervisor hard-delete with permanent history,
 * and for the "hard delete was actually deactivating" bug fix (see the
 * safe-hard-delete and fix-supervisor-hard-delete briefs). Runs against the
 * real DATABASE_URL - no DB layer is mocked, since usersDeletionService/
 * activityService/staffService talk to the database directly and there is
 * no existing seam to fake that safely.
 *
 * Cleanup note: this environment's `bun test` hangs indefinitely on any DB
 * query issued from an `afterAll` hook once a prior `beforeAll`/`it` in the
 * same describe has already queried the same connection (reproduced in
 * isolation with a trivial SELECT - not specific to any table/query here).
 * Cleanup is therefore done as the last step of the last `it()` in each
 * describe instead of in `afterAll`, which does not hit this hang. Every row
 * this suite creates uses a randomized, clearly-tagged email/username so a
 * run that's interrupted before its own cleanup step can never collide with
 * real data and is trivially identifiable for a manual sweep.
 *
 *   bun test src/modules/users/users-deletion.test.ts
 */
import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { getDb, getDbClient } from "@db";
import { activityEvents, projects, projectSites, staff, users } from "@db/schema";
import { hashPassword } from "@utils";
import { activityService } from "@modules/activity/activity.service";
import { usersDeletionService } from "./users-deletion.service";
import { usersService } from "./users.service";
import { staffService } from "../staff/staff.service";

const db = getDb();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sourceId = `test-safe-hard-delete-${RUN_ID}`;

const supervisorEmail = `safe-hard-delete-test-${RUN_ID}@example.invalid`;
const supervisorName = `Safe Hard Delete Test Supervisor ${RUN_ID}`;

describe("safe supervisor hard delete with permanent history", () => {
  let supervisorId: string;
  let adminId: string;
  let projectId: string;
  let siteId: string;
  let newUserWithSameEmailId: string;

  it("setup: create supervisor, admin, an active site assignment, and activity by the supervisor", async () => {
    const passwordHash = await hashPassword("Test-Password-123!");

    // A. create supervisor
    const [supervisor] = await db
      .insert(users)
      .values({
        name: supervisorName,
        username: `sfhd-supervisor-${RUN_ID}`,
        email: supervisorEmail,
        mobile: `9${RUN_ID.replace(/\D/g, "").slice(0, 9).padEnd(9, "0")}`,
        passwordHash,
        role: "supervisor",
        status: "active",
      })
      .returning();
    if (!supervisor) throw new Error("Failed to create test supervisor");
    supervisorId = supervisor.id;

    const [admin] = await db
      .insert(users)
      .values({
        name: `Safe Hard Delete Test Admin ${RUN_ID}`,
        username: `sfhd-admin-${RUN_ID}`,
        email: `safe-hard-delete-admin-${RUN_ID}@example.invalid`,
        passwordHash,
        role: "admin",
        status: "active",
      })
      .returning();
    if (!admin) throw new Error("Failed to create test admin");
    adminId = admin.id;

    // Active site assignment to the supervisor being deleted.
    const [project] = await db
      .insert(projects)
      .values({ name: `SFHD Test Project ${RUN_ID}`, normalizedName: `sfhd test project ${RUN_ID}` })
      .returning();
    if (!project) throw new Error("Failed to create test project");
    projectId = project.id;

    const [site] = await db
      .insert(projectSites)
      .values({
        projectId: project.id,
        name: `SFHD Test Site ${RUN_ID}`,
        normalizedName: `sfhd test site ${RUN_ID}`,
        status: "active",
        supervisorId,
        supervisorName,
      })
      .returning();
    if (!site) throw new Error("Failed to create test site");
    siteId = site.id;

    // B. create activity by supervisor
    await activityService.record({
      type: "system",
      action: "test.safe_hard_delete",
      actorId: supervisorId,
      entityType: "test",
      entityId: sourceId,
      sourceType: "test",
      sourceId,
      title: "Safe hard delete test event",
    });

    const [row] = await db.select().from(activityEvents).where(eq(activityEvents.sourceId, sourceId)).limit(1);
    expect(row).toBeTruthy();
    expect(row!.actorId).toBe(supervisorId);
    expect(row!.actorName).toBe(supervisorName);
    expect(row!.actorRole).toBe("supervisor");
  });

  it("H. reports the active site assignment as a non-blocking impact", async () => {
    const impact = await usersDeletionService.getDeleteImpact(supervisorId);
    expect(impact.canDelete).toBe(true);
    const dependency = impact.dependencies.find((d) => d.key === "activeSiteAssignments");
    expect(dependency?.count).toBe(1);
    expect(dependency?.action).toBe("detach");
  });

  it("C. hard-deletes the supervisor - no row at all, not a row with status=inactive", async () => {
    const result = await usersDeletionService.execute(supervisorId, adminId);
    expect(result.label).toBe(supervisorName);

    // A. the row with the old id does not exist
    const [row] = await db.select().from(users).where(eq(users.id, supervisorId)).limit(1);
    expect(row).toBeUndefined();

    // B. and there is no other row masquerading as this supervisor via status=inactive
    const inactiveRows = await db.select({ id: users.id }).from(users).where(eq(users.status, "inactive"));
    expect(inactiveRows.some((r) => r.id === supervisorId)).toBe(false);
  });

  it("H. the active-only supervisor roster does not contain the hard-deleted supervisor", async () => {
    // No page/limit - the exact shape of the call the app's roster hook makes, which returns a plain array.
    const roster = await usersService.list({ role: "supervisor", status: "active" });
    expect(Array.isArray(roster)).toBe(true);
    expect((roster as { id: string }[]).some((u) => u.id === supervisorId)).toBe(false);
  });

  it("D. the activity row still exists after the actor is deleted", async () => {
    const [row] = await db.select().from(activityEvents).where(eq(activityEvents.sourceId, sourceId)).limit(1);
    expect(row).toBeTruthy();
    expect(row!.actorId).toBeNull();
  });

  it("E. the old supervisor's name still renders via the snapshot, not a raw id or 'Unknown'", async () => {
    const [row] = await db.select().from(activityEvents).where(eq(activityEvents.sourceId, sourceId)).limit(1);
    expect(row!.actorName).toBe(supervisorName);

    const { rows } = await activityService.list({ search: undefined, limit: 200 }, { id: adminId, role: "admin", sessionId: "test" });
    const feedRow = rows.find((r) => r.id === row!.id);
    expect(feedRow?.actor?.name).toBe(supervisorName);
    expect(feedRow?.actor?.deleted).toBe(true);
    expect(feedRow?.actor?.id).toBeNull();
  });

  it("H. the active site assignment is cleared to Unassigned, not left dangling", async () => {
    const [site] = await db.select().from(projectSites).where(eq(projectSites.id, siteId)).limit(1);
    expect(site).toBeTruthy();
    expect(site!.supervisorId).toBeNull();
    expect(site!.supervisorName).toBeNull();
  });

  it("F. the same email can be used to create a new, unrelated user", async () => {
    const [newUser] = await db
      .insert(users)
      .values({
        name: `Different Person ${RUN_ID}`,
        username: `sfhd-new-user-${RUN_ID}`,
        email: supervisorEmail,
        passwordHash: await hashPassword("Another-Password-123!"),
        role: "supervisor",
        status: "active",
      })
      .returning();
    expect(newUser).toBeTruthy();
    expect(newUser!.id).not.toBe(supervisorId);
    newUserWithSameEmailId = newUser!.id;
  });

  it("G. the historical event does not attach to the new user sharing the old email, then cleans up", async () => {
    const [row] = await db.select().from(activityEvents).where(eq(activityEvents.sourceId, sourceId)).limit(1);
    expect(row!.actorId).toBeNull();
    expect(row!.actorId).not.toBe(newUserWithSameEmailId);
    expect(row!.actorName).toBe(supervisorName);

    // Cleanup (see file header - done here, not in afterAll).
    await db.delete(activityEvents).where(eq(activityEvents.sourceId, sourceId));
    await db.delete(projectSites).where(eq(projectSites.id, siteId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.id, newUserWithSameEmailId));
  });
});

describe("a staff-linked user can be permanently hard deleted (remove-staff-block brief)", () => {
  let localAdminId: string;
  let staffUserId: string;
  let staffId: string;

  it("§1-2. staff profile is reported as a non-blocking, deletable impact - not a blocker", async () => {
    const passwordHash = await hashPassword("Test-Password-123!");
    const [admin] = await db
      .insert(users)
      .values({
        name: `Remove Staff Block Test Admin ${RUN_ID}`,
        username: `rsb-admin-${RUN_ID}`,
        email: `remove-staff-block-admin-${RUN_ID}@example.invalid`,
        passwordHash,
        role: "admin",
        status: "active",
      })
      .returning();
    if (!admin) throw new Error("Failed to create test admin");
    localAdminId = admin.id;

    const [staffUser] = await db
      .insert(users)
      .values({
        name: `Remove Staff Block Test Supervisor ${RUN_ID}`,
        username: `rsb-supervisor-${RUN_ID}`,
        email: `remove-staff-block-supervisor-${RUN_ID}@example.invalid`,
        passwordHash,
        role: "supervisor",
        status: "active",
      })
      .returning();
    if (!staffUser) throw new Error("Failed to create test staff-linked user");
    staffUserId = staffUser.id;

    const staffRecord = await staffService.create({ userId: staffUserId }, localAdminId, "admin");
    staffId = staffRecord.id;

    const impact = await usersDeletionService.getDeleteImpact(staffUserId);
    expect(impact.canDelete).toBe(true);
    expect(impact.blockers.length).toBe(0);
    const dependency = impact.dependencies.find((d) => d.key === "staff");
    expect(dependency?.count).toBe(1);
    expect(dependency?.action).toBe("delete");
  });

  it("§3. hard-deleting the user cascade-removes the staff row too - no orphan, no leftover inactive row", async () => {
    const result = await usersDeletionService.execute(staffUserId, localAdminId);
    expect(result.label).toBeTruthy();

    const [userRow] = await db.select().from(users).where(eq(users.id, staffUserId)).limit(1);
    expect(userRow).toBeUndefined();

    const [staffRow] = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
    expect(staffRow).toBeUndefined();

    const inactiveRows = await db.select({ id: users.id }).from(users).where(eq(users.status, "inactive"));
    expect(inactiveRows.some((r) => r.id === staffUserId)).toBe(false);

    // Cleanup (see file header - done here, not in afterAll), then release the connection.
    await db.delete(users).where(eq(users.id, localAdminId));
    await getDbClient().end();
  });
});
