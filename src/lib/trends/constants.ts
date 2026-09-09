// Supported Geo / Country codes for Google Trends
export const SUPPORTED_GEOS = [
  { code: "", name: "Worldwide (Global)" },
  { code: "US", name: "United States (US)" },
  { code: "GB", name: "United Kingdom (UK)" },
  { code: "CA", name: "Canada (CA)" },
  { code: "AU", name: "Australia (AU)" },
  { code: "DE", name: "Germany (DE)" },
  { code: "FR", name: "France (FR)" },
  { code: "IT", name: "Italy (IT)" },
  { code: "ES", name: "Spain (ES)" },
  { code: "NL", name: "Netherlands (NL)" },
  { code: "JP", name: "Japan (JP)" },
  { code: "IN", name: "India (IN)" },
  { code: "BR", name: "Brazil (BR)" },
] as const;

export type TrendPriority = "high" | "medium" | "low";

const NOISE_WORDS = new Set([
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
 * Strips affiliate review words, year numbers, and directory prefixes to isolate the pure product name.
 * Example: "nativepath-collagen-peptides-reviews-2026" -> "Nativepath Collagen Peptides"
 */
export function cleanProductSearchKeyword(urlOrSlug: string): string {
  if (!urlOrSlug) return "";
  let raw = urlOrSlug.trim();

  // Safely decode any prior URL encoding to eliminate %20 and %2520 artifacts
  try {
    while (raw.includes("%")) {
      const decoded = decodeURIComponent(raw);
      if (decoded === raw) break;
      raw = decoded;
    }
  } catch {}

  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      raw = new URL(raw).pathname;
    }
  } catch {}

  // Strip file extensions and directory prefixes
  raw = raw.replace(/\.(html?|php|aspx?)$/i, "");
  raw = raw.replace(
    /^\/?(products?|items?|shop|store|p|catalog|goods|collections?|listing|detail)(\/[a-z0-9_-]+)*\//i,
    ""
  );
  const segments = raw.split("/").filter(Boolean);
  raw = segments.pop() || raw;

  // Remove leading/trailing database IDs and years
  raw = raw.replace(/^\d{4,12}[-_]+/, "");
  raw = raw.replace(/[-_]?(202[0-9]|2030)([-_]|$)/gi, " ");
  raw = raw.replace(/[-_]+(p|sku|id)?[-_]*\d{4,12}$/i, "");

  const words = raw.split(/[-_\s]+/).filter(Boolean);
  const clean = words.filter((w) => {
    const lower = w.toLowerCase().trim();
    if (/^\d{4}$/.test(lower)) return false;
    if (NOISE_WORDS.has(lower)) return false;
    if (lower.length < 2 && !/^\d+$/.test(lower)) return false;
    return true;
  });

  const finalWords = clean.length > 0 ? clean : words;
  return finalWords
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

/**
 * Generates the official Google Trends explore URL with the exact target country.
 * Always produces clean single-encoded terms and consistent region/locale parameters.
 */
export function buildGoogleTrendsUrl(keywordOrSlug: string, geo = ""): string {
  const keyword = cleanProductSearchKeyword(keywordOrSlug);
  const cleanKeyword = encodeURIComponent(keyword.trim());
  const cleanGeo = (geo || "").trim().toUpperCase();
  const geoParam =
    cleanGeo && cleanGeo !== "GLOBAL" && cleanGeo !== "WORLDWIDE"
      ? `&geo=${encodeURIComponent(cleanGeo)}`
      : "";
  return `https://trends.google.com/explore?q=${cleanKeyword}${geoParam}&hl=en`;
}
