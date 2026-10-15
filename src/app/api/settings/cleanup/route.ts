import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
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

    const competitorWebsites = await Website.find(
      { userId: session.userId, isPrimary: { $ne: true } },
      { _id: 1 }
    ).lean();
    const competitorIds = competitorWebsites
      .map((w) => {
        try {
          return new mongoose.Types.ObjectId(String(w._id));
        } catch {
          return null;
        }
      })
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));

    const [exportedCount, totalMissingCount] = await Promise.all([
      PageChange.countDocuments({
        websiteId: { $in: competitorIds },
        exportedToArticleManagement: true,
      }),
      PageChange.countDocuments({
        websiteId: { $in: competitorIds },
        type: "missing_from_primary",
      }),
    ]);

    return NextResponse.json({
      exportedCount,
      totalMissingCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action; // "delete-exported" | "reset-exported" | "wipe-missing"

    const competitorWebsites = await Website.find(
      { userId: session.userId, isPrimary: { $ne: true } },
      { _id: 1 }
    ).lean();
    const competitorIds = competitorWebsites
      .map((w) => {
        try {
          return new mongoose.Types.ObjectId(String(w._id));
        } catch {
          return null;
        }
      })
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));

    if (action === "delete-exported") {
      const result = await PageChange.deleteMany({
        websiteId: { $in: competitorIds },
        exportedToArticleManagement: true,
      });

      return NextResponse.json({
        success: true,
        count: result.deletedCount,
        message: `Successfully deleted ${result.deletedCount} exported product(s) from database.`,
      });
    }

    if (action === "reset-exported") {
      const result = await PageChange.updateMany(
        {
          websiteId: { $in: competitorIds },
          exportedToArticleManagement: true,
        },
        {
          $set: { exportedToArticleManagement: false },
          $unset: { exportedToArticleManagementAt: 1 },
        }
      );

      return NextResponse.json({
        success: true,
        count: result.modifiedCount,
        message: `Successfully reset sent status for ${result.modifiedCount} product(s).`,
      });
    }

    if (action === "wipe-missing") {
      const result = await PageChange.deleteMany({
        websiteId: { $in: competitorIds },
        type: "missing_from_primary",
      });

      return NextResponse.json({
        success: true,
        count: result.deletedCount,
        message: `Successfully removed ${result.deletedCount} missing product records from database.`,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Supported: delete-exported, reset-exported, wipe-missing" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
