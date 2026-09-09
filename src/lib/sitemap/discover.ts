import { XMLParser } from "fast-xml-parser";
import { safeFetch } from "../security/ssrf";
import { isValidHttpUrl, extractDomain } from "./normalizer";
import { type DiscoveredSitemapCandidate } from "@/types";

const quickParser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
});

export interface SitemapDiscoveryResult {
  domain: string;
  baseUrl: string;
  candidates: DiscoveredSitemapCandidate[];
  recommendedSitemap?: string;
}

const COMMON_SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/wp-sitemap.xml",
  "/sitemap/sitemap.xml",
  "/sitemap1.xml",
];

/**
 * Automatically discovers XML sitemaps for a website by checking robots.txt and standard paths.
 */
export async function discoverSitemaps(inputUrl: string): Promise<SitemapDiscoveryResult> {
  let cleanUrl = inputUrl.trim();
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = `https://${cleanUrl}`;
  }

  const domain = extractDomain(cleanUrl);
  const parsed = new URL(cleanUrl);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;

  const candidates: DiscoveredSitemapCandidate[] = [];
  const foundUrls = new Set<string>();

  // 1. Inspect robots.txt
  const robotsUrl = `${baseUrl}/robots.txt`;
  try {
    const robotsRes = await safeFetch(robotsUrl, { timeoutMs: 8000 });
    if (robotsRes.response.ok) {
      const robotsText = await robotsRes.response.text();
      const lines = robotsText.split("\n");
      for (const line of lines) {
        const match = line.match(/^\s*Sitemap:\s*(https?:\/\/[^\s]+)/i);
        if (match && match[1]) {
          const candidateUrl = match[1].trim();
          if (isValidHttpUrl(candidateUrl) && !foundUrls.has(candidateUrl)) {
            foundUrls.add(candidateUrl);
            candidates.push({
              url: candidateUrl,
              source: "robots.txt",
              valid: false,
            });
          }
        }
      }
    }
  } catch {
    // robots.txt missing or timeout is common; proceed with fallback probe
  }

  // 2. Add common paths
  for (const path of COMMON_SITEMAP_PATHS) {
    const candidateUrl = `${baseUrl}${path}`;
    if (!foundUrls.has(candidateUrl)) {
      foundUrls.add(candidateUrl);
      candidates.push({
        url: candidateUrl,
        source: "common_path",
        valid: false,
      });
    }
  }

function classifyChildSitemap(url: string): {
  category: "products" | "posts" | "pages" | "categories" | "other";
  filename: string;
} {
  const filename = url.split("/").pop()?.split("?")[0] || url;
  const lower = filename.toLowerCase();

  // Strip "sitemap" and extension so "s-item-ap" does not accidentally match "item"
  const cleanName = lower.replace(/[-_.]?sitemap/gi, "").replace(/\.xml(\.gz)?$/i, "");

  if (/(product|shop|store|catalog|collection|goods|sku|\bitem)/i.test(cleanName)) {
    return { category: "products", filename };
  }
  if (/(post|blog|article|story|news|recipe|entry)/i.test(cleanName)) {
    return { category: "posts", filename };
  }
  if (/(page)/i.test(cleanName)) {
    return { category: "pages", filename };
  }
  if (/(category|tag|archive|author|user|portfolio)/i.test(cleanName)) {
    return { category: "categories", filename };
  }
  return { category: "other", filename };
}

  // 3. Probe each candidate to verify availability
  const validatedCandidates: DiscoveredSitemapCandidate[] = [];
  const seenChildSignatures = new Set<string>();
  let recommendedSitemap: string | undefined;

  for (const item of candidates) {
    try {
      const probeRes = await safeFetch(item.url, { timeoutMs: 7000 });
      item.status = probeRes.response.status;

      if (probeRes.response.ok) {
        const textSnippet = await probeRes.response.text();
        const lower = textSnippet.slice(0, 1000).toLowerCase();
        if (lower.includes("<urlset") || lower.includes("<sitemapindex")) {
          item.valid = true;
          item.type = lower.includes("<sitemapindex") ? "index" : "sitemap";
          const sampleCount = (textSnippet.match(/<loc>/gi) || []).length;
          item.sampleUrlCount = sampleCount;

          if (item.type === "index") {
            try {
              const parsedXml = quickParser.parse(textSnippet);
              const sitemaps = parsedXml?.sitemapindex?.sitemap;
              const sitemapList = Array.isArray(sitemaps) ? sitemaps : sitemaps ? [sitemaps] : [];

              const rawChildren = sitemapList
                .slice(0, 50)
                .map((s: any) => ({
                  url: typeof s.loc === "string" ? s.loc.trim() : "",
                  lastmod: typeof s.lastmod === "string" ? s.lastmod.trim() : undefined,
                }))
                .filter((s: any) => Boolean(s.url));

              // Deduplicate identical index clones (e.g. sitemap.xml vs sitemap_index.xml)
              const childSignature = rawChildren.map((c) => c.url).sort().join("|");
              if (childSignature && seenChildSignatures.has(childSignature)) {
                continue; // Skip duplicate index candidate
              }
              if (childSignature) {
                seenChildSignatures.add(childSignature);
              }

              const detectedProducts: string[] = [];
              let productsCount = 0;
              let postsCount = 0;
              let pagesCount = 0;
              let otherCount = 0;

              item.childSitemaps = rawChildren.map((c) => {
                const { category, filename } = classifyChildSitemap(c.url);
                if (category === "products") {
                  productsCount++;
                  detectedProducts.push(c.url);
                } else if (category === "posts") {
                  postsCount++;
                } else if (category === "pages") {
                  pagesCount++;
                } else {
                  otherCount++;
                }
                return {
                  url: c.url,
                  filename,
                  category,
                  lastmod: c.lastmod,
                };
              });

              // Sort child sitemaps: products first, then posts, pages, categories, other
              const categoryOrder = { products: 0, posts: 1, pages: 2, categories: 3, other: 4 };
              item.childSitemaps.sort(
                (a, b) => categoryOrder[a.category] - categoryOrder[b.category]
              );

              item.hasProductSitemap = detectedProducts.length > 0;
              item.detectedProductSitemaps = detectedProducts;
              item.summary = { productsCount, postsCount, pagesCount, otherCount };
            } catch {
              // Ignore partial parse failures
            }
          }

          if (!recommendedSitemap) {
            recommendedSitemap = item.url;
          }
        }
      }
    } catch {
      item.status = 0;
      item.valid = false;
    }

    // Keep all valid candidates and keep non-valid only if from robots.txt
    if (item.valid || item.source === "robots.txt") {
      validatedCandidates.push(item);
    }
  }

  // Fallback recommended sitemap if none was verified valid
  if (!recommendedSitemap && validatedCandidates.length > 0) {
    recommendedSitemap = validatedCandidates[0].url;
  } else if (!recommendedSitemap) {
    recommendedSitemap = `${baseUrl}/sitemap.xml`;
  }

  return {
    domain,
    baseUrl,
    candidates: validatedCandidates,
    recommendedSitemap,
  };
}
