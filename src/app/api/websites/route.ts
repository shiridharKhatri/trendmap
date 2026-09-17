import { NextRequest, NextResponse, after } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { extractDomain, isValidHttpUrl, sanitizeWebsiteUrl, detectWebsiteName } from "@/lib/sitemap/normalizer";
import { discoverSitemaps } from "@/lib/sitemap/discover";
import { validateUrlForSSRF } from "@/lib/security/ssrf";
import { calculateNextScanAt, executeWebsiteScan } from "@/lib/scanner/scanEngine";
import { clearComparisonCache } from "@/lib/comparison/comparisonService";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const websites = await Website.find({ userId: session.userId })
      .sort({ isPrimary: -1, createdAt: -1 })
      .lean();

    // Auto-heal any websites that have invalid/broken domains or stale scan locks (>5 mins)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const w of websites) {
      // Auto-unlock orphaned / crashed scans
      if (w.isScanning && (!w.lockAcquiredAt || new Date(w.lockAcquiredAt).getTime() < fiveMinutesAgo)) {
        w.isScanning = false;
        if (w.lastScanStatus === "scanning") {
          w.lastScanStatus = "warning";
          w.lastScanErrorMessage = "Previous scan timed out or server restarted; scan unlocked.";
        }
        await Website.updateOne(
          { _id: w._id },
          {
            $set: {
              isScanning: false,
              lastScanStatus: w.lastScanStatus,
              lastScanErrorMessage: w.lastScanErrorMessage,
            },
          }
        );
      }

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

    return NextResponse.json({ websites });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      url,
      sitemapUrl,
      category = "nutra",
      isPrimary,
      scanFrequency = "24h",
      customFrequencyHours,
      crawlScope = "products",
      urlIncludePatterns,
      urlExcludePatterns,
    } = body;

    if (!url || !String(url).trim()) {
      return NextResponse.json({ error: "Website URL is required" }, { status: 400 });
    }

    const cleanUrl = sanitizeWebsiteUrl(String(url));

    if (!isValidHttpUrl(cleanUrl)) {
      return NextResponse.json({ error: "Please enter a valid website address" }, { status: 400 });
    }

    const ssrfCheck = await validateUrlForSSRF(cleanUrl);
    if (!ssrfCheck.safe) {
      return NextResponse.json({
        error: ssrfCheck.reason?.includes("DNS lookup failed")
          ? "This website could not be found. Please check that the website address is correct."
          : "Cannot reach this website.",
      }, { status: 400 });
    }

    const domain = extractDomain(cleanUrl);
    const finalName = (name && String(name).trim()) || detectWebsiteName(cleanUrl) || domain;

    // Auto-discover sitemap if not specified
    let finalSitemapUrl = sitemapUrl ? sitemapUrl.trim() : undefined;
    if (!finalSitemapUrl) {
      try {
        const discovery = await discoverSitemaps(cleanUrl);
        if (discovery.recommendedSitemap) {
          finalSitemapUrl = discovery.recommendedSitemap;
        }
      } catch {
        finalSitemapUrl = undefined;
      }
    }

    // Website can be designated as one of our primary/baseline sites
    const nextScan = calculateNextScanAt(scanFrequency, customFrequencyHours);

    const newWebsite = await Website.create({
      userId: session.userId,
      name: finalName,
      url: cleanUrl,
      domain,
      category: category === "ecom" ? "ecom" : "nutra",
      sitemapUrl: finalSitemapUrl,
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
      crawlScope: crawlScope || "products",
      urlIncludePatterns: Array.isArray(urlIncludePatterns)
        ? urlIncludePatterns.map((p: string) => String(p).trim()).filter(Boolean)
        : [],
      urlExcludePatterns: Array.isArray(urlExcludePatterns)
        ? urlExcludePatterns.map((p: string) => String(p).trim()).filter(Boolean)
        : [],
    });

    clearComparisonCache();

    // Automatically execute initial scan in the background
    const scanPromise = executeWebsiteScan(String(newWebsite._id), true).catch((err) => {
      console.error(`[AutoScan] Initial scan error for ${newWebsite.domain}:`, err);
    });

    after(async () => {
      try {
        await scanPromise;
      } catch (err) {
        console.error(`[AutoScan after] Error scanning ${newWebsite.domain}:`, err);
      }
    });

    return NextResponse.json({ success: true, website: newWebsite }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
