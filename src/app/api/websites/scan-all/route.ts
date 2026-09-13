import { NextRequest, NextResponse, after } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { executeWebsiteScan } from "@/lib/scanner/scanEngine";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    // Find all websites belonging to this user
    // Scan baseline websites first, then competitors
    const websites = await Website.find({ userId: session.userId }).sort({ isPrimary: -1, createdAt: 1 });

    if (websites.length === 0) {
      return NextResponse.json({ error: "No websites added yet" }, { status: 400 });
    }

    const sync = req.nextUrl.searchParams.get("sync") === "true";

    // Synchronous execution mode (if requested)
    if (sync) {
      const scanResults: any[] = [];
      for (const site of websites) {
        try {
          const result = await executeWebsiteScan(String(site._id), true);
          scanResults.push({
            websiteId: String(site._id),
            domain: site.domain,
            isPrimary: site.isPrimary,
            success: result.success,
            totalUrls: result.totalUrls,
          });
        } catch (err: any) {
          scanResults.push({
            websiteId: String(site._id),
            domain: site.domain,
            isPrimary: site.isPrimary,
            success: false,
            error: err.message,
          });
        }
      }

      return NextResponse.json({
        success: true,
        scannedCount: scanResults.length,
        results: scanResults,
      });
    }

    // Asynchronous background execution (Default):
    // Pre-mark all websites as scanning so UI polling recognizes them instantly
    const websiteIds = websites.map((w) => w._id);
    await Website.updateMany(
      { _id: { $in: websiteIds } },
      {
        $set: {
          isScanning: true,
          lockAcquiredAt: new Date(),
          lastScanStatus: "scanning",
        },
      }
    );

    // Run sequential background scan to avoid overwhelming network or system resources
    const runBatchBackground = async () => {
      for (const site of websites) {
        try {
          await executeWebsiteScan(String(site._id), true);
        } catch (err: any) {
          console.error(`[ScanAll background] Error scanning ${site.domain}:`, err);
        }
      }
    };

    const batchPromise = runBatchBackground().catch((err) => {
      console.error("[ScanAll background] Critical error during batch scan:", err);
    });

    after(async () => {
      try {
        await batchPromise;
      } catch (err) {
        console.error("[ScanAll after] Batch scan completion handler error:", err);
      }
    });

    return NextResponse.json(
      {
        success: true,
        isScanning: true,
        message: `Background scans initiated for all ${websites.length} websites`,
        count: websites.length,
        websites: websites.map((w) => ({
          websiteId: String(w._id),
          domain: w.domain,
          name: w.name,
          isPrimary: w.isPrimary,
        })),
      },
      { status: 202 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
