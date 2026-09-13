import { connectToDatabase } from "../db/mongodb";
import { Website } from "../models/Website";
import { Page } from "../models/Page";
import {
  extractProductSlug,
  tokenizeProductSlug,
  BulkProductMatcher,
} from "./productMatcher";
import { cleanProductSearchKeyword } from "../trends/constants";
import { extractDomain } from "../sitemap/normalizer";

export interface MatrixRow {
  id: string;
  title: string;
  slug: string;
  status: "shared" | "missing_from_baseline" | "only_primary";
  sites: Record<string, { available: boolean; url?: string }>;
  availableCount: number;
  trendScore?: number;
  trendTimeline?: { date: string; value: number }[];
  trendExploreUrl?: string;
  trendPriority?: "high" | "medium" | "low";
}

export interface CachedComparison {
  timestamp: number;
  baselineWebsites: any[];
  activeBaselineWebsites: any[];
  monitoredWebsites: any[];
  selectedMonitored: any;
  stats: {
    primaryTotal: number;
    monitoredTotal: number;
    rawMonitoredTotal: number;
    duplicatesRemoved: number;
    matchingCount: number;
    missingCount: number;
    onlyPrimaryCount: number;
    mergedDuplicatesCount: number;
    matrixTotal?: number;
  };
  shared: any[];
  onlyPrimary: any[];
  missingFromBaseline: any[];
  mergedDuplicates: any[];
  matrix: MatrixRow[];
  baselineCategory?: string;
  monitoredCategory?: string;
  categoryMode?: string;
}

const comparisonCache = new Map<string, CachedComparison>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes in memory

export function clearComparisonCache() {
  comparisonCache.clear();
}

export interface GetComparisonDataParams {
  userId: string | any;
  baselineId?: string | null;
  monitoredId?: string | null;
  baselineCategory?: "all" | "nutra" | "ecom" | string | null;
  monitoredCategory?: "all" | "nutra" | "ecom" | string | null;
  categoryMode?: string | null;
}

export async function getComparisonData({
  userId,
  baselineId,
  monitoredId,
  baselineCategory,
  monitoredCategory,
  categoryMode,
}: GetComparisonDataParams): Promise<CachedComparison> {
  await connectToDatabase();

  let bCat = baselineCategory;
  let mCat = monitoredCategory;
  if (categoryMode === "nutra-nutra") {
    bCat = "nutra";
    mCat = "nutra";
  } else if (categoryMode === "ecom-ecom") {
    bCat = "ecom";
    mCat = "ecom";
  } else if (categoryMode === "ecom-nutra") {
    bCat = "ecom";
    mCat = "nutra";
  } else if (categoryMode === "nutra-ecom") {
    bCat = "nutra";
    mCat = "ecom";
  } else if (categoryMode === "all") {
    bCat = "all";
    mCat = "all";
  }

  // 1. Fetch user's baseline websites (all primary websites)
  const rawPrimaryWebsites = await Website.find({ userId, isPrimary: true }).sort({ name: 1 }).lean();
  let basePrimaryWebsites = rawPrimaryWebsites;
  if (basePrimaryWebsites.length === 0) {
    const fallback = await Website.findOne({ userId }).sort({ createdAt: 1 }).lean();
    if (fallback) basePrimaryWebsites = [fallback];
  }

  // CRITICAL: Any website marked as isPrimary (or fallback) is ALWAYS an owned baseline website.
  // It must NEVER, under any circumstances, be classified as a competitor!
  const allUserBaselineIds = new Set(basePrimaryWebsites.map((w) => String(w._id)));

  // Filter baseline websites by category if requested
  let allBaselineWebsites = basePrimaryWebsites;
  if (bCat && bCat !== "all") {
    allBaselineWebsites = allBaselineWebsites.filter((w) => (w.category || "nutra") === bCat);
  }

  // Filter by selective baselineId if passed
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

  // 2. Fetch all monitored competitor websites
  const allWebsites = await Website.find({ userId }).sort({ isPrimary: -1, name: 1 }).lean();

  // Auto-heal any websites that have invalid/broken domains
  for (const w of allWebsites) {
    if (!w.domain || w.domain === ".com" || w.domain === "com" || w.domain.startsWith(".")) {
      let clean = "";
      if (w.sitemapUrl) clean = extractDomain(w.sitemapUrl);
      else if (w.url) clean = extractDomain(w.url);
      else if (w.name && w.name.includes(".")) clean = extractDomain(w.name);

      if (clean && clean.includes(".") && clean !== ".com") {
        w.domain = clean;
        if (!w.url || w.url === ".com" || w.url.includes("://.com")) {
          w.url = `https://${clean}`;
        }
        await Website.updateOne({ _id: w._id }, { domain: clean, url: w.url });
      }
    }
  }

  // Competitor websites must NEVER include any primary/baseline website
  let monitoredWebsites = allWebsites.filter((w) => !allUserBaselineIds.has(String(w._id)) && !w.isPrimary);
  if (mCat && mCat !== "all") {
    monitoredWebsites = monitoredWebsites.filter((w) => (w.category || "nutra") === mCat);
  }

  if (allBaselineWebsites.length === 0 || monitoredWebsites.length === 0) {
    return {
      timestamp: Date.now(),
      baselineWebsites: allBaselineWebsites,
      activeBaselineWebsites: targetBaselineWebsites,
      monitoredWebsites,
      selectedMonitored: null,
      stats: {
        primaryTotal: 0,
        monitoredTotal: 0,
        rawMonitoredTotal: 0,
        duplicatesRemoved: 0,
        matchingCount: 0,
        missingCount: 0,
        onlyPrimaryCount: 0,
        mergedDuplicatesCount: 0,
        matrixTotal: 0,
      },
      shared: [],
      onlyPrimary: [],
      missingFromBaseline: [],
      mergedDuplicates: [],
      matrix: [],
      baselineCategory: bCat || "all",
      monitoredCategory: mCat || "all",
      categoryMode: categoryMode || `${bCat || "all"}-${mCat || "all"}`,
    };
  }

  // Determine target competitor IDs
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

  const cacheKey = `v4_${userId}:b_${targetBaselineWebsites.map((w) => String(w._id)).sort().join(",")}:m_${targetMonitoredIds.sort().join(",")}:bCat_${bCat || "all"}:mCat_${mCat || "all"}`;
  const cached = comparisonCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached;
  }

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

      mPage.matches = matchesList;
      mPage.matchedDomains = matchesList.map((m) => m.domain);
      mPage.matchedUrls = matchesList.map((m) => m.url);
      mPage.matchType = matchesList[0].matchType;
      mPage.matchedUrl = matchesList[0].url;
      mPage.matchedDomain = matchesList[0].domain;
      mPage.similarityScore = matchesList[0].similarityScore;
      mPage.matchedCount = matchesList.length;
      mPage.isMatchedWithBaseline = true;

      shared.push(mPage);
    } else {
      // Tier 3: Missing across ALL baseline sites
      mPage.isMatchedWithBaseline = false;
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

  const mergedDuplicates = deduplicatedCompetitorPages.filter(
    (p) => (p.duplicateCount && p.duplicateCount > 1) || (p.competitorUrls && p.competitorUrls.length > 1)
  );
  const duplicatesRemoved = rawMonitoredPages.length - deduplicatedCompetitorPages.length;

  // Build Unified Comparison Matrix across all compared sites
  const targetCompetitorSites = monitoredWebsites.filter((w) => targetMonitoredIds.includes(String(w._id)));
  const allComparedSites = [...targetBaselineWebsites, ...targetCompetitorSites];
  const allComparedDomains = Array.from(new Set(allComparedSites.map((s) => s.domain).filter(Boolean)));

  const matrixMap = new Map<string, MatrixRow>();

  const getCleanTitle = (slug: string, rawUrl: string) => {
    if (slug) {
      const clean = cleanProductSearchKeyword(slug);
      if (clean) {
        return clean
          .split("-")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      }
    }
    try {
      const u = new URL(rawUrl);
      const seg = u.pathname.split("/").filter(Boolean).pop() || "";
      return seg.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      return rawUrl;
    }
  };

  const addMatrixEntry = (
    slug: string,
    rawUrl: string,
    initialStatus: "shared" | "missing_from_baseline" | "only_primary",
    siteAvailabilityMap: Record<string, { available: boolean; url?: string }>
  ) => {
    const key = (slug || rawUrl).toLowerCase().trim();
    if (!key) return;

    if (matrixMap.has(key)) {
      const existing = matrixMap.get(key)!;
      for (const [dom, state] of Object.entries(siteAvailabilityMap)) {
        if (state.available) {
          existing.sites[dom] = state;
        }
      }
      existing.availableCount = Object.values(existing.sites).filter((s) => s.available).length;
      const hasBaseline = targetBaselineWebsites.some((bw) => existing.sites[bw.domain]?.available);
      const hasCompetitor = targetCompetitorSites.some((cw) => existing.sites[cw.domain]?.available);
      if (hasBaseline && hasCompetitor) {
        existing.status = "shared";
      } else if (hasCompetitor && !hasBaseline) {
        existing.status = "missing_from_baseline";
      } else if (hasBaseline && !hasCompetitor) {
        existing.status = "only_primary";
      }
    } else {
      const sites: Record<string, { available: boolean; url?: string }> = {};
      for (const dom of allComparedDomains) {
        sites[dom] = siteAvailabilityMap[dom] || { available: false };
      }
      const availableCount = Object.values(sites).filter((s) => s.available).length;
      matrixMap.set(key, {
        id: key,
        title: getCleanTitle(slug, rawUrl),
        slug: slug || key,
        status: initialStatus,
        sites,
        availableCount,
      });
    }
  };

  // 1. Process shared items
  for (const mPage of shared) {
    const slug = mPage.productSlug || extractProductSlug(mPage.normalizedUrl);
    const siteMap: Record<string, { available: boolean; url?: string }> = {};

    if (mPage.competitorDomains) {
      for (const dom of mPage.competitorDomains) {
        siteMap[dom] = { available: true, url: mPage.normalizedUrl };
      }
    }
    if (mPage.competitorItems) {
      for (const item of mPage.competitorItems) {
        siteMap[item.domain] = { available: true, url: item.url };
      }
    }
    if (mPage.matchedDomains) {
      for (let idx = 0; idx < mPage.matchedDomains.length; idx++) {
        const dom = mPage.matchedDomains[idx];
        const mUrl = mPage.matchedUrls?.[idx] || mPage.matchedUrl;
        siteMap[dom] = { available: true, url: mUrl };
      }
    }
    addMatrixEntry(slug, mPage.normalizedUrl, "shared", siteMap);
  }

  // 2. Process missing from baseline items
  for (const mPage of missingFromBaseline) {
    const slug = mPage.productSlug || extractProductSlug(mPage.normalizedUrl);
    const siteMap: Record<string, { available: boolean; url?: string }> = {};

    if (mPage.competitorDomains) {
      for (const dom of mPage.competitorDomains) {
        siteMap[dom] = { available: true, url: mPage.normalizedUrl };
      }
    }
    if (mPage.competitorItems) {
      for (const item of mPage.competitorItems) {
        siteMap[item.domain] = { available: true, url: item.url };
      }
    }
    addMatrixEntry(slug, mPage.normalizedUrl, "missing_from_baseline", siteMap);
  }

  // 3. Process only primary items
  for (const bPage of onlyPrimary) {
    const slug = bPage.productSlug || extractProductSlug(bPage.normalizedUrl);
    const siteMap: Record<string, { available: boolean; url?: string }> = {};
    if (bPage.domain) {
      siteMap[bPage.domain] = { available: true, url: bPage.normalizedUrl };
    }
    addMatrixEntry(slug, bPage.normalizedUrl, "only_primary", siteMap);
  }

  const matrix = Array.from(matrixMap.values()).sort((a, b) => {
    // Missing items first (high priority), then shared, then only_primary
    if (a.status === "missing_from_baseline" && b.status !== "missing_from_baseline") return -1;
    if (b.status === "missing_from_baseline" && a.status !== "missing_from_baseline") return 1;
    return b.availableCount - a.availableCount;
  });

  const stats = {
    primaryTotal: baselinePages.length,
    monitoredTotal: deduplicatedCompetitorPages.length,
    rawMonitoredTotal: rawMonitoredPages.length,
    duplicatesRemoved,
    matchingCount: shared.length,
    missingCount: missingFromBaseline.length,
    onlyPrimaryCount: onlyPrimary.length,
    mergedDuplicatesCount: mergedDuplicates.length,
    matrixTotal: matrix.length,
  };

  const result: CachedComparison = {
    timestamp: Date.now(),
    baselineWebsites: allBaselineWebsites,
    activeBaselineWebsites: targetBaselineWebsites,
    monitoredWebsites,
    selectedMonitored,
    stats,
    shared,
    onlyPrimary,
    missingFromBaseline,
    mergedDuplicates,
    matrix,
    baselineCategory: bCat || "all",
    monitoredCategory: mCat || "all",
    categoryMode: categoryMode || `${bCat || "all"}-${mCat || "all"}`,
  };

  // Cache the result
  comparisonCache.set(cacheKey, result);

  return result;
}
