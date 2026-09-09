import { XMLParser } from "fast-xml-parser";
import { safeFetch } from "../security/ssrf";
import { normalizeUrl, isValidHttpUrl, matchesUrlPattern, type NormalizationOptions } from "./normalizer";

export interface ParsedUrlEntry {
  originalUrl: string;
  normalizedUrl: string;
  lastmod?: Date;
  changefreq?: string;
  priority?: number;
  sourceSitemap: string;
}

export interface SitemapHealthMetrics {
  totalUrls: number;
  validUrls: number;
  duplicateUrls: number;
  invalidUrls: number;
  withLastmod: number;
  withoutLastmod: number;
  filesProcessed: number;
  brokenFiles: number;
}

export interface SitemapFileResult {
  url: string;
  type: "sitemap" | "index";
  status: "valid" | "error" | "warning";
  httpStatus: number;
  responseTimeMs: number;
  urlCount: number;
  errorMessage?: string;
}

export interface ParseResult {
  urls: ParsedUrlEntry[];
  files: SitemapFileResult[];
  metrics: SitemapHealthMetrics;
  errors: Array<{ sitemapUrl: string; message: string }>;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  cdataPropName: "__cdata",
  parseTagValue: false, // Keep raw strings to avoid date/number auto-conversion bugs
});

/**
 * Extracts string content whether inside standard tags or CDATA.
 */
function extractText(val: any): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "string") return val.trim();
  if (typeof val === "object" && val.__cdata) return String(val.__cdata).trim();
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return undefined;
}

/**
 * Recursively parses sitemaps and sitemap indexes with loop detection and max depth limits.
 */
export async function parseSitemapTree(
  rootSitemapUrl: string,
  options: {
    maxDepth?: number;
    maxSitemaps?: number;
    normalizationOptions?: NormalizationOptions;
    timeoutMs?: number;
    urlIncludePatterns?: string[];
    urlExcludePatterns?: string[];
  } = {}
): Promise<ParseResult> {
  const maxDepth = options.maxDepth ?? 4;
  const maxSitemaps = options.maxSitemaps ?? 50;

  const visitedSitemaps = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: rootSitemapUrl, depth: 0 }];

  const allUrls: ParsedUrlEntry[] = [];
  const files: SitemapFileResult[] = [];
  const errors: Array<{ sitemapUrl: string; message: string }> = [];

  const seenNormalizedUrls = new Set<string>();
  let duplicateCount = 0;
  let invalidCount = 0;
  let withLastmod = 0;
  let withoutLastmod = 0;
  let brokenFiles = 0;

  while (queue.length > 0) {
    if (visitedSitemaps.size >= maxSitemaps) {
      errors.push({
        sitemapUrl: rootSitemapUrl,
        message: `Reached maximum sitemap limit of ${maxSitemaps} files. Skipping remaining files.`,
      });
      break;
    }

    const current = queue.shift()!;
    const cleanCurrentUrl = current.url.trim();

    if (visitedSitemaps.has(cleanCurrentUrl)) {
      continue;
    }
    visitedSitemaps.add(cleanCurrentUrl);

    let res;
    let durationMs = 0;
    try {
      const fetchRes = await safeFetch(cleanCurrentUrl, {
        timeoutMs: options.timeoutMs ?? 15000,
      });
      res = fetchRes.response;
      durationMs = fetchRes.durationMs;

      if (!res.ok) {
        brokenFiles++;
        errors.push({
          sitemapUrl: cleanCurrentUrl,
          message: `HTTP ${res.status}: ${res.statusText}`,
        });
        files.push({
          url: cleanCurrentUrl,
          type: "sitemap",
          status: "error",
          httpStatus: res.status,
          responseTimeMs: durationMs,
          urlCount: 0,
          errorMessage: `HTTP ${res.status}: ${res.statusText}`,
        });
        continue;
      }
    } catch (fetchErr: any) {
      brokenFiles++;
      errors.push({
        sitemapUrl: cleanCurrentUrl,
        message: `Fetch failed: ${fetchErr.message}`,
      });
      files.push({
        url: cleanCurrentUrl,
        type: "sitemap",
        status: "error",
        httpStatus: 0,
        responseTimeMs: durationMs,
        urlCount: 0,
        errorMessage: fetchErr.message,
      });
      continue;
    }

    let text: string;
    try {
      text = await res.text();
    } catch (readErr: any) {
      brokenFiles++;
      errors.push({
        sitemapUrl: cleanCurrentUrl,
        message: `Failed to read response body: ${readErr.message}`,
      });
      files.push({
        url: cleanCurrentUrl,
        type: "sitemap",
        status: "error",
        httpStatus: res.status,
        responseTimeMs: durationMs,
        urlCount: 0,
        errorMessage: readErr.message,
      });
      continue;
    }

    let parsedXml: any;
    try {
      parsedXml = xmlParser.parse(text);
    } catch (xmlErr: any) {
      brokenFiles++;
      errors.push({
        sitemapUrl: cleanCurrentUrl,
        message: `XML parse failed: ${xmlErr.message}`,
      });
      files.push({
        url: cleanCurrentUrl,
        type: "sitemap",
        status: "error",
        httpStatus: res.status,
        responseTimeMs: durationMs,
        urlCount: 0,
        errorMessage: `XML parse failed: ${xmlErr.message}`,
      });
      continue;
    }

    if (!parsedXml || typeof parsedXml !== "object") {
      brokenFiles++;
      errors.push({
        sitemapUrl: cleanCurrentUrl,
        message: "Invalid or empty XML structure",
      });
      files.push({
        url: cleanCurrentUrl,
        type: "sitemap",
        status: "error",
        httpStatus: res.status,
        responseTimeMs: durationMs,
        urlCount: 0,
        errorMessage: "Invalid or empty XML structure",
      });
      continue;
    }

    // 1. Check for Sitemap Index (<sitemapindex>)
    const sitemapIndex = parsedXml.sitemapindex;
    if (sitemapIndex) {
      const sitemapItems = sitemapIndex.sitemap;
      const sitemapList = Array.isArray(sitemapItems)
        ? sitemapItems
        : sitemapItems
        ? [sitemapItems]
        : [];

      files.push({
        url: cleanCurrentUrl,
        type: "index",
        status: "valid",
        httpStatus: res.status,
        responseTimeMs: durationMs,
        urlCount: sitemapList.length,
      });

      if (current.depth < maxDepth) {
        // Collect valid child sitemaps
        const validChildLocs: string[] = [];
        for (const item of sitemapList) {
          const loc = extractText(item.loc);
          if (loc && isValidHttpUrl(loc) && !visitedSitemaps.has(loc)) {
            // Check exclusion patterns on sitemap URL name
            if (options.urlExcludePatterns?.length) {
              const isExcluded = options.urlExcludePatterns.some((pat) => matchesUrlPattern(loc, pat));
              if (isExcluded) continue;
            }
            validChildLocs.push(loc);
          }
        }

        // If inclusion patterns are specified, see if child sitemap filenames directly match (e.g. "product", "shop")
        if (options.urlIncludePatterns?.length) {
          const matchingChildSitemaps = validChildLocs.filter((loc) =>
            options.urlIncludePatterns!.some((pat) => matchesUrlPattern(loc, pat))
          );
          // If we found specific matching child sitemaps (e.g. product-sitemap.xml), ONLY queue those!
          if (matchingChildSitemaps.length > 0) {
            for (const loc of matchingChildSitemaps) {
              queue.push({ url: loc, depth: current.depth + 1 });
            }
          } else {
            // None of the sitemap filenames matched (e.g. sitemap1.xml), so queue all and filter URLs inside
            for (const loc of validChildLocs) {
              queue.push({ url: loc, depth: current.depth + 1 });
            }
          }
        } else {
          // If child sitemaps contain dedicated product sitemaps, prioritize them
          const productSitemaps = validChildLocs.filter((loc) => /product[-_]sitemap|products?\.xml/i.test(loc));
          if (productSitemaps.length > 0) {
            for (const loc of productSitemaps) {
              queue.push({ url: loc, depth: current.depth + 1 });
            }
          } else {
            for (const loc of validChildLocs) {
              queue.push({ url: loc, depth: current.depth + 1 });
            }
          }
        }
      } else {
        errors.push({
          sitemapUrl: cleanCurrentUrl,
          message: `Reached maximum recursion depth of ${maxDepth}. Child sitemaps not expanded.`,
        });
      }
      continue;
    }

    // 2. Check for Standard URL Set (<urlset>)
    const urlset = parsedXml.urlset;
    if (urlset) {
      const urlItems = urlset.url;
      const urlList = Array.isArray(urlItems) ? urlItems : urlItems ? [urlItems] : [];

      let fileUrlCount = 0;
      for (const item of urlList) {
        const rawLoc = extractText(item.loc);
        if (!rawLoc) continue;

        if (!isValidHttpUrl(rawLoc)) {
          invalidCount++;
          continue;
        }

        // 1. URL Exclude Pattern Check (e.g. /terms, /privacy, /author/)
        if (options.urlExcludePatterns && options.urlExcludePatterns.length > 0) {
          const isExcluded = options.urlExcludePatterns.some((pat) => matchesUrlPattern(rawLoc, pat));
          if (isExcluded) continue;

          // Exclude bare domain homepage when filtering out non-product pages
          try {
            const u = new URL(rawLoc);
            if (!u.pathname || u.pathname === "/" || u.pathname === "") {
              continue;
            }
          } catch {}
        }

        // 2. URL Include Pattern Check (e.g. /products/, /shop/, *product*)
        if (options.urlIncludePatterns && options.urlIncludePatterns.length > 0) {
          const isIncluded = options.urlIncludePatterns.some((pat) => matchesUrlPattern(rawLoc, pat));
          if (!isIncluded) continue;
        }

        let normalized: string;
        try {
          normalized = normalizeUrl(rawLoc, options.normalizationOptions);
        } catch {
          invalidCount++;
          continue;
        }

        if (seenNormalizedUrls.has(normalized)) {
          duplicateCount++;
          continue;
        }
        seenNormalizedUrls.add(normalized);

        const lastmodStr = extractText(item.lastmod);
        let parsedDate: Date | undefined;
        if (lastmodStr) {
          const d = new Date(lastmodStr);
          if (!isNaN(d.getTime())) {
            parsedDate = d;
            withLastmod++;
          } else {
            withoutLastmod++;
          }
        } else {
          withoutLastmod++;
        }

        const priorityStr = extractText(item.priority);
        let priority: number | undefined;
        if (priorityStr) {
          const p = parseFloat(priorityStr);
          if (!isNaN(p) && p >= 0 && p <= 1) {
            priority = p;
          }
        }

        const changefreq = extractText(item.changefreq);

        allUrls.push({
          originalUrl: rawLoc,
          normalizedUrl: normalized,
          lastmod: parsedDate,
          changefreq,
          priority,
          sourceSitemap: cleanCurrentUrl,
        });
        fileUrlCount++;
      }

      files.push({
        url: cleanCurrentUrl,
        type: "sitemap",
        status: "valid",
        httpStatus: res.status,
        responseTimeMs: durationMs,
        urlCount: fileUrlCount,
      });
      continue;
    }

    // Neither <urlset> nor <sitemapindex> found
    brokenFiles++;
    errors.push({
      sitemapUrl: cleanCurrentUrl,
      message: "XML is neither a valid <urlset> nor a <sitemapindex>",
    });
    files.push({
      url: cleanCurrentUrl,
      type: "sitemap",
      status: "error",
      httpStatus: res.status,
      responseTimeMs: durationMs,
      urlCount: 0,
      errorMessage: "XML is neither a valid <urlset> nor a <sitemapindex>",
    });
  }

  return {
    urls: allUrls,
    files,
    metrics: {
      totalUrls: allUrls.length,
      validUrls: allUrls.length,
      duplicateUrls: duplicateCount,
      invalidUrls: invalidCount,
      withLastmod,
      withoutLastmod,
      filesProcessed: files.length,
      brokenFiles,
    },
    errors,
  };
}
