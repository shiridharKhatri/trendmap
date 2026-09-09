import { describe, it, expect } from "vitest";
import {
  normalizeUrl,
  isValidHttpUrl,
  extractDomain,
  matchesUrlPattern,
  isInformationalArticle,
} from "../src/lib/sitemap/normalizer";

describe("URL Normalizer", () => {
  it("normalizes scheme and hostname to lowercase", () => {
    const input = "HTTPS://WWW.EXAMPLE.COM/Blog";
    const output = normalizeUrl(input);
    expect(output).toBe("https://www.example.com/Blog");
  });

  it("strips trailing slash on non-root paths", () => {
    expect(normalizeUrl("https://example.com/page/")).toBe("https://example.com/page");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("removes URL fragments", () => {
    expect(normalizeUrl("https://example.com/pricing#enterprise")).toBe(
      "https://example.com/pricing"
    );
  });

  it("strips tracking parameters (utm_*, fbclid, gclid, etc.)", () => {
    const input =
      "https://example.com/products/item?utm_source=google&utm_medium=cpc&id=123&fbclid=abc";
    const output = normalizeUrl(input);
    expect(output).toBe("https://example.com/products/item?id=123");
  });

  it("preserves and sorts meaningful query parameters", () => {
    const input = "https://example.com/shop?color=red&size=large&brand=nike";
    const output = normalizeUrl(input);
    expect(output).toBe("https://example.com/shop?brand=nike&color=red&size=large");
  });

  it("collapses multiple consecutive slashes in pathname", () => {
    const input = "https://example.com//products///shoes";
    const output = normalizeUrl(input);
    expect(output).toBe("https://example.com/products/shoes");
  });

  it("strips default HTTP and HTTPS port numbers", () => {
    expect(normalizeUrl("https://example.com:443/page")).toBe("https://example.com/page");
    expect(normalizeUrl("http://example.com:80/page")).toBe("http://example.com/page");
    expect(normalizeUrl("https://example.com:8443/page")).toBe("https://example.com:8443/page");
  });

  it("validates valid and invalid URLs accurately", () => {
    expect(isValidHttpUrl("https://example.com")).toBe(true);
    expect(isValidHttpUrl("http://sub.domain.org/path?q=1")).toBe(true);
    expect(isValidHttpUrl("ftp://files.com")).toBe(false);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("not-a-url")).toBe(false);
  });

  it("extracts base domain correctly", () => {
    expect(extractDomain("https://www.example.com/page")).toBe("example.com");
    expect(extractDomain("https://blog.mysite.org/post")).toBe("blog.mysite.org");
  });
});

describe("URL Pattern Matching", () => {
  it("matches simple substrings case-insensitively", () => {
    expect(matchesUrlPattern("https://example.com/products/item-1", "product")).toBe(true);
    expect(matchesUrlPattern("https://example.com/Products/item-1", "product")).toBe(true);
    expect(matchesUrlPattern("https://example.com/about-us", "product")).toBe(false);
    expect(matchesUrlPattern("https://example.com/blog/2026/post", "/blog/")).toBe(true);
    expect(matchesUrlPattern("https://example.com/blogger-profile", "/blog/")).toBe(false);
  });

  it("matches wildcard glob patterns", () => {
    expect(matchesUrlPattern("https://example.com/shop/shoes/123", "*shop*shoes*")).toBe(true);
    expect(matchesUrlPattern("https://example.com/shop/apparel/123", "*shop*shoes*")).toBe(false);
    expect(matchesUrlPattern("https://example.com/cbd-gummies-review", "*cbd*")).toBe(true);
  });

  it("matches regular expressions", () => {
    expect(matchesUrlPattern("https://example.com/products/item-992", "/products\\/item-\\d+/")).toBe(true);
    expect(matchesUrlPattern("https://example.com/products/item-xyz", "/products\\/item-\\d+/")).toBe(false);
  });

  it("handles empty or blank inputs safely", () => {
    expect(matchesUrlPattern("", "product")).toBe(false);
    expect(matchesUrlPattern("https://example.com", "")).toBe(false);
    expect(matchesUrlPattern("https://example.com", "   ")).toBe(false);
  });
});

describe("Informational Article Detector", () => {
  it("flags medical Q&A and blog guides as informational", () => {
    expect(isInformationalArticle("https://inmybowl.com/the-back-of-my-knee-hurts-when-bend-it-and-straighten-it/")).toBe(true);
    expect(isInformationalArticle("https://inmybowl.com/how-to-heal-a-sprained-knee-quickly/")).toBe(true);
    expect(isInformationalArticle("https://inmybowl.com/can-a-swollen-knee-be-dangerous/")).toBe(true);
    expect(isInformationalArticle("https://inmybowl.com/why-does-my-knee-hurt-when-bend-it/")).toBe(true);
    expect(isInformationalArticle("why-does-the-back-of-my-knee-hurt")).toBe(true);
    expect(isInformationalArticle("pain-in-back-of-knee-when-straightening-leg")).toBe(true);
    expect(isInformationalArticle("vicks-vaporub-for-memory")).toBe(true);
  });

  it("does not flag genuine product reviews", () => {
    expect(isInformationalArticle("https://inmybowl.com/biopeak-reviews/")).toBe(false);
    expect(isInformationalArticle("https://inmybowl.com/scalpistry-reviews/")).toBe(false);
    expect(isInformationalArticle("https://inmybowl.com/prosta-defend-prostate-supplement/")).toBe(false);
    expect(isInformationalArticle("trimrx-semaglutide-reviews")).toBe(false);
    expect(isInformationalArticle("organifi-happy-drops-reviews")).toBe(false);
  });
});
