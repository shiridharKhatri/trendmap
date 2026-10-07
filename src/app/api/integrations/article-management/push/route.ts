import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import http from "node:http";
import { connectToDatabase } from "@/lib/db/mongodb";
import { User } from "@/lib/models/User";
import { Settings } from "@/lib/models/Settings";
import { Website } from "@/lib/models/Website";
import { PageChange } from "@/lib/models/PageChange";
import { ProductTrend } from "@/lib/models/ProductTrend";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { cleanProductSearchKeyword } from "@/lib/trends/constants";

interface PostResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  json: () => Promise<any>;
}

function sendJsonRequest(
  urlStr: string,
  data: any,
  headers: Record<string, string> = {},
  timeoutMs = 15000
): Promise<PostResponse> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const bodyStr = JSON.stringify(data);
      const transport = url.protocol === "https:" ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST",
        family: 4, // Force IPv4 to prevent macOS / undici connect timeouts
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
          ...headers,
        },
        timeout: timeoutMs,
      };

      const req = transport.request(options, (res) => {
        let chunks = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          chunks += chunk;
        });
        res.on("end", () => {
          const statusCode = res.statusCode || 500;
          resolve({
            ok: statusCode >= 200 && statusCode < 300,
            status: statusCode,
            statusText: res.statusMessage || "",
            text: async () => chunks,
            json: async () => {
              try {
                return JSON.parse(chunks);
              } catch {
                return {};
              }
            },
          });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy(new Error(`Connection to ${urlStr} timed out after ${timeoutMs}ms`));
      });

      req.write(bodyStr);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const userDoc = await User.findById(session.userId).lean();
    const username =
      userDoc?.name?.trim() ||
      session.name?.trim() ||
      (session.email ? session.email.split("@")[0] : "") ||
      "Trendmap";

    const settings = await Settings.findOne({ userId: session.userId });
    const targetUrl =
      settings?.articleManagementWebhookUrl?.trim() ||
      process.env.ARTICLE_MANAGEMENT_API_URL ||
      "";

    if (!targetUrl) {
      return NextResponse.json(
        {
          error: "Article Management API Endpoint URL is not configured. Please enter your endpoint URL in Settings.",
          needsConfiguration: true,
        },
        { status: 400 }
      );
    }

    const apiKey =
      settings?.articleManagementApiKey?.trim() ||
      process.env.ARTICLE_MANAGEMENT_API_KEY ||
      "";

    const body = await req.json().catch(() => ({}));

    // Build common headers for Article Management request
    const destinationHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "TrendMap-Integration/1.0",
    };

    if (apiKey) {
      destinationHeaders["Authorization"] = `Bearer ${apiKey}`;
      destinationHeaders["x-api-key"] = apiKey;
    }

    const isArticleflow =
      targetUrl.includes("dailyworkreport.com") ||
      targetUrl.includes("trendmap-products") ||
      targetUrl.includes("articleflow");

    // 1. Handle Ping / Connection Test
    if (body.action === "test") {
      try {
        const testPayload = isArticleflow
          ? {
              name: "Trendmap Connection Test",
              productUrl: "https://dailyworkreport.com",
              competitor: "trendmap.io",
              searchDemand: "Not analyzed",
              demandScore: null,
              demandLevel: "NOT_ANALYZED",
              category: "Supplements",
              market: "United (US)",
              modifiedDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
              discoveredDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
              researchedBy: username,
            }
          : {
              event: "test_connection",
              source: "trendmap",
              message: "Connection test from TrendMap to Article Management",
              timestamp: new Date().toISOString(),
              user: {
                id: String(session.userId),
                email: session.email,
                name: session.name,
              },
            };

        const testRes = await sendJsonRequest(targetUrl, testPayload, destinationHeaders, 10000);

        if (!testRes.ok) {
          const errText = await testRes.text().catch(() => "");
          let parsedError = "";
          try {
            const errJson = JSON.parse(errText);
            parsedError = errJson.error || errJson.message || "";
          } catch {
            parsedError = errText.slice(0, 200);
          }

          if (testRes.status === 401) {
            return NextResponse.json(
              {
                success: false,
                error: `Authentication failed (HTTP 401): Please enter a valid API Key in Settings > Article Management.`,
              },
              { status: 401 }
            );
          }

          return NextResponse.json(
            {
              success: false,
              error: `Article Management endpoint (${targetUrl}) returned HTTP ${testRes.status}: ${parsedError || testRes.statusText}`,
            },
            { status: 400 }
          );
        }

        return NextResponse.json({
          success: true,
          message: `Successfully connected to Article Management (${targetUrl})`,
        });
      } catch (err: any) {
        return NextResponse.json(
          {
            success: false,
            error: `Failed to reach Article Management endpoint (${targetUrl}): ${err.message}`,
          },
          { status: 400 }
        );
      }
    }

    // 2. Export Missing Products
    const userWebsites = await Website.find({ userId: session.userId }).lean();
    const userWebsiteIds = userWebsites.map((w) => w._id);
    const websiteMap = new Map(userWebsites.map((w) => [String(w._id), w]));

    const query: any = {
      websiteId: { $in: userWebsiteIds },
      type: "missing_from_primary",
    };

    if (body.productChangeIds && Array.isArray(body.productChangeIds) && body.productChangeIds.length > 0) {
      query._id = { $in: body.productChangeIds };
    }

    const changes = await PageChange.find(query).sort({ detectedAt: -1 }).lean();

    if (changes.length === 0) {
      return NextResponse.json(
        { error: "No missing products found matching the selection to send." },
        { status: 404 }
      );
    }

    // Query cached trends for timeline data
    const terms = changes
      .map((c) => cleanProductSearchKeyword(c.productSlug || c.normalizedUrl).toLowerCase().trim())
      .filter(Boolean);

    const trendMap = new Map<string, any>();
    if (terms.length > 0) {
      const productTrends = await ProductTrend.find({ keyword: { $in: terms } }).lean();
      productTrends.forEach((pt) => {
        trendMap.set(pt.keyword.toLowerCase(), pt);
      });
    }

    // Build payload to send to Article Management / Articleflow
    const productsPayload = changes.map((c) => {
      const site = websiteMap.get(String(c.websiteId));
      const keyword = cleanProductSearchKeyword(c.productSlug || c.normalizedUrl).toLowerCase().trim();
      const pt = trendMap.get(keyword);

      const rawSlug = c.productSlug || c.normalizedUrl.split("/").filter(Boolean).pop() || "";
      const formattedTitle = rawSlug
        .replace(/-/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      const productName = formattedTitle || c.normalizedUrl || "Product Opportunity";

      const demandLevel =
        c.trendPriority === "high"
          ? "HIGH"
          : c.trendPriority === "medium"
          ? "MODERATE"
          : c.trendPriority === "low"
          ? "LOW"
          : "NOT_ANALYZED";

      const marketName = site?.country
        ? site.country === "US"
          ? "United (US)"
          : `${site.language || "en"} (${site.country})`
        : "United (US)";

      const formattedModifiedDate = c.currentLastmod
        ? new Date(c.currentLastmod).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : null;

      const formattedDiscoveredDate = c.detectedAt
        ? new Date(c.detectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

      const categoryName = site?.category
        ? site.category.toLowerCase() === "nutra"
          ? "Supplements"
          : site.category.charAt(0).toUpperCase() + site.category.slice(1)
        : "Supplements";

      return {
        // Direct root fields matching dailyworkreport.com / Articleflow schema exactly:
        name: productName,
        productUrl: c.url,
        competitor: site?.domain || site?.name || "Competitor",
        searchDemand: typeof c.trendScore === "number" ? `${c.trendScore} / 100` : "Not analyzed",
        demandScore: typeof c.trendScore === "number" ? c.trendScore : null,
        demandLevel,
        category: categoryName,
        market: marketName,
        modifiedDate: formattedModifiedDate,
        discoveredDate: formattedDiscoveredDate,
        researchedBy: username,

        // Additional structured fields for webhook compatibility
        id: String(c._id),
        productSlug: c.productSlug || "",
        productTitle: productName,
        url: c.url,
        normalizedUrl: c.normalizedUrl,
        detectedAt: c.detectedAt,
        lastmod: c.currentLastmod || c.detectedAt,
        competitorWebsite: {
          id: site ? String(site._id) : String(c.websiteId),
          name: site?.name || "Competitor",
          domain: site?.domain || "Unknown",
          category: site?.category || "nutra",
          language: site?.language || "en",
          country: site?.country || "US",
        },
        trend: {
          score: c.trendScore ?? null,
          priority: c.trendPriority ?? "unanalyzed",
          geo: c.trendGeo || "US",
          exploreUrl: c.trendExploreUrl || "",
          timeline: pt?.timeline || [],
        },
      };
    });

    const formatItemForArticleflow = (p: (typeof productsPayload)[0]) => ({
      name: p.name,
      productUrl: p.productUrl,
      competitor: p.competitor,
      searchDemand: p.searchDemand,
      demandScore: p.demandScore,
      demandLevel: p.demandLevel,
      category: p.category,
      market: p.market,
      modifiedDate: p.modifiedDate,
      discoveredDate: p.discoveredDate,
      researchedBy: p.researchedBy,
    });

    // Check if target requires individual product POSTs (like dailyworkreport.com)
    const isSingle = productsPayload.length === 1;

    if (isSingle) {
      const singleProduct = productsPayload[0];
      const payload = isArticleflow
        ? formatItemForArticleflow(singleProduct)
        : {
            ...singleProduct,
            // Include envelope for general webhook listeners
            event: "missing_products_export",
            source: "trendmap",
            exportedAt: new Date().toISOString(),
            user: {
              id: String(session.userId),
              email: session.email,
              name: session.name,
            },
            totalProducts: 1,
            products: productsPayload,
          };

      try {
        const destinationRes = await sendJsonRequest(targetUrl, payload, destinationHeaders, 15000);

        if (!destinationRes.ok) {
          const errText = await destinationRes.text().catch(() => "");
          let parsedError = "";
          try {
            const errJson = JSON.parse(errText);
            parsedError = errJson.error || errJson.message || "";
          } catch {
            parsedError = errText.slice(0, 200);
          }

          if (destinationRes.status === 401) {
            return NextResponse.json(
              {
                error: `Unauthorized (HTTP 401): Please configure your Article Management API Key in Settings > Article Management.`,
                needsApiKey: true,
              },
              { status: 401 }
            );
          }

          return NextResponse.json(
            {
              error: `Article Management (${targetUrl}) rejected the request with HTTP ${destinationRes.status}: ${parsedError || destinationRes.statusText}`,
            },
            { status: 502 }
          );
        }
      } catch (err: any) {
        return NextResponse.json(
          {
            error: `Failed to connect to Article Management (${targetUrl}): ${err.message}`,
          },
          { status: 504 }
        );
      }
    } else {
      // Multiple products: POST each item to endpoint to support APIs that accept 1 product per request
      const results = await Promise.allSettled(
        productsPayload.map(async (p) => {
          try {
            const postBody = isArticleflow ? formatItemForArticleflow(p) : p;
            const res = await sendJsonRequest(targetUrl, postBody, destinationHeaders, 15000);
            return { ok: res.ok, status: res.status, id: p.id };
          } catch (err: any) {
            return { ok: false, status: 500, error: err.message, id: p.id };
          }
        })
      );

      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));
      if (failed.length === results.length) {
        return NextResponse.json(
          {
            error: `Failed to export products to Article Management. Endpoint returned errors.`,
          },
          { status: 502 }
        );
      }
    }

    // Mark PageChanges as exported
    const exportedIds = changes.map((c) => c._id);
    await PageChange.updateMany(
      { _id: { $in: exportedIds } },
      {
        $set: {
          exportedToArticleManagement: true,
          exportedToArticleManagementAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      exportedCount: productsPayload.length,
      message: `Successfully sent ${productsPayload.length} product${
        productsPayload.length > 1 ? "s" : ""
      } to Article Management.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Integration error: ${err.message}` },
      { status: 500 }
    );
  }
}
