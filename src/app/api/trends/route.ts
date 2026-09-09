import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PageChange } from "@/lib/models/PageChange";
import { Settings } from "@/lib/models/Settings";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { getProductTrend } from "@/lib/trends/trendsService";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const { pageChangeId, pageChangeIds, url, keyword, geo } = body;

    // Fetch user settings to check for optional SerpApi key
    const settings = await Settings.findOne({ userId: session.userId }).lean();
    const targetGeo = typeof geo === "string" ? geo : (settings?.defaultTrendGeo || "");

    // Batch analysis mode
    if (Array.isArray(pageChangeIds) && pageChangeIds.length > 0) {
      const maxBatch = 25;
      const idsToProcess = pageChangeIds.slice(0, maxBatch);

      const pageChanges = await PageChange.find({
        _id: { $in: idsToProcess },
      });

      const results: any[] = [];

      for (const pc of pageChanges) {
        const queryTerm = pc.productSlug || pc.normalizedUrl || pc.url;
        const trendResult = await getProductTrend(queryTerm, targetGeo, "today 1-m", settings?.serpApiKey);

        pc.trendScore = trendResult.score;
        pc.trendPriority = trendResult.priority;
        pc.trendGeo = trendResult.geo;
        pc.trendExploreUrl = trendResult.exploreUrl;
        pc.trendFetchedAt = new Date();
        await pc.save();

        results.push({
          pageChangeId: String(pc._id),
          trend: trendResult,
        });
      }

      return NextResponse.json({
        success: true,
        processed: results.length,
        results,
      });
    }

    // Single item analysis mode
    let targetTerm = keyword || url;

    if (pageChangeId) {
      const pc = await PageChange.findById(pageChangeId);
      if (!pc) {
        return NextResponse.json({ error: "Page change not found" }, { status: 404 });
      }

      targetTerm = pc.productSlug || pc.normalizedUrl || pc.url;
      const trendResult = await getProductTrend(targetTerm, targetGeo, "today 1-m", settings?.serpApiKey);

      pc.trendScore = trendResult.score;
      pc.trendPriority = trendResult.priority;
      pc.trendGeo = trendResult.geo;
      pc.trendExploreUrl = trendResult.exploreUrl;
      pc.trendFetchedAt = new Date();
      await pc.save();

      return NextResponse.json({
        success: true,
        pageChangeId: String(pc._id),
        trend: trendResult,
      });
    }

    if (!targetTerm) {
      return NextResponse.json({ error: "Missing keyword, url, or pageChangeId" }, { status: 400 });
    }

    const trendResult = await getProductTrend(targetTerm, targetGeo, "today 1-m", settings?.serpApiKey);

    return NextResponse.json({
      success: true,
      trend: trendResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
