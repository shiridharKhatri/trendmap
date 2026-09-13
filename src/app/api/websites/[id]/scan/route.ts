import { NextRequest, NextResponse, after } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Website } from "@/lib/models/Website";
import { getAuthenticatedUser } from "@/lib/security/auth";
import { executeWebsiteScan } from "@/lib/scanner/scanEngine";

export async function POST(
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

    const searchParams = req.nextUrl.searchParams;
    const force = searchParams.get("force") === "true";
    const sync = searchParams.get("sync") === "true";
    const isStale =
      !website.lockAcquiredAt ||
      Date.now() - new Date(website.lockAcquiredAt).getTime() > 5 * 60 * 1000;

    if (website.isScanning && !force && !isStale) {
      return NextResponse.json(
        { error: "A scan is already in progress for this website. If it has been running for over 5 minutes, you can retry or force rescan." },
        { status: 409 }
      );
    }

    // Synchronous mode (if explicitly requested by caller)
    if (sync) {
      const result = await executeWebsiteScan(id, force);
      return NextResponse.json({
        success: result.success,
        result,
      });
    }

    // Asynchronous background scan (Default):
    // Pre-mark website as scanning immediately so client polling catches it with zero delay
    await Website.updateOne(
      { _id: id },
      {
        $set: {
          isScanning: true,
          lockAcquiredAt: new Date(),
          lastScanStatus: "scanning",
        },
      }
    );

    // Launch background promise
    const scanPromise = executeWebsiteScan(id, true).catch((err) => {
      console.error(`[BackgroundScan] Error scanning ${website.domain} (${id}):`, err);
    });

    // Ensure runtime keeps promise alive even if HTTP connection is terminated
    after(async () => {
      try {
        await scanPromise;
      } catch (err) {
        console.error(`[BackgroundScan after] Error scanning ${website.domain}:`, err);
      }
    });

    return NextResponse.json(
      {
        success: true,
        isScanning: true,
        message: `Background scan started for ${website.domain}`,
        websiteId: id,
        domain: website.domain,
        name: website.name,
        isPrimary: website.isPrimary,
      },
      { status: 202 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
