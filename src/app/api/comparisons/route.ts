import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/security/auth";
import {
  getComparisonData,
  clearComparisonCache,
} from "@/lib/comparison/comparisonService";

export { clearComparisonCache };

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const url = new URL(req.url);
    const monitoredId = url.searchParams.get("monitoredId");
    const baselineId = url.searchParams.get("baselineId");
    const tab = url.searchParams.get("tab") || "missing"; // missing, shared, only_primary, merged_duplicates
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const search = url.searchParams.get("search")?.trim();

    const result = await getComparisonData({
      userId: session.userId,
      baselineId,
      monitoredId,
    });

    if (result.baselineWebsites.length === 0 || result.monitoredWebsites.length === 0) {
      return NextResponse.json({
        primaryWebsite: result.activeBaselineWebsites[0] || result.baselineWebsites[0] || null,
        baselineWebsites: result.baselineWebsites,
        activeBaselineWebsites: result.activeBaselineWebsites,
        monitoredWebsites: [],
        selectedMonitored: null,
        stats: null,
        pages: [],
        total: 0,
      });
    }

    let targetList: any[] = [];
    if (tab === "shared") {
      targetList = result.shared;
    } else if (tab === "only_primary") {
      targetList = result.onlyPrimary;
    } else if (tab === "merged_duplicates") {
      targetList = result.mergedDuplicates;
    } else {
      targetList = result.missingFromBaseline;
    }

    if (search) {
      const lower = search.toLowerCase();
      targetList = targetList.filter(
        (p) =>
          p.normalizedUrl.toLowerCase().includes(lower) ||
          (p.productSlug && p.productSlug.toLowerCase().includes(lower)) ||
          (p.matchedDomains && p.matchedDomains.some((d: string) => d.toLowerCase().includes(lower))) ||
          (p.matchedUrls && p.matchedUrls.some((u: string) => u.toLowerCase().includes(lower))) ||
          (p.competitorDomains && p.competitorDomains.some((d: string) => d.toLowerCase().includes(lower))) ||
          (p.domain && p.domain.toLowerCase().includes(lower))
      );
    }

    const total = targetList.length;
    const skip = (page - 1) * limit;
    const paginated = targetList.slice(skip, skip + limit);

    return NextResponse.json({
      primaryWebsite: result.activeBaselineWebsites[0] || result.baselineWebsites[0] || null,
      baselineWebsites: result.baselineWebsites,
      activeBaselineWebsites: result.activeBaselineWebsites,
      monitoredWebsites: result.monitoredWebsites,
      selectedMonitored: result.selectedMonitored,
      stats: result.stats,
      tab,
      pages: paginated,
      total,
      page,
      limit,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
