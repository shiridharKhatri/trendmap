import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Scan } from "@/lib/models/Scan";
import { Website } from "@/lib/models/Website";
import { Sitemap } from "@/lib/models/Sitemap";
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

    const scan = await Scan.findById(id).lean();
    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    const website = await Website.findOne({ _id: scan.websiteId, userId: session.userId }).lean();
    if (!website) {
      return NextResponse.json({ error: "Unauthorized access to scan" }, { status: 403 });
    }

    const sitemaps = await Sitemap.find({ websiteId: website._id }).lean();

    return NextResponse.json({ scan, website, sitemaps });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
