import { describe, it, expect } from "vitest";
import {
  formatKeywordFromSlug,
  classifyTrendPriority,
  buildGoogleTrendsUrl,
  SUPPORTED_GEOS,
} from "../src/lib/trends/trendsService";

describe("Google Trends Intelligence Service", () => {
  describe("formatKeywordFromSlug", () => {
    it("converts standard hyphenated slugs into natural search terms", () => {
      expect(formatKeywordFromSlug("nike-air-max-90")).toBe("Nike Air Max 90");
      expect(formatKeywordFromSlug("adidas-ultraboost-light-running")).toBe("Adidas Ultraboost Light Running");
    });

    it("cleans URLs and strips e-commerce directories and file extensions", () => {
      expect(formatKeywordFromSlug("https://example.com/products/sony-wh-1000xm5.html")).toBe(
        "Sony Wh 1000xm5"
      );
      expect(formatKeywordFromSlug("/shop/electronics/p/apple-airpods-pro-2")).toBe(
        "Apple Airpods Pro 2"
      );
    });

    it("strips numerical database IDs and SKUs", () => {
      expect(formatKeywordFromSlug("10492-nike-air-max-90")).toBe("Nike Air Max 90");
      expect(formatKeywordFromSlug("sony-headphones-sku-99281")).toBe("Sony Headphones");
    });

    it("strips affiliate review and year noise to isolate the true product name", () => {
      expect(formatKeywordFromSlug("nativepath-collagen-peptides-reviews-2026")).toBe("Nativepath Collagen Peptides");
      expect(formatKeywordFromSlug("osteoshield-reviews")).toBe("Osteoshield");
      expect(formatKeywordFromSlug("breathizen-reviews")).toBe("Breathizen");
      expect(formatKeywordFromSlug("nail-exodus-reviews-2026-update")).toBe("Nail Exodus");
    });
  });

  describe("classifyTrendPriority", () => {
    it("classifies scores >= 70 as high priority", () => {
      expect(classifyTrendPriority(70)).toBe("high");
      expect(classifyTrendPriority(85)).toBe("high");
      expect(classifyTrendPriority(100)).toBe("high");
    });

    it("classifies scores between 30 and 69 as medium priority", () => {
      expect(classifyTrendPriority(30)).toBe("medium");
      expect(classifyTrendPriority(50)).toBe("medium");
      expect(classifyTrendPriority(69)).toBe("medium");
    });

    it("classifies scores below 30 as low priority", () => {
      expect(classifyTrendPriority(0)).toBe("low");
      expect(classifyTrendPriority(15)).toBe("low");
      expect(classifyTrendPriority(29)).toBe("low");
    });
  });

  describe("buildGoogleTrendsUrl", () => {
    it("builds worldwide Google Trends exploration URL when geo is empty", () => {
      const url = buildGoogleTrendsUrl("Nike Air Max 90");
      expect(url).toBe("https://trends.google.com/explore?q=Nike%20Air%20Max%2090");
      expect(url).not.toContain("&geo=");
    });

    it("appends uppercase geo parameter when country is specified", () => {
      const urlUS = buildGoogleTrendsUrl("Nike Air Max 90", "US");
      expect(urlUS).toBe("https://trends.google.com/explore?q=Nike%20Air%20Max%2090&geo=US");

      const urlGB = buildGoogleTrendsUrl("Nike Air Max 90", "gb");
      expect(urlGB).toBe("https://trends.google.com/explore?q=Nike%20Air%20Max%2090&geo=GB");
    });
  });

  describe("SUPPORTED_GEOS", () => {
    it("contains Worldwide and key e-commerce country codes", () => {
      const codes = SUPPORTED_GEOS.map((g) => g.code);
      expect(codes).toContain(""); // Worldwide
      expect(codes).toContain("US");
      expect(codes).toContain("GB");
      expect(codes).toContain("CA");
      expect(codes).toContain("AU");
      expect(codes).toContain("DE");
    });
  });
});
