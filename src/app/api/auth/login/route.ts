import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { User } from "@/lib/models/User";
import { verifyPassword, signToken, ensureDefaultUser } from "@/lib/security/auth";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    await ensureDefaultUser(); // Make sure default admin exists if DB is clean

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    if (cleanEmail.length > 254 || password.length > 128) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 400 }
      );
    }

    const user = await User.findOne({ email: cleanEmail });
    // Constant-time mitigation against user enumeration timing attacks:
    // If the user does not exist, run a dummy bcrypt compare so execution duration remains identical
    const DUMMY_HASH = "$2a$10$7EqJtq98hPqEX7fNZaFWoOhiMkWbH5zW7vKqZ7G9R6H9Z6H9Z6H9Z";
    const passwordToCompare = user ? user.passwordHash : DUMMY_HASH;
    const isValid = await verifyPassword(password, passwordToCompare);

    if (!user || !isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

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
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Login failed" },
      { status: 500 }
    );
  }
}
