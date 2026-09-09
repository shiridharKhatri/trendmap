import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Website } from "@/lib/models/Website";
import { Page } from "@/lib/models/Page";
import { Comparison } from "@/lib/models/Comparison";
import { getAuthenticatedUser } from "@/lib/security/auth";
import {
  extractProductSlug,
  tokenizeProductSlug,
  BulkProductMatcher,
} from "@/lib/comparison/productMatcher";
import { cleanProductSearchKeyword } from "@/lib/trends/constants";

interface CachedComparison {
  timestamp: number;
  baselineWebsites: any[];
  monitoredWebsites: any[];
  selectedMonitored: any;
  stats: any;
  shared: any[];
  onlyPrimary: any[];
  missingFromBaseline: any[];
}

const comparisonCache = new Map<string, CachedComparison>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function clearComparisonCache() {
  comparisonCache.clear();
}

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const url = new URL(req.url);
    const monitoredId = url.searchParams.get("monitoredId");
    const tab = url.searchParams.get("tab") || "missing"; // missing, shared, only_primary
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const search = url.searchParams.get("search")?.trim();

    // 1. Fetch user's baseline websites (can be multiple)
    let baselineWebsites = await Website.find({ userId: session.userId, isPrimary: true }).sort({ name: 1 }).lean();
    if (baselineWebsites.length === 0) {
      const fallback = await Website.findOne({ userId: session.userId }).sort({ createdAt: 1 }).lean();
      if (fallback) baselineWebsites = [fallback];
    }

    const baselineIds = new Set(baselineWebsites.map((w) => String(w._id)));

    // 2. Fetch all monitored competitor websites (not in baseline)
    const allWebsites = await Website.find({ userId: session.userId }).sort({ isPrimary: -1, name: 1 }).lean();
    const monitoredWebsites = allWebsites.filter((w) => !baselineIds.has(String(w._id)));

    if (baselineWebsites.length === 0 || monitoredWebsites.length === 0) {
      return NextResponse.json({
        primaryWebsite: baselineWebsites[0] || null,
        baselineWebsites,
        monitoredWebsites: [],
        selectedMonitored: null,
        stats: null,
        pages: [],
        total: 0,
      });
    }

    // Determine target competitor IDs: supports "all", comma-separated IDs, or single ID
    let targetMonitoredIds: string[] = [];
    if (!monitoredId || monitoredId === "all") {
      targetMonitoredIds = monitoredWebsites.map((w) => String(w._id));
    } else {
      targetMonitoredIds = monitoredId.split(",").map((s) => s.trim()).filter(Boolean);
      if (targetMonitoredIds.length === 0) {
        targetMonitoredIds = monitoredWebsites.map((w) => String(w._id));
      }
    }

    const competitorDomainMap = new Map(monitoredWebsites.map((w) => [String(w._id), w.domain]));
    const isBulk = targetMonitoredIds.length > 1 || monitoredId === "all";

    const selectedMonitored = isBulk
      ? {
          _id: "all",
          name: `All Competitors (${targetMonitoredIds.length} sites)`,
          domain: `All ${targetMonitoredIds.length} Competitors (Combined & Deduplicated)`,
          totalUrls: 0,
          isBulk: true,
          selectedCount: targetMonitoredIds.length,
        }
      : monitoredWebsites.find((w) => String(w._id) === targetMonitoredIds[0]) || monitoredWebsites[0];

    const cacheKey = `${session.userId}:${targetMonitoredIds.sort().join(",")}`;
    const cached = comparisonCache.get(cacheKey);

    let baselineWebsitesResult = baselineWebsites;
    let monitoredWebsitesResult = monitoredWebsites;
    let selectedMonitoredResult = selectedMonitored;
    let statsResult: any = null;
    let sharedResult: any[] = [];
    let onlyPrimaryResult: any[] = [];
    let missingFromBaselineResult: any[] = [];

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      baselineWebsitesResult = cached.baselineWebsites;
      monitoredWebsitesResult = cached.monitoredWebsites;
      selectedMonitoredResult = cached.selectedMonitored;
      statsResult = cached.stats;
      sharedResult = cached.shared;
      onlyPrimaryResult = cached.onlyPrimary;
      missingFromBaselineResult = cached.missingFromBaseline;
    } else {
      // 3. Fetch pages for all baseline websites + target competitors
      const [baselinePages, rawMonitoredPages] = await Promise.all([
        Page.find(
          { websiteId: { $in: baselineWebsites.map((w) => w._id) }, isActive: true },
          { normalizedUrl: 1, originalUrl: 1, lastmod: 1, websiteId: 1 }
        ).lean(),
        Page.find(
          { websiteId: { $in: targetMonitoredIds }, isActive: true },
          { normalizedUrl: 1, originalUrl: 1, lastmod: 1, websiteId: 1 }
        ).lean(),
      ]);

      // Deduplicate competitor pages across competitors:
      // If duplicate products found on 2 or more competitors, combine them into 1 single entry
      const deduplicatedCompetitorPages: any[] = [];
      const competitorSeenMap = new Map<string, any>();

      for (const mPage of rawMonitoredPages) {
        const slug = extractProductSlug(mPage.normalizedUrl);
        const domain = competitorDomainMap.get(String(mPage.websiteId)) || "Competitor";

        let dedupKey = "";
        if (slug && slug.length >= 3) {
          const cleanKey = cleanProductSearchKeyword(slug).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
          if (cleanKey.length >= 3) {
            dedupKey = `slug:${cleanKey}`;
          }
        }
        if (!dedupKey) {
          try {
            const u = new URL(mPage.normalizedUrl);
            dedupKey = `path:${u.pathname.toLowerCase().replace(/\/$/, "")}`;
          } catch {
            dedupKey = `url:${mPage.normalizedUrl.toLowerCase()}`;
          }
        }

        if (competitorSeenMap.has(dedupKey)) {
          // DUPLICATE DETECTED: Merge into single entry
          const existing = competitorSeenMap.get(dedupKey);
          if (!existing.competitorDomains.includes(domain)) {
            existing.competitorDomains.push(domain);
          }
          if (!existing.competitorUrls.includes(mPage.normalizedUrl)) {
            existing.competitorUrls.push(mPage.normalizedUrl);
          }
          existing.duplicateCount = (existing.duplicateCount || 1) + 1;
          if (mPage.lastmod && (!existing.lastmod || new Date(mPage.lastmod) > new Date(existing.lastmod))) {
            existing.lastmod = mPage.lastmod;
          }
        } else {
          // First occurrence: register new unique item
          const entry = {
            ...mPage,
            productSlug: slug,
            competitorDomain: domain,
            competitorDomains: [domain],
            competitorUrls: [mPage.normalizedUrl],
            duplicateCount: 1,
          };
          competitorSeenMap.set(dedupKey, entry);
          deduplicatedCompetitorPages.push(entry);
        }
      }

      const baselineDomainMap = new Map(baselineWebsites.map((w) => [String(w._id), w.domain]));

      // Build baseline exact path map and high-performance inverted index
      const baselinePathMap = new Map<string, (typeof baselinePages)[0]>();
      for (const p of baselinePages) {
        try {
          const u = new URL(p.normalizedUrl);
          baselinePathMap.set(`${u.pathname}${u.search}`.toLowerCase(), p);
        } catch {
          baselinePathMap.set(p.normalizedUrl.toLowerCase(), p);
        }
      }

      const baselineProductIndex = baselinePages.map((p) => ({
        url: p.normalizedUrl,
        websiteId: String(p.websiteId),
        websiteDomain: baselineDomainMap.get(String(p.websiteId)) || "Baseline",
        slug: extractProductSlug(p.normalizedUrl),
        tokens: tokenizeProductSlug(p.normalizedUrl),
      }));

      const bulkMatcher = new BulkProductMatcher(baselineProductIndex);

      const matchedBaselinePageUrls = new Set<string>();
      const missingFromBaseline: any[] = [];
      const shared: any[] = [];

      // Compare each deduplicated competitor product against all baseline sites
      for (const mPage of deduplicatedCompetitorPages) {
        let path = mPage.normalizedUrl;
        try {
          const u = new URL(mPage.normalizedUrl);
          path = `${u.pathname}${u.search}`.toLowerCase();
        } catch {
          path = mPage.normalizedUrl.toLowerCase();
        }

        // Tier 1: Exact path match against any baseline website
        const exactMatch = baselinePathMap.get(path);
        if (exactMatch) {
          matchedBaselinePageUrls.add(exactMatch.normalizedUrl);
          shared.push({
            ...mPage,
            matchType: "exact_path",
            matchedUrl: exactMatch.normalizedUrl,
            matchedDomain: baselineDomainMap.get(String(exactMatch.websiteId)),
            similarityScore: 1.0,
          });
          continue;
        }

        // Tier 2: Multi-site semantic inverted index fuzzy product match
        const slug = mPage.productSlug || extractProductSlug(mPage.normalizedUrl);
        const tokens = tokenizeProductSlug(slug);
        const productMatch = bulkMatcher.findMatch(slug, tokens, 0.65);
        if (productMatch.isMatch && productMatch.matchedProduct) {
          matchedBaselinePageUrls.add(productMatch.matchedProduct.url);
          shared.push({
            ...mPage,
            matchType: "token_overlap",
            matchedUrl: productMatch.matchedProduct.url,
            matchedDomain: productMatch.matchedProduct.websiteDomain,
            similarityScore: productMatch.bestScore,
          });
          continue;
        }

        // Tier 3: Missing across all baseline sites
        missingFromBaseline.push(mPage);
      }

      // Baseline only pages (pages that exist on our baseline but not matched on competitor)
      const onlyPrimary: any[] = [];
      for (const bPage of baselinePages) {
        if (!matchedBaselinePageUrls.has(bPage.normalizedUrl)) {
          onlyPrimary.push({
            ...bPage,
            domain: baselineDomainMap.get(String(bPage.websiteId)),
            productSlug: extractProductSlug(bPage.normalizedUrl),
          });
        }
      }

      const duplicatesRemoved = rawMonitoredPages.length - deduplicatedCompetitorPages.length;

      statsResult = {
        primaryTotal: baselinePages.length,
        monitoredTotal: deduplicatedCompetitorPages.length,
        rawMonitoredTotal: rawMonitoredPages.length,
        duplicatesRemoved,
        matchingCount: shared.length,
        missingCount: missingFromBaseline.length,
        onlyPrimaryCount: onlyPrimary.length,
      };
      sharedResult = shared;
      onlyPrimaryResult = onlyPrimary;
      missingFromBaselineResult = missingFromBaseline;

      // Cache the heavy multi-site comparison result
      comparisonCache.set(cacheKey, {
        timestamp: Date.now(),
        baselineWebsites: baselineWebsitesResult,
        monitoredWebsites: monitoredWebsitesResult,
        selectedMonitored: selectedMonitoredResult,
        stats: statsResult,
        shared: sharedResult,
        onlyPrimary: onlyPrimaryResult,
        missingFromBaseline: missingFromBaselineResult,
      });
    }

    const stats = statsResult;
    const shared = sharedResult;
    const onlyPrimary = onlyPrimaryResult;
    const missingFromBaseline = missingFromBaselineResult;

    // Filter by active tab and search
    let targetList: any[] = [];
    if (tab === "shared") {
      targetList = shared;
    } else if (tab === "only_primary") {
      targetList = onlyPrimary;
    } else {
      targetList = missingFromBaseline;
    }

    if (search) {
      const lower = search.toLowerCase();
      targetList = targetList.filter(
        (p) =>
          p.normalizedUrl.toLowerCase().includes(lower) ||
          (p.productSlug && p.productSlug.toLowerCase().includes(lower))
      );
    }

    const total = targetList.length;
    const skip = (page - 1) * limit;
    const paginatedPages = targetList.slice(skip, skip + limit);

    return NextResponse.json(
      {
        primaryWebsite: baselineWebsites[0] || null,
        baselineWebsites,
        monitoredWebsites,
        selectedMonitored,
        stats,
        tab,
        pages: paginatedPages,
        total,
        page,
        limit,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
