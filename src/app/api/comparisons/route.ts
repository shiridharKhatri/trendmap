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
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes in memory

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
    const baselineId = url.searchParams.get("baselineId");
    const tab = url.searchParams.get("tab") || "missing"; // missing, shared, only_primary
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const search = url.searchParams.get("search")?.trim();

    // 1. Fetch user's baseline websites (can be multiple)
    let allBaselineWebsites = await Website.find({ userId: session.userId, isPrimary: true }).sort({ name: 1 }).lean();
    if (allBaselineWebsites.length === 0) {
      const fallback = await Website.findOne({ userId: session.userId }).sort({ createdAt: 1 }).lean();
      if (fallback) allBaselineWebsites = [fallback];
    }

    // Filter by selective baselineId if passed (supports comma-separated IDs or "all")
    let targetBaselineWebsites = allBaselineWebsites;
    if (baselineId && baselineId !== "all") {
      const requestedBaselineIds = new Set(baselineId.split(",").map((s) => s.trim()).filter(Boolean));
      if (requestedBaselineIds.size > 0) {
        const filtered = allBaselineWebsites.filter((w) => requestedBaselineIds.has(String(w._id)));
        if (filtered.length > 0) {
          targetBaselineWebsites = filtered;
        }
      }
    }

    const allBaselineIds = new Set(allBaselineWebsites.map((w) => String(w._id)));

    // 2. Fetch all monitored competitor websites (not in baseline)
    const allWebsites = await Website.find({ userId: session.userId }).sort({ isPrimary: -1, name: 1 }).lean();
    const monitoredWebsites = allWebsites.filter((w) => !allBaselineIds.has(String(w._id)));

    if (allBaselineWebsites.length === 0 || monitoredWebsites.length === 0) {
      return NextResponse.json({
        primaryWebsite: targetBaselineWebsites[0] || allBaselineWebsites[0] || null,
        baselineWebsites: allBaselineWebsites,
        activeBaselineWebsites: targetBaselineWebsites,
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

    const cacheKey = `v3_${session.userId}:b_${targetBaselineWebsites.map((w) => String(w._id)).sort().join(",")}:m_${targetMonitoredIds.sort().join(",")}`;
    const cached = comparisonCache.get(cacheKey);

    let baselineWebsitesResult = allBaselineWebsites;
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
      // 3. Fetch pages for selected baseline websites + target competitors
      const [baselinePages, rawMonitoredPages] = await Promise.all([
        Page.find(
          { websiteId: { $in: targetBaselineWebsites.map((w) => w._id) }, isActive: true },
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
          // DUPLICATE DETECTED: Merge into single entry across all competitors
          const existing = competitorSeenMap.get(dedupKey);
          if (!existing.competitorDomains.includes(domain)) {
            existing.competitorDomains.push(domain);
          }
          if (!existing.competitorUrls.includes(mPage.normalizedUrl)) {
            existing.competitorUrls.push(mPage.normalizedUrl);
          }
          if (!existing.competitorItems) {
            existing.competitorItems = [{ domain: existing.competitorDomain, url: existing.normalizedUrl, lastmod: existing.lastmod }];
          }
          if (!existing.competitorItems.some((ci: any) => ci.url === mPage.normalizedUrl)) {
            existing.competitorItems.push({ domain, url: mPage.normalizedUrl, lastmod: mPage.lastmod });
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
            competitorItems: [{ domain, url: mPage.normalizedUrl, lastmod: mPage.lastmod }],
            duplicateCount: 1,
          };
          competitorSeenMap.set(dedupKey, entry);
          deduplicatedCompetitorPages.push(entry);
        }
      }

      const baselineDomainMap = new Map(targetBaselineWebsites.map((w) => [String(w._id), w.domain]));

      // Build baseline exact path map: maps pathname -> array of all baseline pages across all sites
      const baselinePathMap = new Map<string, (typeof baselinePages)[0][]>();
      for (const p of baselinePages) {
        let pathKey = "";
        try {
          const u = new URL(p.normalizedUrl);
          pathKey = `${u.pathname}${u.search}`.toLowerCase();
        } catch {
          pathKey = p.normalizedUrl.toLowerCase();
        }
        let list = baselinePathMap.get(pathKey);
        if (!list) {
          list = [];
          baselinePathMap.set(pathKey, list);
        }
        list.push(p);
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

      // Compare each deduplicated competitor product against ALL baseline sites
      for (const mPage of deduplicatedCompetitorPages) {
        let path = mPage.normalizedUrl;
        try {
          const u = new URL(mPage.normalizedUrl);
          path = `${u.pathname}${u.search}`.toLowerCase();
        } catch {
          path = mPage.normalizedUrl.toLowerCase();
        }

        // Map to store best match per baseline websiteId
        const matchesByWebsiteId = new Map<
          string,
          {
            url: string;
            domain: string;
            websiteId: string;
            matchType: "exact_path" | "exact_slug" | "token_overlap";
            similarityScore: number;
          }
        >();

        // Tier 1: Exact path match against ALL baseline websites
        const exactMatches = baselinePathMap.get(path);
        if (exactMatches && exactMatches.length > 0) {
          for (const ep of exactMatches) {
            const webId = String(ep.websiteId);
            const domain = baselineDomainMap.get(webId) || "Baseline";
            matchesByWebsiteId.set(webId, {
              url: ep.normalizedUrl,
              domain,
              websiteId: webId,
              matchType: "exact_path",
              similarityScore: 1.0,
            });
            matchedBaselinePageUrls.add(ep.normalizedUrl);
          }
        }

        // Performance short-circuit: If all target baseline websites already matched, skip Tier 2 completely
        if (matchesByWebsiteId.size < targetBaselineWebsites.length) {
          // Tier 2: Multi-site semantic inverted index fuzzy product match
          // Check for matches on any baseline website not already matched via exact path
          const slug = mPage.productSlug || extractProductSlug(mPage.normalizedUrl);
          const tokens = tokenizeProductSlug(slug);
          const allFuzzyMatches = bulkMatcher.findAllMatches(slug, tokens, 0.65, targetBaselineWebsites.length);

          if (allFuzzyMatches.isMatch) {
            for (const m of allFuzzyMatches.matches) {
              const webId = m.product.websiteId;
              if (!matchesByWebsiteId.has(webId)) {
                matchesByWebsiteId.set(webId, {
                  url: m.product.url,
                  domain: m.product.websiteDomain,
                  websiteId: webId,
                  matchType: m.matchType,
                  similarityScore: m.score,
                });
                matchedBaselinePageUrls.add(m.product.url);
              }
            }
          }
        }

        if (matchesByWebsiteId.size > 0) {
          const matchesList = Array.from(matchesByWebsiteId.values());
          matchesList.sort((a, b) => b.similarityScore - a.similarityScore);

          shared.push({
            ...mPage,
            matches: matchesList,
            matchedDomains: matchesList.map((m) => m.domain),
            matchedUrls: matchesList.map((m) => m.url),
            matchType: matchesList[0].matchType,
            matchedUrl: matchesList[0].url,
            matchedDomain: matchesList[0].domain,
            similarityScore: matchesList[0].similarityScore,
            matchedCount: matchesList.length,
          });
        } else {
          // Tier 3: Missing across ALL baseline sites
          missingFromBaseline.push(mPage);
        }
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
          (p.productSlug && p.productSlug.toLowerCase().includes(lower)) ||
          (p.matchedDomains && p.matchedDomains.some((d: string) => d.toLowerCase().includes(lower))) ||
          (p.matchedUrls && p.matchedUrls.some((u: string) => u.toLowerCase().includes(lower))) ||
          (p.competitorDomains && p.competitorDomains.some((d: string) => d.toLowerCase().includes(lower))) ||
          (p.domain && p.domain.toLowerCase().includes(lower))
      );
    }

    const total = targetList.length;
    const skip = (page - 1) * limit;
    const paginatedPages = targetList.slice(skip, skip + limit);

    return NextResponse.json(
      {
        primaryWebsite: targetBaselineWebsites[0] || allBaselineWebsites[0] || null,
        baselineWebsites: allBaselineWebsites,
        activeBaselineWebsites: targetBaselineWebsites,
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
