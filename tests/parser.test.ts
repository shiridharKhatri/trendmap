import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSitemapTree } from "../src/lib/sitemap/parser";
import * as ssrfModule from "../src/lib/security/ssrf";

vi.mock("../src/lib/security/ssrf", () => ({
  safeFetch: vi.fn(),
}));

describe("Sitemap Tree Parser with URL Pattern Filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters URLs using urlIncludePatterns", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/products/running-shoes</loc></url>
      <url><loc>https://example.com/products/t-shirt</loc></url>
      <url><loc>https://example.com/blog/how-to-run</loc></url>
      <url><loc>https://example.com/about-us</loc></url>
      <url><loc>https://example.com/privacy</loc></url>
    </urlset>`;

    vi.mocked(ssrfModule.safeFetch).mockResolvedValueOnce({
      response: new Response(xml, {
        status: 200,
        headers: { "content-type": "application/xml" },
      }),
      finalUrl: "https://example.com/sitemap.xml",
      durationMs: 15,
    });

    const result = await parseSitemapTree("https://example.com/sitemap.xml", {
      urlIncludePatterns: ["product"],
    });

    expect(result.urls).toHaveLength(2);
    expect(result.urls.map((u) => u.normalizedUrl)).toEqual([
      "https://example.com/products/running-shoes",
      "https://example.com/products/t-shirt",
    ]);
  });

  it("filters URLs using urlExcludePatterns", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/products/item-1</loc></url>
      <url><loc>https://example.com/general/terms.html</loc></url>
      <url><loc>https://example.com/privacy</loc></url>
      <url><loc>https://example.com/author/john</loc></url>
      <url><loc>https://example.com/blog/guide</loc></url>
    </urlset>`;

    vi.mocked(ssrfModule.safeFetch).mockResolvedValueOnce({
      response: new Response(xml, {
        status: 200,
        headers: { "content-type": "application/xml" },
      }),
      finalUrl: "https://example.com/sitemap.xml",
      durationMs: 20,
    });

    const result = await parseSitemapTree("https://example.com/sitemap.xml", {
      urlExcludePatterns: ["/general/", "/privacy", "/author/"],
    });

    expect(result.urls).toHaveLength(2);
    expect(result.urls.map((u) => u.normalizedUrl)).toEqual([
      "https://example.com/products/item-1",
      "https://example.com/blog/guide",
    ]);
  });

  it("prioritizes matching child sitemaps in sitemapindex when urlIncludePatterns are specified", async () => {
    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/product-sitemap.xml</loc></sitemap>
      <sitemap><loc>https://example.com/post-sitemap.xml</loc></sitemap>
      <sitemap><loc>https://example.com/page-sitemap.xml</loc></sitemap>
      <sitemap><loc>https://example.com/author-sitemap.xml</loc></sitemap>
    </sitemapindex>`;

    const productXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/products/keyboard</loc></url>
      <url><loc>https://example.com/products/mouse</loc></url>
    </urlset>`;

    vi.mocked(ssrfModule.safeFetch)
      .mockResolvedValueOnce({
        response: new Response(indexXml, {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
        finalUrl: "https://example.com/sitemap_index.xml",
        durationMs: 25,
      })
      .mockResolvedValueOnce({
        response: new Response(productXml, {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
        finalUrl: "https://example.com/product-sitemap.xml",
        durationMs: 18,
      });

    const result = await parseSitemapTree("https://example.com/sitemap_index.xml", {
      urlIncludePatterns: ["product"],
    });

    // Only the index and product sitemap should have been fetched (post, page, author skipped)
    expect(ssrfModule.safeFetch).toHaveBeenCalledTimes(2);
    expect(result.urls).toHaveLength(2);
    expect(result.urls.map((u) => u.normalizedUrl)).toEqual([
      "https://example.com/products/keyboard",
      "https://example.com/products/mouse",
    ]);
  });
});
