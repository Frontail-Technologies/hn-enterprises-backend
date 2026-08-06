import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { randomInt, randomUUID } from "node:crypto";
import {
  NODE_ENV,
  PASSWORD_RESET_OTP_EXPIRY_MINUTES,
  PASSWORD_RESET_OTP_MAX_ATTEMPTS,
} from "@constants";
import { getDb } from "@db";
import { passwordResetTokens, refreshTokens, users } from "@db/schema";
import { auditService, backgroundJobService, emailService } from "@services";
import { assertStrongPassword, generateSecureToken, hashPassword, hashToken, verifyPassword } from "@utils";
import type { AuthTokenPayload } from "@types";
import type { RequestMeta } from "./auth.helpers";

type LoginInput = {
  identifier: string;
  password: string;
  clientType?: "admin" | "mobile";
};

type UserRecord = typeof users.$inferSelect;

function normalizeIdentifier(identifier: string) {
  return identifier.trim().toLowerCase();
}

function isAllowedForClient(user: UserRecord, clientType?: LoginInput["clientType"]) {
  if (clientType === "mobile") {
    return user.role === "supervisor";
  }

  return user.role === "super_admin" || user.role === "admin";
}

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
  };
}

function authPayload(user: UserRecord): AuthTokenPayload {
  if (!user.currentSessionId) {
    throw new Error("Active session not found");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    sessionId: user.currentSessionId,
  };
}

function generateOtp() {
  return String(randomInt(100000, 1000000));
}

function hashResetOtp(userId: string, otp: string) {
  return hashToken(`${userId}:${otp}`);
}

async function findUserByIdentifier(identifier: string) {
  const db = getDb();
  const normalizedIdentifier = normalizeIdentifier(identifier);

  const [user] = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.email, normalizedIdentifier),
        eq(users.username, normalizedIdentifier),
        eq(users.mobile, identifier.trim()),
      ),
    )
    .limit(1);

  return user ?? null;
}

async function getActiveUserById(userId: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user || user.status !== "active") {
    throw new Error("User not found");
  }

  return {
    user: publicUser(user),
    payload: authPayload(user),
  };
}

async function getActiveUserBySession(userId: string, sessionId: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user || user.status !== "active" || user.currentSessionId !== sessionId) {
    throw new Error("Session expired. Please login again.");
  }

  return {
    user: publicUser(user),
    payload: authPayload(user),
  };
}

async function createRefreshToken(userId: string, sessionId: string, meta?: RequestMeta) {
  const db = getDb();
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    sessionId,
    expiresAt,
    ipAddress: meta?.ipAddress ?? null,
    userAgent: meta?.userAgent ?? null,
  });

  return token;
}

export const authService = {
  async login(input: LoginInput, meta?: RequestMeta) {
    const db = getDb();
    const user = await findUserByIdentifier(input.identifier);

    if (!user) {
      await auditService.log({
        module: "auth",
        action: "login_failed",
        description: "Invalid identifier",
        metadata: { identifier: input.identifier, ...meta },
      });
      throw new Error("Invalid username or password");
    }

    if (user.status !== "active" || !isAllowedForClient(user, input.clientType)) {
      await auditService.log({
        userId: user.id,
        module: "auth",
        action: "login_blocked",
        description:
          user.status !== "active"
            ? `User status is ${user.status}`
            : `Role ${user.role} cannot login to ${input.clientType ?? "admin"} client`,
        metadata: meta,
      });
      throw new Error("Invalid username or password");
    }

    const passwordValid = await verifyPassword(input.password, user.passwordHash);

    if (!passwordValid) {
      await auditService.log({
        userId: user.id,
        module: "auth",
        action: "login_failed",
        description: "Invalid password",
        metadata: meta,
      });
      throw new Error("Invalid username or password");
    }

    const loggedInAt = new Date();
    const sessionId = randomUUID();

    await db
      .update(users)
      .set({
        currentSessionId: sessionId,
        lastLoginAt: loggedInAt,
        updatedAt: loggedInAt,
      })
      .where(eq(users.id, user.id));

    await db
      .update(refreshTokens)
      .set({ revokedAt: loggedInAt })
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));

    const sessionUser = {
      ...user,
      currentSessionId: sessionId,
      lastLoginAt: loggedInAt,
    };

    await auditService.log({
      userId: user.id,
      module: "auth",
      action: "login_success",
      description: "User logged in",
      metadata: meta,
    });

    return {
      user: publicUser(sessionUser),
      payload: authPayload(sessionUser),
    };
  },

  async getUserById(userId: string) {
    return getActiveUserById(userId);
  },

  async getUserBySession(userId: string, sessionId: string) {
    return getActiveUserBySession(userId, sessionId);
  },

  async createRefreshToken(userId: string, sessionId: string, meta?: RequestMeta) {
    return createRefreshToken(userId, sessionId, meta);
  },

  async rotateRefreshToken(token: string, meta?: RequestMeta) {
    const db = getDb();
    const tokenHash = hashToken(token);
    const now = new Date();

    const [refreshToken] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .limit(1);

    if (!refreshToken) {
      throw new Error("Invalid or expired refresh token");
    }

    if (refreshToken.revokedAt) {
      const diff = now.getTime() - refreshToken.revokedAt.getTime();
      if (diff < 30 * 1000) {
        throw new Error("Token recently rotated");
      }
      throw new Error("Invalid or expired refresh token");
    }

    if (!refreshToken.sessionId) {
      throw new Error("Invalid or expired refresh token");
    }

    const { user, payload } = await getActiveUserBySession(
      refreshToken.userId,
      refreshToken.sessionId,
    );

    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.id, refreshToken.id));

    const newRefreshToken = await createRefreshToken(
      refreshToken.userId,
      refreshToken.sessionId,
      meta,
    );

    return {
      user,
      payload,
      refreshToken: newRefreshToken,
    };
  },

  async revokeRefreshToken(token?: string) {
    if (!token) return;

    const db = getDb();
    const tokenHash = hashToken(token);
    const [refreshToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));

    if (refreshToken?.sessionId) {
      await db
        .update(users)
        .set({ currentSessionId: null, updatedAt: new Date() })
        .where(
          and(
            eq(users.id, refreshToken.userId),
            eq(users.currentSessionId, refreshToken.sessionId),
          ),
        );
    }
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    assertStrongPassword(newPassword);
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    if (user.role !== "super_admin" && user.role !== "admin") {
      throw new Error("Password change is available for admin users only");
    }

    const currentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentPasswordValid) {
      await auditService.log({
        userId,
        module: "auth",
        action: "password_change_failed",
        description: "Current password did not match",
      });
      throw new Error("Current password is incorrect");
    }

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(newPassword),
        currentSessionId: null,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

    await auditService.log({
      userId,
      module: "auth",
      action: "password_changed",
      description: "User changed password",
    });
  },

  async requestPasswordReset(identifier: string, meta?: RequestMeta) {
    const db = getDb();
    const user = await findUserByIdentifier(identifier);

    if (!user || user.status !== "active" || !user.email) {
      return { resetOtp: null };
    }

    const now = new Date();
    const otp = generateOtp();

    await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashResetOtp(user.id, otp),
      attempts: 0,
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_OTP_EXPIRY_MINUTES * 60 * 1000),
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    });

    backgroundJobService.enqueue("send-password-reset-otp", () =>
      emailService.sendPasswordResetOtp({
        email: user.email,
        name: user.name,
        otp,
        expiresInMinutes: PASSWORD_RESET_OTP_EXPIRY_MINUTES,
      }),
    );

    await auditService.log({
      userId: user.id,
      module: "auth",
      action: "password_reset_requested",
      description: "Password reset OTP requested",
      metadata: meta,
    });

    return {
      resetOtp: NODE_ENV === "production" ? null : otp,
    };
  },

  async resetPassword(identifier: string, otp: string, newPassword: string) {
    assertStrongPassword(newPassword);
    const db = getDb();
    const now = new Date();
    const user = await findUserByIdentifier(identifier);

    if (!user || user.status !== "active") {
      throw new Error("Invalid or expired OTP");
    }

    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1);

    if (!resetToken) {
      throw new Error("Invalid or expired OTP");
    }

    if (resetToken.attempts >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
      await db
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, resetToken.id));
      throw new Error("Invalid or expired OTP");
    }

    const expectedHash = hashResetOtp(user.id, otp.trim());
    if (resetToken.tokenHash !== expectedHash) {
      const attempts = resetToken.attempts + 1;
      await db
        .update(passwordResetTokens)
        .set({ attempts, usedAt: attempts >= PASSWORD_RESET_OTP_MAX_ATTEMPTS ? now : null })
        .where(eq(passwordResetTokens.id, resetToken.id));
      throw new Error("Invalid or expired OTP");
    }

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(newPassword),
        currentSessionId: null,
        passwordChangedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, resetToken.id));

    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));

    await auditService.log({
      userId: user.id,
      module: "auth",
      action: "password_reset_completed",
      description: "Password reset completed with OTP",
    });
  },
};