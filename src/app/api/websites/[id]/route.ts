import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Website } from "@/lib/models/Website";
import { Page } from "@/lib/models/Page";
import { Scan } from "@/lib/models/Scan";
import { Sitemap } from "@/lib/models/Sitemap";
import { PageChange } from "@/lib/models/PageChange";
import { Comparison } from "@/lib/models/Comparison";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { calculateNextScanAt } from "@/lib/scanner/scanEngine";
import { extractDomain } from "@/lib/sitemap/normalizer";
import { clearComparisonCache } from "@/app/api/comparisons/route";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await connectToDatabase();
    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const website = await Website.findOne({ _id: id, userId: session.userId }).lean();
    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Fetch sitemaps files processed
    const sitemaps = await Sitemap.find({ websiteId: id }).lean();

    return NextResponse.json({ website, sitemaps });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const website = await Website.findOne({ _id: id, userId: session.userId });
    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    if (body.name !== undefined) website.name = body.name.trim();

    if (body.url !== undefined && body.url.trim()) {
      website.url = body.url.trim();
      const extracted = extractDomain(website.url);
      if (extracted && extracted.includes(".") && extracted !== ".com") {
        website.domain = extracted;
      }
    }

    if (body.sitemapUrl !== undefined) {
      website.sitemapUrl = body.sitemapUrl.trim();
      if (website.sitemapUrl) {
        const extracted = extractDomain(website.sitemapUrl);
        if (extracted && extracted.includes(".") && extracted !== ".com") {
          // If domain was .com or empty or not explicitly provided, derive from sitemap URL
          if (!body.domain || website.domain === ".com" || !website.domain || !website.domain.includes(".")) {
            website.domain = extracted;
          }
          if (!website.url || website.url === ".com" || website.url.includes("://.com")) {
            website.url = `https://${extracted}`;
          }
        }
      }
    }

    if (body.domain !== undefined && body.domain.trim()) {
      const extracted = extractDomain(body.domain.trim());
      if (extracted && extracted.includes(".") && extracted !== ".com") {
        website.domain = extracted;
      }
    }

    // Safety auto-heal: if website.domain is still .com or invalid, heal it from sitemapUrl, url, or name
    if (!website.domain || website.domain === ".com" || website.domain === "com" || website.domain.startsWith(".")) {
      let clean = "";
      if (website.sitemapUrl) clean = extractDomain(website.sitemapUrl);
      else if (website.url) clean = extractDomain(website.url);
      else if (website.name && website.name.includes(".")) clean = extractDomain(website.name);
      if (clean && clean.includes(".") && clean !== ".com") {
        website.domain = clean;
        website.url = `https://${clean}`;
      }
    }

    if (body.scanFrequency !== undefined) {
      website.scanFrequency = body.scanFrequency;
      website.nextScanAt = calculateNextScanAt(body.scanFrequency, body.customFrequencyHours || website.customFrequencyHours);
    }
    if (body.customFrequencyHours !== undefined) {
      website.customFrequencyHours = body.customFrequencyHours;
      if (website.scanFrequency === "custom") {
        website.nextScanAt = calculateNextScanAt("custom", body.customFrequencyHours);
      }
    }
    if (body.isActive !== undefined) {
      website.isActive = Boolean(body.isActive);
      if (!website.isActive) {
        website.lastScanStatus = "disabled";
      } else if (website.lastScanStatus === "disabled") {
        website.lastScanStatus = "scheduled";
      }
    }

    if (body.isPrimary !== undefined) {
      website.isPrimary = Boolean(body.isPrimary);
    }
    if (body.crawlScope !== undefined && ["all", "products", "blog", "custom"].includes(body.crawlScope)) {
      website.crawlScope = body.crawlScope;
    }
    if (body.urlIncludePatterns !== undefined && Array.isArray(body.urlIncludePatterns)) {
      website.urlIncludePatterns = body.urlIncludePatterns.map((p: string) => String(p).trim()).filter(Boolean);
    }
    if (body.urlExcludePatterns !== undefined && Array.isArray(body.urlExcludePatterns)) {
      website.urlExcludePatterns = body.urlExcludePatterns.map((p: string) => String(p).trim()).filter(Boolean);
    }

    await website.save();
    clearComparisonCache();

    return NextResponse.json({ success: true, website });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const website = await Website.findOne({ _id: id, userId: session.userId });
    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Cascade delete associated entities
    await Promise.all([
      Website.deleteOne({ _id: id }),
      Page.deleteMany({ websiteId: id }),
      Scan.deleteMany({ websiteId: id }),
      Sitemap.deleteMany({ websiteId: id }),
      PageChange.deleteMany({ websiteId: id }),
      Comparison.deleteMany({ $or: [{ primaryWebsiteId: id }, { monitoredWebsiteId: id }] }),
    ]);

    return NextResponse.json({ success: true, message: "Website and associated data deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
