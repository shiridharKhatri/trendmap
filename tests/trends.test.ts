import { describe, it, expect } from "vitest";
import {
  formatKeywordFromSlug,
  classifyTrendPriority,
  buildGoogleTrendsUrl,
  calculateTrueTrendScore,
  isNonProduct,
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

    it("intelligently unifies case and spacing variations like exampleFX, 'example  fx', and 'example FX'", () => {
      expect(formatKeywordFromSlug("exampleFX")).toBe("Example FX");
      expect(formatKeywordFromSlug("example  fx")).toBe("Example FX");
      expect(formatKeywordFromSlug("example FX")).toBe("Example FX");
      expect(formatKeywordFromSlug("example-fx")).toBe("Example FX");
      expect(formatKeywordFromSlug("https://competitor.com/products/exampleFX")).toBe("Example FX");
      expect(formatKeywordFromSlug("https://competitor.com/products/example  fx")).toBe("Example FX");
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
      expect(url).toBe("https://trends.google.com/explore?q=Nike%20Air%20Max%2090&hl=en");
      expect(url).not.toContain("&geo=");
    });

    it("appends uppercase geo parameter when country is specified", () => {
      const urlUS = buildGoogleTrendsUrl("Nike Air Max 90", "US");
      expect(urlUS).toBe("https://trends.google.com/explore?q=Nike%20Air%20Max%2090&geo=US&hl=en");

      const urlGB = buildGoogleTrendsUrl("Nike Air Max 90", "gb");
      expect(urlGB).toBe("https://trends.google.com/explore?q=Nike%20Air%20Max%2090&geo=GB&hl=en");
    });

    it("prevents %2520 double-encoding when given encoded strings", () => {
      const url = buildGoogleTrendsUrl("Urinary%20Tract%20Infections", "US");
      expect(url).toBe("https://trends.google.com/explore?q=Urinary%20Tract%20Infections&geo=US&hl=en");
      expect(url).not.toContain("%2520");
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

  describe("Real Google Trends verification & zero-demand handling", () => {
    it("extracts Genesis Renew Cream cleanly from competitor URLs", () => {
      expect(
        formatKeywordFromSlug(
          "https://www.consumerhealthdigest.com/eye-cream-reviews/genesis-renew-cream.html"
        )
      ).toBe("Genesis Renew Cream");
    });

    it("verifies 0 search volume returns score 0 and low priority", () => {
      expect(classifyTrendPriority(0)).toBe("low");
    });

    it("strictly returns score 0 when all values are zero", () => {
      expect(calculateTrueTrendScore([0, 0, 0, 0, 0])).toBe(0);
      expect(calculateTrueTrendScore([])).toBe(0);
    });

    it("strictly returns score 0 on isolated single-week spikes (e.g. 53 zeros and 1 blip of 100)", () => {
      // Mimics Google Trends self-scaling an isolated noise spike to 100
      const isolatedSpike = new Array(53).fill(0).concat([100]);
      expect(calculateTrueTrendScore(isolatedSpike)).toBe(0);

      const twoSpikes = [100].concat(new Array(52).fill(0)).concat([100]);
      expect(calculateTrueTrendScore(twoSpikes)).toBe(0);
    });

    it("strictly returns score 0 when recent 4 weeks have zero search interest", () => {
      // Historical interest months ago, but dead for the past month
      const deadProduct = [50, 60, 40, 50, 45].concat(new Array(10).fill(0));
      expect(calculateTrueTrendScore(deadProduct)).toBe(0);
    });

    it("calculates positive score for sustained, active search interest", () => {
      // Consistent active interest over recent weeks
      const activeProduct = [30, 40, 50, 60, 70, 65, 75, 80, 85, 90];
      const score = calculateTrueTrendScore(activeProduct);
      expect(score).toBeGreaterThan(50);
      expect(classifyTrendPriority(score)).toBe("high");
    });
  });

  describe("Excluded non-product items from product filtering", () => {
    const excludedItems = [
      "30 Day Booty Camp",
      "Methodology",
      "Editorial Policy",
      "Corrections",
      "How We Rate Products",
      "Product Claim Standards",
      "Disclosure",
      "Buying Guides",
      "Buyers Guide",
      "Compact Tools Under 100",
      "Alternatives",
      "Opiniones",
      "Test",
      "Cooling Options",
      "Personal Air Cooler",
      "Small Room Cooling Options",
      "[Small Room Cooling] Options",
      "Portable Cooling Device",
      "Kidney Disease Solution Program",
      "[Kidney] Disease Solution Program",
      "Over the Counter Heartburn Medicine 2025",
      "Over the Counter [Heartburn Medicine 2025]",
    ];

    it.each(excludedItems)("correctly identifies '%s' as non-product and returns empty product keyword", (item) => {
      expect(isNonProduct(item)).toBe(true);
      expect(formatKeywordFromSlug(item)).toBe("");
    });

    it("correctly identifies hyphenated URL slug versions as non-products", () => {
      const slugItems = [
        "30-day-booty-camp",
        "/methodology",
        "/editorial-policy",
        "/corrections",
        "/how-we-rate-products",
        "/product-claim-standards",
        "/disclosure",
        "/buying-guides",
        "/buyers-guide",
        "/compact-tools-under-100",
        "/alternatives",
        "/opiniones",
        "/test",
        "/cooling-options",
        "/personal-air-cooler",
        "/small-room-cooling-options",
        "/portable-cooling-device",
        "/kidney-disease-solution-program",
        "/over-the-counter-heartburn-medicine-2025",
      ];

      for (const slug of slugItems) {
        expect(isNonProduct(slug)).toBe(true);
        expect(formatKeywordFromSlug(slug)).toBe("");
      }
    });

    it("strictly excludes pure numbers and pagination IDs from product names", () => {
      const numericItems = ["4", "1", "123", "2024", "/4/", "/page/4", "https://site.com/4"];
      for (const num of numericItems) {
        expect(isNonProduct(num)).toBe(true);
        expect(formatKeywordFromSlug(num)).toBe("");
      }
    });
  });
});


