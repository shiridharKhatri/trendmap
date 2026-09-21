import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PageChange } from "@/lib/models/PageChange";
import { Page } from "@/lib/models/Page";
import { Website } from "@/lib/models/Website";
import { ProductTrend } from "@/lib/models/ProductTrend";
import { cleanProductSearchKeyword, isNonProduct } from "@/lib/trends/constants";
import { getAuthenticatedUser } from "@/lib/security/auth";
import {
  BulkProductMatcher,
  extractProductSlug,
  tokenizeProductSlug,
} from "@/lib/comparison/productMatcher";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const url = new URL(req.url);
    const websiteId = url.searchParams.get("websiteId");
    const search = url.searchParams.get("search");
    const reviewed = url.searchParams.get("reviewed");
    const priority = url.searchParams.get("priority"); // all, high, medium, low, unanalyzed
    const geo = url.searchParams.get("geo");
    const category = url.searchParams.get("category");
    const language = url.searchParams.get("language") || url.searchParams.get("market");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const sortBy = url.searchParams.get("sortBy") || "detectedAt";
    const sortOrder = url.searchParams.get("sortOrder") === "asc" ? 1 : -1;

    // Find all websites belonging to this user
    const websiteQuery: any = { userId: session.userId };
    if (category && category !== "all") {
      websiteQuery.category = category;
    }
    if (language && language !== "all") {
      websiteQuery.language = language;
    }

    const userWebsites = await Website.find(
      websiteQuery,
      { _id: 1, name: 1, domain: 1, isPrimary: 1, category: 1, language: 1, country: 1 }
    ).lean();
    // Only competitor websites can have missing products (baseline sites are our catalog!)
    const competitorWebsites = userWebsites.filter((w) => !w.isPrimary);
    const competitorWebsiteIds = competitorWebsites.map((w) => w._id);
    const websiteMap = new Map(userWebsites.map((w) => [String(w._id), w]));

    // Base scope query for current checklist tab (active vs completed) and website/search/geo
    const tabScopeQuery: any = {
      websiteId: websiteId
        ? competitorWebsiteIds.some((id) => String(id) === String(websiteId))
          ? websiteId
          : { $in: [] }
        : { $in: competitorWebsiteIds },
      type: "missing_from_primary",
    };

    if (reviewed === "true") {
      tabScopeQuery.isReviewed = true;
    } else if (reviewed === "false") {
      tabScopeQuery.isReviewed = false;
    }



    if (search && search.trim()) {
      const term = search.trim();
      tabScopeQuery.$or = [
        { normalizedUrl: { $regex: term, $options: "i" } },
        { productSlug: { $regex: term, $options: "i" } },
      ];
    }

    // Query for table rows applying the active priority filter
    const query: any = { ...tabScopeQuery };

    if (priority === "high" || priority === "medium" || priority === "low") {
      query.trendPriority = priority;
    } else if (priority === "unanalyzed") {
      query.trendScore = { $exists: false };
    }

    const skip = (page - 1) * limit;

    // Determine sort object
    const sortObj: any = {};
    if (sortBy === "trendScore") {
      sortObj.trendScore = sortOrder;
      sortObj.detectedAt = -1;
    } else {
      sortObj[sortBy] = sortOrder;
    }

    // Base scope query for counting completed vs active checklist items across all tabs
    const baseScopeQuery: any = {
      websiteId: websiteId
        ? competitorWebsiteIds.some((id) => String(id) === String(websiteId))
          ? websiteId
          : { $in: [] }
        : { $in: competitorWebsiteIds },
      type: "missing_from_primary",
    };

    const [
      changes,
      filteredTotal,
      allCount,
      highCount,
      medCount,
      lowCount,
      unanalyzedCount,
      completedCount,
      activeCount,
    ] = await Promise.all([
      PageChange.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      PageChange.countDocuments(query),
      PageChange.countDocuments(tabScopeQuery),
      PageChange.countDocuments({ ...tabScopeQuery, trendPriority: "high" }),
      PageChange.countDocuments({ ...tabScopeQuery, trendPriority: "medium" }),
      PageChange.countDocuments({ ...tabScopeQuery, trendPriority: "low" }),
      PageChange.countDocuments({ ...tabScopeQuery, trendScore: { $exists: false } }),
      PageChange.countDocuments({ ...baseScopeQuery, isReviewed: true }),
      PageChange.countDocuments({ ...baseScopeQuery, isReviewed: false }),
    ]);

    // Query cached timeline for analyzed products
    const termList = changes
      .map((c) => cleanProductSearchKeyword(c.productSlug || c.normalizedUrl).toLowerCase().trim())
      .filter(Boolean);

    const trendMap = new Map<string, any>();
    if (termList.length > 0) {
      const productTrends = await ProductTrend.find(
        { keyword: { $in: termList } },
        { keyword: 1, timeline: 1, score: 1 }
      ).lean();
      productTrends.forEach((pt) => {
        trendMap.set(pt.keyword.toLowerCase(), pt);
      });
    }

    // Attach website name, domain, and trend timeline
    let enrichedChanges = changes.map((c) => {
      const site = websiteMap.get(String(c.websiteId));
      const keyword = cleanProductSearchKeyword(c.productSlug || c.normalizedUrl).toLowerCase().trim();
      const pt = trendMap.get(keyword);
      return {
        ...c,
        websiteName: site?.name || "Unknown",
        websiteDomain: site?.domain || "Unknown",
        trendTimeline: pt?.timeline || [],
      };
    });

    // Clean & purge any non-product records (e.g. personal injury, pure numbers like "4")
    const nonProductIdsToDelete: any[] = [];
    enrichedChanges = enrichedChanges.filter((c) => {
      const slugOrUrl = c.productSlug || c.normalizedUrl || c.url;
      const clean = cleanProductSearchKeyword(slugOrUrl);
      if (
        isNonProduct(slugOrUrl) ||
        !clean ||
        !/[a-zA-Z]/.test(clean) ||
        /^\d+$/.test(clean) ||
        /^\d+$/.test(c.productSlug || "")
      ) {
        nonProductIdsToDelete.push(c._id);
        return false;
      }
      return true;
    });

    if (nonProductIdsToDelete.length > 0) {
      PageChange.deleteMany({ _id: { $in: nonProductIdsToDelete } }).catch(() => {});
    }

    // Self-healing: verify against active baseline websites to guarantee no matched product is returned as missing
    const baselineWebsiteIds = userWebsites.filter((w) => w.isPrimary).map((w) => w._id);
    if (baselineWebsiteIds.length > 0 && enrichedChanges.length > 0) {
      const primaryPages = await Page.find(
        { websiteId: { $in: baselineWebsiteIds }, isActive: true },
        { normalizedUrl: 1, websiteId: 1 }
      ).lean();

      if (primaryPages.length > 0) {
        const primaryPathSet = new Set<string>();
        const baselineIndex = primaryPages.map((p) => {
          let path = p.normalizedUrl;
          try {
            const u = new URL(p.normalizedUrl);
            path = `${u.pathname}${u.search}`;
          } catch {}
          primaryPathSet.add(path);
          return {
            url: p.normalizedUrl,
            websiteId: String(p.websiteId),
            websiteDomain: "Baseline",
            slug: extractProductSlug(p.normalizedUrl),
            tokens: tokenizeProductSlug(p.normalizedUrl),
          };
        });

        const bulkMatcher = new BulkProductMatcher(baselineIndex);
        const staleIdsToDelete: any[] = [];

        enrichedChanges = enrichedChanges.filter((c) => {
          let p = c.normalizedUrl || c.url;
          try {
            const u = new URL(p);
            p = `${u.pathname}${u.search}`;
          } catch {}

          if (primaryPathSet.has(p)) {
            staleIdsToDelete.push(c._id);
            return false;
          }

          const slug = extractProductSlug(c.normalizedUrl || c.url);
          const tokens = tokenizeProductSlug(slug);
          const match = bulkMatcher.findMatch(slug, tokens, 0.65);
          if (match.isMatch && match.matchedProduct) {
            staleIdsToDelete.push(c._id);
            return false;
          }
          return true;
        });

        if (staleIdsToDelete.length > 0) {
          PageChange.deleteMany({ _id: { $in: staleIdsToDelete } }).catch(() => {});
        }
      }
    }

    return NextResponse.json({
      missingPages: enrichedChanges,
      total: filteredTotal,
      allCount,
      page,
      limit,
      websites: competitorWebsites,
      priorityCounts: {
        all: allCount,
        high: highCount,
        medium: medCount,
        low: lowCount,
        unanalyzed: unanalyzedCount,
      },
      completedCount,
      activeCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
