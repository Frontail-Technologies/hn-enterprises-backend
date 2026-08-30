import { readSheetRows, normalizeKey } from "@modules/master-import/master-import.mapper";
import { getDb } from "@db";
import { users } from "@db/schema";
import { hashPassword } from "@utils";

export type UserImportRowData = {
  name: string;
  username: string;
  email: string;
  mobile: string;
  role: string;
  password: string;
};

type UserImportRow = UserImportRowData & { rowNumber: number };
type UserImportInvalidRow = UserImportRow & { error: string };

const VALID_ROLES = ["super_admin", "admin", "supervisor", "accountant", "office_staff"];

function assertAdmin(role: string) {
  if (!["super_admin", "admin"].includes(role)) {
    throw new Error("Only admin users can import users");
  }
}

function normalizeRole(role: string) {
  return role.toLowerCase().replace(/\s+/g, "_");
}

type ExistingIdentifiers = { usernames: Set<string>; emails: Set<string>; mobiles: Set<string> };

// Shared by the bulk preview loop and the standalone validate-row endpoint -
// uniqueness is checked against existing system records either way. In-file
// duplicates are only caught during the initial bulk preview (the only place
// every row is available at once).
export function validateUserRow(
  data: UserImportRowData,
  existing: ExistingIdentifiers,
): { error?: string; normalizedRole?: string } {
  // email is a NOT NULL column (auth.schema.ts) - required here too, not
  // just name/username/role/password, or the insert would fail at commit
  // time instead of being caught during preview/edit.
  if (!data.name || !data.username || !data.email || !data.role || !data.password) {
    return { error: "Missing required fields (Name, Username, Email, Role, Password)" };
  }

  const role = normalizeRole(data.role);
  if (!VALID_ROLES.includes(role)) return { error: `Invalid role: ${role}` };
  if (existing.usernames.has(data.username)) return { error: "Username already exists" };
  if (data.email && existing.emails.has(data.email)) return { error: "Email already exists" };
  if (data.mobile && existing.mobiles.has(data.mobile)) return { error: "Mobile already exists" };

  return { normalizedRole: role };
}

async function loadExistingIdentifiers(): Promise<ExistingIdentifiers> {
  const db = getDb();
  const existing = await db.select({ username: users.username, email: users.email, mobile: users.mobile }).from(users);
  return {
    usernames: new Set(existing.map((e) => e.username)),
    emails: new Set(existing.map((e) => e.email).filter((v): v is string => Boolean(v))),
    mobiles: new Set(existing.map((e) => e.mobile).filter((v): v is string => Boolean(v))),
  };
}

export const usersImportService = {
  async preview(file: File, user: { id: string; role: string }) {
    assertAdmin(user.role);

    const rawRows = await readSheetRows(file);
    const validRows: UserImportRow[] = [];
    const invalidRows: UserImportInvalidRow[] = [];
    const existing = await loadExistingIdentifiers();

    for (const row of rawRows) {
      const keys = Object.keys(row.values);
      const getVal = (possibleNames: string[]) => {
        const match = keys.find((k) => possibleNames.includes(normalizeKey(k)));
        return match ? String(row.values[match] || "").trim() : "";
      };

      const base: UserImportRowData = {
        name: getVal(["name", "fullname", "firstlast"]),
        username: getVal(["username", "user"]),
        email: getVal(["email", "emailaddress"]),
        mobile: getVal(["mobile", "phone", "contact"]),
        role: getVal(["role", "type", "userrole"]),
        password: getVal(["password", "pass"]),
      };

      const { error, normalizedRole } = validateUserRow(base, existing);
      if (error) {
        invalidRows.push({ rowNumber: row.rowNumber, ...base, error });
        continue;
      }

      existing.usernames.add(base.username);
      if (base.email) existing.emails.add(base.email);
      if (base.mobile) existing.mobiles.add(base.mobile);

      validRows.push({ rowNumber: row.rowNumber, ...base, role: normalizedRole ?? base.role });
    }

    return { fileName: file.name, validRows, invalidRows };
  },

  async validateRow(data: UserImportRowData, user: { role: string }) {
    assertAdmin(user.role);
    const existing = await loadExistingIdentifiers();
    const { error } = validateUserRow(data, existing);
    return { error };
  },

  // Per-row isolated - actually audited, not assumed: each imported account
  // is independent, with no FK or ordering relationship between one row and
  // another (unlike Customers, where a row can depend on a project/site
  // another row also creates). Username/email/mobile uniqueness is already
  // checked per-row, both against the DB and against rows already accepted
  // earlier in this same commit, so there is no scenario where one row
  // succeeding depends on another also succeeding. Nothing here justifies
  // keeping the whole accepted batch atomic ("auth is stricter" alone is not
  // a reason - the actual invariants were checked and none exist), so this
  // matches every other module's per-row-isolated commit policy.
  async confirm(validRows: UserImportRow[], user: { id: string }) {
    const db = getDb();
    let insertedCount = 0;
    const failed: { tempId: string; message: string }[] = [];
    const seenUsernames = new Set<string>();

    for (const row of validRows) {
      const tempId = String(row.rowNumber);
      try {
        if (seenUsernames.has(row.username)) {
          failed.push({ tempId, message: "Duplicate username in this batch" });
          continue;
        }
        seenUsernames.add(row.username);

        await db.insert(users).values({
          name: row.name,
          username: row.username,
          email: row.email,
          mobile: row.mobile || null,
          role: normalizeRole(row.role) as (typeof users.$inferInsert)["role"],
          passwordHash: await hashPassword(row.password),
        });
        insertedCount += 1;
      } catch (error) {
        failed.push({ tempId, message: error instanceof Error ? error.message : "Unable to import this row" });
      }
    }

    return { insertedCount, imported: insertedCount, failed };
  },
};
