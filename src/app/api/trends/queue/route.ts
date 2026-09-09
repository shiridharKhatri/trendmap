import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/security/auth";
import {
  getQueueStatus,
  queueAllUnrankedProducts,
  startBackgroundQueueWorker,
  pauseBackgroundQueueWorker,
} from "@/lib/trends/trendsQueue";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const status = await getQueueStatus(session.userId);
    return NextResponse.json({ success: true, ...status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "queue_all";

    if (action === "queue_all" || action === "start") {
      const { queuedCount } = await queueAllUnrankedProducts(session.userId);
      const status = await getQueueStatus(session.userId);
      return NextResponse.json({
        success: true,
        message: `Queued ${queuedCount} products for gentle background processing (2-3 items/min). Safe without proxies!`,
        ...status,
      });
    }

    if (action === "pause") {
      pauseBackgroundQueueWorker();
      const status = await getQueueStatus(session.userId);
      return NextResponse.json({
        success: true,
        message: "Background demand analysis paused.",
        ...status,
      });
    }

    if (action === "resume") {
      startBackgroundQueueWorker();
      const status = await getQueueStatus(session.userId);
      return NextResponse.json({
        success: true,
        message: "Background demand analysis resumed (2-3 items/min).",
        ...status,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
