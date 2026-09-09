import { describe, it, expect } from "vitest";
import {
  extractProductSlug,
  tokenizeProductSlug,
  calculateProductSimilarity,
  findBestProductMatch,
  BulkProductMatcher,
  type IndexedProduct,
} from "../src/lib/comparison/productMatcher";

describe("Product Matcher - Slug Extraction & Sanitization", () => {
  it("strips directory prefixes like /products/, /shop/, /item/, /p/", () => {
    expect(extractProductSlug("https://competitor.com/products/nike-air-max-90")).toBe("nike-air-max-90");
    expect(extractProductSlug("https://competitor.com/shop/mens/nike-air-max-90")).toBe("nike-air-max-90");
    expect(extractProductSlug("https://competitor.com/item/nike-air-max-90")).toBe("nike-air-max-90");
    expect(extractProductSlug("https://competitor.com/p/shoes/nike-air-max-90")).toBe("nike-air-max-90");
  });

  it("strips file extensions (.html, .htm, .php)", () => {
    expect(extractProductSlug("https://competitor.com/shop/nike-air-max-90.html")).toBe("nike-air-max-90");
    expect(extractProductSlug("/products/air-fryer-pro.php")).toBe("air-fryer-pro");
  });

  it("strips leading database SKU IDs and numbers", () => {
    expect(extractProductSlug("https://competitor.com/item/10492-nike-air-max-90.html")).toBe(
      "nike-air-max-90"
    );
    expect(extractProductSlug("/products/883921_wireless-headphones")).toBe("wireless-headphones");
  });

  it("strips trailing SKU/ID suffixes", () => {
    expect(extractProductSlug("/p/nike-air-max-90-p102934")).toBe("nike-air-max-90");
    expect(extractProductSlug("/products/nike-air-max-90-sku-883921")).toBe("nike-air-max-90");
  });
});

describe("Product Matcher - Tokenization & Semantic Normalization", () => {
  it("extracts meaningful tokens and removes e-commerce stopwords", () => {
    const tokens = tokenizeProductSlug("buy-online-nike-air-max-90-running-shoes-for-men-free-shipping");
    expect(tokens).toContain("nike");
    expect(tokens).toContain("air");
    expect(tokens).toContain("max");
    expect(tokens).toContain("90");
    expect(tokens).toContain("run"); // stemmed
    expect(tokens).toContain("shoe"); // stemmed
    // Stopwords should be removed
    expect(tokens).not.toContain("buy");
    expect(tokens).not.toContain("online");
    expect(tokens).not.toContain("free");
    expect(tokens).not.toContain("shipping");
    expect(tokens).not.toContain("for");
  });
});

describe("Product Matcher - Similarity & Fuzzy Pattern Matching", () => {
  it("matches identical products across different directory structures (100%)", () => {
    const comp = "https://competitor.com/products/sony-wh-1000xm5-wireless-headphones";
    const our = "https://mysite.com/shop/audio/sony-wh-1000xm5-wireless-headphones";

    const result = calculateProductSimilarity(comp, our);
    expect(result.isMatch).toBe(true);
    expect(result.similarity).toBe(1.0);
  });

  it("matches products with different slug phrasing and modifiers", () => {
    const comp = "https://competitor.com/products/nike-air-max-90-mens-running-shoes";
    const our = "https://mysite.com/shop/footwear/nike-air-max-90";

    const result = calculateProductSimilarity(comp, our);
    expect(result.isMatch).toBe(true);
    expect(result.similarity).toBeGreaterThanOrEqual(0.7);
    expect(result.sharedTokens).toEqual(expect.arrayContaining(["nike", "air", "max", "90"]));
  });

  it("correctly rejects completely different products", () => {
    const comp = "https://competitor.com/products/dyson-v15-detect-cordless-vacuum";
    const our = "https://mysite.com/products/nike-air-max-90";

    const result = calculateProductSimilarity(comp, our);
    expect(result.isMatch).toBe(false);
    expect(result.similarity).toBe(0);
  });
});

describe("Product Matcher - Multi-Baseline Matching Across Multiple Sites", () => {
  const ourMultiSiteIndex: IndexedProduct[] = [
    {
      url: "https://mysite1.com/shop/electronics/sony-wh-1000xm5",
      websiteId: "site-1",
      websiteDomain: "mysite1.com",
      slug: "sony-wh-1000xm5",
      tokens: tokenizeProductSlug("sony-wh-1000xm5"),
    },
    {
      url: "https://mysite2.com/catalog/footwear/nike-air-max-90",
      websiteId: "site-2",
      websiteDomain: "mysite2.com",
      slug: "nike-air-max-90",
      tokens: tokenizeProductSlug("nike-air-max-90"),
    },
    {
      url: "https://mysite3.com/p/kitchen/instant-pot-duo-plus-9-in-1",
      websiteId: "site-3",
      websiteDomain: "mysite3.com",
      slug: "instant-pot-duo-plus-9-in-1",
      tokens: tokenizeProductSlug("instant-pot-duo-plus-9-in-1"),
    },
  ];

  it("detects product exists when found on Site 2 even with SKU and extra adjectives", () => {
    const competitorProduct = "https://competitor.com/items/10492-nike-air-max-90-running-shoes.html";
    const match = findBestProductMatch(competitorProduct, ourMultiSiteIndex);

    expect(match.isMatch).toBe(true);
    expect(match.matchedProduct?.websiteDomain).toBe("mysite2.com");
    expect(match.matchedProduct?.url).toBe("https://mysite2.com/catalog/footwear/nike-air-max-90");
  });

  it("detects product exists when found on Site 1 with rearranged words", () => {
    const competitorProduct = "https://otherstore.com/products/wireless-noise-cancelling-headphones-sony-wh-1000xm5";
    const match = findBestProductMatch(competitorProduct, ourMultiSiteIndex);

    expect(match.isMatch).toBe(true);
    expect(match.matchedProduct?.websiteDomain).toBe("mysite1.com");
  });

  it("flags product as missing when it does NOT exist across any of our 3 baseline sites", () => {
    const competitorProduct = "https://competitor.com/products/apple-macbook-pro-16-inch-m3-max";
    const match = findBestProductMatch(competitorProduct, ourMultiSiteIndex);

    expect(match.isMatch).toBe(false);
    expect(match.matchedProduct).toBeUndefined();
  });

  it("finds all matches when a product is shared across 2 or more baseline sites", () => {
    const multiBaselineIndex: IndexedProduct[] = [
      {
        url: "https://supplementmag.com/memovolt-reviews",
        websiteId: "site-supp",
        websiteDomain: "supplementmag.com",
        slug: "memovolt-reviews",
        tokens: tokenizeProductSlug("memovolt-reviews"),
      },
      {
        url: "https://dailyhealthsupplement.com/memovolt-reviews",
        websiteId: "site-dhs",
        websiteDomain: "dailyhealthsupplement.com",
        slug: "memovolt-reviews",
        tokens: tokenizeProductSlug("memovolt-reviews"),
      },
      {
        url: "https://thirdsite.com/other-product",
        websiteId: "site-third",
        websiteDomain: "thirdsite.com",
        slug: "other-product",
        tokens: tokenizeProductSlug("other-product"),
      },
    ];

    const bulk = new BulkProductMatcher(multiBaselineIndex);
    const result = bulk.findAllMatches("memovolt-reviews", tokenizeProductSlug("memovolt-reviews"));

    expect(result.isMatch).toBe(true);
    expect(result.matches.length).toBe(2);
    const domains = result.matches.map((m) => m.product.websiteDomain);
    expect(domains).toContain("supplementmag.com");
    expect(domains).toContain("dailyhealthsupplement.com");
    expect(domains).not.toContain("thirdsite.com");
  });
});
