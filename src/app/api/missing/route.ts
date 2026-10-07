import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PageChange } from "@/lib/models/PageChange";
import { Page } from "@/lib/models/Page";
import { Website } from "@/lib/models/Website";
import { ProductTrend } from "@/lib/models/ProductTrend";
import { Settings } from "@/lib/models/Settings";
import { cleanProductSearchKeyword, isNonProduct } from "@/lib/trends/constants";
import { getAuthenticatedUser } from "@/lib/security/auth";
import {
  BulkProductMatcher,
  extractProductSlug,
  tokenizeProductSlug,
} from "@/lib/comparison/productMatcher";
import { ensureMissingProductsPopulated } from "@/lib/missing/missingService";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    // Ensure baseline store is configured and missing product records are populated
    await ensureMissingProductsPopulated(session.userId);

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

    // 1. Fetch current page of records
    const changesPromise = PageChange.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    // 2. Fetch base checklist counts (completed vs active across user competitor websites)
    const reviewCountsPromise = PageChange.aggregate([
      { $match: baseScopeQuery },
      { $group: { _id: "$isReviewed", count: { $sum: 1 } } },
    ]);

    // 3. Fetch priority badge counts across current tab scope in a single aggregated pass
    const priorityCountsPromise = PageChange.aggregate([
      { $match: tabScopeQuery },
      {
        $group: {
          _id: {
            priority: "$trendPriority",
            hasScore: { $cond: [{ $ifNull: ["$trendScore", false] }, true, false] },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const [changes, reviewCountsRaw, priorityCountsRaw] = await Promise.all([
      changesPromise,
      reviewCountsPromise,
      priorityCountsPromise,
    ]);

    let activeCount = 0;
    let completedCount = 0;
    for (const item of reviewCountsRaw) {
      if (item._id === true) completedCount = item.count;
      else if (item._id === false) activeCount = item.count;
    }

    let allCount = 0;
    let highCount = 0;
    let medCount = 0;
    let lowCount = 0;
    let unanalyzedCount = 0;

    for (const item of priorityCountsRaw) {
      const c = item.count || 0;
      allCount += c;
      if (item._id?.priority === "high") highCount += c;
      else if (item._id?.priority === "medium") medCount += c;
      else if (item._id?.priority === "low") lowCount += c;

      if (!item._id?.hasScore) unanalyzedCount += c;
    }

    let filteredTotal = allCount;
    if (priority === "high") filteredTotal = highCount;
    else if (priority === "medium") filteredTotal = medCount;
    else if (priority === "low") filteredTotal = lowCount;
    else if (priority === "unanalyzed") filteredTotal = unanalyzedCount;

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

    // Self-healing: fast indexed check against active baseline websites for the current displayed page
    const baselineWebsiteIds = userWebsites.filter((w) => w.isPrimary).map((w) => w._id);
    if (baselineWebsiteIds.length > 0 && enrichedChanges.length > 0) {
      const urlsToCheck = enrichedChanges.map((c) => c.normalizedUrl || c.url).filter(Boolean);
      const matchedPrimary = await Page.find(
        {
          websiteId: { $in: baselineWebsiteIds },
          isActive: true,
          normalizedUrl: { $in: urlsToCheck },
        },
        { normalizedUrl: 1 }
      ).lean();

      if (matchedPrimary.length > 0) {
        const matchedUrls = new Set(matchedPrimary.map((p) => p.normalizedUrl));
        const staleIdsToDelete: any[] = [];
        enrichedChanges = enrichedChanges.filter((c) => {
          if (matchedUrls.has(c.normalizedUrl) || matchedUrls.has(c.url)) {
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

    const userSettings = await Settings.findOne({ userId: session.userId }, { articleManagementWebhookUrl: 1 }).lean();
    const hasArticleIntegration = Boolean(
      userSettings?.articleManagementWebhookUrl?.trim() ||
      process.env.ARTICLE_MANAGEMENT_API_URL
    );

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
      hasArticleIntegration,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
