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
    const type = url.searchParams.get("type"); // added, removed, changed, missing_from_primary, or all
    const websiteId = url.searchParams.get("websiteId");
    const search = url.searchParams.get("search");
    const reviewed = url.searchParams.get("reviewed");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const sortBy = url.searchParams.get("sortBy") || "detectedAt";
    const sortOrder = url.searchParams.get("sortOrder") === "asc" ? 1 : -1;

    const userWebsites = await Website.find({ userId: session.userId }, { _id: 1, name: 1, domain: 1 }).lean();
    const userWebsiteIds = userWebsites.map((w) => w._id);
    const websiteMap = new Map(userWebsites.map((w) => [String(w._id), w]));

    const query: any = {
      websiteId: websiteId ? websiteId : { $in: userWebsiteIds },
    };

    if (type && type !== "all") {
      query.type = type;
    } else if (!type || type === "all") {
      query.type = { $in: ["added", "removed", "changed"] }; // Default changes excluding missing unless specified
    }

    if (reviewed === "true") {
      query.isReviewed = true;
    } else if (reviewed === "false") {
      query.isReviewed = false;
    }

    if (search && search.trim()) {
      query.normalizedUrl = { $regex: search.trim(), $options: "i" };
    }

    const skip = (page - 1) * limit;

    const [changes, total] = await Promise.all([
      PageChange.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      PageChange.countDocuments(query),
    ]);

    const enrichedChanges = changes.map((c) => {
      const site = websiteMap.get(String(c.websiteId));
      return {
        ...c,
        websiteName: site?.name || "Unknown",
        websiteDomain: site?.domain || "Unknown",
      };
    });

    return NextResponse.json({
      changes: enrichedChanges,
      total,
      page,
      limit,
      websites: userWebsites,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
