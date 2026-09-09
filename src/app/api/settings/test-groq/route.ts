import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/security/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const apiKey = body.apiKey?.trim() || process.env.GROQ_API_KEY;
    const model = body.model?.trim() || process.env.GROQ_MODEL || "openai/gpt-oss-20b";

    if (!apiKey) {
      return NextResponse.json({ success: false, error: "No Groq API key provided." }, { status: 400 });
    }

    const start = Date.now();
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are an e-commerce and affiliate product classifier. Output JSON: {\"results\": [{\"url\": string, \"isProduct\": boolean, \"cleanProductName\": string}]}",
          },
          {
            role: "user",
            content: "Classify this URL: https://inmybowl.com/biopeak-reviews/",
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { success: false, error: `Groq error (HTTP ${response.status}): ${errorText}` },
        { status: response.status }
      );
    }

    const json = await response.json();
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      model,
      latencyMs,
      message: `Successfully connected to Groq (${model}) in ${latencyMs}ms!`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
