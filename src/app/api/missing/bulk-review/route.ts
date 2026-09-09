import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PageChange } from "@/lib/models/PageChange";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const { ids, isReviewed = true } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Array of IDs is required" }, { status: 400 });
    }

    // Get user's websites to ensure tenant isolation
    const userWebsites = await Website.find({ userId: session.userId }, { _id: 1 });
    const userWebsiteIds = userWebsites.map((w) => w._id);

    const updateRes = await PageChange.updateMany(
      { _id: { $in: ids }, websiteId: { $in: userWebsiteIds } },
      { $set: { isReviewed: Boolean(isReviewed) } }
    );

    return NextResponse.json({
      success: true,
      modifiedCount: updateRes.modifiedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
