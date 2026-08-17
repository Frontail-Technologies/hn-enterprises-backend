import type { CurrentUser, UserRole } from "@types";

function hasRole(user: CurrentUser | null, roles: UserRole | UserRole[]) {
  if (!user) return false;
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return allowedRoles.includes(user.role);
}

export const permissionService = {
  hasRole(user: CurrentUser | null, roles: UserRole | UserRole[]) {
    return hasRole(user, roles);
  },

  canManage(user: CurrentUser | null) {
    return hasRole(user, ["super_admin", "admin"]);
  },

  canFieldUpdate(user: CurrentUser | null) {
    return hasRole(user, ["super_admin", "admin", "supervisor"]);
  },
};
