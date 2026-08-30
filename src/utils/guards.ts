import type { AuthTokenPayload, UserRole } from "@types";

export function assertUser(currentUser: AuthTokenPayload | null): AuthTokenPayload {
  if (!currentUser) {
    throw new Error("Authentication required");
  }
  return currentUser;
}

const ELEVATED_ROLES: UserRole[] = ["super_admin", "admin"];

export function assertCanAssignRole(actorRole: UserRole, targetRole: UserRole) {
  if (ELEVATED_ROLES.includes(targetRole) && actorRole !== "super_admin") {
    throw new Error("Only super_admin can assign the super_admin or admin role");
  }
}
