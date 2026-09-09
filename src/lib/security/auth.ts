import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { connectToDatabase } from "../db/mongodb";
import { User, IUserDocument } from "../models/User";
import { Settings } from "../models/Settings";

import { getAuthSecret, getCronSecret } from "./env";

const COOKIE_NAME = "sitemap_auth_token";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "user";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getAuthSecret());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as "admin" | "user",
    };
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the authenticated user from middleware headers, cookies, or Authorization header.
 */
export async function getAuthenticatedUser(
  req?: NextRequest
): Promise<SessionPayload | null> {
  // 1. Fast-path: Check if Edge Middleware already verified and forwarded headers
  if (req) {
    const userId = req.headers.get("x-user-id");
    const email = req.headers.get("x-user-email");
    const role = (req.headers.get("x-user-role") || "user") as "admin" | "user";
    if (userId && email) {
      return { userId, email, name: "", role };
    }
  }

  // 2. Direct token lookup from request
  let token: string | undefined;

  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      token = req.cookies.get(COOKIE_NAME)?.value;
    }
  }

  // 3. Fallback to next/headers cookies
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    } catch {
      // Out of request scope
    }
  }

  if (!token) return null;
  return verifyToken(token);
}

/**
 * Strict authentication guard: returns the authenticated user session or throws an UNAUTHORIZED error.
 */
export async function requireAuth(req: NextRequest): Promise<SessionPayload> {
  const session = await getAuthenticatedUser(req);
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

/**
 * Guarantees that at least one administrator account exists if the database is brand new.
 */
export async function ensureDefaultUser(): Promise<IUserDocument | null> {
  await connectToDatabase();
  const existingUser = await User.findOne();
  if (existingUser) {
    return existingUser;
  }

  const initialEmail = process.env.INITIAL_ADMIN_EMAIL;
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;

  // If no initial credentials are provided via environment, require manual registration
  if (!initialEmail || !initialPassword) {
    return null;
  }

  const hash = await hashPassword(initialPassword);

  const user = await User.create({
    email: initialEmail.toLowerCase().trim(),
    passwordHash: hash,
    name: "Platform Administrator",
    role: "admin",
  });

  // Create default settings for user
  await Settings.create({
    userId: user._id,
    defaultScanFrequency: "24h",
    maxConcurrentScans: 3,
    requestTimeoutMs: 15000,
    maxRetries: 3,
    cronSecret: getCronSecret(),
  });

  return user;
}
