import { eq } from "drizzle-orm";
import { getDb } from "@db";
import { appSettings } from "@db/schema";
import { auditService } from "@services";

/**
 * Maintenance mode: while on, the mobile app is blocked for everyone who is
 * not an admin (the API answers 503 and the app shows a maintenance screen).
 * The admin panel keeps working.
 */
export type MaintenanceState = { enabled: boolean; message: string; updatedAt: string | null };

const KEY = "maintenance";
export const DEFAULT_MAINTENANCE_MESSAGE = "The app is under maintenance. Please try again in a little while.";
const ADMIN_ROLES = new Set(["super_admin", "admin"]);
const CACHE_MS = 15_000;

let cache: { at: number; state: MaintenanceState } | null = null;

export class MaintenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaintenanceError";
  }
}

export async function getMaintenance(): Promise<MaintenanceState> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.state;
  let state: MaintenanceState = { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE, updatedAt: null };
  try {
    const [row] = await getDb().select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
    if (row) {
      const value = row.value as Partial<MaintenanceState>;
      state = {
        enabled: Boolean(value.enabled),
        message: value.message?.trim() || DEFAULT_MAINTENANCE_MESSAGE,
        updatedAt: row.updatedAt.toISOString(),
      };
    }
  } catch (error) {
    // Table not migrated yet, or DB hiccup: never block the app because of this check.
    console.error("[maintenance] read failed", error);
  }
  cache = { at: Date.now(), state };
  return state;
}

export async function setMaintenance(input: { enabled: boolean; message?: string }, actorId: string) {
  const value = { enabled: input.enabled, message: input.message?.trim() || DEFAULT_MAINTENANCE_MESSAGE };
  await getDb()
    .insert(appSettings)
    .values({ key: KEY, value, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: actorId, updatedAt: new Date() } });
  cache = null;
  await auditService.log({
    userId: actorId,
    module: "System",
    action: input.enabled ? "Maintenance On" : "Maintenance Off",
    description: input.enabled ? `Mobile app blocked: ${value.message}` : "Mobile app unblocked",
  });
  return getMaintenance();
}

/** Throws a MaintenanceError (503) when maintenance is on and the role is not an admin. */
export async function assertNotInMaintenance(role: string | null | undefined) {
  if (role && ADMIN_ROLES.has(role)) return;
  const state = await getMaintenance();
  if (state.enabled) throw new MaintenanceError(state.message);
}
