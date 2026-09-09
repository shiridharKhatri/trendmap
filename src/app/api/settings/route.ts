import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Settings } from "@/lib/models/Settings";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { getCronSecret } from "@/lib/security/env";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    let settings = await Settings.findOne({ userId: session.userId });
    if (!settings) {
      settings = await Settings.create({
        userId: session.userId,
        defaultScanFrequency: "24h",
        ignoredQueryParams: [
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_term",
          "utm_content",
          "fbclid",
          "gclid",
          "msclkid",
          "ref",
          "mc_cid",
          "mc_eid",
        ],
        maxConcurrentScans: 3,
        requestTimeoutMs: 15000,
        maxRetries: 3,
        cronSecret: getCronSecret(),
      });
    }

    const websites = await Website.find({ userId: session.userId }, { _id: 1, name: 1, domain: 1, isPrimary: true }).lean();

    return NextResponse.json({ settings, websites });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await connectToDatabase();

    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    let settings = await Settings.findOne({ userId: session.userId });
    if (!settings) {
      settings = new Settings({ userId: session.userId });
    }

    if (body.defaultScanFrequency) {
      settings.defaultScanFrequency = body.defaultScanFrequency;
    }
    if (body.ignoredQueryParams && Array.isArray(body.ignoredQueryParams)) {
      settings.ignoredQueryParams = body.ignoredQueryParams.map((p: string) => p.trim()).filter(Boolean);
    }
    if (body.maxConcurrentScans) {
      settings.maxConcurrentScans = Math.max(1, Math.min(10, parseInt(body.maxConcurrentScans, 10)));
    }
    if (body.requestTimeoutMs) {
      settings.requestTimeoutMs = Math.max(3000, Math.min(60000, parseInt(body.requestTimeoutMs, 10)));
    }
    if (body.maxRetries !== undefined) {
      settings.maxRetries = Math.max(0, Math.min(5, parseInt(body.maxRetries, 10)));
    }

    // Handle primary website change if passed
    if (body.primaryWebsiteId !== undefined) {
      settings.primaryWebsiteId = body.primaryWebsiteId || undefined;

      // Update isPrimary in Website collection
      await Website.updateMany({ userId: session.userId }, { $set: { isPrimary: false } });
      if (body.primaryWebsiteId) {
        await Website.updateOne({ _id: body.primaryWebsiteId, userId: session.userId }, { $set: { isPrimary: true } });
      }
    }

    await settings.save();

    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
