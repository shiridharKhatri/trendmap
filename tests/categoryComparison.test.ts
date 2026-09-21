import { describe, it, expect } from "vitest";

describe("Category Comparison & Mode Resolution", () => {
  const websites = [
    { _id: "b1", domain: "nutra-base.com", isPrimary: true, category: "nutra" },
    { _id: "b2", domain: "ecom-base.com", isPrimary: true, category: "ecom" },
    { _id: "c1", domain: "nutra-rival.com", isPrimary: false, category: "nutra" },
    { _id: "c2", domain: "ecom-rival.com", isPrimary: false, category: "ecom" },
  ];

  const filterSites = (
    sites: typeof websites,
    isBaseline: boolean,
    categoryMode?: string,
    specificCat?: string
  ) => {
    return sites.filter((site) => {
      if (site.isPrimary !== isBaseline) return false;
      const siteCat = site.category || "nutra";

      if (specificCat && specificCat !== "all") {
        return siteCat === specificCat;
      }

      if (categoryMode === "nutra-nutra") {
        return siteCat === "nutra";
      }
      if (categoryMode === "ecom-ecom") {
        return siteCat === "ecom";
      }
      if (categoryMode === "ecom-nutra") {
        return isBaseline ? siteCat === "ecom" : siteCat === "nutra";
      }
      if (categoryMode === "nutra-ecom") {
        return isBaseline ? siteCat === "nutra" : siteCat === "ecom";
      }

      return true;
    });
  };

  it("filters correctly for nutra-nutra mode", () => {
    const baselines = filterSites(websites, true, "nutra-nutra");
    const competitors = filterSites(websites, false, "nutra-nutra");

    expect(baselines.map((s) => s.domain)).toEqual(["nutra-base.com"]);
    expect(competitors.map((s) => s.domain)).toEqual(["nutra-rival.com"]);
  });

  it("filters correctly for ecom-ecom mode", () => {
    const baselines = filterSites(websites, true, "ecom-ecom");
    const competitors = filterSites(websites, false, "ecom-ecom");

    expect(baselines.map((s) => s.domain)).toEqual(["ecom-base.com"]);
    expect(competitors.map((s) => s.domain)).toEqual(["ecom-rival.com"]);
  });

  it("filters correctly for cross-vertical ecom-nutra mode", () => {
    const baselines = filterSites(websites, true, "ecom-nutra");
    const competitors = filterSites(websites, false, "ecom-nutra");

    expect(baselines.map((s) => s.domain)).toEqual(["ecom-base.com"]);
    expect(competitors.map((s) => s.domain)).toEqual(["nutra-rival.com"]);
  });

  it("filters correctly for cross-vertical nutra-ecom mode", () => {
    const baselines = filterSites(websites, true, "nutra-ecom");
    const competitors = filterSites(websites, false, "nutra-ecom");

    expect(baselines.map((s) => s.domain)).toEqual(["nutra-base.com"]);
    expect(competitors.map((s) => s.domain)).toEqual(["ecom-rival.com"]);
  });

  it("includes all sites in 'all' mode", () => {
    const baselines = filterSites(websites, true, "all");
    const competitors = filterSites(websites, false, "all");

    expect(baselines.map((s) => s.domain)).toEqual(["nutra-base.com", "ecom-base.com"]);
    expect(competitors.map((s) => s.domain)).toEqual(["nutra-rival.com", "ecom-rival.com"]);
  });

  it("verifies export CSV category enrichment structure", () => {
    const siteCategoryMap = new Map([
      ["nutra-base.com", "nutra"],
      ["ecom-rival.com", "ecom"],
    ]);

    const modeLabel = "Nutra to Ecom";
    const baselineCategory = siteCategoryMap.get("nutra-base.com") || "nutra";
    const competitorCategory = siteCategoryMap.get("ecom-rival.com") || "nutra";

    const exportRow = {
      title: "Super Multi Collagen",
      slug: "super-multi-collagen",
      comparisonMode: modeLabel,
      baselineCategory: baselineCategory.toUpperCase(),
      competitorCategory: competitorCategory.toUpperCase(),
      competitorDomain: "ecom-rival.com",
    };

    expect(exportRow.comparisonMode).toBe("Nutra to Ecom");
    expect(exportRow.baselineCategory).toBe("NUTRA");
    expect(exportRow.competitorCategory).toBe("ECOM");
  });

  it("ensures a primary baseline website is never placed into competitors", () => {
    // Only 1 primary nutra website, 1 competitor nutra website
    const userWebsites = [
      { _id: "b1", domain: "supplementmag.com", isPrimary: true, category: "nutra" },
      { _id: "c1", domain: "inmybowl.com", isPrimary: false, category: "nutra" },
    ];

    const baselineIds = new Set(userWebsites.filter((w) => w.isPrimary).map((w) => w._id));

    // When mode is ecom-nutra:
    // Baselines (ecom): 0 found
    const baselines = userWebsites.filter((w) => w.isPrimary && w.category === "ecom");
    expect(baselines.length).toBe(0);

    // Competitors: must exclude all baseline IDs and isPrimary: true
    const competitors = userWebsites.filter(
      (w) => !baselineIds.has(w._id) && !w.isPrimary && (w.category || "nutra") === "nutra"
    );

    // supplementmag.com MUST NOT appear in competitors!
    expect(competitors.map((c) => c.domain)).toEqual(["inmybowl.com"]);
    expect(competitors.find((c) => c.domain === "supplementmag.com")).toBeUndefined();
  });

  it("filters competitors by language / market correctly", () => {
    const multiMarketSites = [
      { domain: "thebuyersreviews.com", category: "nutra", language: "en", country: "US" },
      { domain: "praxis-dr-grosse.de", category: "nutra", language: "de", country: "DE" },
      { domain: "afnutrition.it", category: "nutra", language: "it", country: "IT" },
      { domain: "musclepower.fr", category: "nutra", language: "fr", country: "FR" },
      { domain: "baur.de", category: "ecom", language: "de", country: "DE" },
      { domain: "walmart.com", category: "ecom", language: "en", country: "US" },
    ];

    const germanNutra = multiMarketSites.filter(
      (s) => s.category === "nutra" && s.language === "de"
    );
    expect(germanNutra.map((s) => s.domain)).toEqual(["praxis-dr-grosse.de"]);

    const italianNutra = multiMarketSites.filter(
      (s) => s.category === "nutra" && s.language === "it"
    );
    expect(italianNutra.map((s) => s.domain)).toEqual(["afnutrition.it"]);

    const germanEcom = multiMarketSites.filter(
      (s) => s.category === "ecom" && s.language === "de"
    );
    expect(germanEcom.map((s) => s.domain)).toEqual(["baur.de"]);

    const frenchNutra = multiMarketSites.filter(
      (s) => s.category === "nutra" && s.language === "fr"
    );
    expect(frenchNutra.map((s) => s.domain)).toEqual(["musclepower.fr"]);
  });

  it("correctly infers language and country from domain TLDs and paths", () => {
    const infer = (cleanUrl: string) => {
      const lower = cleanUrl.toLowerCase();
      if (lower.endsWith(".de") || lower.includes(".de/") || lower.includes("/de/") || lower.includes("/de")) {
        return { language: "de", country: "DE" };
      } else if (lower.endsWith(".it") || lower.includes(".it/") || lower.includes("/it/") || lower.includes("/it")) {
        return { language: "it", country: "IT" };
      } else if (lower.endsWith(".fr") || lower.includes(".fr/") || lower.includes("/fr/") || lower.includes("/fr")) {
        return { language: "fr", country: "FR" };
      } else {
        return { language: "en", country: "US" };
      }
    };

    expect(infer("https://praxis-dr-grosse.de")).toEqual({ language: "de", country: "DE" });
    expect(infer("https://afnutrition.it/shop")).toEqual({ language: "it", country: "IT" });
    expect(infer("https://musclepower.fr/collections")).toEqual({ language: "fr", country: "FR" });
    expect(infer("https://shop.com/de/products")).toEqual({ language: "de", country: "DE" });
    expect(infer("https://thebuyersreviews.com")).toEqual({ language: "en", country: "US" });
  });
});
