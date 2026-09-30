import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Settings } from "@/lib/models/Settings";
import { Website } from "@/lib/models/Website";
import { PageChange } from "@/lib/models/PageChange";
import { ProductTrend } from "@/lib/models/ProductTrend";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { cleanProductSearchKeyword } from "@/lib/trends/constants";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const settings = await Settings.findOne({ userId: session.userId });
    if (!settings || !settings.articleManagementWebhookUrl) {
      return NextResponse.json(
        {
          error: "Article Management Webhook URL is not configured. Please enter your Webhook URL in Settings.",
          needsConfiguration: true,
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Build common headers for Article Management request
    const destinationHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "TrendMap-Integration/1.0",
    };

    if (settings.articleManagementApiKey) {
      destinationHeaders["Authorization"] = `Bearer ${settings.articleManagementApiKey}`;
      destinationHeaders["x-api-key"] = settings.articleManagementApiKey;
    }

    // 1. Handle Ping / Connection Test
    if (body.action === "test") {
      try {
        const testPayload = {
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

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const testRes = await fetch(settings.articleManagementWebhookUrl, {
          method: "POST",
          headers: destinationHeaders,
          body: JSON.stringify(testPayload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!testRes.ok) {
          const errText = await testRes.text().catch(() => "");
          return NextResponse.json(
            {
              success: false,
              error: `Webhook returned HTTP ${testRes.status}: ${errText.slice(0, 200) || "Unknown error"}`,
            },
            { status: 400 }
          );
        }

        return NextResponse.json({
          success: true,
          message: `Successfully connected to Article Management (HTTP ${testRes.status})`,
        });
      } catch (err: any) {
        return NextResponse.json(
          {
            success: false,
            error: `Failed to reach Article Management webhook: ${err.message}`,
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

    // Build payload to send to Article Management
    const productsPayload = changes.map((c) => {
      const site = websiteMap.get(String(c.websiteId));
      const keyword = cleanProductSearchKeyword(c.productSlug || c.normalizedUrl).toLowerCase().trim();
      const pt = trendMap.get(keyword);

      const title = (c.productSlug || "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      return {
        id: String(c._id),
        productSlug: c.productSlug || "",
        productTitle: title || c.normalizedUrl,
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

    const exportPayload = {
      event: "missing_products_export",
      source: "trendmap",
      exportedAt: new Date().toISOString(),
      user: {
        id: String(session.userId),
        email: session.email,
        name: session.name,
      },
      totalProducts: productsPayload.length,
      products: productsPayload,
    };

    // Send payload to Article Management
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const destinationRes = await fetch(settings.articleManagementWebhookUrl, {
      method: "POST",
      headers: destinationHeaders,
      body: JSON.stringify(exportPayload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!destinationRes.ok) {
      const errText = await destinationRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Article Management rejected the payload with HTTP ${destinationRes.status}: ${errText.slice(0, 200)}`,
        },
        { status: 502 }
      );
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
