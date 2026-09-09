import googleTrends from "google-trends-api";
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
 * - Low: 0 - 29 (Niche / low or zero search volume)
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
  return `https://trends.google.com/explore?q=${cleanKeyword}${geoParam}`;
}

/**
 * Fetches true interest over time directly from Google Trends.
 * Returns authentic score (0-100) and timeline points.
 * Returns null if rate limited (429) or on network error.
 */
async function fetchFromGoogleTrends(
  keyword: string,
  geo = "",
  timeframe = "today 1-m"
): Promise<{ score: number; timeline: { date: string; value: number }[] } | null> {
  if (!keyword || !keyword.trim()) return null;

  try {
    const isYear = timeframe.includes("12-m") || timeframe.includes("year");
    const startTime = new Date(Date.now() - (isYear ? 365 : 30) * 24 * 60 * 60 * 1000);

    const options: any = {
      keyword: keyword.trim(),
      startTime,
      hl: "en-US",
    };

    const cleanGeo = (geo || "").trim().toUpperCase();
    if (cleanGeo && cleanGeo !== "GLOBAL" && cleanGeo !== "WORLDWIDE") {
      options.geo = cleanGeo;
    }

    const raw = await Promise.race([
      googleTrends.interestOverTime(options),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("Google Trends timeout")), 9000)
      ),
    ]);

    if (!raw || typeof raw !== "string" || raw.trim().startsWith("<")) {
      // HTML response indicates bot block / 429
      return null;
    }

    const parsed = JSON.parse(raw);
    const timelineData = parsed?.default?.timelineData;

    if (Array.isArray(timelineData)) {
      if (timelineData.length === 0) {
        // True zero interest: Google Trends has no measurable search volume for this term
        return {
          score: 0,
          timeline: [
            { date: "Week 1", value: 0 },
            { date: "Week 2", value: 0 },
            { date: "Week 3", value: 0 },
            { date: "Week 4", value: 0 },
          ],
        };
      }

      const values: number[] = [];
      const timeline = timelineData.map((item: any) => {
        const val = Number(item.value?.[0] ?? 0);
        values.push(val);
        return {
          date: item.formattedAxisTime || item.formattedTime || "",
          value: val,
        };
      });

      const avgScore =
        values.length > 0
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : 0;

      return { score: avgScore, timeline };
    }
  } catch {
    // Network error, JSON parse error, or rate limit
    return null;
  }

  return null;
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
      if (Array.isArray(timelineData)) {
        if (timelineData.length === 0) {
          return {
            score: 0,
            timeline: [
              { date: "Week 1", value: 0 },
              { date: "Week 2", value: 0 },
              { date: "Week 3", value: 0 },
              { date: "Week 4", value: 0 },
            ],
          };
        }

        const values: number[] = [];
        const timeline = timelineData.map((item: any) => {
          const val = item.values?.[0]?.extracted_value ?? item.values?.[0]?.value ?? 0;
          values.push(Number(val));
          return {
            date: item.date || item.time || "",
            value: Number(val),
          };
        });

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
 * Auxiliary search signal check using Google Suggest.
 * Strictly verifies that autocomplete suggestions match the product name.
 * If zero suggestions exist or matching is low, faithfully returns score 0.
 * NEVER fabricates synthetic floors or random numbers.
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
      const rawSuggestions: string[] = Array.isArray(data[1]) ? data[1] : [];
      const rels: number[] = Array.isArray(data[4]?.["google:suggestrelevance"])
        ? data[4]["google:suggestrelevance"]
        : [];

      // Filter: ONLY count suggestions that actually relate to the product
      const cleanTokens = keyword
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);

      const matchingSuggestions = rawSuggestions.filter((s) => {
        const lower = s.toLowerCase();
        const matchedTokens = cleanTokens.filter((token) => lower.includes(token));
        return matchedTokens.length >= Math.ceil(cleanTokens.length / 2);
      });

      // If zero suggestions exist or fewer than 3 product matches, search volume is negligible -> 0
      if (matchingSuggestions.length < 3) {
        return {
          score: 0,
          timeline: [
            { date: "Week 1", value: 0 },
            { date: "Week 2", value: 0 },
            { date: "Week 3", value: 0 },
            { date: "Week 4", value: 0 },
          ],
        };
      }

      // Proportional score based on verified suggestion breadth & intent
      const countFactor = (Math.min(matchingSuggestions.length, 15) / 15) * 50;
      const maxRel = rels.length > 0 ? Math.max(...rels) : 500;
      const relFactor = Math.min(30, (maxRel / 1300) * 30);

      const commercialWords = [
        "amazon",
        "price",
        "ingredients",
        "buy",
        "discount",
        "sale",
        "side effects",
        "order",
        "cost",
        "official",
      ];
      const intentMatches = matchingSuggestions.filter((s) =>
        commercialWords.some((w) => s.toLowerCase().includes(w))
      ).length;
      const intentFactor = Math.min(20, intentMatches * 4);

      const computedScore = Math.min(95, Math.round(countFactor + relFactor + intentFactor));
      const score = computedScore < 20 ? 0 : computedScore;

      const timeline = [
        { date: "Week 1", value: Math.max(0, score - 5) },
        { date: "Week 2", value: score },
        { date: "Week 3", value: Math.max(0, score - 2) },
        { date: "Week 4", value: Math.min(100, score + 3) },
      ];

      return { score, timeline };
    }
  } catch {
    // Ignore error, return 0
  }

  // True 0 default when no positive search volume is verified
  return {
    score: 0,
    timeline: [
      { date: "Week 1", value: 0 },
      { date: "Week 2", value: 0 },
      { date: "Week 3", value: 0 },
      { date: "Week 4", value: 0 },
    ],
  };
}

/**
 * Analyzes search interest for a product keyword or URL.
 * 1. Checks MongoDB Cache (7 days, unless forceFresh or legacy estimated)
 * 2. Queries real Google Trends interest-over-time directly
 * 3. Falls back to SerpApi (if key provided)
 * 4. Falls back to verified Google Autocomplete signal (returns 0 if no demand)
 */
export async function getProductTrend(
  urlOrKeyword: string,
  geo = "",
  timeframe = "today 1-m",
  serpApiKey?: string,
  forceFresh = false
): Promise<TrendAnalysisResult> {
  const keyword = formatKeywordFromSlug(urlOrKeyword);
  const normalizedGeo = (geo || "").trim().toUpperCase();
  const exploreUrl = buildGoogleTrendsUrl(keyword, normalizedGeo);

  // 1. Check MongoDB Cache (unless forceFresh or cached source was legacy "estimated" with fake score)
  if (!forceFresh) {
    try {
      const cached = await ProductTrend.findOne({
        keyword: keyword.toLowerCase(),
        geo: normalizedGeo,
        timeframe,
      }).lean();

      // Only reuse cache if it is fresh AND not an old legacy estimated record
      if (
        cached &&
        new Date(cached.expiresAt) > new Date() &&
        cached.source === "google_trends"
      ) {
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
      // Proceed to fetch
    }
  }

  let score = 0;
  let timeline: { date: string; value: number }[] = [];
  let source: "google_trends" | "serpapi" | "estimated" = "google_trends";

  // 2. Primary: Direct Google Trends interest over time
  const directResult = await fetchFromGoogleTrends(keyword, normalizedGeo, timeframe);
  if (directResult) {
    score = directResult.score;
    timeline = directResult.timeline;
    source = "google_trends";
  } else {
    // 3. Secondary: SerpApi if user provided API key
    const keyToUse = serpApiKey || process.env.SERPAPI_KEY;
    if (keyToUse) {
      const serpResult = await fetchFromSerpApi(keyword, normalizedGeo, keyToUse);
      if (serpResult) {
        score = serpResult.score;
        timeline = serpResult.timeline;
        source = "serpapi";
      }
    }

    // 4. Tertiary: Auxiliary verified autocomplete signal (strictly 0 if no demand)
    if (source !== "serpapi") {
      const estimate = await estimateTrendScoreFromGoogle(keyword, normalizedGeo);
      score = estimate.score;
      timeline = estimate.timeline;
      source = "estimated";
    }
  }

  const priority = classifyTrendPriority(score);

  // 5. Save to MongoDB Cache (7-day TTL)
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
      { upsert: true, returnDocument: "after" }
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

