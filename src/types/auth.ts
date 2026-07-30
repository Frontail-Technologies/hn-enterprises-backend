export type UserRole =
  | "super_admin"
  | "admin"
  | "supervisor"
  | "field_executive"
  | "viewer";

export type AuthTokenPayload = {
  id: string;
  role: UserRole;
  sessionId: string;
  name?: string;
  email?: string;
};

export type CurrentUser = AuthTokenPayload;
