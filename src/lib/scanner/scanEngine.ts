import mongoose from "mongoose";
import { connectToDatabase } from "../db/mongodb";
import { Website, IWebsiteDocument } from "../models/Website";
import { Page } from "../models/Page";
import { Scan, IScanDocument } from "../models/Scan";
import { Sitemap } from "../models/Sitemap";
import { PageChange } from "../models/PageChange";
import { Comparison } from "../models/Comparison";
import { Notification } from "../models/Notification";
import { Settings } from "../models/Settings";
import { parseSitemapTree, ParseResult } from "../sitemap/parser";
import { discoverSitemaps } from "../sitemap/discover";
import {
  DEFAULT_PRODUCT_PATTERNS,
  DEFAULT_PRODUCT_EXCLUDE_PATTERNS,
  DEFAULT_BLOG_PATTERNS,
  isInformationalArticle,
} from "../sitemap/normalizer";
import {
  extractProductSlug,
  tokenizeProductSlug,
  findBestProductMatch,
  BulkProductMatcher,
  type IndexedProduct,
} from "../comparison/productMatcher";
import { getProductTrend } from "../trends/trendsService";
import { classifyUrlsWithGroq } from "../ai/groqClassifier";
import { type ScanFrequency } from "@/types";

export function calculateNextScanAt(frequency: ScanFrequency, customHours?: number): Date {
  const now = new Date();
  let hours = 24;

  switch (frequency) {
    case "6h":
      hours = 6;
      break;
    case "12h":
      hours = 12;
      break;
    case "24h":
      hours = 24;
      break;
    case "3d":
      hours = 72;
      break;
    case "weekly":
      hours = 168;
      break;
    case "custom":
      hours = customHours && customHours > 0 ? customHours : 24;
      break;
    default:
      hours = 24;
  }

  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export interface ScanExecutionResult {
  success: boolean;
  scanId?: string;
  totalUrls: number;
  newUrls: number;
  removedUrls: number;
  missingFromPrimary: number;
  errorCount: number;
  durationMs: number;
  errorMessage?: string;
}

/**
 * Executes a full sitemap scan for a given website.
 * Enforces atomic concurrency locking, retry resilience, page diffing,
 * primary-site gap analysis, and historical persistence.
 */
export async function executeWebsiteScan(websiteId: string): Promise<ScanExecutionResult> {
  await connectToDatabase();
  const startTime = Date.now();

  // 1. Scan Locking: Atomically acquire lock
  // If locked more than 15 minutes ago, consider it stale and allow reclaiming.
  const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);

  const website = await Website.findOneAndUpdate(
    {
      _id: websiteId,
      $or: [
        { isScanning: false },
        { isScanning: { $exists: false } },
        { lockAcquiredAt: { $lt: staleThreshold } },
      ],
    },
    {
      $set: {
        isScanning: true,
        lockAcquiredAt: new Date(),
        lastScanStatus: "scanning",
      },
    },
    { returnDocument: 'after' }
  );

  if (!website) {
    return {
      success: false,
      totalUrls: 0,
      newUrls: 0,
      removedUrls: 0,
      missingFromPrimary: 0,
      errorCount: 1,
      durationMs: 0,
      errorMessage: "Website is currently scanning. Concurrent scan skipped.",
    };
  }

  // 2. Create initial Scan record
  const scanDoc: IScanDocument = await Scan.create({
    websiteId: website._id,
    status: "running",
    startedAt: new Date(),
    totalUrls: 0,
    newUrls: 0,
    removedUrls: 0,
    missingFromPrimaryCount: 0,
    duplicateUrls: 0,
    invalidUrls: 0,
    errorCount: 0,
    processedFiles: 0,
  });

  try {
    // 3. Auto-discover sitemap if none is set
    let targetSitemapUrl = website.sitemapUrl;
    if (!targetSitemapUrl) {
      const discovery = await discoverSitemaps(website.url);
      if (discovery.recommendedSitemap) {
        targetSitemapUrl = discovery.recommendedSitemap;
        website.sitemapUrl = targetSitemapUrl;
        await website.save();
      } else {
        throw new Error("Could not discover a valid sitemap URL for this website.");
      }
    }

    // 4. Fetch user-configured ignored parameters if available
    const settings = await Settings.findOne({ userId: website.userId });
    const ignoredParams = settings?.ignoredQueryParams;

    // 5. Compute effective URL patterns based on crawlScope
    let effectiveIncludePatterns = website.urlIncludePatterns;
    let effectiveExcludePatterns = website.urlExcludePatterns;

    if (website.crawlScope === "products") {
      // If user provided custom include patterns, use them.
      // Otherwise, leave undefined so that root-level product permalinks (e.g. /product-slug or /product-review)
      // are not dropped by a rigid substring filter!
      effectiveIncludePatterns =
        website.urlIncludePatterns && website.urlIncludePatterns.length > 0
          ? website.urlIncludePatterns
          : undefined;

      effectiveExcludePatterns = Array.from(
        new Set([...(website.urlExcludePatterns || []), ...DEFAULT_PRODUCT_EXCLUDE_PATTERNS])
      );
    } else if (website.crawlScope === "blog") {
      effectiveIncludePatterns =
        website.urlIncludePatterns && website.urlIncludePatterns.length > 0
          ? website.urlIncludePatterns
          : DEFAULT_BLOG_PATTERNS;
    }

    // Parse Sitemap Tree with URL pattern filters
    const parseResult: ParseResult = await parseSitemapTree(targetSitemapUrl, {
      normalizationOptions: { ignoredParams },
      timeoutMs: settings?.requestTimeoutMs || 15000,
      urlIncludePatterns: effectiveIncludePatterns,
      urlExcludePatterns: effectiveExcludePatterns,
    });

    // 6. Persist Sitemap File Diagnostics
    for (const f of parseResult.files) {
      await Sitemap.findOneAndUpdate(
        { websiteId: website._id, url: f.url },
        {
          type: f.type,
          lastFetchedAt: new Date(),
          httpStatus: f.httpStatus,
          responseTimeMs: f.responseTimeMs,
          status: f.status,
          urlCount: f.urlCount,
          errorMessage: f.errorMessage,
        },
        { upsert: true, returnDocument: 'after' }
      );
    }

    // 7. URL Diffing against existing pages for this website
    const currentParsedMap = new Map<string, (typeof parseResult.urls)[0]>();
    for (const entry of parseResult.urls) {
      currentParsedMap.set(entry.normalizedUrl, entry);
    }

    const existingPages = await Page.find({ websiteId: website._id }).lean();
    const existingMap = new Map<string, (typeof existingPages)[0]>();
    for (const p of existingPages) {
      existingMap.set(p.normalizedUrl, p);
    }

    let newUrlsCount = 0;
    let removedUrlsCount = 0;
    const now = new Date();
    let pageChangesToInsert: any[] = [];
    const bulkPageOps: any[] = [];

    // A. Detect newly added URLs or update existing active ones
    for (const [normUrl, entry] of currentParsedMap.entries()) {
      const existing = existingMap.get(normUrl);
      if (!existing) {
        newUrlsCount++;
        pageChangesToInsert.push({
          websiteId: website._id,
          scanId: scanDoc._id,
          url: entry.originalUrl,
          normalizedUrl: normUrl,
          type: "added",
          detectedAt: now,
          currentLastmod: entry.lastmod,
          isReviewed: false,
        });

        bulkPageOps.push({
          updateOne: {
            filter: { websiteId: website._id, normalizedUrl: normUrl },
            update: {
              $set: {
                originalUrl: entry.originalUrl,
                lastmod: entry.lastmod,
                changefreq: entry.changefreq,
                priority: entry.priority,
                sourceSitemap: entry.sourceSitemap,
                lastSeenAt: now,
                isActive: true,
              },
              $setOnInsert: {
                firstSeenAt: now,
                isReviewed: false,
              },
            },
            upsert: true,
          },
        });
      } else {
        // Existed previously: check if lastmod changed
        let isChanged = false;
        if (
          entry.lastmod &&
          existing.lastmod &&
          new Date(entry.lastmod).getTime() !== new Date(existing.lastmod).getTime()
        ) {
          isChanged = true;
          pageChangesToInsert.push({
            websiteId: website._id,
            scanId: scanDoc._id,
            url: entry.originalUrl,
            normalizedUrl: normUrl,
            type: "changed",
            detectedAt: now,
            previousLastmod: existing.lastmod,
            currentLastmod: entry.lastmod,
            isReviewed: false,
          });
        }

        bulkPageOps.push({
          updateOne: {
            filter: { websiteId: website._id, normalizedUrl: normUrl },
            update: {
              $set: {
                originalUrl: entry.originalUrl,
                lastmod: entry.lastmod || existing.lastmod,
                changefreq: entry.changefreq || existing.changefreq,
                priority: entry.priority !== undefined ? entry.priority : existing.priority,
                sourceSitemap: entry.sourceSitemap,
                lastSeenAt: now,
                isActive: true,
              },
            },
          },
        });
      }
    }

    // B. Detect removed URLs (existed and was active, but absent in current scan)
    for (const [normUrl, existing] of existingMap.entries()) {
      if (existing.isActive && !currentParsedMap.has(normUrl)) {
        removedUrlsCount++;
        pageChangesToInsert.push({
          websiteId: website._id,
          scanId: scanDoc._id,
          url: existing.originalUrl,
          normalizedUrl: normUrl,
          type: "removed",
          detectedAt: now,
          previousLastmod: existing.lastmod,
          isReviewed: false,
        });

        bulkPageOps.push({
          updateOne: {
            filter: { websiteId: website._id, normalizedUrl: normUrl },
            update: {
              $set: { isActive: false },
            },
          },
        });
      }
    }

    if (bulkPageOps.length > 0) {
      await Page.bulkWrite(bulkPageOps);
    }

    // 8. Competitive Gap Comparison against All Baseline / "Our" Websites
    // Only run competitive gap analysis for COMPETITOR sites.
    // Primary / baseline stores are our catalog, so they never generate "missing_from_primary" records!
    let missingFromPrimaryCount = 0;

    if (!website.isPrimary) {
      // Find all user baseline websites
      const baselineWebsites = await Website.find({
        userId: website.userId,
        isPrimary: true,
        isActive: true,
      }).lean();

      if (baselineWebsites.length > 0) {
      // Fetch all active pages from ALL our baseline websites
      const baselineWebsiteIds = baselineWebsites.map((w) => w._id);
      const primaryPages = await Page.find(
        { websiteId: { $in: baselineWebsiteIds }, isActive: true },
        { normalizedUrl: 1, websiteId: 1 }
      ).lean();

      // Build baseline lookup maps and in-memory product index
      const baselineDomainMap = new Map<string, string>();
      for (const b of baselineWebsites) {
        baselineDomainMap.set(String(b._id), b.domain || b.name);
      }

      const primaryPathMap = new Set<string>();
      const baselineProductIndex: IndexedProduct[] = [];

      for (const p of primaryPages) {
        let path = p.normalizedUrl;
        try {
          const parsed = new URL(p.normalizedUrl);
          path = `${parsed.pathname}${parsed.search}`;
        } catch {
          // fallback
        }
        primaryPathMap.add(path);

        const slug = extractProductSlug(p.normalizedUrl);
        const tokens = tokenizeProductSlug(slug);
        if (tokens.length > 0) {
          baselineProductIndex.push({
            url: p.normalizedUrl,
            websiteId: String(p.websiteId),
            websiteDomain: baselineDomainMap.get(String(p.websiteId)) || "Our Site",
            slug,
            tokens,
          });
        }
      }

      const bulkMatcher = new BulkProductMatcher(baselineProductIndex);

      let matchingCount = 0;
      for (const [normUrl, entry] of currentParsedMap.entries()) {
        let competitorPath = normUrl;
        try {
          const parsed = new URL(normUrl);
          competitorPath = `${parsed.pathname}${parsed.search}`;
        } catch {
          competitorPath = normUrl;
        }

        // Tier 1: Exact pathname match across any of our sites
        if (primaryPathMap.has(competitorPath)) {
          matchingCount++;
          continue;
        }

        // Tier 2: Multi-site semantic inverted index product matching
        const compSlug = extractProductSlug(normUrl);

        // Never consider informational health Q&A or blog articles as missing products
        if (isInformationalArticle(normUrl) || isInformationalArticle(compSlug)) {
          continue;
        }

        const compTokens = tokenizeProductSlug(compSlug);
        const match = bulkMatcher.findMatch(compSlug, compTokens, 0.65);
        if (match.isMatch && match.matchedProduct) {
          // Product exists on one of our baseline sites!
          matchingCount++;
        } else {
          // Product does NOT exist on ANY of our sites -> True Gap!
          missingFromPrimaryCount++;
          pageChangesToInsert.push({
            websiteId: website._id,
            scanId: scanDoc._id,
            url: entry.originalUrl,
            normalizedUrl: normUrl,
            type: "missing_from_primary",
            detectedAt: now,
            currentLastmod: entry.lastmod,
            isReviewed: false,
            productSlug: compSlug,
            matchedUrl: match.matchedProduct?.url,
            similarityScore: match.bestScore,
          });
        }
      }

      // Record snapshot Comparison for the primary baseline
      await Comparison.create({
        primaryWebsiteId: baselineWebsites[0]._id,
        monitoredWebsiteId: website._id,
        scanId: scanDoc._id,
        totalPrimaryUrls: primaryPages.length,
        totalMonitoredUrls: currentParsedMap.size,
        matchingUrls: matchingCount,
        missingUrls: missingFromPrimaryCount,
        newUrls: newUrlsCount,
        removedUrls: removedUrlsCount,
      });
    }
  }

    // AI Verification with Groq LLM: Filter out non-products and enrich with clean product names
    const missingCandidateItems = pageChangesToInsert.filter((p) => p.type === "missing_from_primary");
    if (missingCandidateItems.length > 0 && settings?.aiExtractionEnabled !== false) {
      try {
        const candidateUrls = missingCandidateItems.map((p) => p.normalizedUrl || p.url);
        const aiResults = await classifyUrlsWithGroq(candidateUrls, {
          apiKey: settings?.groqApiKey || process.env.GROQ_API_KEY,
          model: settings?.groqModel || process.env.GROQ_MODEL,
        });

        pageChangesToInsert = pageChangesToInsert.filter((p) => {
          if (p.type !== "missing_from_primary") return true;
          const res = aiResults.get(p.normalizedUrl) || aiResults.get(p.url);
          if (res) {
            if (!res.isProduct) return false;
            if (res.cleanProductName) {
              p.productSlug = res.cleanProductName;
            }
          }
          return true;
        });
        missingFromPrimaryCount = pageChangesToInsert.filter((p) => p.type === "missing_from_primary").length;
      } catch (aiErr) {
        console.warn("AI product classification skipped due to error:", aiErr);
      }
    }

    // Queue newly detected missing products for gentle overnight background processing (2-3 items/min)
    const missingItems = pageChangesToInsert.filter((p) => p.type === "missing_from_primary");
    for (const item of missingItems) {
      item.trendQueueStatus = "queued";
    }

    if (pageChangesToInsert.length > 0) {
      await PageChange.insertMany(pageChangesToInsert, { ordered: false }).catch(() => {});
    }

    const durationMs = Date.now() - startTime;
    const totalDiscovered = currentParsedMap.size;

    // 9. Update Scan Record
    scanDoc.status = parseResult.errors.length > 0 && totalDiscovered === 0 ? "failed" : "completed";
    scanDoc.completedAt = new Date();
    scanDoc.durationMs = durationMs;
    scanDoc.totalUrls = totalDiscovered;
    scanDoc.newUrls = newUrlsCount;
    scanDoc.removedUrls = removedUrlsCount;
    scanDoc.missingFromPrimaryCount = missingFromPrimaryCount;
    scanDoc.duplicateUrls = parseResult.metrics.duplicateUrls;
    scanDoc.invalidUrls = parseResult.metrics.invalidUrls;
    scanDoc.errorCount = parseResult.errors.length;
    scanDoc.errorMessage = parseResult.errors.length > 0 ? parseResult.errors.map((e) => e.message).join("; ") : undefined;
    scanDoc.processedFiles = parseResult.metrics.filesProcessed;
    await scanDoc.save();

    // 10. Update Website Record & Release Lock
    const nextScan = calculateNextScanAt(website.scanFrequency, website.customFrequencyHours);
    const finalStatus =
      parseResult.errors.length > 0
        ? totalDiscovered > 0
          ? "warning"
          : "error"
        : "healthy";

    await Website.updateOne(
      { _id: website._id },
      {
        $set: {
          isScanning: false,
          lastScanAt: new Date(),
          lastScanStatus: finalStatus,
          lastScanErrorMessage: parseResult.errors.length > 0 ? parseResult.errors.map((e) => e.message).join("; ") : undefined,
          nextScanAt: nextScan,
          totalUrls: totalDiscovered,
          missingUrlsCount: missingFromPrimaryCount,
          newUrlsCount: newUrlsCount,
        },
      }
    );

    // 11. Create In-App Notification if significant
    if (newUrlsCount > 0 || missingFromPrimaryCount > 0 || parseResult.errors.length > 0) {
      await Notification.create({
        userId: website.userId,
        websiteId: website._id,
        title: `Scan finished for ${website.domain}`,
        message: `${totalDiscovered.toLocaleString()} URLs scanned. +${newUrlsCount} new, -${removedUrlsCount} removed, ${missingFromPrimaryCount} missing from primary.`,
        type: parseResult.errors.length > 0 ? "warning" : "info",
      });
    }

    return {
      success: true,
      scanId: String(scanDoc._id),
      totalUrls: totalDiscovered,
      newUrls: newUrlsCount,
      removedUrls: removedUrlsCount,
      missingFromPrimary: missingFromPrimaryCount,
      errorCount: parseResult.errors.length,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    // Fail scan
    scanDoc.status = "failed";
    scanDoc.completedAt = new Date();
    scanDoc.durationMs = durationMs;
    scanDoc.errorCount = 1;
    scanDoc.errorMessage = err.message || "Unknown scan error";
    await scanDoc.save();

    // Release lock on Website and set status to error
    await Website.updateOne(
      { _id: website._id },
      {
        $set: {
          isScanning: false,
          lastScanAt: new Date(),
          lastScanStatus: "error",
          nextScanAt: calculateNextScanAt(website.scanFrequency, website.customFrequencyHours),
        },
      }
    );

    // Create failure notification
    await Notification.create({
      userId: website.userId,
      websiteId: website._id,
      title: `Scan failed for ${website.domain}`,
      message: err.message || "Encountered an unexpected error during scan.",
      type: "error",
    });

    return {
      success: false,
      scanId: String(scanDoc._id),
      totalUrls: 0,
      newUrls: 0,
      removedUrls: 0,
      missingFromPrimary: 0,
      errorCount: 1,
      durationMs,
      errorMessage: err.message,
    };
  }
}
