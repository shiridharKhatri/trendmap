import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Scan } from "@/lib/models/Scan";
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
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const skip = (page - 1) * limit;

    const [scans, total] = await Promise.all([
      Scan.find({ websiteId: id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Scan.countDocuments({ websiteId: id }),
    ]);

    return NextResponse.json({ scans, total, page, limit });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
