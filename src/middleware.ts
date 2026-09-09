import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getAuthSecret, getCronSecret } from "@/lib/security/env";

const COOKIE_NAME = "sitemap_auth_token";

// In-memory sliding rate limiter for sensitive authentication endpoints
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();

function checkRateLimit(ip: string, limit = 10, windowMs = 60000): boolean {
  const now = Date.now();
  // Periodically purge expired records if map grows
  if (rateLimitMap.size > 1000) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (now > val.resetTime) rateLimitMap.delete(key);
    }
  }

  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= limit) {
    return false;
  }
  record.count++;
  return true;
}

// Security headers applied to all responses
function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()");
  res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.groq.com; frame-ancestors 'none';"
  );
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return res;
}

async function getVerifiedPayload(req: NextRequest) {
  let token: string | undefined;

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    token = req.cookies.get(COOKIE_NAME)?.value;
  }

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  // Reject bot probes targeting Server Actions (this application uses standard REST API routes)
  if (req.headers.has("next-action")) {
    return applySecurityHeaders(new NextResponse(null, { status: 404 }));
  }

  // 1. Rate Limiting for Auth Endpoints (Brute Force Protection: max 6 attempts per minute)
  if (pathname === "/api/auth/login" || pathname === "/api/auth/register") {
    if (!checkRateLimit(ip, 6, 60000)) {
      const rateLimitRes = NextResponse.json(
        { error: "Too many authentication attempts. Please wait 60 seconds before trying again." },
        { status: 429 }
      );
      return applySecurityHeaders(rateLimitRes);
    }
  }

  // 2. Cron Endpoint Protection
  if (pathname.startsWith("/api/cron/")) {
    const authHeader = req.headers.get("authorization");
    const querySecret = req.nextUrl.searchParams.get("secret");
    const token = authHeader?.replace(/^Bearer\s+/i, "") || querySecret;

    if (!token || token !== getCronSecret()) {
      const unauthorizedCron = NextResponse.json(
        { error: "Unauthorized. Valid CRON_SECRET is required." },
        { status: 401 }
      );
      return applySecurityHeaders(unauthorizedCron);
    }

    const res = NextResponse.next();
    return applySecurityHeaders(res);
  }

  // 3. Authenticate User Session
  const session = await getVerifiedPayload(req);

  // 4. Auth Pages (Login & Register): Redirect to Dashboard if already logged in
  if (pathname === "/login" || pathname === "/register") {
    if (session) {
      const redirectUrl = new URL("/dashboard", req.url);
      const res = NextResponse.redirect(redirectUrl);
      return applySecurityHeaders(res);
    }
    const res = NextResponse.next();
    return applySecurityHeaders(res);
  }

  // 5. Dashboard Pages: Require Authentication
  if (pathname.startsWith("/dashboard")) {
    if (!session) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("from", pathname);
      const res = NextResponse.redirect(loginUrl);
      return applySecurityHeaders(res);
    }
    const res = NextResponse.next();
    return applySecurityHeaders(res);
  }

  // 6. Protected API Routes
  if (pathname.startsWith("/api/")) {
    // Exclude public auth endpoints
    if (pathname.startsWith("/api/auth/")) {
      const res = NextResponse.next();
      return applySecurityHeaders(res);
    }

    // All other API endpoints require valid authentication
    if (!session) {
      const unauthRes = NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      );
      return applySecurityHeaders(unauthRes);
    }

    // Forward authenticated user identity downstream in request headers
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-user-id", String(session.userId || ""));
    requestHeaders.set("x-user-email", String(session.email || ""));
    requestHeaders.set("x-user-role", String(session.role || "user"));

    const res = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    return applySecurityHeaders(res);
  }

  const res = NextResponse.next();
  return applySecurityHeaders(res);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, icon.png, apple-icon.png (static icons)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
