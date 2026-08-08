import { readSheetRows, normalizeKey } from "@modules/master-import/master-import.mapper";
import { getDb } from "@db";
import { users } from "@db/schema";
import { eq, or } from "drizzle-orm";
import { hashPassword } from "@utils";

export const usersImportService = {
  async preview(file: File, user: { id: string; role: string }) {
    if (!["super_admin", "admin"].includes(user.role)) {
      throw new Error("Only admin users can import users");
    }

    const rawRows = await readSheetRows(file);
    
    const validRows: any[] = [];
    const invalidRows: any[] = [];

    const db = getDb();
    const existing = await db
      .select({ username: users.username, email: users.email, mobile: users.mobile })
      .from(users);
    
    const existingUsernames = new Set(existing.map((e) => e.username));
    const existingEmails = new Set(existing.map((e) => e.email).filter(Boolean));
    const existingMobiles = new Set(existing.map((e) => e.mobile).filter(Boolean));

    for (const row of rawRows) {
      const keys = Object.keys(row.values);
      const getVal = (possibleNames: string[]) => {
        const match = keys.find((k) => possibleNames.includes(normalizeKey(k)));
        return match ? String(row.values[match] || "").trim() : "";
      };

      const name = getVal(["name", "fullname", "firstlast"]);
      const username = getVal(["username", "user"]);
      const email = getVal(["email", "emailaddress"]);
      const mobile = getVal(["mobile", "phone", "contact"]);
      let role = getVal(["role", "type", "userrole"]);
      const password = getVal(["password", "pass"]);

      if (!name || !username || !role || !password) {
        invalidRows.push({ rowNumber: row.rowNumber, name, username, email, mobile, role, error: "Missing required fields (Name, Username, Role, Password)" });
        continue;
      }

      // Map roles
      role = role.toLowerCase().replace(/\s+/g, "_");
      if (!["super_admin", "admin", "supervisor", "accountant", "office_staff"].includes(role)) {
        invalidRows.push({ rowNumber: row.rowNumber, name, username, email, mobile, role, error: `Invalid role: ${role}` });
        continue;
      }

      if (existingUsernames.has(username)) {
        invalidRows.push({ rowNumber: row.rowNumber, name, username, email, mobile, role, error: "Username already exists" });
        continue;
      }

      if (email && existingEmails.has(email)) {
        invalidRows.push({ rowNumber: row.rowNumber, name, username, email, mobile, role, error: "Email already exists" });
        continue;
      }

      if (mobile && existingMobiles.has(mobile)) {
        invalidRows.push({ rowNumber: row.rowNumber, name, username, email, mobile, role, error: "Mobile already exists" });
        continue;
      }

      existingUsernames.add(username);
      if (email) existingEmails.add(email);
      if (mobile) existingMobiles.add(mobile);

      validRows.push({ rowNumber: row.rowNumber, name, username, email, mobile, role, password });
    }

    return {
      fileName: file.name,
      validRows,
      invalidRows,
    };
  },

  async confirm(validRows: any[], user: { id: string }) {
    if (!validRows.length) return { insertedCount: 0 };
    
    const db = getDb();
    await db.transaction(async (tx) => {
      const toInsert = [];
      for (const row of validRows) {
        toInsert.push({
          name: row.name,
          username: row.username,
          email: row.email || null,
          mobile: row.mobile || null,
          role: row.role as any,
          passwordHash: await hashPassword(row.password),
        });
      }

      if (toInsert.length > 0) {
        await tx.insert(users).values(toInsert);
      }
    });

    return { insertedCount: validRows.length };
  }
};
