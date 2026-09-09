import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PageChange } from "@/lib/models/PageChange";
import { Scan } from "@/lib/models/Scan";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { generateCsv } from "@/lib/utils/csv";
import { cleanProductSearchKeyword, buildGoogleTrendsUrl } from "@/lib/trends/constants";
import { extractProductSlug } from "@/lib/comparison/productMatcher";
import { isInformationalArticle } from "@/lib/sitemap/normalizer";

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

      const rows = deduplicatedRecords.map((r) => {
        const productName = cleanProductSearchKeyword(r.productSlug || r.normalizedUrl || r.url);
        return {
          productName,
          url: r.url,
          trendPriority: r.trendPriority
            ? `${r.trendPriority.toUpperCase()} DEMAND`
            : "UNRANKED",
        };
      });

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
