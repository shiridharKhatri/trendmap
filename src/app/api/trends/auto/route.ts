import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PageChange } from "@/lib/models/PageChange";
import { Website } from "@/lib/models/Website";
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

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(parseInt(body.batchSize || "50", 10), 100);
    const targetGeo = typeof body.geo === "string" ? body.geo : "US";

    // User's websites
    const userWebsites = await Website.find({ userId: session.userId }, { _id: 1 }).lean();
    const websiteIds = userWebsites.map((w) => w._id);

    // Fetch user settings for optional SerpApi key
    const settings = await Settings.findOne({ userId: session.userId }).lean();
    const serpApiKey = settings?.serpApiKey;

    // Find unranked missing products
    const unrankedProducts = await PageChange.find({
      websiteId: { $in: websiteIds },
      type: "missing_from_primary",
      trendScore: { $exists: false },
    })
      .sort({ detectedAt: -1 })
      .limit(batchSize);

    if (unrankedProducts.length === 0) {
      const totalRemaining = 0;
      return NextResponse.json({
        success: true,
        processed: 0,
        remaining: 0,
        message: "All missing products are already analyzed",
      });
    }

    const updatedItems: any[] = [];

    // Process batch with concurrency limit
    for (const item of unrankedProducts) {
      const term = item.productSlug || item.normalizedUrl || item.url;
      try {
        const trend = await getProductTrend(term, targetGeo, "today 1-m", serpApiKey);
        item.trendScore = trend.score;
        item.trendPriority = trend.priority;
        item.trendGeo = trend.geo;
        item.trendExploreUrl = trend.exploreUrl;
        item.trendFetchedAt = new Date();
        await item.save();

        updatedItems.push({
          id: String(item._id),
          keyword: trend.keyword,
          score: trend.score,
          priority: trend.priority,
        });
      } catch {
        // Skip failed individual item
      }
    }

    const remaining = await PageChange.countDocuments({
      websiteId: { $in: websiteIds },
      type: "missing_from_primary",
      trendScore: { $exists: false },
    });

    return NextResponse.json({
      success: true,
      processed: updatedItems.length,
      remaining,
      results: updatedItems,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
