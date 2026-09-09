import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { extractDomain, isValidHttpUrl } from "@/lib/sitemap/normalizer";
import { discoverSitemaps } from "@/lib/sitemap/discover";
import { calculateNextScanAt } from "@/lib/scanner/scanEngine";

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
      isPrimary,
      scanFrequency = "24h",
      customFrequencyHours,
      crawlScope = "all",
      urlIncludePatterns,
      urlExcludePatterns,
    } = body;

    if (!name || !url) {
      return NextResponse.json({ error: "Name and Website URL are required" }, { status: 400 });
    }

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = `https://${cleanUrl}`;
    }

    if (!isValidHttpUrl(cleanUrl)) {
      return NextResponse.json({ error: "Invalid Website URL format" }, { status: 400 });
    }

    const domain = extractDomain(cleanUrl);

    // Auto-discover sitemap if not specified
    let finalSitemapUrl = sitemapUrl ? sitemapUrl.trim() : undefined;
    if (!finalSitemapUrl) {
      try {
        const discovery = await discoverSitemaps(cleanUrl);
        if (discovery.recommendedSitemap) {
          finalSitemapUrl = discovery.recommendedSitemap;
        }
      } catch {
        finalSitemapUrl = `${cleanUrl}/sitemap.xml`;
      }
    }

    // Website can be designated as one of our primary/baseline sites
    const nextScan = calculateNextScanAt(scanFrequency, customFrequencyHours);

    const newWebsite = await Website.create({
      userId: session.userId,
      name: name.trim(),
      url: cleanUrl,
      domain,
      sitemapUrl: finalSitemapUrl,
      isPrimary: Boolean(isPrimary),
      isActive: true,
      scanFrequency,
      customFrequencyHours,
      nextScanAt: nextScan,
      lastScanStatus: "scheduled",
      isScanning: false,
      totalUrls: 0,
      missingUrlsCount: 0,
      newUrlsCount: 0,
      crawlScope: crawlScope || "all",
      urlIncludePatterns: Array.isArray(urlIncludePatterns)
        ? urlIncludePatterns.map((p: string) => String(p).trim()).filter(Boolean)
        : [],
      urlExcludePatterns: Array.isArray(urlExcludePatterns)
        ? urlExcludePatterns.map((p: string) => String(p).trim()).filter(Boolean)
        : [],
    });

    return NextResponse.json({ success: true, website: newWebsite }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
