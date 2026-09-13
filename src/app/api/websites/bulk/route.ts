import { NextRequest, NextResponse, after } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";
import {
  extractDomain,
  isValidHttpUrl,
  sanitizeWebsiteUrl,
  detectWebsiteName,
  parseBulkLine,
} from "@/lib/sitemap/normalizer";
import { calculateNextScanAt, executeWebsiteScan } from "@/lib/scanner/scanEngine";
import { clearComparisonCache } from "@/lib/comparison/comparisonService";

export { parseBulkLine };

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const {
      urls,
      category = "nutra",
      isPrimary = false,
      scanFrequency = "24h",
      customFrequencyHours,
    } = body;

    let rawList: string[] = [];
    if (Array.isArray(urls)) {
      rawList = urls.map((u) => String(u || "").trim()).filter(Boolean);
    } else if (typeof urls === "string") {
      // Split by newlines first so lines containing commas (e.g. "domain.com, https://domain.com/sitemap.xml") remain paired
      rawList = urls
        .split(/\r?\n+/)
        .map((u) => u.trim())
        .filter(Boolean);
    }

    if (rawList.length === 0) {
      return NextResponse.json(
        { error: "Please provide at least one valid website URL or domain" },
        { status: 400 }
      );
    }

    // Deduplicate within the provided batch
    const uniqueInputs = Array.from(new Set(rawList));
    const nextScan = calculateNextScanAt(scanFrequency, customFrequencyHours);
    const validatedCategory = category === "ecom" ? "ecom" : "nutra";

    // Fetch existing user website domains to avoid adding duplicates
    const existingUserWebsites = await Website.find(
      { userId: session.userId },
      { domain: 1, url: 1 }
    ).lean();
    const existingDomainSet = new Set(existingUserWebsites.map((w) => w.domain.toLowerCase()));

    const created: any[] = [];
    const errors: { input: string; reason: string }[] = [];

    for (const raw of uniqueInputs) {
      try {
        const parsed = parseBulkLine(raw);
        if (!parsed || !parsed.siteUrl) {
          errors.push({ input: raw, reason: "Invalid format or empty line" });
          continue;
        }

        const cleanUrl = parsed.siteUrl;
        if (!isValidHttpUrl(cleanUrl)) {
          errors.push({ input: raw, reason: "Invalid URL format" });
          continue;
        }

        const domain = extractDomain(cleanUrl);
        if (!domain || domain === ".com") {
          errors.push({ input: raw, reason: "Could not extract valid domain" });
          continue;
        }

        if (existingDomainSet.has(domain.toLowerCase())) {
          errors.push({ input: raw, reason: `Domain ${domain} is already added in your account` });
          continue;
        }

        const name = detectWebsiteName(cleanUrl) || domain;
        // Do NOT hardcode /sitemap.xml if no explicit sitemap was given; let auto-discovery probe accurately!
        const sitemapUrl = parsed.explicitSitemapUrl || undefined;

        const newSite = await Website.create({
          userId: session.userId,
          name,
          url: cleanUrl,
          domain,
          category: validatedCategory,
          sitemapUrl,
          isPrimary: Boolean(isPrimary),
          isActive: true,
          scanFrequency,
          customFrequencyHours,
          nextScanAt: nextScan,
          lastScanStatus: "scanning",
          isScanning: true,
          lockAcquiredAt: new Date(),
          totalUrls: 0,
          missingUrlsCount: 0,
          newUrlsCount: 0,
          crawlScope: "products",
          urlIncludePatterns: [],
          urlExcludePatterns: [],
        });

        existingDomainSet.add(domain.toLowerCase());
        created.push(newSite);
      } catch (err: any) {
        errors.push({ input: raw, reason: err.message || "Failed to create" });
      }
    }

    if (created.length > 0) {
      clearComparisonCache();

      // Launch background sequential scan for newly created websites
      const bulkScanPromise = (async () => {
        for (const site of created) {
          try {
            await executeWebsiteScan(String(site._id), true);
          } catch (err) {
            console.error(`[BulkAutoScan] Error scanning ${site.domain}:`, err);
          }
        }
      })().catch((err) => {
        console.error("[BulkAutoScan] Batch scan execution error:", err);
      });

      after(async () => {
        try {
          await bulkScanPromise;
        } catch (err) {
          console.error("[BulkAutoScan after] Error:", err);
        }
      });
    }

    return NextResponse.json({
      success: true,
      count: created.length,
      websites: created,
      errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
