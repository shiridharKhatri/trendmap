import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/security/auth";
import {
  getComparisonData,
  clearComparisonCache,
} from "@/lib/comparison/comparisonService";
import { ProductTrend } from "@/lib/models/ProductTrend";
import { cleanProductSearchKeyword } from "@/lib/trends/constants";

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
    const tab = url.searchParams.get("tab") || "matrix"; // default to matrix view
    const filter = url.searchParams.get("filter") || "all"; // all, missing, shared, only_primary, merged_duplicates
    const categoryMode = url.searchParams.get("categoryMode") || "all";
    const baselineCategory = url.searchParams.get("baselineCategory");
    const monitoredCategory = url.searchParams.get("monitoredCategory");
    const language = url.searchParams.get("language") || url.searchParams.get("market");
    const country = url.searchParams.get("country");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const search = url.searchParams.get("search")?.trim();

    const result = await getComparisonData({
      userId: session.userId,
      baselineId,
      monitoredId,
      baselineCategory,
      monitoredCategory,
      categoryMode,
      language,
      country,
    });

    if (result.baselineWebsites.length === 0 || result.monitoredWebsites.length === 0) {
      return NextResponse.json({
        primaryWebsite: result.activeBaselineWebsites[0] || result.baselineWebsites[0] || null,
        baselineWebsites: result.baselineWebsites,
        activeBaselineWebsites: result.activeBaselineWebsites,
        monitoredWebsites: result.monitoredWebsites,
        selectedMonitored: result.selectedMonitored,
        allComparedSites: [...result.activeBaselineWebsites, ...result.monitoredWebsites],
        stats: {
          primaryTotal: 0,
          monitoredTotal: 0,
          missingCount: 0,
          matchingCount: 0,
          onlyPrimaryCount: 0,
          matrixTotal: 0,
          duplicatesRemoved: 0,
        },
        pages: [],
        total: 0,
        categoryMode: result.categoryMode,
        baselineCategory: result.baselineCategory,
        monitoredCategory: result.monitoredCategory,
      });
    }

    let targetList: any[] = [];
    if (tab === "matrix") {
      if (filter === "missing") {
        targetList = result.matrix.filter((m: any) => m.status === "missing_from_baseline");
      } else if (filter === "shared") {
        targetList = result.matrix.filter((m: any) => m.status === "shared");
      } else if (filter === "only_primary") {
        targetList = result.matrix.filter((m: any) => m.status === "only_primary");
      } else if (filter === "merged_duplicates") {
        targetList = result.matrix.filter((m: any) => {
          const compCount = Object.keys(m.sites || {}).filter((d) => {
            const isBase = result.baselineWebsites.some((b) => b.domain === d);
            return !isBase && m.sites[d]?.available;
          }).length;
          return compCount > 1;
        });
      } else {
        targetList = result.matrix;
      }
    } else if (tab === "shared") {
      targetList = result.shared;
    } else if (tab === "only_primary") {
      targetList = result.onlyPrimary;
    } else if (tab === "merged_duplicates") {
      targetList = result.mergedDuplicates;
    } else {
      targetList = result.missingFromBaseline;
    }

    // Filter out purely numeric entries (e.g. "4") or items without letters
    targetList = targetList.filter((m: any) => {
      const title = (m.title || "").trim();
      const slug = (m.slug || m.productSlug || "").trim();
      if (title && (/^\d+$/.test(title) || !/[a-zA-Z]/.test(title))) return false;
      if (slug && (/^\d+$/.test(slug) || !/[a-zA-Z]/.test(slug))) return false;
      return true;
    });

    if (search) {
      const lower = search.toLowerCase();
      if (tab === "matrix") {
        targetList = targetList.filter(
          (m: any) =>
            m.title.toLowerCase().includes(lower) ||
            m.slug.toLowerCase().includes(lower) ||
            Object.keys(m.sites).some((d) => d.toLowerCase().includes(lower))
        );
      } else {
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
    }

    const total = targetList.length;
    const skip = (page - 1) * limit;
    const paginated = targetList.slice(skip, skip + limit);

    // Enrich paginated slice with cached Google Trends scores if available
    try {
      const lookupTerms = new Set<string>();
      for (const item of paginated) {
        const rawSlug = (item.slug || "").toLowerCase().trim();
        const rawTitle = (item.title || "").toLowerCase().trim();
        if (rawSlug) lookupTerms.add(rawSlug);
        if (rawTitle) lookupTerms.add(rawTitle);
        const cleanedSlug = cleanProductSearchKeyword(rawSlug);
        if (cleanedSlug) lookupTerms.add(cleanedSlug.toLowerCase().trim());
        const cleanedTitle = cleanProductSearchKeyword(rawTitle);
        if (cleanedTitle) lookupTerms.add(cleanedTitle.toLowerCase().trim());
      }

      if (lookupTerms.size > 0) {
        const cachedTrends = await ProductTrend.find({
          keyword: { $in: Array.from(lookupTerms) },
        }).lean();

        if (cachedTrends.length > 0) {
          const trendLookup = new Map<string, any>();
          for (const t of cachedTrends) {
            trendLookup.set(t.keyword.toLowerCase().trim(), t);
          }

          for (const item of paginated) {
            const rawSlug = (item.slug || "").toLowerCase().trim();
            const rawTitle = (item.title || "").toLowerCase().trim();
            const cleanedSlug = cleanProductSearchKeyword(rawSlug).toLowerCase().trim();
            const cleanedTitle = cleanProductSearchKeyword(rawTitle).toLowerCase().trim();

            const found =
              trendLookup.get(cleanedSlug) ||
              trendLookup.get(rawSlug) ||
              trendLookup.get(cleanedTitle) ||
              trendLookup.get(rawTitle);

            if (found) {
              item.trendScore = found.score;
              item.trendTimeline = found.timeline;
              item.trendExploreUrl = found.exploreUrl;
              item.trendPriority = found.priority;
            }
          }
        }
      }
    } catch {
      // Non-blocking enrichment
    }

    return NextResponse.json({
      primaryWebsite: result.activeBaselineWebsites[0] || result.baselineWebsites[0] || null,
      baselineWebsites: result.baselineWebsites,
      activeBaselineWebsites: result.activeBaselineWebsites,
      monitoredWebsites: result.monitoredWebsites,
      selectedMonitored: result.selectedMonitored,
      allComparedSites: [...result.activeBaselineWebsites, ...result.monitoredWebsites],
      stats: result.stats,
      tab,
      pages: paginated,
      total,
      page,
      limit,
      categoryMode: result.categoryMode,
      baselineCategory: result.baselineCategory,
      monitoredCategory: result.monitoredCategory,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
