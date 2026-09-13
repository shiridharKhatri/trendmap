import { describe, it, expect } from "vitest";
import {
  sanitizeWebsiteUrl,
  detectWebsiteName,
  extractDomain,
  parseBulkLine,
} from "../src/lib/sitemap/normalizer";

describe("Bulk Website Link Processing", () => {
  it("splits multiline and comma-separated inputs cleanly", () => {
    const rawInput = `
      GuruReviewsClub.com
      https://supplement-guide.org
      shop.example.com, test-nutra.io
      http://another-brand.com/sitemap.xml
    `;

    const tokens = rawInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    expect(tokens).toHaveLength(5);
    expect(tokens).toEqual([
      "GuruReviewsClub.com",
      "https://supplement-guide.org",
      "shop.example.com",
      "test-nutra.io",
      "http://another-brand.com/sitemap.xml",
    ]);
  });

  it("sanitizes each link, prepending https:// and extracting domain and name", () => {
    const input = "GuruReviewsClub.com";
    const cleanUrl = sanitizeWebsiteUrl(input);
    expect(cleanUrl).toBe("https://GuruReviewsClub.com");

    const domain = extractDomain(cleanUrl);
    expect(domain).toBe("gurureviewsclub.com");

    const name = detectWebsiteName(cleanUrl);
    expect(name).toBe("Guru Reviews Club");
  });

  it("handles mixed categories and defaults crawlScope to products", () => {
    const rawLinks = ["GuruReviewsClub.com", "my-ecom-store.com"];
    const category = "ecom";

    const records = rawLinks.map((raw) => {
      const cleanUrl = sanitizeWebsiteUrl(raw);
      return {
        url: cleanUrl,
        domain: extractDomain(cleanUrl),
        name: detectWebsiteName(cleanUrl),
        category,
        crawlScope: "products",
      };
    });

    expect(records[0]).toEqual({
      url: "https://GuruReviewsClub.com",
      domain: "gurureviewsclub.com",
      name: "Guru Reviews Club",
      category: "ecom",
      crawlScope: "products",
    });

    expect(records[1]).toEqual({
      url: "https://my-ecom-store.com",
      domain: "my-ecom-store.com",
      name: "My Ecom Store",
      category: "ecom",
      crawlScope: "products",
    });
  });

  it("verifies initial auto-scan creation state and primary-first scan order", () => {
    const createdSite = {
      domain: "testsite.com",
      isScanning: true,
      lastScanStatus: "scanning",
      lockAcquiredAt: new Date(),
      totalUrls: 0,
    };

    expect(createdSite.isScanning).toBe(true);
    expect(createdSite.lastScanStatus).toBe("scanning");

    // Scan all ordering: primary websites first, then monitored
    const allSites = [
      { domain: "competitor-a.com", isPrimary: false, createdAt: new Date("2026-01-01") },
      { domain: "baseline-b.com", isPrimary: true, createdAt: new Date("2026-01-02") },
      { domain: "baseline-a.com", isPrimary: true, createdAt: new Date("2026-01-01") },
    ];

    const sortedForScanAll = [...allSites].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    expect(sortedForScanAll.map((s) => s.domain)).toEqual([
      "baseline-a.com",
      "baseline-b.com",
      "competitor-a.com",
    ]);
  });

  it("accurately parses versatile bulk inputs (domain only, domain + sitemap, direct XML)", () => {
    // 1. Pure domain (sitemapUrl should be undefined so auto-discovery runs)
    const p1 = parseBulkLine("thebuyersreviews.com");
    expect(p1).toEqual({
      siteUrl: "https://thebuyersreviews.com",
      explicitSitemapUrl: undefined,
    });

    // 2. Domain + Sitemap pair with comma
    const p2 = parseBulkLine("supplementvibes.com, https://supplementvibes.com/sitemap_index.xml");
    expect(p2).toEqual({
      siteUrl: "https://supplementvibes.com",
      explicitSitemapUrl: "https://supplementvibes.com/sitemap_index.xml",
    });

    // 3. Domain + Sitemap pair with pipe
    const p3 = parseBulkLine("dailyhealthsupplement.com | https://dailyhealthsupplement.com/sitemap_index.xml");
    expect(p3).toEqual({
      siteUrl: "https://dailyhealthsupplement.com",
      explicitSitemapUrl: "https://dailyhealthsupplement.com/sitemap_index.xml",
    });

    // 4. Direct sitemap XML URL
    const p4 = parseBulkLine("https://supplementdolphin.com/sitemap_index.xml");
    expect(p4).toEqual({
      siteUrl: "https://supplementdolphin.com",
      explicitSitemapUrl: "https://supplementdolphin.com/sitemap_index.xml",
    });

    // 5. Space separated
    const p5 = parseBulkLine("supplementtiger.com https://www.supplementtiger.com/sitemap_index.xml");
    expect(p5).toEqual({
      siteUrl: "https://supplementtiger.com",
      explicitSitemapUrl: "https://www.supplementtiger.com/sitemap_index.xml",
    });

    // 6. Empty / Comment lines
    expect(parseBulkLine("")).toBeNull();
    expect(parseBulkLine("# comment")).toBeNull();
  });
});

