import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { User } from "@/lib/models/User";
import { Settings } from "@/lib/models/Settings";
import { hashPassword, signToken } from "@/lib/security/auth";
import { getCronSecret } from "@/lib/security/env";
import { validateUserName } from "@/lib/validation/name";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { email, password, name } = body;

    const fieldErrors: Record<string, string> = {};

    // 1. Name validation
    const nameValidation = validateUserName(name);
    if (!nameValidation.valid || !nameValidation.cleanName) {
      fieldErrors.name = nameValidation.error || "Please enter a valid name";
    }

    // 2. Email validation
    const cleanEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail) || cleanEmail.length > 254) {
      fieldErrors.email = "Please enter a valid email address";
    }

    // 3. Password validation
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      fieldErrors.password = "Password must be between 8 and 128 characters";
    }

    // If any validation failed, return all field errors at once
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: Object.values(fieldErrors).join(". "),
          errors: fieldErrors,
        },
        { status: 400 }
      );
    }

    const cleanName = nameValidation.cleanName!;
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: "User with this email already exists",
          errors: { email: "User with this email already exists" },
        },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      email: cleanEmail,
      passwordHash,
      name: cleanName,
      role: "admin",
    });

    // Create default settings
    await Settings.create({
      userId: user._id,
      defaultScanFrequency: "24h",
      maxConcurrentScans: 3,
      requestTimeoutMs: 15000,
      maxRetries: 3,
      cronSecret: getCronSecret(),
    });

    const token = await signToken({
      userId: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

    response.cookies.set("sitemap_auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Registration failed" },
      { status: 500 }
    );
  }
}
