import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Website } from "@/lib/models/Website";
import { Scan } from "@/lib/models/Scan";
import { PageChange } from "@/lib/models/PageChange";
import { getAuthenticatedUser } from "@/lib/security/auth";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    // 1. Fetch user's websites
    const websites = await Website.find({ userId: session.userId })
      .sort({ isPrimary: -1, createdAt: -1 })
      .lean();

    const primaryWebsite = websites.find((w) => w.isPrimary) || null;
    const monitoredWebsites = websites.filter((w) => !w.isPrimary);

    // 2. Aggregate statistics across monitored websites
    const totalMonitoredSites = monitoredWebsites.length;
    const totalMonitoredUrls = monitoredWebsites.reduce((acc, curr) => acc + (curr.totalUrls || 0), 0);
    const totalMissingUrls = monitoredWebsites.reduce((acc, curr) => acc + (curr.missingUrlsCount || 0), 0);
    const totalNewUrls = monitoredWebsites.reduce((acc, curr) => acc + (curr.newUrlsCount || 0), 0);
    const scanFailures = websites.filter((w) => w.lastScanStatus === "error").length;

    // 3. Recent 5 scans across all websites
    const websiteIds = websites.map((w) => w._id);
    const recentScans = await Scan.find({ websiteId: { $in: websiteIds } })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const websiteMap = new Map(websites.map((w) => [String(w._id), w]));
    const enrichedRecentScans = recentScans.map((s) => ({
      ...s,
      websiteName: websiteMap.get(String(s.websiteId))?.name || "Unknown",
      websiteDomain: websiteMap.get(String(s.websiteId))?.domain || "Unknown",
    }));

    return NextResponse.json({
      summary: {
        primaryWebsite: primaryWebsite
          ? {
              id: primaryWebsite._id,
              name: primaryWebsite.name,
              domain: primaryWebsite.domain,
              url: primaryWebsite.url,
              totalUrls: primaryWebsite.totalUrls,
              lastScanAt: primaryWebsite.lastScanAt,
              lastScanStatus: primaryWebsite.lastScanStatus,
              isScanning: primaryWebsite.isScanning,
            }
          : null,
        monitored: {
          count: totalMonitoredSites,
          totalUrls: totalMonitoredUrls,
          missingUrls: totalMissingUrls,
          newUrls: totalNewUrls,
          scanFailures,
        },
      },
      websites,
      recentScans: enrichedRecentScans,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
