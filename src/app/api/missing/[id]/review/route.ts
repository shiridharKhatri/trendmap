import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PageChange } from "@/lib/models/PageChange";
import { Page } from "@/lib/models/Page";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";

export async function PATCH(
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

    const body = await req.json();
    const isReviewed = body.isReviewed !== undefined ? Boolean(body.isReviewed) : true;

    const pageChange = await PageChange.findById(id);
    if (!pageChange) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Verify ownership
    const website = await Website.findOne({ _id: pageChange.websiteId, userId: session.userId });
    if (!website) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    pageChange.isReviewed = isReviewed;
    await pageChange.save();

    // Also update corresponding Page record if present
    await Page.updateOne(
      { websiteId: pageChange.websiteId, normalizedUrl: pageChange.normalizedUrl },
      { $set: { isReviewed } }
    );

    return NextResponse.json({ success: true, pageChange });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
