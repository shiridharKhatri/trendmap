import { connectToDatabase } from "../db/mongodb";
import { ProductExtraction } from "../models/ProductExtraction";
import { isInformationalArticle } from "../sitemap/normalizer";
import { cleanProductSearchKeyword } from "../trends/constants";
import { extractProductSlug } from "../comparison/productMatcher";

export interface AIClassificationResult {
  url: string;
  isProduct: boolean;
  cleanProductName: string;
}

const DEFAULT_GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Classify a batch of URLs using Groq LLM with MongoDB caching, rate-limit backoff, and heuristic fallbacks.
 */
export async function classifyUrlsWithGroq(
  urls: string[],
  options?: {
    apiKey?: string;
    model?: string;
    batchSize?: number;
  }
): Promise<Map<string, AIClassificationResult>> {
  const results = new Map<string, AIClassificationResult>();
  if (!urls || urls.length === 0) return results;

  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  const apiKey = options?.apiKey || process.env.GROQ_API_KEY;
  const model = options?.model || process.env.GROQ_MODEL || DEFAULT_MODEL;
  // Conservative batch size to stay safely under Groq's 8,000 TPM limit
  const batchSize = options?.batchSize || 8;

  // 1. Check MongoDB Cache first
  const missingFromCache: string[] = [];
  try {
    await connectToDatabase();
    const cachedDocs = await ProductExtraction.find({ url: { $in: uniqueUrls } }).lean();
    for (const doc of cachedDocs) {
      results.set(doc.url, {
        url: doc.url,
        isProduct: doc.isProduct,
        cleanProductName: doc.cleanProductName,
      });
    }

    for (const u of uniqueUrls) {
      if (!results.has(u)) {
        missingFromCache.push(u);
      }
    }
  } catch (err) {
    console.warn("MongoDB extraction cache lookup failed, proceeding to live evaluation:", err);
    missingFromCache.push(...uniqueUrls);
  }

  // If all URLs were in cache, return immediately (0 API tokens consumed!)
  if (missingFromCache.length === 0) {
    return results;
  }

  // 2. If no Groq API Key, use rule-based heuristics fallback
  if (!apiKey) {
    for (const u of missingFromCache) {
      const slug = extractProductSlug(u);
      const isInfo = isInformationalArticle(u) || isInformationalArticle(slug);
      results.set(u, {
        url: u,
        isProduct: !isInfo,
        cleanProductName: !isInfo ? cleanProductSearchKeyword(slug) : "",
      });
    }
    return results;
  }

  // 3. Process un-cached URLs in small batches via Groq API with auto-retry
  for (let i = 0; i < missingFromCache.length; i += batchSize) {
    const batch = missingFromCache.slice(i, i + batchSize);
    const promptList = batch.map((u, idx) => `${idx + 1}. ${u}`).join("\n");

    let batchSuccess = false;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts && !batchSuccess; attempt++) {
      try {
        const response = await fetch(DEFAULT_GROQ_API_URL, {
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
                  "You are an expert e-commerce and affiliate product classifier. For each URL, output JSON with 'results' array containing:\n" +
                  "- url: string\n" +
                  "- isProduct: boolean (true if affiliate product review, offer, physical product, supplement; false if informational blog, recipe, medical advice, symptom guide, or general Q&A)\n" +
                  "- cleanProductName: string (clean brand or product name, stripping SEO spam like 'reviews', 'legit or scam'; empty string if isProduct is false)\n" +
                  "Be concise. Output JSON format: {\"results\": [{\"url\": \"...\", \"isProduct\": boolean, \"cleanProductName\": \"...\"}]}",
              },
              {
                role: "user",
                content: `Classify these URLs:\n${promptList}`,
              },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
          }),
        });

        // Handle rate limits (429) gracefully with backoff
        if (response.status === 429) {
          const errorText = await response.text();
          if (attempt < maxAttempts) {
            let waitSeconds = 2.5;
            const retryHeader = response.headers.get("retry-after");
            if (retryHeader && !isNaN(Number(retryHeader))) {
              waitSeconds = Math.max(1.5, Number(retryHeader) + 0.5);
            } else {
              const match = errorText.match(/try again in ([\d\.]+)s/i);
              if (match && match[1]) {
                waitSeconds = Math.max(1.5, parseFloat(match[1]) + 0.5);
              }
            }
            console.warn(`[Groq TPM Backoff] HTTP 429. Waiting ${waitSeconds.toFixed(1)}s before retry ${attempt + 1}/${maxAttempts}...`);
            await sleep(waitSeconds * 1000);
            continue;
          } else {
            console.error(`[Groq TPM Exceeded] Max attempts reached for batch: ${errorText}`);
            throw new Error(`Groq API 429 rate limit exceeded`);
          }
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Groq API returned HTTP ${response.status}: ${errorText}`);
          throw new Error(`Groq API error: ${response.statusText}`);
        }

        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        if (!content) throw new Error("Empty Groq completion");

        let items: any[] = [];
        try {
          const parsed = JSON.parse(content);
          items = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.results)
            ? parsed.results
            : Array.isArray(parsed.products)
            ? parsed.products
            : [];
        } catch (pErr) {
          console.warn("Failed to parse Groq completion JSON:", content);
        }

        const docsToUpsert: any[] = [];

        for (const item of items) {
          if (!item.url) continue;
          const resObj: AIClassificationResult = {
            url: item.url,
            isProduct: Boolean(item.isProduct),
            cleanProductName: (item.cleanProductName || "").trim(),
          };
          results.set(item.url, resObj);

          docsToUpsert.push({
            url: item.url,
            slug: extractProductSlug(item.url),
            isProduct: resObj.isProduct,
            cleanProductName: resObj.cleanProductName,
            aiModel: model,
            extractedAt: new Date(),
          });
        }

        // Fill in any batch items that the LLM may have omitted
        for (const u of batch) {
          if (!results.has(u)) {
            const slug = extractProductSlug(u);
            const isInfo = isInformationalArticle(u) || isInformationalArticle(slug);
            const fallbackObj: AIClassificationResult = {
              url: u,
              isProduct: !isInfo,
              cleanProductName: !isInfo ? cleanProductSearchKeyword(slug) : "",
            };
            results.set(u, fallbackObj);
            docsToUpsert.push({
              url: u,
              slug,
              isProduct: fallbackObj.isProduct,
              cleanProductName: fallbackObj.cleanProductName,
              aiModel: "fallback",
              extractedAt: new Date(),
            });
          }
        }

        // Persist to MongoDB cache for zero subsequent API cost
        if (docsToUpsert.length > 0) {
          try {
            await ProductExtraction.bulkWrite(
              docsToUpsert.map((doc) => ({
                updateOne: {
                  filter: { url: doc.url },
                  update: { $set: doc },
                  upsert: true,
                },
              }))
            );
          } catch (writeErr) {
            console.warn("Failed caching AI extractions to MongoDB:", writeErr);
          }
        }

        batchSuccess = true;
      } catch (batchErr: any) {
        if (attempt >= maxAttempts || !batchErr.message?.includes("429")) {
          console.error(`Batch Groq classification failed (attempt ${attempt}/${maxAttempts}), using heuristic fallback:`, batchErr.message || batchErr);
          for (const u of batch) {
            const slug = extractProductSlug(u);
            const isInfo = isInformationalArticle(u) || isInformationalArticle(slug);
            results.set(u, {
              url: u,
              isProduct: !isInfo,
              cleanProductName: !isInfo ? cleanProductSearchKeyword(slug) : "",
            });
          }
          break;
        }
      }
    }

    // Pace consecutive batches by 650ms to ensure smooth token replenishment
    if (i + batchSize < missingFromCache.length) {
      await sleep(650);
    }
  }

  return results;
}
