import googleTrends from "google-trends-api";
import { ProductTrend, type IProductTrendDocument } from "../models/ProductTrend";
import { extractProductSlug } from "../comparison/productMatcher";

import { SUPPORTED_GEOS, cleanProductSearchKeyword, isNonProduct, type TrendPriority } from "./constants";
export { SUPPORTED_GEOS, cleanProductSearchKeyword, isNonProduct, type TrendPriority };

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

/**
 * Converts a product URL or slug into a clean, true product keyword phrase.
 * Strips affiliate and review noise, "for" clauses, country names, and leading prefix noise.
 * Example: "nativepath-collagen-peptides-reviews-2026" -> "Nativepath Collagen Peptides"
 */
export function formatKeywordFromSlug(urlOrSlug: string): string {
  return cleanProductSearchKeyword(urlOrSlug);
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
 * Always produces clean single-encoded terms and consistent region/locale parameters.
 */
export function buildGoogleTrendsUrl(keyword: string, geo = "", date = ""): string {
  const cleanKeyword = encodeURIComponent(formatKeywordFromSlug(keyword));
  const cleanGeo = (geo || "").trim().toUpperCase();
  const geoParam =
    cleanGeo && cleanGeo !== "GLOBAL" && cleanGeo !== "WORLDWIDE"
      ? `&geo=${encodeURIComponent(cleanGeo)}`
      : "";
  const dateParam = date ? `&date=${encodeURIComponent(date)}` : "";
  return `https://trends.google.com/explore?q=${cleanKeyword}${geoParam}${dateParam}&hl=en`;
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
    let startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (timeframe.includes("5-y") || timeframe.includes("5year")) {
      startTime = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
    } else if (timeframe.includes("12-m") || timeframe.includes("1-y") || timeframe.includes("year")) {
      startTime = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    } else if (timeframe.includes("3-m")) {
      startTime = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    } else if (timeframe.includes("1-m")) {
      startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeframe.includes("7-d")) {
      startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === "all") {
      startTime = new Date("2004-01-01");
    }

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

      const maxScore = values.length > 0 ? Math.max(...values) : 0;
      if (maxScore === 0) {
        return { score: 0, timeline };
      }

      const recentSlice = values.slice(-7);
      const recentAvg = Math.round(recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length);
      const score = Math.min(100, Math.max(0, Math.round(recentAvg * 0.6 + maxScore * 0.4)));

      return { score, timeline };
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
        const values: number[] = [];
        const timeline = timelineData.map((item: any) => {
          const val = item.values?.[0]?.extracted_value ?? item.values?.[0]?.value ?? 0;
          values.push(Number(val));
          return {
            date: item.date || item.time || "",
            value: Number(val),
          };
        });

        const maxScore = values.length > 0 ? Math.max(...values) : 0;
        if (maxScore === 0) {
          return { score: 0, timeline };
        }

        const recentSlice = values.slice(-7);
        const recentAvg = Math.round(recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length);
        const score = Math.min(100, Math.max(0, Math.round(recentAvg * 0.6 + maxScore * 0.4)));
        return { score, timeline };
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
 * NEVER fabricates synthetic high scores (capped at 35 max so it never falsely flags "High Demand").
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

      // Conservative estimation: Suggest signals alone cannot establish "High Demand" (70+)
      // They can only confirm baseline existence (15-35 range)
      const countFactor = (Math.min(matchingSuggestions.length, 10) / 10) * 15;
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
      const intentFactor = Math.min(15, intentMatches * 3);

      const score = Math.min(35, Math.max(0, Math.round(countFactor + intentFactor)));

      const timeline = [
        { date: "Week 1", value: Math.max(0, score - 3) },
        { date: "Week 2", value: score },
        { date: "Week 3", value: Math.max(0, score - 2) },
        { date: "Week 4", value: Math.min(35, score + 2) },
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
 * 1. Checks MongoDB Cache (7 days, unless forceFresh)
 * 2. Queries real Google Trends interest-over-time directly
 * 3. Falls back to SerpApi (if key provided)
 * 4. Falls back to preserved cache if Google Trends rate limits
 * 5. Falls back to verified Google Autocomplete signal (conservative <=35, strictly 0 if no demand)
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
  const exploreUrl = buildGoogleTrendsUrl(keyword, normalizedGeo, timeframe);

  // 1. Check MongoDB Cache
  let cached: any = null;
  try {
    cached = await ProductTrend.findOne({
      keyword: keyword.toLowerCase(),
      geo: normalizedGeo,
      timeframe,
    }).lean();

    // If cache is fresh and not forcing fresh: use cached record
    if (!forceFresh && cached && new Date(cached.expiresAt) > new Date()) {
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
    let serpResult = null;
    if (keyToUse) {
      serpResult = await fetchFromSerpApi(keyword, normalizedGeo, keyToUse);
      if (serpResult) {
        score = serpResult.score;
        timeline = serpResult.timeline;
        source = "serpapi";
      }
    }

    if (!serpResult) {
      // If Google Trends was rate-limited or timed out, but we had a prior cached score:
      // Preserve the verified cached score rather than flip-flopping!
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

      // 4. Tertiary fallback: Auxiliary autocomplete signal (capped at 35 max, never fake High)
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

