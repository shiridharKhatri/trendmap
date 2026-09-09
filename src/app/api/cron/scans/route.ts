import { NextRequest, NextResponse } from "next/server";
import { runDueScheduledScans } from "@/lib/scanner/scheduler";
import { getCronSecret } from "@/lib/security/env";

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  try {
    const configuredSecret = getCronSecret();

    // Validate secret token from Authorization header or URL param
    const authHeader = req.headers.get("authorization");
    const querySecret = req.nextUrl.searchParams.get("secret");

    const token = authHeader?.replace(/^Bearer\s+/i, "") || querySecret;

    if (!token || token !== configuredSecret) {
      return NextResponse.json(
        { error: "Unauthorized. Valid CRON_SECRET is required." },
        { status: 401 }
      );
    }

    const summary = await runDueScheduledScans();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to execute cron scans" },
      { status: 500 }
    );
  }
}
