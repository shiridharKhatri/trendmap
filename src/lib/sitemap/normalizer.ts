export const DEFAULT_IGNORED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "ref",
];

export interface NormalizationOptions {
  ignoredParams?: string[];
  stripTrailingSlash?: boolean;
  lowercasePath?: boolean;
}

/**
 * Normalizes a URL to ensure reliable comparisons across scans and competitors.
 * 
 * Rules:
 * 1. Lowercase scheme and host.
 * 2. Remove URL fragment (#...).
 * 3. Strip tracking parameters while keeping functional query params.
 * 4. Sort remaining query params alphabetically.
 * 5. Normalize trailing slashes consistently (strip trailing slash unless path is strictly "/").
 * 6. Remove default ports (:80 for http, :443 for https).
 * 7. Normalize multiple consecutive slashes in the path.
 */
export function normalizeUrl(
  rawUrl: string,
  options: NormalizationOptions = {}
): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("Invalid URL input");
  }

  const trimmed = rawUrl.trim();
  const ignored = options.ignoredParams || DEFAULT_IGNORED_PARAMS;
  const stripSlash = options.stripTrailingSlash ?? true;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: any) {
    throw new Error(`Cannot parse URL "${rawUrl}": ${err.message}`);
  }

  // 1. Lowercase scheme and hostname
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();

  // 2. Remove default ports
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }

  // 3. Remove fragment
  parsed.hash = "";

  // 4. Normalize pathname: collapse consecutive slashes (except protocol)
  let pathname = parsed.pathname.replace(/\/+/g, "/");

  // Lowercase path if configured (default false to preserve case-sensitive IDs)
  if (options.lowercasePath) {
    pathname = pathname.toLowerCase();
  }

  // Strip trailing slash if pathname is longer than 1 character
  if (stripSlash && pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  parsed.pathname = pathname;

  // 5. Filter ignored query parameters and sort remaining keys
  const searchParams = new URLSearchParams(parsed.search);
  const filteredKeys = Array.from(new Set(searchParams.keys()))
    .filter((key) => !ignored.some((ig) => ig.toLowerCase() === key.toLowerCase()))
    .sort();

  const newSearchParams = new URLSearchParams();
  for (const key of filteredKeys) {
    const values = searchParams.getAll(key);
    for (const val of values) {
      newSearchParams.append(key, val);
    }
  }

  const searchStr = newSearchParams.toString();
  parsed.search = searchStr ? `?${searchStr}` : "";

  return parsed.toString();
}

/**
 * Validates whether a string is a well-formed http/https URL.
 */
export function isValidHttpUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Extracts the base domain or host from a URL (e.g. https://www.example.com/path -> example.com).
 */
export function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return urlStr.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  }
}

/**
 * Checks whether a URL matches an inclusion or exclusion filter pattern.
 * Supports:
 * - Simple substrings: e.g. "product", "/products/", "cbd"
 * - Glob / wildcards: e.g. "*product*", "*shop*"
 * - Regex format: if enclosed in /regex/
 */
export function matchesUrlPattern(url: string, pattern: string): boolean {
  if (!pattern || !url) return false;
  const cleanPattern = pattern.trim();
  if (!cleanPattern) return false;

  const cleanUrl = url.toLowerCase();
  const lowerPattern = cleanPattern.toLowerCase();

  // Regex format: explicitly prefixed with regex: or /.../ containing regex metacharacters
  let isExplicitRegex = false;
  let regexStr = "";
  if (lowerPattern.startsWith("regex:")) {
    isExplicitRegex = true;
    regexStr = cleanPattern.slice(6).trim();
  } else if (
    lowerPattern.startsWith("/") &&
    lowerPattern.endsWith("/") &&
    lowerPattern.length > 2 &&
    /[\\^$+?()|[\]{}]/.test(lowerPattern.slice(1, -1))
  ) {
    isExplicitRegex = true;
    regexStr = lowerPattern.slice(1, -1);
  }

  if (isExplicitRegex && regexStr) {
    try {
      const regex = new RegExp(regexStr, "i");
      return regex.test(url);
    } catch {
      // Fallback to substring
    }
  }

  // Wildcard pattern with *
  if (lowerPattern.includes("*")) {
    const regexPattern = lowerPattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    try {
      const regex = new RegExp(regexPattern, "i");
      return regex.test(cleanUrl);
    } catch {
      // Fallback
    }
  }

  // Standard substring / path check
  return cleanUrl.includes(lowerPattern);
}

/**
 * Standard product URL patterns used for automatic product detection.
 */
export const DEFAULT_PRODUCT_PATTERNS = [
  "product",
  "/products/",
  "/product/",
  "/shop/",
  "/item/",
  "/items/",
  "/p/",
  "/store/",
  "/listing/",
  "/collection/",
  "/collections/",
  "review",
  "reviews",
  "-review",
  "-reviews",
  "/reviews/",
  "/review/",
];

/**
/**
 * Informational blog article, symptom guide, and Q&A patterns that must NEVER be treated as products.
 */
export const INFORMATIONAL_ARTICLE_PATTERNS = [
  "how-to-",
  "why-does-",
  "why-do-",
  "why-is-",
  "can-a-",
  "can-",
  "what-causes-",
  "what-is-",
  "what-to-",
  "what-vitamin-",
  "causes-of-",
  "symptoms-of-",
  "pain-in-",
  "hurts-when-",
  "ways-to-",
  "exercises-for-",
  "remedies-for-",
  "stretches-for-",
  "how-long-does-",
  "foods-to-avoid-",
  "foods-that-",
  "7-foods-",
  "that-feeling-when-",
  "the-back-of-my-",
  "the-back-of-",
  "my-knee-hurts-",
  "my-knee-",
  "knee-pain-",
  "where-to-buy-",
  "home-remedies-",
  "acupressure-for-",
  "best-ways-to-",
  "tips-for-",
  "how-do-you-",
  "how-much-does-",
  "is-it-safe-to-",
  "-for-memory",
  "-for-ed",
  "-for-erectile-dysfunction",
  "-when-bending",
  "-for-brain-health",
  "-for-neuropathy",
  "-trick-for-",
  "-drain-edema",
  "buying-guide",
  "buyers-guide",
  "buying-guides",
  "how-we-rate",
  "claim-standards",
  "cooling-options",
  "personal-air-cooler",
  "small-room-cooling",
  "portable-cooling",
  "booty-camp",
  "kidney-disease-solution",
  "heartburn-medicine",
];

const INFORMATIONAL_PREFIX_REGEX =
  /^(what-|how-|why-|can-|is-|are-|does-|do-|should-|could-|would-|when-|where-|who-|the-feeling-|the-truth-|ways-to-|things-to-|exercises-|stretches-|remedies-|foods-|signs-of-|symptoms-|causes-|treatment-|natural-remedies|home-remedies|that-feeling-)/i;

const INFORMATIONAL_SUFFIX_REGEX =
  /(-trick-|-recipe|-side-effects|-explained|-foods-for-|-trick$)/i;

import { isNonProduct } from "../trends/constants";
export { isNonProduct };

/**
 * Helper to test if a URL or slug is an informational blog post or non-product rather than a product.
 */
export function isInformationalArticle(urlOrSlug: string): boolean {
  if (!urlOrSlug) return false;
  if (isNonProduct(urlOrSlug)) return true;
  const clean = urlOrSlug.toLowerCase();
  const lastPart = clean.split("/").filter(Boolean).pop() || clean;
  if (INFORMATIONAL_PREFIX_REGEX.test(lastPart) || INFORMATIONAL_SUFFIX_REGEX.test(lastPart)) {
    return true;
  }
  return INFORMATIONAL_ARTICLE_PATTERNS.some((pat) => clean.includes(pat));
}

/**
 * Common non-product paths automatically excluded when in "Products Only" scope.
 */
export const DEFAULT_PRODUCT_EXCLUDE_PATTERNS = [
  "/general/",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/contact",
  "/about",
  "/cookie",
  "/legal",
  "/policy",
  "/policies",
  "/author/",
  "/tag/",
  "/tags/",
  "/category/",
  "/categories/",
  "/cart",
  "/checkout",
  "/my-account",
  "/account",
  "/login",
  "/signup",
  "/register",
  "/wp-admin",
  "/wp-content",
  "/wp-json",
  "/feed",
  "page-sitemap",
  "category-sitemap",
  "tag-sitemap",
  "author-sitemap",
  "methodology",
  "editorial-policy",
  "editorial",
  "corrections",
  "how-we-rate",
  "claim-standards",
  "disclosure",
  "disclosures",
  "buying-guide",
  "buyers-guide",
  "buying-guides",
  "alternatives",
  "opiniones",
  "booty-camp",
  "cooling-options",
  "personal-air-cooler",
  "small-room-cooling",
  "portable-cooling",
  "kidney-disease-solution",
  "heartburn-medicine",
  ...INFORMATIONAL_ARTICLE_PATTERNS,
];

/**
 * Standard blog/article URL patterns for automatic blog scope.
 */
export const DEFAULT_BLOG_PATTERNS = [
  "blog",
  "/blog/",
  "/post/",
  "/posts/",
  "/article/",
  "/articles/",
  "/news/",
  "/recipe/",
  "/recipes/",
];

/**
 * Tests whether a URL is likely a product page using automated heuristics.
 */
export function isProductUrl(url: string): boolean {
  if (!url) return false;
  if (isInformationalArticle(url)) return false;
  const isExcluded = DEFAULT_PRODUCT_EXCLUDE_PATTERNS.some((pat) => matchesUrlPattern(url, pat));
  if (isExcluded) return false;
  return DEFAULT_PRODUCT_PATTERNS.some((pat) => matchesUrlPattern(url, pat));
}

/**
 * Ensures a website URL or domain has a valid https:// scheme.
 * Handles inputs like "GuruReviewsClub.com", "http://example.com", "www.site.com".
 */
export function sanitizeWebsiteUrl(raw: string): string {
  if (!raw) return "";
  let clean = raw.trim();
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = `https://${clean}`;
  }
  return clean;
}

/**
 * Automatically infers a clean, human-readable website name from a URL or domain.
 * Examples:
 *   "GuruReviewsClub.com" -> "Guru Reviews Club"
 *   "https://supplement-mag.com/sitemap.xml" -> "Supplement Mag"
 *   "thebuyersreviews.com" -> "Thebuyersreviews"
 */
export function detectWebsiteName(urlOrDomain: string): string {
  if (!urlOrDomain) return "";
  let raw = urlOrDomain.trim();

  // Strip protocol and path while preserving original casing (URL.hostname lowercases)
  let host = raw.replace(/^https?:\/\//i, "").split("/")[0].split("?")[0].split("#")[0];
  // Strip port if present
  host = host.split(":")[0];
  // Strip leading www.
  host = host.replace(/^www\./i, "");

  // Strip top level domain (e.g. .com, .co.uk, .org, etc.)
  const base = host.replace(/\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?$/i, "");
  if (!base) return host;

  // Split CamelCase: "GuruReviewsClub" -> "Guru Reviews Club"
  let name = base.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  // Replace hyphens, underscores, dots with spaces
  name = name.replace(/[-_.]+/g, " ");

  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Helper to parse each bulk line (supports "domain.com", "domain.com, sitemapUrl", or direct sitemap URLs).
 */
export function parseBulkLine(raw: string): { siteUrl: string; explicitSitemapUrl?: string } | null {
  const line = raw.trim();
  if (!line || line.startsWith("#") || line.startsWith("//")) return null;

  // Case 1: Line has comma, pipe, tab, or arrow separator e.g. "domain.com, https://domain.com/sitemap_index.xml"
  const sepMatch = line.match(/^([^,|=>\t]+)[,|=>\t]+(.*)$/);
  if (sepMatch) {
    const p1 = sepMatch[1].trim();
    const p2 = sepMatch[2].trim().replace(/^[|=>\s-]+/, "");
    if (p2 && (p2.includes("sitemap") || p2.endsWith(".xml") || p2.startsWith("http"))) {
      const cleanSite = sanitizeWebsiteUrl(p1);
      const cleanMap = sanitizeWebsiteUrl(p2);
      return { siteUrl: cleanSite, explicitSitemapUrl: cleanMap };
    }
  }

  // Case 2: Space-separated "domain.com https://domain.com/sitemap.xml"
  const spaceParts = line.split(/\s+/);
  if (spaceParts.length === 2 && (spaceParts[1].includes("sitemap") || spaceParts[1].endsWith(".xml") || spaceParts[1].startsWith("http"))) {
    return {
      siteUrl: sanitizeWebsiteUrl(spaceParts[0]),
      explicitSitemapUrl: sanitizeWebsiteUrl(spaceParts[1]),
    };
  }

  // Case 3: Line is a direct sitemap URL (e.g. "https://domain.com/sitemap_index.xml" or "domain.com/sitemap.xml")
  if (line.endsWith(".xml") || line.includes("/sitemap") || line.includes(".xml?")) {
    const fullSitemap = sanitizeWebsiteUrl(line);
    try {
      const u = new URL(fullSitemap);
      const origin = `${u.protocol}//${u.host}`;
      return {
        siteUrl: origin,
        explicitSitemapUrl: fullSitemap,
      };
    } catch {}
  }

  // Case 4: Standard domain or website URL (no explicit sitemap specified; auto-discovery will discover it)
  return {
    siteUrl: sanitizeWebsiteUrl(line),
  };
}


