import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PageChange } from "@/lib/models/PageChange";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const url = new URL(req.url);
    const websiteId = url.searchParams.get("websiteId");
    const search = url.searchParams.get("search");
    const reviewed = url.searchParams.get("reviewed");
    const priority = url.searchParams.get("priority"); // all, high, medium, low, unanalyzed
    const geo = url.searchParams.get("geo");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const sortBy = url.searchParams.get("sortBy") || "detectedAt";
    const sortOrder = url.searchParams.get("sortOrder") === "asc" ? 1 : -1;

    // Find all websites belonging to this user
    const userWebsites = await Website.find({ userId: session.userId }, { _id: 1, name: 1, domain: 1, isPrimary: 1 }).lean();
    // Only competitor websites can have missing products (baseline sites are our catalog!)
    const competitorWebsites = userWebsites.filter((w) => !w.isPrimary);
    const competitorWebsiteIds = competitorWebsites.map((w) => w._id);
    const websiteMap = new Map(userWebsites.map((w) => [String(w._id), w]));

    const query: any = {
      websiteId: websiteId
        ? competitorWebsiteIds.some((id) => String(id) === String(websiteId))
          ? websiteId
          : { $in: [] }
        : { $in: competitorWebsiteIds },
      type: "missing_from_primary",
    };

    if (reviewed === "true") {
      query.isReviewed = true;
    } else if (reviewed === "false") {
      query.isReviewed = false;
    }

    if (priority === "high" || priority === "medium" || priority === "low") {
      query.trendPriority = priority;
    } else if (priority === "unanalyzed") {
      query.trendScore = { $exists: false };
    }

    const geoFilter = url.searchParams.get("geoFilter");
    if (geoFilter && geoFilter.trim() !== "all") {
      query.trendGeo = geoFilter.trim().toUpperCase();
    }

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { normalizedUrl: { $regex: term, $options: "i" } },
        { productSlug: { $regex: term, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    // Determine sort object
    const sortObj: any = {};
    if (sortBy === "trendScore") {
      sortObj.trendScore = sortOrder;
      sortObj.detectedAt = -1;
    } else {
      sortObj[sortBy] = sortOrder;
    }

    const [changes, total, highCount, medCount, lowCount, unanalyzedCount] = await Promise.all([
      PageChange.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      PageChange.countDocuments(query),
      PageChange.countDocuments({ ...query, trendPriority: "high" }),
      PageChange.countDocuments({ ...query, trendPriority: "medium" }),
      PageChange.countDocuments({ ...query, trendPriority: "low" }),
      PageChange.countDocuments({ ...query, trendScore: { $exists: false } }),
    ]);

    // Attach website name and domain
    const enrichedChanges = changes.map((c) => {
      const site = websiteMap.get(String(c.websiteId));
      return {
        ...c,
        websiteName: site?.name || "Unknown",
        websiteDomain: site?.domain || "Unknown",
      };
    });

    return NextResponse.json({
      missingPages: enrichedChanges,
      total,
      page,
      limit,
      websites: competitorWebsites,
      priorityCounts: {
        high: highCount,
        medium: medCount,
        low: lowCount,
        unanalyzed: unanalyzedCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
