import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Auto-heal any stale locks (> 5 mins)
    await Website.updateMany(
      {
        userId: session.userId,
        isScanning: true,
        $or: [
          { lockAcquiredAt: { $lt: fiveMinutesAgo } },
          { lockAcquiredAt: { $exists: false } },
          { lockAcquiredAt: null },
        ],
      },
      {
        $set: {
          isScanning: false,
          lastScanStatus: "warning",
          lastScanErrorMessage: "Scan timed out or stalled; lock released automatically.",
        },
      }
    );

    // Fetch active scanning sites
    const activeWebsites = await Website.find({
      userId: session.userId,
      isScanning: true,
    })
      .select("_id domain name isPrimary lockAcquiredAt lastScanStatus")
      .lean();

    const now = Date.now();
    const activeScans = activeWebsites.map((w) => {
      const lockTime = w.lockAcquiredAt ? new Date(w.lockAcquiredAt).getTime() : now;
      return {
        websiteId: String(w._id),
        domain: w.domain,
        name: w.name,
        isPrimary: Boolean(w.isPrimary),
        startedAt: w.lockAcquiredAt || new Date(),
        elapsedSeconds: Math.max(0, Math.floor((now - lockTime) / 1000)),
      };
    });

    return NextResponse.json({
      activeScans,
      count: activeScans.length,
      hasActiveScans: activeScans.length > 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
