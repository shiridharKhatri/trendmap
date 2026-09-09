import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Page } from "@/lib/models/Page";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const website = await Website.findOne({ _id: id, userId: session.userId });
    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const search = url.searchParams.get("search") || "";
    const activeOnly = url.searchParams.get("active") === "true";
    const sortBy = url.searchParams.get("sortBy") || "lastSeenAt";
    const sortOrder = url.searchParams.get("sortOrder") === "asc" ? 1 : -1;

    const query: any = { websiteId: id };
    if (activeOnly) {
      query.isActive = true;
    }
    if (search.trim()) {
      query.normalizedUrl = { $regex: search.trim(), $options: "i" };
    }

    const skip = (page - 1) * limit;

    const [pages, total] = await Promise.all([
      Page.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Page.countDocuments(query),
    ]);

    return NextResponse.json({ pages, total, page, limit });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
