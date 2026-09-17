import { describe, it, expect } from "vitest";
import { discoverSitemaps } from "../src/lib/sitemap/discover";

describe("Sitemap Discovery & Verification", () => {
  it("returns error and no recommended sitemap for a non-existent domain", async () => {
    const res = await discoverSitemaps("https://supplementama-does-not-exist-9999.com");
    expect(res.recommendedSitemap).toBeUndefined();
    expect(res.candidates).toHaveLength(0);
    expect(res.error).toBeDefined();
    expect(res.error).toContain("website");
  }, 10000);

  it("handles malformed URLs gracefully without throwing", async () => {
    const res = await discoverSitemaps("invalid:::not a url");
    expect(res.recommendedSitemap).toBeUndefined();
    expect(res.candidates).toHaveLength(0);
  });
});
