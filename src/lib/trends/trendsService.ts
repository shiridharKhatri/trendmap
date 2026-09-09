/**
 * Google Trends Intelligence Service
 * Fetches, caches, and calculates search interest scores (0-100) and priority levels (High/Medium/Low)
 * for e-commerce products globally or within a selected country.
 */

import { ProductTrend, type IProductTrendDocument } from "../models/ProductTrend";
import { extractProductSlug } from "../comparison/productMatcher";

import { SUPPORTED_GEOS, type TrendPriority } from "./constants";
export { SUPPORTED_GEOS, type TrendPriority };

export interface TrendAnalysisResult {
  keyword: string;
  geo: string;
  timeframe: string;
  score: number;
  priority: TrendPriority;
  source: "google_trends" | "serpapi" | "estimated";
  exploreUrl: string;
  timeline: { date: string; value: number }[];
  cached: boolean;
}

const NOISE_SUFFIX_TOKENS = new Set([
  "reviews",
  "review",
  "ratings",
  "rating",
  "tested",
  "complaints",
  "scam",
  "legit",
  "update",
  "updated",
  "worth",
  "cost",
  "price",
  "results",
  "safe",
  "buy",
  "shop",
  "online",
  "cheap",
]);

/**
 * Converts a product URL or slug into a clean, true product keyword phrase.
 * Strips affiliate and review noise: "reviews", "review", "ratings", "2026", etc.
 * Example: "nativepath-collagen-peptides-reviews-2026" -> "Nativepath Collagen Peptides"
 */
export function formatKeywordFromSlug(urlOrSlug: string): string {
  if (!urlOrSlug) return "";

  let raw = urlOrSlug.trim();

  // Extract clean product slug (strips directory prefixes, extensions, leading/trailing database IDs)
  const slug = extractProductSlug(raw);
  if (slug) raw = slug;

  // Remove common review year patterns like -2024, -2025, -2026, -2027
  raw = raw.replace(/[-_]?(202[0-9]|2030)([-_]|$)/gi, " ");

  // Split by dashes, underscores, and spaces
  const rawWords = raw.split(/[-_\s]+/).filter(Boolean);

  // Filter out review/affiliate noise words
  const cleanWords = rawWords.filter((w) => {
    const lower = w.toLowerCase().trim();
    if (/^\d{4}$/.test(lower)) return false; // standalone 4-digit years
    if (NOISE_SUFFIX_TOKENS.has(lower)) return false;
    if (lower.length < 2 && !/^\d+$/.test(lower)) return false; // keep model version numbers like "2", "3", "5"
    return true;
  });

  // If all words were filtered out, fall back to non-review words or original
  const finalWords = cleanWords.length > 0 ? cleanWords : rawWords.filter((w) => !/^(reviews?|ratings?)$/i.test(w));
  const wordsToUse = finalWords.length > 0 ? finalWords : rawWords;

  return wordsToUse
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

/**
 * Classifies a 0-100 Google Trends score into actionable priority tiers:
 * - High: 70 - 100 (Hot demand / viral product)
 * - Medium: 30 - 69 (Consistent / steady search interest)
 * - Low: 0 - 29 (Niche / low search volume)
 */
export function classifyTrendPriority(score: number): TrendPriority {
  if (score >= 70) return "high";
  if (score >= 30) return "medium";
  return "low";
}

/**
 * Builds the official interactive Google Trends chart URL.
 */
export function buildGoogleTrendsUrl(keyword: string, geo = ""): string {
  const cleanKeyword = encodeURIComponent(keyword.trim());
  const geoParam = geo.trim() ? `&geo=${encodeURIComponent(geo.trim().toUpperCase())}` : "";
  return `https://trends.google.com/trends/explore?q=${cleanKeyword}${geoParam}`;
}

/**
 * Estimates trend interest using Google Suggestion API popularity index
 * when Google Trends rate limits (HTTP 429) direct server requests.
 */
async function estimateTrendScoreFromGoogle(keyword: string, geo = ""): Promise<{
  score: number;
  timeline: { date: string; value: number }[];
}> {
  try {
    const gl = geo ? `&gl=${geo.toLowerCase()}` : "";
    const suggestUrl = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(
      keyword
    )}${gl}`;

    const res = await fetch(suggestUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const suggestions: string[] = Array.isArray(data[1]) ? data[1] : [];
      const rels: number[] = Array.isArray(data[4]?.["google:suggestrelevance"])
        ? data[4]["google:suggestrelevance"]
        : [];

      // Keyword hash for deterministic fine-grained variance
      let hash = 0;
      for (let i = 0; i < keyword.length; i++) {
        hash = ((hash << 5) - hash + keyword.charCodeAt(i)) | 0;
      }
      const variance = Math.abs(hash % 9);

      if (suggestions.length === 0) {
        // Obscure / low volume search query
        const obscureScore = Math.max(8, 18 - (Math.abs(hash) % 7));
        return {
          score: obscureScore,
          timeline: [
            { date: "Week 1", value: Math.max(5, obscureScore - 3) },
            { date: "Week 2", value: obscureScore },
            { date: "Week 3", value: Math.max(5, obscureScore - 2) },
            { date: "Week 4", value: obscureScore + 2 },
          ],
        };
      }

      // Factor 1: Suggestion breadth (Google returns up to 15 suggestions) -> 0 to 40 pts
      const countFactor = (Math.min(suggestions.length, 15) / 15) * 40;

      // Factor 2: Google suggestion relevance index (reaches 1250+) -> 0 to 35 pts
      const maxRel = rels.length > 0 ? Math.max(...rels) : 600;
      const relFactor = Math.min(35, (maxRel / 1300) * 35);

      // Factor 3: Commercial search intent modifiers -> 0 to 15 pts
      const commercialWords = ["amazon", "price", "ingredients", "buy", "discount", "sale", "side effects", "order"];
      const intentMatches = suggestions.filter((s) =>
        commercialWords.some((w) => s.toLowerCase().includes(w))
      ).length;
      const intentFactor = Math.min(15, intentMatches * 2.5);

      const rawScore = Math.round(countFactor + relFactor + intentFactor + variance);
      const score = Math.min(98, Math.max(12, rawScore));

      // Generate dynamic timeline around the score
      const timeline = [
        { date: "Week 1", value: Math.max(5, Math.min(100, score - 6 + (Math.abs(hash) % 5))) },
        { date: "Week 2", value: Math.max(5, Math.min(100, score + 4 - (Math.abs(hash) % 4))) },
        { date: "Week 3", value: Math.max(5, Math.min(100, score - 3 + (Math.abs(hash) % 6))) },
        { date: "Week 4", value: Math.max(5, Math.min(100, score + 5 - (Math.abs(hash) % 5))) },
      ];

      return { score, timeline };
    }
  } catch {
    // Fallback to deterministic heuristic
  }

  // Deterministic fallback based on keyword length and character dispersion
  let hash = 0;
  for (let i = 0; i < keyword.length; i++) {
    hash = ((hash << 5) - hash + keyword.charCodeAt(i)) | 0;
  }
  const words = keyword.split(" ").length;
  const fallbackScore = Math.min(75, Math.max(18, 65 - words * 6 + (Math.abs(hash) % 12)));
  return {
    score: fallbackScore,
    timeline: [
      { date: "Week 1", value: fallbackScore - 5 },
      { date: "Week 2", value: fallbackScore },
      { date: "Week 3", value: fallbackScore + 4 },
      { date: "Week 4", value: fallbackScore - 2 },
    ],
  };
}

/**
 * Fetches Google Trends data via SerpApi if key is provided.
 */
async function fetchFromSerpApi(
  keyword: string,
  geo = "",
  apiKey: string
): Promise<{ score: number; timeline: { date: string; value: number }[] } | null> {
  try {
    const geoParam = geo ? `&geo=${encodeURIComponent(geo)}` : "";
    const url = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(
      keyword
    )}${geoParam}&api_key=${apiKey}`;

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const json = await res.json();
      const timelineData = json?.interest_over_time?.timeline_data;
      if (Array.isArray(timelineData) && timelineData.length > 0) {
        const values: number[] = [];
        const timeline = timelineData.map((item: any) => {
          const val = item.values?.[0]?.extracted_value ?? item.values?.[0]?.value ?? 0;
          values.push(Number(val));
          return {
            date: item.date || item.time || "",
            value: Number(val),
          };
        });

        // Compute average score
        const avgScore = Math.round(values.reduce((a, b) => a + b, 0) / (values.length || 1));
        return { score: avgScore, timeline };
      }
    }
  } catch {
    // Pass through to next strategy
  }
  return null;
}

/**
 * Analyzes search interest for a product keyword or URL.
 * Automatically checks MongoDB cache (7 days), then queries Google or SerpApi.
 */
export async function getProductTrend(
  urlOrKeyword: string,
  geo = "",
  timeframe = "today 1-m",
  serpApiKey?: string
): Promise<TrendAnalysisResult> {
  const keyword = formatKeywordFromSlug(urlOrKeyword);
  const normalizedGeo = (geo || "").trim().toUpperCase();
  const exploreUrl = buildGoogleTrendsUrl(keyword, normalizedGeo);

  // 1. Check MongoDB Cache
  try {
    const cached = await ProductTrend.findOne({
      keyword: keyword.toLowerCase(),
      geo: normalizedGeo,
      timeframe,
    }).lean();

    if (cached && new Date(cached.expiresAt) > new Date()) {
      return {
        keyword,
        geo: normalizedGeo,
        timeframe,
        score: cached.score,
        priority: cached.priority,
        source: cached.source,
        exploreUrl: cached.exploreUrl || exploreUrl,
        timeline: cached.timeline || [],
        cached: true,
      };
    }
  } catch {
    // Database check failed or collection initializing, proceed to fetch
  }

  // 2. Try SerpApi if key is provided
  let score = 0;
  let timeline: { date: string; value: number }[] = [];
  let source: "google_trends" | "serpapi" | "estimated" = "estimated";

  const keyToUse = serpApiKey || process.env.SERPAPI_KEY;
  if (keyToUse) {
    const serpResult = await fetchFromSerpApi(keyword, normalizedGeo, keyToUse);
    if (serpResult) {
      score = serpResult.score;
      timeline = serpResult.timeline;
      source = "serpapi";
    }
  }

  // 3. If no SerpApi or SerpApi failed, estimate from Google Suggest / live signal
  if (source === "estimated") {
    const estimate = await estimateTrendScoreFromGoogle(keyword, normalizedGeo);
    score = estimate.score;
    timeline = estimate.timeline;
  }

  const priority = classifyTrendPriority(score);

  // 4. Save to MongoDB Cache (7-day TTL)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    await ProductTrend.findOneAndUpdate(
      {
        keyword: keyword.toLowerCase(),
        geo: normalizedGeo,
        timeframe,
      },
      {
        keyword: keyword.toLowerCase(),
        geo: normalizedGeo,
        timeframe,
        score,
        priority,
        source,
        timeline,
        exploreUrl,
        fetchedAt: new Date(),
        expiresAt,
      },
      { upsert: true, returnDocument: 'after' }
    );
  } catch {
    // Cache write error should not fail the user request
  }

  return {
    keyword,
    geo: normalizedGeo,
    timeframe,
    score,
    priority,
    source,
    exploreUrl,
    timeline,
    cached: false,
  };
}
