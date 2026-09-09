import { NextRequest, NextResponse } from "next/server";
import { discoverSitemaps } from "@/lib/sitemap/discover";
import { isValidHttpUrl } from "@/lib/sitemap/normalizer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = `https://${cleanUrl}`;
    }

    if (!isValidHttpUrl(cleanUrl)) {
      return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
    }

    const result = await discoverSitemaps(cleanUrl);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to discover sitemaps" },
      { status: 500 }
    );
  }
}
