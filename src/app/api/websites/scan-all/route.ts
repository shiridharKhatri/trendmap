import { NextRequest, NextResponse } from "next/server";
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

    const scanResults: any[] = [];

    // Scan each website sequentially to avoid overwhelming resources
    for (const site of websites) {
      try {
        const result = await executeWebsiteScan(String(site._id));
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
