import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { Website } from "@/lib/models/Website";
import { PageChange } from "@/lib/models/PageChange";
import { ProductTrend } from "@/lib/models/ProductTrend";
import { cleanProductSearchKeyword, isNonProduct } from "@/lib/trends/constants";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch user websites
    const websites = await Website.find({ userId: session.userId }).lean();
    const primaryWebsites = websites.filter((w) => w.isPrimary);
    const competitorWebsites = websites.filter((w) => !w.isPrimary);
    const competitorIds = competitorWebsites.map((w) => w._id);

    const baseQuery: any = {
      websiteId: { $in: competitorIds },
      type: "missing_from_primary",
    };

    // 2. Fetch counts in parallel
    const [totalMissing, activeCount, completedCount, highCount, medCount, lowCount, unanalyzedCount] =
      await Promise.all([
        PageChange.countDocuments(baseQuery),
        PageChange.countDocuments({ ...baseQuery, isReviewed: false }),
        PageChange.countDocuments({ ...baseQuery, isReviewed: true }),
        PageChange.countDocuments({ ...baseQuery, trendPriority: "high" }),
        PageChange.countDocuments({ ...baseQuery, trendPriority: "medium" }),
        PageChange.countDocuments({ ...baseQuery, trendPriority: "low" }),
        PageChange.countDocuments({ ...baseQuery, trendScore: { $exists: false } }),
      ]);

    // 3. Fetch real Google Trends timelines from ProductTrend collection
    const productTrendsWithTimeline = await ProductTrend.find(
      { "timeline.0": { $exists: true } },
      { keyword: 1, score: 1, timeline: 1 }
    ).lean();

    // Compute real aggregated momentum points from actual Google Trends timelines
    interface AggregatedPoint {
      label: string;
      value: number;
      count: number;
    }

    const momentumPoints: { label: string; value: number }[] = [];

    if (productTrendsWithTimeline.length > 0) {
      // Find the timeline with the most points to determine date buckets
      const longest = productTrendsWithTimeline.reduce(
        (max, curr) => ((curr.timeline?.length || 0) > (max.timeline?.length || 0) ? curr : max),
        productTrendsWithTimeline[0]
      );

      const bucketCount = Math.min(12, longest.timeline?.length || 12);
      const buckets: AggregatedPoint[] = [];

      for (let b = 0; b < bucketCount; b++) {
        const sampleDate = longest.timeline?.[b]?.date || `P${b + 1}`;
        buckets.push({ label: sampleDate, value: 0, count: 0 });
      }

      // Sum actual values across all real product trends
      productTrendsWithTimeline.forEach((pt) => {
        const tl = pt.timeline;
        if (!tl || tl.length === 0) return;
        const ptLen = tl.length;
        buckets.forEach((bucket, bIdx) => {
          // Sample proportionally across the timeline
          const ptIdx = Math.min(ptLen - 1, Math.floor((bIdx / bucketCount) * ptLen));
          const val = tl[ptIdx]?.value;
          if (typeof val === "number") {
            bucket.value += val;
            bucket.count++;
          }
        });
      });

      // Calculate pure average (no synthetic numbers)
      buckets.forEach((b) => {
        momentumPoints.push({
          label: b.label,
          value: b.count > 0 ? Math.round(b.value / b.count) : 0,
        });
      });
    }

    // 4. Fetch top real high-demand opportunities (only items with actual trendScore)
    const topOpportunitiesRaw = await PageChange.find({
      ...baseQuery,
      trendScore: { $exists: true, $gt: 0 },
      isReviewed: false,
    })
      .sort({ trendScore: -1 })
      .limit(20)
      .lean();

    const staleNonProducts: any[] = [];
    const validOpportunities = topOpportunitiesRaw.filter((item) => {
      const slugOrUrl = item.productSlug || item.normalizedUrl || item.url;
      const clean = cleanProductSearchKeyword(slugOrUrl);
      if (
        isNonProduct(slugOrUrl) ||
        !clean ||
        !/[a-zA-Z]/.test(clean) ||
        /^\d+$/.test(clean) ||
        /^\d+$/.test(item.productSlug || "")
      ) {
        staleNonProducts.push(item._id);
        return false;
      }
      return true;
    }).slice(0, 5);

    if (staleNonProducts.length > 0) {
      PageChange.deleteMany({ _id: { $in: staleNonProducts } }).catch(() => {});
    }

    const websiteMap = new Map(websites.map((w) => [String(w._id), w.domain]));

    const topOpportunities = validOpportunities.map((item) => ({
      _id: String(item._id),
      url: item.url,
      productSlug: cleanProductSearchKeyword(item.productSlug || item.normalizedUrl || item.url),
      normalizedUrl: item.normalizedUrl,
      trendScore: item.trendScore,
      trendPriority: item.trendPriority,
      trendGeo: item.trendGeo,
      websiteDomain: websiteMap.get(String(item.websiteId)) || "Competitor",
    }));

    return NextResponse.json({
      websites: websites.map((w) => ({
        _id: String(w._id),
        name: w.name,
        domain: w.domain,
        isPrimary: w.isPrimary,
        totalUrls: w.totalUrls || 0,
        lastScanStatus: w.lastScanStatus,
      })),
      totalMissing,
      activeCount,
      completedCount,
      priorityCounts: {
        high: highCount,
        medium: medCount,
        low: lowCount,
        unanalyzed: unanalyzedCount,
      },
      momentumTimeline: momentumPoints,
      topOpportunities,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
