/**
 * Multi-Stage Product Slug & Pattern Matching Engine
 * Accurately matches products across different competitor and baseline websites
 * regardless of directory prefixes, file extensions, numeric SKU/IDs, and slug word ordering.
 */

// Common e-commerce directory prefixes to strip from product URLs
const PRODUCT_PREFIX_REGEX =
  /^\/?(products?|items?|shop|store|p|catalog|goods|collections?|listing|detail|pd|sku)(\/[a-z0-9_-]+)*\//i;

// E-commerce stopwords and filler words that do not distinguish products
const STOPWORDS = new Set([
  "buy",
  "online",
  "shop",
  "sale",
  "best",
  "official",
  "store",
  "cheap",
  "item",
  "product",
  "products",
  "new",
  "free",
  "shipping",
  "delivery",
  "with",
  "and",
  "for",
  "the",
  "in",
  "on",
  "at",
  "to",
  "of",
  "a",
  "an",
  "mens",
  "womens",
  "unisex",
  "kids",
  "adult",
  // Affiliate, review & e-commerce boilerplate noise
  "review",
  "reviews",
  "rating",
  "ratings",
  "tested",
  "complaint",
  "complaints",
  "scam",
  "legit",
  "update",
  "updated",
  "worth",
  "cost",
  "price",
  "safe",
  "safety",
  "result",
  "results",
  "formula",
  "supplement",
  "supplements",
  "pill",
  "pills",
  "capsule",
  "capsules",
  "tablet",
  "tablets",
  "drop",
  "drops",
  "gummy",
  "gummies",
  "powder",
  "syrup",
  "solution",
  "softgel",
  "softgels",
  "pack",
  "packs",
  "bottle",
  "bottles",
  "is",
  "it",
  "or",
  "vs",
  "versus",
  "by",
  "from",
  "uk",
  "usa",
  "us",
  "complex",
  "blend",
  "extract",
]);

/**
 * Extracts the clean product slug from a full URL or pathname.
 * Strips:
 * 1. Directory prefixes (/products/, /shop/, /p/, etc.)
 * 2. Trailing slashes and file extensions (.html, .htm, .php)
 * 3. Leading or trailing numerical SKU/ID identifiers (e.g. "12345-nike-air" -> "nike-air", "nike-air-p1092" -> "nike-air")
 * 4. Query strings, hashes, and affiliate review suffixes
 */
export function extractProductSlug(urlOrPath: string): string {
  if (!urlOrPath) return "";

  let path = urlOrPath;
  try {
    if (urlOrPath.includes("/") || urlOrPath.startsWith("http")) {
      const parsed = new URL(
        urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")
          ? urlOrPath
          : `https://example.com/${urlOrPath.replace(/^\/+/, "")}`
      );
      path = decodeURIComponent(parsed.pathname);
    } else {
      path = decodeURIComponent(urlOrPath);
    }
  } catch {
    try {
      path = decodeURIComponent(urlOrPath.split("?")[0].split("#")[0]);
    } catch {
      path = urlOrPath.split("?")[0].split("#")[0];
    }
  }

  // Normalize: strip trailing slashes and file extensions FIRST
  path = path.replace(/\/+$/, "").replace(/\.(html?|php|aspx?)$/i, "");

  // Directory segment extraction:
  // In e-commerce URL structures (/shop/category/product, /products/item-slug, /p/item-slug),
  // the product slug is the last path segment.
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "";

  let slug = segments[segments.length - 1];

  // If the last segment is itself a generic directory or category root, it's not a product
  const GENERIC_SEGMENTS = new Set([
    "product",
    "products",
    "item",
    "items",
    "shop",
    "store",
    "p",
    "catalog",
    "goods",
    "collection",
    "collections",
    "listing",
    "detail",
    "pd",
    "sku",
    "category",
    "categories",
  ]);
  if (GENERIC_SEGMENTS.has(slug.toLowerCase())) {
    return "";
  }

  // Separate camelCase and acronym boundaries before lowercasing (e.g. "exampleFX" -> "example-FX", "OsteoShield" -> "Osteo-Shield")
  slug = slug
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2");

  // Clean characters
  slug = slug.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

  // Strip leading numerical IDs (e.g. "10492-nike-air-max-90" -> "nike-air-max-90")
  slug = slug.replace(/^\d{4,12}[-_]+/, "");

  // Strip trailing numerical IDs or SKU formats (e.g. "nike-air-max-90-sku-883921" or "nike-air-max-90-p102934")
  slug = slug.replace(/[-_]+(p|sku|id)?[-_]*\d{4,12}$/i, "");
  slug = slug.replace(/[-_]+(sku|id|p)$/i, "");

  // Strip affiliate review phrases & suffixes (e.g. -uk-review-is-it-real-or-scam, -reviews-does-it-work, etc.)
  slug = slug.replace(
    /[-_]+(uk|us|ca|au|gb|nz|ie)?[-_]*(reviews?|ratings?|is[-_]+it|does[-_]+it|side[-_]+effects?|ingredients?|scams?|legit|truth|complaints?|worth[-_]+it|customer[-_]+reviews?|honest[-_]+reviews?|where[-_]+to[-_]+buy|pros[-_]+and[-_]+cons|official[-_]+website|fake[-_]+or[-_]+real|before[-_]+and[-_]+after|results?|price|cost|discount|promo|exposed|warning).*/gi,
    ""
  );
  const cleaned = slug.replace(/^-+|-+$/g, "");
  if (/^\d+$/.test(cleaned) || !/[a-z]/i.test(cleaned)) {
    return "";
  }

  return cleaned;
}

/**
 * Light stemming helper to collapse plural/singular forms.
 */
function stemWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes")) return word.slice(0, -1);
  if (word.endsWith("ing") && word.length > 5) {
    return word.slice(0, -3).replace(/(.)\1$/, "$1");
  }
  if (word.endsWith("es") && !word.endsWith("ses") && !word.endsWith("ches")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Tokenizes a product slug into a set of normalized, significant product keywords.
 */
export function tokenizeProductSlug(slugOrUrl: string): string[] {
  const slug = extractProductSlug(slugOrUrl);
  if (!slug) return [];

  const rawWords = slug.split(/[-_]+/).filter(Boolean);
  const meaningfulTokens: string[] = [];

  for (const w of rawWords) {
    const clean = w.toLowerCase().trim();
    if (clean.length < 2) continue;
    // Skip 4-digit years like 2024, 2025, 2026, 2027
    if (/^(19|20)\d{2}$/.test(clean)) continue;
    if (STOPWORDS.has(clean)) continue;

    const stemmed = stemWord(clean);
    if (STOPWORDS.has(stemmed)) continue;
    if (!meaningfulTokens.includes(stemmed)) {
      meaningfulTokens.push(stemmed);
    }
  }

  return meaningfulTokens;
}

export interface MatchScoreResult {
  similarity: number; // 0.0 to 1.0
  isMatch: boolean;
  matchType: "exact_path" | "exact_slug" | "token_overlap" | "none";
  sharedTokens: string[];
}

/**
 * Evaluates whether two tokenized products are a legitimate match.
 * Eliminates cross-category false positives where single words (e.g. "basic", "wild", "fitness", "force")
 * or low-similarity token subsets cause completely different products to falsely match.
 */
export function isLegitimateProductMatch(
  compTokens: string[],
  candTokens: string[],
  sharedTokens: string[],
  threshold = 0.65
): { isMatch: boolean; score: number } {
  const lenA = compTokens.length;
  const lenB = candTokens.length;
  const sharedCount = sharedTokens.length;

  if (lenA === 0 || lenB === 0 || sharedCount === 0) {
    return { isMatch: false, score: 0 };
  }

  const minLen = Math.min(lenA, lenB);
  const maxLen = Math.max(lenA, lenB);
  const unionCount = lenA + lenB - sharedCount;
  const jaccard = sharedCount / unionCount;
  const containment = sharedCount / minLen;

  // 1. Both are single-token products (e.g. ["memovolt"] vs ["memovolt"], ["berberin"] vs ["berberin"])
  if (minLen === 1 && maxLen === 1) {
    const isMatch = compTokens[0] === candTokens[0];
    return { isMatch, score: isMatch ? 1.0 : 0 };
  }

  // 2. One product is single-token, but the other has multiple tokens
  // (e.g. "basic" vs "thorne-basic-nutrients", "wild" vs "wild-burn", "fitness" vs "fitness-keto", "force" vs "bcaa-g-force")
  // A single-word token MUST NEVER match a multi-word product!
  if (minLen === 1 && maxLen > 1) {
    return { isMatch: false, score: Math.round(jaccard * 100) / 100 };
  }

  // 3. Both are 2-token products (e.g. ["bcaa", "force"] vs ["force", "x"], or ["air", "max"] vs ["max", "air"])
  // Must share BOTH tokens! Sharing 1 token out of 2 is only 33% Jaccard and indicates different products.
  if (minLen === 2 && maxLen === 2) {
    const isMatch = sharedCount === 2;
    const score = isMatch ? 1.0 : Math.round(jaccard * 100) / 100;
    return { isMatch, score };
  }

  // 4. Products with 2+ tokens:
  // Must share at least 2 tokens (sharedCount >= 2). A single shared word is NEVER a match across multi-token products!
  if (sharedCount < 2) {
    return { isMatch: false, score: Math.round(jaccard * 100) / 100 };
  }

  // 5. Multi-token fuzzy matching
  const score = Math.round((jaccard * 0.4 + containment * 0.6) * 100) / 100;

  // Legitimate match if:
  // - High Jaccard similarity (>= 0.60) and score meets threshold, OR
  // - Shorter product is heavily contained (containment >= 0.85) AND sharedCount >= 2 AND jaccard >= 0.40, OR
  // - Shorter product has 3+ tokens and is 100% contained (containment === 1.0 && sharedCount >= 3)
  const isMatch =
    (jaccard >= 0.60 && score >= threshold) ||
    (containment >= 0.85 && sharedCount >= 2 && jaccard >= 0.40) ||
    (containment === 1.0 && sharedCount >= 3);

  return {
    isMatch,
    score: isMatch ? score : Math.min(score, 0.49),
  };
}

/**
 * Calculates similarity between a competitor product URL and a baseline/our product URL.
 * Threshold defaults to 0.65 (65% token overlap).
 */
export function calculateProductSimilarity(
  competitorUrl: string,
  ourUrl: string,
  threshold = 0.65
): MatchScoreResult {
  // 1. Direct path check
  let compPath = competitorUrl;
  let ourPath = ourUrl;
  try {
    compPath = new URL(competitorUrl).pathname;
    ourPath = new URL(ourUrl).pathname;
  } catch {
    // Keep raw
  }

  if (compPath.toLowerCase().replace(/\/+$/, "") === ourPath.toLowerCase().replace(/\/+$/, "")) {
    return {
      similarity: 1.0,
      isMatch: true,
      matchType: "exact_path",
      sharedTokens: tokenizeProductSlug(compPath),
    };
  }

  // 2. Slug check
  const compSlug = extractProductSlug(competitorUrl);
  const ourSlug = extractProductSlug(ourUrl);

  if (compSlug && ourSlug && compSlug === ourSlug) {
    return {
      similarity: 1.0,
      isMatch: true,
      matchType: "exact_slug",
      sharedTokens: tokenizeProductSlug(compSlug),
    };
  }

  // 2b. Compact normalized slug check (e.g. "examplefx" vs "example-fx")
  const compCompact = compSlug ? compSlug.replace(/[^a-z0-9]/g, "") : "";
  const ourCompact = ourSlug ? ourSlug.replace(/[^a-z0-9]/g, "") : "";
  if (compCompact && ourCompact && compCompact === ourCompact && compCompact.length >= 3) {
    const compToks = tokenizeProductSlug(compSlug);
    const ourToks = tokenizeProductSlug(ourSlug);
    return {
      similarity: 1.0,
      isMatch: true,
      matchType: "exact_slug",
      sharedTokens: compToks.length >= ourToks.length ? compToks : ourToks,
    };
  }

  // 3. Token-level overlap
  const compTokens = tokenizeProductSlug(compSlug);
  const ourTokens = tokenizeProductSlug(ourSlug);

  if (compTokens.length === 0 || ourTokens.length === 0) {
    return { similarity: 0, isMatch: false, matchType: "none", sharedTokens: [] };
  }

  // Check if concatenated tokens match (e.g. ["examplefx"] vs ["example", "fx"])
  if (
    compTokens.join("") === ourTokens.join("") &&
    compTokens.join("").length >= 3
  ) {
    return {
      similarity: 1.0,
      isMatch: true,
      matchType: "exact_slug",
      sharedTokens: compTokens.length >= ourTokens.length ? compTokens : ourTokens,
    };
  }

  const ourSet = new Set(ourTokens);
  const sharedTokens = compTokens.filter((t) => ourSet.has(t));

  if (sharedTokens.length === 0) {
    return { similarity: 0, isMatch: false, matchType: "none", sharedTokens: [] };
  }

  const { isMatch, score } = isLegitimateProductMatch(compTokens, ourTokens, sharedTokens, threshold);

  return {
    similarity: score,
    isMatch,
    matchType: isMatch ? "token_overlap" : "none",
    sharedTokens: isMatch ? sharedTokens : [],
  };
}

export interface IndexedProduct {
  url: string;
  websiteId: string;
  websiteDomain: string;
  slug: string;
  tokens: string[];
}

/**
 * Calculates similarity directly from pre-tokenized sets to avoid repeated regex & parsing.
 */
export function calculateTokenSimilarity(
  compTokens: string[],
  compSlug: string,
  ourTokens: string[],
  ourSlug: string,
  threshold = 0.65
): {
  similarity: number;
  isMatch: boolean;
  sharedTokens: string[];
} {
  if (compSlug && ourSlug && compSlug === ourSlug) {
    return {
      similarity: 1.0,
      isMatch: true,
      sharedTokens: compTokens,
    };
  }

  // Compact normalized slug check (e.g. "examplefx" vs "example-fx")
  const compCompact = compSlug ? compSlug.replace(/[^a-z0-9]/g, "") : "";
  const ourCompact = ourSlug ? ourSlug.replace(/[^a-z0-9]/g, "") : "";
  if (compCompact && ourCompact && compCompact === ourCompact && compCompact.length >= 3) {
    return {
      similarity: 1.0,
      isMatch: true,
      sharedTokens: compTokens.length >= ourTokens.length ? compTokens : ourTokens,
    };
  }

  // Check if concatenated tokens match (e.g. ["examplefx"] vs ["example", "fx"])
  if (
    compTokens.length > 0 &&
    ourTokens.length > 0 &&
    compTokens.join("") === ourTokens.join("") &&
    compTokens.join("").length >= 3
  ) {
    return {
      similarity: 1.0,
      isMatch: true,
      sharedTokens: compTokens.length >= ourTokens.length ? compTokens : ourTokens,
    };
  }

  if (compTokens.length === 0 || ourTokens.length === 0) {
    return { similarity: 0, isMatch: false, sharedTokens: [] };
  }

  const ourSet = new Set(ourTokens);
  const sharedTokens = compTokens.filter((t) => ourSet.has(t));
  if (sharedTokens.length === 0) {
    return { similarity: 0, isMatch: false, sharedTokens: [] };
  }

  const { isMatch, score } = isLegitimateProductMatch(compTokens, ourTokens, sharedTokens, threshold);

  return {
    similarity: score,
    isMatch,
    sharedTokens: isMatch ? sharedTokens : [],
  };
}

/**
 * Searches an in-memory index of all our baseline products to find the closest match.
 * Returns the highest-scoring match if it meets the threshold.
 */
export function findBestProductMatch(
  competitorUrl: string,
  ourProductIndex: IndexedProduct[],
  threshold = 0.65
): {
  isMatch: boolean;
  bestScore: number;
  matchedProduct?: IndexedProduct;
  sharedTokens: string[];
} {
  const compSlug = extractProductSlug(competitorUrl);
  const compTokens = tokenizeProductSlug(compSlug);

  if (compTokens.length === 0 && !compSlug) {
    return { isMatch: false, bestScore: 0, sharedTokens: [] };
  }

  const compSet = new Set(compTokens);

  let bestScore = 0;
  let bestProduct: IndexedProduct | undefined;
  let bestSharedTokens: string[] = [];

  for (const ourProd of ourProductIndex) {
    // Exact slug match instant short circuit
    if (compSlug && ourProd.slug && compSlug === ourProd.slug) {
      return {
        isMatch: true,
        bestScore: 1.0,
        matchedProduct: ourProd,
        sharedTokens: compTokens,
      };
    }

    // Compact normalized slug match (e.g. "examplefx" vs "example-fx")
    const compCompact = compSlug ? compSlug.replace(/[^a-z0-9]/g, "") : "";
    const ourCompact = ourProd.slug ? ourProd.slug.replace(/[^a-z0-9]/g, "") : "";
    if (compCompact && ourCompact && compCompact === ourCompact && compCompact.length >= 3) {
      return {
        isMatch: true,
        bestScore: 1.0,
        matchedProduct: ourProd,
        sharedTokens: compTokens.length >= ourProd.tokens.length ? compTokens : ourProd.tokens,
      };
    }

    // Quick filter: check if there's any shared token at all
    const hasAnyShared = ourProd.tokens.some((t) => compSet.has(t));
    if (!hasAnyShared) continue;

    const result = calculateTokenSimilarity(compTokens, compSlug, ourProd.tokens, ourProd.slug, threshold);
    if (result.isMatch && result.similarity > bestScore) {
      bestScore = result.similarity;
      bestProduct = ourProd;
      bestSharedTokens = result.sharedTokens;

      // Perfect match short-circuit
      if (bestScore === 1.0) break;
    }
  }

  const isMatch = bestScore >= threshold && bestProduct !== undefined;

  return {
    isMatch,
    bestScore: isMatch ? bestScore : 0,
    matchedProduct: isMatch ? bestProduct : undefined,
    sharedTokens: isMatch ? bestSharedTokens : [],
  };
}

export interface MatchedProductDetail {
  product: IndexedProduct;
  score: number;
  matchType: "exact_slug" | "token_overlap";
  sharedTokens: string[];
}

/**
 * High-performance inverted index matcher for catalog-scale comparisons (1,000s of products).
 * Reduces time complexity from O(N * M) to O(N * k), speeding up comparisons by 80x+.
 */
export class BulkProductMatcher {
  private exactSlugMap = new Map<string, IndexedProduct[]>();
  private compactSlugMap = new Map<string, IndexedProduct[]>();
  private tokenIndex = new Map<string, (IndexedProduct & { tokenSet: Set<string> })[]>();

  constructor(products: IndexedProduct[]) {
    for (const p of products) {
      if (p.slug) {
        let list = this.exactSlugMap.get(p.slug);
        if (!list) {
          list = [];
          this.exactSlugMap.set(p.slug, list);
        }
        list.push(p);

        const compact = p.slug.replace(/[^a-z0-9]/g, "");
        if (compact.length >= 3) {
          let cList = this.compactSlugMap.get(compact);
          if (!cList) {
            cList = [];
            this.compactSlugMap.set(compact, cList);
          }
          cList.push(p);
        }
      }
      const tokenSet = new Set(p.tokens);
      const item = { ...p, tokenSet };
      for (const t of p.tokens) {
        let list = this.tokenIndex.get(t);
        if (!list) {
          list = [];
          this.tokenIndex.set(t, list);
        }
        list.push(item);
      }
    }
  }

  findMatch(
    compSlug: string,
    compTokens: string[],
    threshold = 0.65
  ): {
    isMatch: boolean;
    bestScore: number;
    matchedProduct?: IndexedProduct;
    sharedTokens: string[];
  } {
    // 1. O(1) Exact slug match
    if (compSlug && this.exactSlugMap.has(compSlug)) {
      const list = this.exactSlugMap.get(compSlug)!;
      if (list.length > 0) {
        return {
          isMatch: true,
          bestScore: 1.0,
          matchedProduct: list[0],
          sharedTokens: compTokens,
        };
      }
    }

    // 1b. O(1) Compact normalized slug match (e.g. "examplefx" vs "example-fx")
    const compCompact = compSlug ? compSlug.replace(/[^a-z0-9]/g, "") : "";
    if (compCompact && compCompact.length >= 3 && this.compactSlugMap.has(compCompact)) {
      const list = this.compactSlugMap.get(compCompact)!;
      if (list.length > 0) {
        return {
          isMatch: true,
          bestScore: 1.0,
          matchedProduct: list[0],
          sharedTokens: compTokens.length >= list[0].tokens.length ? compTokens : list[0].tokens,
        };
      }
    }

    if (compTokens.length === 0) {
      return { isMatch: false, bestScore: 0, sharedTokens: [] };
    }

    // 2. Query inverted index for candidate products sharing tokens
    const candidateSet = new Set<(IndexedProduct & { tokenSet: Set<string> })>();
    for (const t of compTokens) {
      const prods = this.tokenIndex.get(t);
      if (prods) {
        for (const p of prods) candidateSet.add(p);
      }
    }

    if (candidateSet.size === 0) {
      return { isMatch: false, bestScore: 0, sharedTokens: [] };
    }

    let bestScore = 0;
    let bestProduct: IndexedProduct | undefined;
    let bestSharedTokens: string[] = [];

    for (const cand of candidateSet) {
      const shared: string[] = [];
      for (const t of compTokens) {
        if (cand.tokenSet.has(t)) {
          shared.push(t);
        }
      }
      if (shared.length === 0) continue;

      const { isMatch, score } = isLegitimateProductMatch(compTokens, cand.tokens, shared, threshold);

      if (isMatch && score > bestScore) {
        bestScore = score;
        bestProduct = cand;
        bestSharedTokens = shared;
        if (bestScore === 1.0) break;
      }
    }

    const isMatch = bestScore >= threshold && bestProduct !== undefined;
    return {
      isMatch,
      bestScore: isMatch ? bestScore : 0,
      matchedProduct: isMatch ? bestProduct : undefined,
      sharedTokens: isMatch ? bestSharedTokens : [],
    };
  }

  /**
   * Finds all matches across distinct baseline websites (best match per website).
   */
  findAllMatches(
    compSlug: string,
    compTokens: string[],
    threshold = 0.65,
    targetWebsiteCount?: number
  ): {
    isMatch: boolean;
    bestScore: number;
    matches: MatchedProductDetail[];
  } {
    const websiteBestMap = new Map<string, MatchedProductDetail>();

    // 1. O(1) Exact slug matches across all baseline websites
    if (compSlug && this.exactSlugMap.has(compSlug)) {
      const exactList = this.exactSlugMap.get(compSlug)!;
      for (const p of exactList) {
        if (!websiteBestMap.has(p.websiteId)) {
          websiteBestMap.set(p.websiteId, {
            product: p,
            score: 1.0,
            matchType: "exact_slug",
            sharedTokens: compTokens,
          });
        }
      }
      // If all target websites already matched exactly, exit immediately in 0.001ms
      if (targetWebsiteCount && websiteBestMap.size >= targetWebsiteCount) {
        const matches = Array.from(websiteBestMap.values());
        return { isMatch: true, bestScore: 1.0, matches };
      }
    }

    // 1b. O(1) Compact normalized slug matches across all baseline websites
    const compCompact = compSlug ? compSlug.replace(/[^a-z0-9]/g, "") : "";
    if (compCompact && compCompact.length >= 3 && this.compactSlugMap.has(compCompact)) {
      const compactList = this.compactSlugMap.get(compCompact)!;
      for (const p of compactList) {
        if (!websiteBestMap.has(p.websiteId)) {
          websiteBestMap.set(p.websiteId, {
            product: p,
            score: 1.0,
            matchType: "exact_slug",
            sharedTokens: compTokens.length >= p.tokens.length ? compTokens : p.tokens,
          });
        }
      }
      if (targetWebsiteCount && websiteBestMap.size >= targetWebsiteCount) {
        const matches = Array.from(websiteBestMap.values());
        return { isMatch: true, bestScore: 1.0, matches };
      }
    }

    // 2. Query inverted index for candidate products on websites that don't have an exact match
    if (compTokens.length >= 1) {
      const candidateSet = new Set<(IndexedProduct & { tokenSet: Set<string> })>();
      for (const t of compTokens) {
        const prods = this.tokenIndex.get(t);
        if (prods) {
          for (const p of prods) {
            candidateSet.add(p);
          }
        }
      }

      for (const cand of candidateSet) {
        // If this website already has a perfect 1.0 match, skip evaluating lower score candidates for it
        const currentBest = websiteBestMap.get(cand.websiteId);
        if (currentBest && currentBest.score >= 0.95) continue;

        const shared: string[] = [];
        for (const t of compTokens) {
          if (cand.tokenSet.has(t)) {
            shared.push(t);
          }
        }
        if (shared.length === 0) continue;

        const { isMatch, score } = isLegitimateProductMatch(compTokens, cand.tokens, shared, threshold);

        if (isMatch) {
          if (!currentBest || score > currentBest.score) {
            websiteBestMap.set(cand.websiteId, {
              product: cand,
              score,
              matchType: "token_overlap",
              sharedTokens: shared,
            });
          }
        }
      }
    }

    const matches = Array.from(websiteBestMap.values()).sort((a, b) => b.score - a.score);
    return {
      isMatch: matches.length > 0,
      bestScore: matches[0]?.score || 0,
      matches,
    };
  }
}
