import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PageChange } from "@/lib/models/PageChange";
import { Scan } from "@/lib/models/Scan";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { generateCsv } from "@/lib/utils/csv";
import { cleanProductSearchKeyword, buildGoogleTrendsUrl, isNonProduct } from "@/lib/trends/constants";
import { extractProductSlug } from "@/lib/comparison/productMatcher";
import { isInformationalArticle } from "@/lib/sitemap/normalizer";
import { getComparisonData } from "@/lib/comparison/comparisonService";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const url = new URL(req.url);
    const exportType = url.searchParams.get("type") || "missing";
    const websiteId = url.searchParams.get("websiteId");
    const geo = url.searchParams.get("geo") || "";

    const userWebsites = await Website.find({ userId: session.userId }, { _id: 1, name: 1, domain: 1 }).lean();
    const userWebsiteIds = userWebsites.map((w) => w._id);
    const websiteMap = new Map(userWebsites.map((w) => [String(w._id), w]));

    const targetWebsiteIds = (!websiteId || websiteId === "all")
      ? userWebsiteIds
      : websiteId.split(",").map((s) => s.trim()).filter(Boolean);

    let csvContent = "";
    let filename = `export-${exportType}-${new Date().toISOString().split("T")[0]}.csv`;

    if (exportType === "missing") {
      const records = await PageChange.find({
        websiteId: { $in: targetWebsiteIds },
        type: "missing_from_primary",
      })
        .sort({ detectedAt: -1 })
        .limit(15000)
        .lean();

      // Deduplicate duplicate products across competitors
      const dedupMap = new Map<string, any>();
      for (const r of records) {
        // Skip informational guides, medical Q&A, and blog articles
        if (
          isInformationalArticle(r.productSlug || "") ||
          isInformationalArticle(r.normalizedUrl || r.url || "")
        ) {
          continue;
        }

        const slug = r.productSlug || extractProductSlug(r.normalizedUrl || r.url);
        let key = "";
        if (slug && slug.length >= 3) {
          key = cleanProductSearchKeyword(slug).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
        }
        if (!key) {
          key = (r.normalizedUrl || r.url).toLowerCase().trim();
        }

        const domain = websiteMap.get(String(r.websiteId))?.domain || "Unknown";
        if (!dedupMap.has(key)) {
          dedupMap.set(key, {
            ...r,
            competitorDomains: [domain],
          });
        } else {
          const existing = dedupMap.get(key);
          if (!existing.competitorDomains.includes(domain)) {
            existing.competitorDomains.push(domain);
          }
          // Preserve higher trend score if one exists
          if (r.trendScore !== undefined && (existing.trendScore === undefined || r.trendScore > existing.trendScore)) {
            existing.trendScore = r.trendScore;
            existing.trendPriority = r.trendPriority;
          }
        }
      }

      const deduplicatedRecords = Array.from(dedupMap.values());

      const headers = [
        { key: "productName", label: "Product Name" },
        { key: "url", label: "Product URL" },
        { key: "trendPriority", label: "Priority Level" },
      ];

      const rows = deduplicatedRecords
        .filter((r) => !isNonProduct(r.productSlug || r.normalizedUrl || r.url))
        .map((r) => {
          const productName = cleanProductSearchKeyword(r.productSlug || r.normalizedUrl || r.url);
          return {
            productName,
            url: r.url,
            trendPriority: r.trendPriority
              ? `${r.trendPriority.toUpperCase()} DEMAND`
              : "UNRANKED",
          };
        })
        .filter((r) => r.productName);

      csvContent = generateCsv(headers, rows);
    } else if (exportType === "changes") {
      const records = await PageChange.find({
        websiteId: { $in: targetWebsiteIds },
        type: { $in: ["added", "removed", "changed"] },
      })
        .sort({ detectedAt: -1 })
        .limit(10000)
        .lean();

      const headers = [
        { key: "url", label: "URL" },
        { key: "websiteDomain", label: "Website" },
        { key: "type", label: "Change Type" },
        { key: "detectedAt", label: "Detected At" },
        { key: "isReviewed", label: "Reviewed" },
      ];

      const rows = records.map((r) => ({
        url: r.url,
        websiteDomain: websiteMap.get(String(r.websiteId))?.domain || "Unknown",
        type: r.type,
        detectedAt: r.detectedAt ? new Date(r.detectedAt).toISOString() : "",
        isReviewed: r.isReviewed ? "Yes" : "No",
      }));

      csvContent = generateCsv(headers, rows);
    } else if (exportType === "scans") {
      const records = await Scan.find({
        websiteId: { $in: targetWebsiteIds },
      })
        .sort({ createdAt: -1 })
        .limit(5000)
        .lean();

      const headers = [
        { key: "websiteDomain", label: "Website" },
        { key: "status", label: "Status" },
        { key: "startedAt", label: "Started At" },
        { key: "durationMs", label: "Duration (ms)" },
        { key: "totalUrls", label: "Total URLs" },
        { key: "newUrls", label: "New URLs" },
        { key: "removedUrls", label: "Removed URLs" },
        { key: "missingFromPrimaryCount", label: "Missing From Primary" },
        { key: "errorCount", label: "Errors" },
      ];

      const rows = records.map((r) => ({
        websiteDomain: websiteMap.get(String(r.websiteId))?.domain || "Unknown",
        status: r.status,
        startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : "",
        durationMs: r.durationMs || 0,
        totalUrls: r.totalUrls || 0,
        newUrls: r.newUrls || 0,
        removedUrls: r.removedUrls || 0,
        missingFromPrimaryCount: r.missingFromPrimaryCount || 0,
        errorCount: r.errorCount || 0,
      }));

      csvContent = generateCsv(headers, rows);
    } else if (exportType === "comparison") {
      const dataset = url.searchParams.get("dataset") || "missing";
      const baselineId = url.searchParams.get("baselineId");
      const monitoredId = url.searchParams.get("websiteId") || url.searchParams.get("monitoredId");
      const categoryMode = url.searchParams.get("categoryMode") || "all";
      const baselineCategory = url.searchParams.get("baselineCategory");
      const monitoredCategory = url.searchParams.get("monitoredCategory");

      const comparison = await getComparisonData({
        userId: session.userId,
        baselineId,
        monitoredId,
        baselineCategory,
        monitoredCategory,
        categoryMode,
      });

      const selectedDatasets = new Set(
        dataset
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      );
      const isAll = selectedDatasets.has("all") || selectedDatasets.size === 0;

      const categorySlug = categoryMode && categoryMode !== "all" ? `${categoryMode}-` : "";
      filename = `comparison-${categorySlug}${selectedDatasets.has("all") ? "full-report" : Array.from(selectedDatasets).join("-")}-${new Date().toISOString().split("T")[0]}.csv`;

      // Helper map for domain -> Category
      const siteCategoryMap = new Map<string, string>();
      comparison.baselineWebsites.forEach((w) =>
        siteCategoryMap.set(w.domain, w.category === "ecom" ? "E-commerce" : "Nutra")
      );
      comparison.monitoredWebsites.forEach((w) =>
        siteCategoryMap.set(w.domain, w.category === "ecom" ? "E-commerce" : "Nutra")
      );

      const modeLabel =
        categoryMode === "nutra-nutra"
          ? "Nutra vs Nutra"
          : categoryMode === "ecom-ecom"
            ? "Ecom vs Ecom"
            : categoryMode === "ecom-nutra"
              ? "Ecom vs Nutra"
              : categoryMode === "nutra-ecom"
                ? "Nutra vs Ecom"
                : "All Categories";

      const getSiteCats = (domains?: string[]) => {
        if (!domains || domains.length === 0) return "-";
        return domains.map((d) => siteCategoryMap.get(d) || "Nutra").join(", ");
      };

      // Single dataset specialized layouts
      if (!isAll && selectedDatasets.size === 1) {
        const singleType = Array.from(selectedDatasets)[0];

        if (singleType === "missing") {
          const headers = [
            { key: "productName", label: "Product Name" },
            { key: "categoryMode", label: "Comparison Mode" },
            { key: "competitorCategory", label: "Competitor Category" },
            { key: "competitorDomains", label: "Found On Competitor(s)" },
            { key: "url", label: "Product URL" },
            { key: "competitorUrls", label: "All Competitor URLs" },
            { key: "lastmod", label: "Last Modified" },
            { key: "status", label: "Comparison Status" },
          ];
          const rows = comparison.missingFromBaseline.map((p) => {
            const compDoms = p.competitorDomains || (p.competitorDomain ? [p.competitorDomain] : []);
            return {
              productName: cleanProductSearchKeyword(p.productSlug || p.normalizedUrl),
              categoryMode: modeLabel,
              competitorCategory: getSiteCats(compDoms),
              url: p.originalUrl || p.normalizedUrl,
              competitorDomains: compDoms.join(", ") || "",
              competitorUrls: p.competitorUrls?.join(" ; ") || p.normalizedUrl,
              lastmod: p.lastmod ? new Date(p.lastmod).toISOString().split("T")[0] : "",
              status: "Missing from Baseline",
            };
          });
          csvContent = generateCsv(headers, rows);
        } else if (singleType === "shared") {
          const headers = [
            { key: "productName", label: "Product Name" },
            { key: "categoryMode", label: "Comparison Mode" },
            { key: "competitorCategory", label: "Competitor Category" },
            { key: "baselineCategory", label: "Baseline Category" },
            { key: "url", label: "Competitor URL" },
            { key: "competitorDomain", label: "Competitor Domain" },
            { key: "matchedBaselineDomains", label: "Matched Baseline Site(s)" },
            { key: "matchedBaselineUrls", label: "Matched Baseline URL(s)" },
            { key: "matchType", label: "Match Type" },
            { key: "similarityScore", label: "Similarity Score" },
            { key: "lastmod", label: "Last Modified" },
          ];
          const rows = comparison.shared.map((p) => {
            const compDoms = p.competitorDomains || (p.competitorDomain ? [p.competitorDomain] : []);
            const baseDoms = p.matchedDomains || (p.matchedDomain ? [p.matchedDomain] : []);
            return {
              productName: cleanProductSearchKeyword(p.productSlug || p.normalizedUrl),
              categoryMode: modeLabel,
              competitorCategory: getSiteCats(compDoms),
              baselineCategory: getSiteCats(baseDoms),
              url: p.originalUrl || p.normalizedUrl,
              competitorDomain: compDoms.join(", ") || "",
              matchedBaselineDomains: baseDoms.join(", ") || "",
              matchedBaselineUrls: p.matchedUrls?.join(" ; ") || p.matchedUrl || "",
              matchType: p.matchType || "exact_path",
              similarityScore: p.similarityScore ? `${Math.round(p.similarityScore * 100)}%` : "100%",
              lastmod: p.lastmod ? new Date(p.lastmod).toISOString().split("T")[0] : "",
            };
          });
          csvContent = generateCsv(headers, rows);
        } else if (singleType === "merged_duplicates" || singleType === "duplicates") {
          const headers = [
            { key: "productName", label: "Product Name" },
            { key: "categoryMode", label: "Comparison Mode" },
            { key: "competitorCategory", label: "Competitor Category" },
            { key: "url", label: "Canonical URL" },
            { key: "competitorDomains", label: "Sold Across Competitors" },
            { key: "duplicateCount", label: "Store Count" },
            { key: "allCompetitorUrls", label: "All Competitor URLs" },
            { key: "inBaseline", label: "Available in Baseline?" },
            { key: "matchedBaselineDomains", label: "Matched Baseline Store(s)" },
            { key: "lastmod", label: "Last Modified" },
          ];
          const rows = comparison.mergedDuplicates.map((p) => {
            const compDoms = p.competitorDomains || (p.competitorDomain ? [p.competitorDomain] : []);
            const baseDoms = p.matchedDomains || (p.matchedDomain ? [p.matchedDomain] : []);
            return {
              productName: cleanProductSearchKeyword(p.productSlug || p.normalizedUrl),
              categoryMode: modeLabel,
              competitorCategory: getSiteCats(compDoms),
              url: p.originalUrl || p.normalizedUrl,
              competitorDomains: compDoms.join(", "),
              duplicateCount: compDoms.length || p.duplicateCount || 2,
              allCompetitorUrls: p.competitorUrls?.join(" ; ") || p.normalizedUrl,
              inBaseline: p.isMatchedWithBaseline ? "Yes" : "No (Missing from Baseline)",
              matchedBaselineDomains: baseDoms.join(", ") || "None",
              lastmod: p.lastmod ? new Date(p.lastmod).toISOString().split("T")[0] : "",
            };
          });
          csvContent = generateCsv(headers, rows);
        } else if (singleType === "only_primary" || singleType === "baseline_only") {
          const headers = [
            { key: "productName", label: "Product Name" },
            { key: "categoryMode", label: "Comparison Mode" },
            { key: "baselineCategory", label: "Baseline Category" },
            { key: "domain", label: "Baseline Store" },
            { key: "url", label: "Baseline URL" },
            { key: "lastmod", label: "Last Modified" },
            { key: "status", label: "Status" },
          ];
          const rows = comparison.onlyPrimary.map((p) => ({
            productName: cleanProductSearchKeyword(p.productSlug || p.normalizedUrl),
            categoryMode: modeLabel,
            baselineCategory: siteCategoryMap.get(p.domain) || "Nutra",
            domain: p.domain || "Baseline",
            url: p.originalUrl || p.normalizedUrl,
            lastmod: p.lastmod ? new Date(p.lastmod).toISOString().split("T")[0] : "",
            status: "Only on Baseline",
          }));
          csvContent = generateCsv(headers, rows);
        }
      }

      // If multiple datasets or "all" selected: combined master report
      if (!csvContent) {
        const headers = [
          { key: "productName", label: "Product Name" },
          { key: "datasetType", label: "Dataset Section" },
          { key: "categoryMode", label: "Comparison Mode" },
          { key: "baselineCategory", label: "Baseline Category" },
          { key: "competitorCategory", label: "Competitor Category" },
          { key: "comparisonStatus", label: "Comparison Status" },
          { key: "competitorDomains", label: "Competitor Domain(s)" },
          { key: "url", label: "Primary URL" },
          { key: "allCompetitorUrls", label: "All Competitor URLs" },
          { key: "matchedBaselineDomains", label: "Matched Baseline Site(s)" },
          { key: "matchedBaselineUrls", label: "Matched Baseline URL(s)" },
          { key: "lastmod", label: "Last Modified" },
        ];

        const rows: any[] = [];

        if (isAll || selectedDatasets.has("missing")) {
          for (const p of comparison.missingFromBaseline) {
            const compDoms = p.competitorDomains || (p.competitorDomain ? [p.competitorDomain] : []);
            rows.push({
              productName: cleanProductSearchKeyword(p.productSlug || p.normalizedUrl),
              datasetType: "Missing from Baseline",
              categoryMode: modeLabel,
              baselineCategory: "-",
              competitorCategory: getSiteCats(compDoms),
              comparisonStatus: "Content Gap (Missing across all baseline stores)",
              competitorDomains: compDoms.join(", ") || "",
              url: p.originalUrl || p.normalizedUrl,
              allCompetitorUrls: p.competitorUrls?.join(" ; ") || p.normalizedUrl,
              matchedBaselineDomains: "-",
              matchedBaselineUrls: "-",
              lastmod: p.lastmod ? new Date(p.lastmod).toISOString().split("T")[0] : "",
            });
          }
        }

        if (isAll || selectedDatasets.has("shared")) {
          for (const p of comparison.shared) {
            const compDoms = p.competitorDomains || (p.competitorDomain ? [p.competitorDomain] : []);
            const baseDoms = p.matchedDomains || (p.matchedDomain ? [p.matchedDomain] : []);
            rows.push({
              productName: cleanProductSearchKeyword(p.productSlug || p.normalizedUrl),
              datasetType: "Shared Products",
              categoryMode: modeLabel,
              baselineCategory: getSiteCats(baseDoms),
              competitorCategory: getSiteCats(compDoms),
              comparisonStatus: "Matched in Baseline",
              competitorDomains: compDoms.join(", ") || "",
              url: p.originalUrl || p.normalizedUrl,
              allCompetitorUrls: p.competitorUrls?.join(" ; ") || p.normalizedUrl,
              matchedBaselineDomains: baseDoms.join(", ") || "",
              matchedBaselineUrls: p.matchedUrls?.join(" ; ") || p.matchedUrl || "",
              lastmod: p.lastmod ? new Date(p.lastmod).toISOString().split("T")[0] : "",
            });
          }
        }

        if (isAll || selectedDatasets.has("merged_duplicates") || selectedDatasets.has("duplicates")) {
          for (const p of comparison.mergedDuplicates) {
            const compDoms = p.competitorDomains || (p.competitorDomain ? [p.competitorDomain] : []);
            const baseDoms = p.matchedDomains || (p.matchedDomain ? [p.matchedDomain] : []);
            rows.push({
              productName: cleanProductSearchKeyword(p.productSlug || p.normalizedUrl),
              datasetType: "Cross-Competitor Duplicates",
              categoryMode: modeLabel,
              baselineCategory: getSiteCats(baseDoms),
              competitorCategory: getSiteCats(compDoms),
              comparisonStatus: `Merged from ${compDoms.length || p.duplicateCount || 2} Competitors (${p.isMatchedWithBaseline ? "Present in Baseline" : "Missing from Baseline"})`,
              competitorDomains: compDoms.join(", ") || "",
              url: p.originalUrl || p.normalizedUrl,
              allCompetitorUrls: p.competitorUrls?.join(" ; ") || p.normalizedUrl,
              matchedBaselineDomains: baseDoms.join(", ") || "-",
              matchedBaselineUrls: p.matchedUrls?.join(" ; ") || p.matchedUrl || "-",
              lastmod: p.lastmod ? new Date(p.lastmod).toISOString().split("T")[0] : "",
            });
          }
        }

        if (isAll || selectedDatasets.has("only_primary") || selectedDatasets.has("baseline_only")) {
          for (const p of comparison.onlyPrimary) {
            const baseCat = siteCategoryMap.get(p.domain) || "Nutra";
            rows.push({
              productName: cleanProductSearchKeyword(p.productSlug || p.normalizedUrl),
              datasetType: "Only on Baseline",
              categoryMode: modeLabel,
              baselineCategory: baseCat,
              competitorCategory: "-",
              comparisonStatus: "Unique to Baseline Store",
              competitorDomains: "-",
              url: p.originalUrl || p.normalizedUrl,
              allCompetitorUrls: "-",
              matchedBaselineDomains: p.domain || "Baseline",
              matchedBaselineUrls: p.normalizedUrl,
              lastmod: p.lastmod ? new Date(p.lastmod).toISOString().split("T")[0] : "",
            });
          }
        }

        csvContent = generateCsv(headers, rows);
      }
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
