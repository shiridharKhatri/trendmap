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

  it("intelligently extracts clean product slugs from camelCase and spaced variants", () => {
    expect(extractProductSlug("exampleFX")).toBe("example-fx");
    expect(extractProductSlug("example  fx")).toBe("example-fx");
    expect(extractProductSlug("example FX")).toBe("example-fx");
    expect(extractProductSlug("https://competitor.com/products/exampleFX")).toBe("example-fx");
    expect(extractProductSlug("https://competitor.com/shop/example  fx")).toBe("example-fx");
  });
});

describe("Product Matcher - Tokenization & Semantic Normalization", () => {
  it("produces identical tokens for exampleFX, 'example  fx', and 'example FX'", () => {
    const t1 = tokenizeProductSlug("exampleFX");
    const t2 = tokenizeProductSlug("example  fx");
    const t3 = tokenizeProductSlug("example FX");
    const t4 = tokenizeProductSlug("example-fx");

    expect(t1).toEqual(["example", "fx"]);
    expect(t2).toEqual(["example", "fx"]);
    expect(t3).toEqual(["example", "fx"]);
    expect(t4).toEqual(["example", "fx"]);
  });

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

  it("intelligently matches exampleFX, 'example  fx', and 'example FX' as 100% identical products", () => {
    const comp1 = "https://competitor.com/products/exampleFX";
    const comp2 = "https://competitor.com/products/example  fx";
    const our = "https://mysite.com/products/example-fx";

    const res1 = calculateProductSimilarity(comp1, our);
    expect(res1.isMatch).toBe(true);
    expect(res1.similarity).toBe(1.0);

    const res2 = calculateProductSimilarity(comp2, our);
    expect(res2.isMatch).toBe(true);
    expect(res2.similarity).toBe(1.0);

    const res3 = calculateProductSimilarity(comp1, comp2);
    expect(res3.isMatch).toBe(true);
    expect(res3.similarity).toBe(1.0);
  });

  it("matches unhyphenated lowercase slug examplefx with example-fx", () => {
    const comp = "https://competitor.com/products/examplefx";
    const our = "https://mysite.com/products/example-fx";

    const res = calculateProductSimilarity(comp, our);
    expect(res.isMatch).toBe(true);
    expect(res.similarity).toBe(1.0);
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

  it("matches single-token competitor products against baseline multi-token products", () => {
    const singleTokenIndex: IndexedProduct[] = [
      {
        url: "https://mysite.com/shop/berberine-complex",
        websiteId: "site-1",
        websiteDomain: "mysite.com",
        slug: "berberine-complex",
        tokens: tokenizeProductSlug("berberine-complex"),
      },
    ];

    const bulk = new BulkProductMatcher(singleTokenIndex);
    const result = bulk.findAllMatches("berberine", tokenizeProductSlug("berberine"));

    expect(result.isMatch).toBe(true);
    expect(result.bestScore).toBeGreaterThanOrEqual(0.65);
    expect(result.matches[0].product.url).toBe("https://mysite.com/shop/berberine-complex");
  });

  it("matches affiliate boilerplate review slugs with year to clean product baseline slugs", () => {
    const baseline: IndexedProduct[] = [
      {
        url: "https://mysite.com/products/lipojaro-drops",
        websiteId: "site-1",
        websiteDomain: "mysite.com",
        slug: "lipojaro-drops",
        tokens: tokenizeProductSlug("lipojaro-drops"),
      },
    ];

    const competitorUrl = "https://competitor.com/lipojaro-reviews-complaints-2026-is-it-legit";
    const compSlug = extractProductSlug(competitorUrl);
    const compTokens = tokenizeProductSlug(compSlug);

    const bulk = new BulkProductMatcher(baseline);
    const result = bulk.findAllMatches(compSlug, compTokens);

    expect(result.isMatch).toBe(true);
    expect(result.matches[0].product.url).toBe("https://mysite.com/products/lipojaro-drops");
  });

  it("matches products in large catalogs (>150 items) without premature candidateSet cutoff", () => {
    const largeCatalog: IndexedProduct[] = [];
    // 200 items that share the common token "serum"
    for (let i = 0; i < 200; i++) {
      largeCatalog.push({
        url: `https://mysite.com/products/generic-item-${i}`,
        websiteId: "site-1",
        websiteDomain: "mysite.com",
        slug: `generic-item-${i}`,
        tokens: ["serum", `item${i}`],
      });
    }
    // Add the target product at index 200
    largeCatalog.push({
      url: "https://mysite.com/products/retinol-night-serum",
      websiteId: "site-1",
      websiteDomain: "mysite.com",
      slug: "retinol-night-serum",
      tokens: tokenizeProductSlug("retinol-night-serum"),
    });

    const bulk = new BulkProductMatcher(largeCatalog);
    const compTokens = tokenizeProductSlug("retinol-night-serum-complex");
    const result = bulk.findAllMatches("retinol-night-serum-complex", compTokens);

    expect(result.isMatch).toBe(true);
    expect(result.matches[0].product.url).toBe("https://mysite.com/products/retinol-night-serum");
  });

  it("matches exampleFX, 'example  fx', and 'examplefx' against baseline example-fx using BulkProductMatcher", () => {
    const baseline: IndexedProduct[] = [
      {
        url: "https://mysite.com/products/example-fx",
        websiteId: "site-1",
        websiteDomain: "mysite.com",
        slug: "example-fx",
        tokens: tokenizeProductSlug("example-fx"),
      },
    ];

    const bulk = new BulkProductMatcher(baseline);

    const match1 = bulk.findMatch("example-fx", tokenizeProductSlug("exampleFX"));
    expect(match1.isMatch).toBe(true);
    expect(match1.bestScore).toBe(1.0);
    expect(match1.matchedProduct?.url).toBe("https://mysite.com/products/example-fx");

    const match2 = bulk.findMatch(extractProductSlug("example  fx"), tokenizeProductSlug("example  fx"));
    expect(match2.isMatch).toBe(true);
    expect(match2.bestScore).toBe(1.0);
    expect(match2.matchedProduct?.url).toBe("https://mysite.com/products/example-fx");

    const match3 = bulk.findMatch("examplefx", ["examplefx"]);
    expect(match3.isMatch).toBe(true);
    expect(match3.bestScore).toBe(1.0);
    expect(match3.matchedProduct?.url).toBe("https://mysite.com/products/example-fx");
  });
});

describe("Product Matcher - False-Positive Elimination (Cross-Category & Single-Word Isolation)", () => {
  it("strictly rejects BCAA G-Force matching against Force X", () => {
    const bcaaNutritrade = "https://nutritrade.it/shop/bodybuilding-and-fitness/amminoacidi/bcaa-g-force-1150/";
    const forceXReview = "https://dailyhealthsupplement.com/force-x-review-2026-the-truth-they-hide/";

    const result = calculateProductSimilarity(bcaaNutritrade, forceXReview);
    expect(result.isMatch).toBe(false);
  });

  it("strictly rejects Bcaa Force matching against Force X at slug level", () => {
    const result = calculateProductSimilarity("bcaa-g-force", "force-x");
    expect(result.isMatch).toBe(false);
  });

  it("strictly rejects single-word generic product slugs matching multi-word products", () => {
    // Single word 'basic' (fitness gloves) vs 'thorne-basic-nutrients' (multivitamins)
    const basicRes = calculateProductSimilarity(
      "https://nutritrade.it/shop/guanti-fitness/basic/",
      "https://dailyhealthsupplement.com/thorne-basic-nutrients/"
    );
    expect(basicRes.isMatch).toBe(false);

    // Single word 'wild' (gloves) vs 'wild-burn' (fat burner)
    const wildRes = calculateProductSimilarity(
      "https://nutritrade.it/shop/guanti-fitness/wild/",
      "https://dailyhealthsupplement.com/wild-burn/"
    );
    expect(wildRes.isMatch).toBe(false);

    // Single word 'fitness' (gloves) vs 'fitness-keto-capsules' (weight loss)
    const fitRes = calculateProductSimilarity(
      "https://nutritrade.it/shop/guanti-fitness/fitness/",
      "https://dailyhealthsupplement.com/fitness-keto-capsules/"
    );
    expect(fitRes.isMatch).toBe(false);
  });

  it("rejects multi-token products that only share a single generic modifier word", () => {
    // Thermo Fat Burner Max vs Max Vitality (only share 'max')
    const maxRes = calculateProductSimilarity(
      "thermo-fat-burner-max",
      "max-vitality"
    );
    expect(maxRes.isMatch).toBe(false);

    // Glucosamine 2 vs generic joint complex sharing only glucosamine
    const glucRes = calculateProductSimilarity(
      "glucosamine-2",
      "advanced-joint-mobility-complex"
    );
    expect(glucRes.isMatch).toBe(false);
  });

  it("correctly flags products as missing across baseline in BulkProductMatcher", () => {
    const dailyHealthSuppBaseline: IndexedProduct[] = [
      {
        url: "https://dailyhealthsupplement.com/force-x-review-2026",
        websiteId: "site-dhs",
        websiteDomain: "dailyhealthsupplement.com",
        slug: "force-x",
        tokens: tokenizeProductSlug("force-x"),
      },
      {
        url: "https://dailyhealthsupplement.com/thorne-basic-nutrients",
        websiteId: "site-dhs",
        websiteDomain: "dailyhealthsupplement.com",
        slug: "thorne-basic-nutrients",
        tokens: tokenizeProductSlug("thorne-basic-nutrients"),
      },
      {
        url: "https://dailyhealthsupplement.com/wild-burn",
        websiteId: "site-dhs",
        websiteDomain: "dailyhealthsupplement.com",
        slug: "wild-burn",
        tokens: tokenizeProductSlug("wild-burn"),
      },
      {
        url: "https://dailyhealthsupplement.com/fitness-keto-capsules",
        websiteId: "site-dhs",
        websiteDomain: "dailyhealthsupplement.com",
        slug: "fitness-keto-capsules",
        tokens: tokenizeProductSlug("fitness-keto-capsules"),
      },
    ];

    const matcher = new BulkProductMatcher(dailyHealthSuppBaseline);

    // BCAA G-Force 1150 must NOT match Force X
    const bcaaMatch = matcher.findAllMatches(
      extractProductSlug("https://nutritrade.it/shop/bodybuilding-and-fitness/amminoacidi/bcaa-g-force-1150/"),
      tokenizeProductSlug("https://nutritrade.it/shop/bodybuilding-and-fitness/amminoacidi/bcaa-g-force-1150/")
    );
    expect(bcaaMatch.isMatch).toBe(false);
    expect(bcaaMatch.matches.length).toBe(0);

    // Basic must NOT match Thorne Basic Nutrients
    const basicMatch = matcher.findAllMatches("basic", tokenizeProductSlug("basic"));
    expect(basicMatch.isMatch).toBe(false);
    expect(basicMatch.matches.length).toBe(0);

    // Wild must NOT match Wild Burn
    const wildMatch = matcher.findAllMatches("wild", tokenizeProductSlug("wild"));
    expect(wildMatch.isMatch).toBe(false);
    expect(wildMatch.matches.length).toBe(0);

    // Fitness must NOT match Fitness Keto Capsules
    const fitMatch = matcher.findAllMatches("fitness", tokenizeProductSlug("fitness"));
    expect(fitMatch.isMatch).toBe(false);
    expect(fitMatch.matches.length).toBe(0);
  });
});
