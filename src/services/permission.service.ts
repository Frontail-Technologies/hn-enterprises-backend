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

  /**
   * Customers are not permanently owned by one supervisor (any supervisor can
   * change at the project level over time) - so this is a plain role check,
   * matching canFieldUpdate, rather than a per-customer ownership check.
   * Actor attribution for "who changed what" lives in Recent Activity /
   * customers.createdBy/updatedBy, not in a restrictive owner field.
   */
  canModifyCustomer(user: CurrentUser | null) {
    return hasRole(user, ["super_admin", "admin", "supervisor"]);
  },
};
