import { describe, it, expect } from "vitest";

describe("Comparison & Diff Logic", () => {
  it("accurately detects newly added and removed URLs across scan runs", () => {
    const previousScanUrls = new Set([
      "https://example.com/home",
      "https://example.com/about",
      "https://example.com/old-page",
    ]);

    const currentScanUrls = new Set([
      "https://example.com/home",
      "https://example.com/about",
      "https://example.com/new-feature",
    ]);

    const added: string[] = [];
    const removed: string[] = [];

    for (const url of currentScanUrls) {
      if (!previousScanUrls.has(url)) added.push(url);
    }
    for (const url of previousScanUrls) {
      if (!currentScanUrls.has(url)) removed.push(url);
    }

    expect(added).toEqual(["https://example.com/new-feature"]);
    expect(removed).toEqual(["https://example.com/old-page"]);
  });

  it("accurately computes competitor URLs missing from primary baseline", () => {
    // Primary baseline URLs
    const primaryPaths = new Set([
      "/",
      "/pricing",
      "/features",
      "/contact",
    ]);

    // Competitor URLs
    const competitorPaths = [
      "/",
      "/pricing",
      "/blog/best-running-shoes",
      "/compare/competitor-vs-us",
    ];

    const shared: string[] = [];
    const missingFromPrimary: string[] = [];

    for (const path of competitorPaths) {
      if (primaryPaths.has(path)) {
        shared.push(path);
      } else {
        missingFromPrimary.push(path);
      }
    }

    expect(shared).toEqual(["/", "/pricing"]);
    expect(missingFromPrimary).toEqual([
      "/blog/best-running-shoes",
      "/compare/competitor-vs-us",
    ]);
  });
});
