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
  // Conservative batch size (4 URLs) to stay safely under Groq's sliding TPM limits
  const batchSize = options?.batchSize || 4;

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
    let currentModel = model;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts && !batchSuccess; attempt++) {
      try {
        const response = await fetch(DEFAULT_GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: currentModel,
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

        // Handle rate limits (429) gracefully with adaptive backoff and model fallback
        if (response.status === 429) {
          const errorText = await response.text();
          if (attempt < maxAttempts) {
            let waitMs = 2000;
            const retryHeader = response.headers.get("retry-after");
            if (retryHeader && !isNaN(Number(retryHeader))) {
              waitMs = Math.max(1000, Number(retryHeader) * 1000 + 500);
            } else {
              const msMatch = errorText.match(/try again in ([\d\.]+)ms/i);
              const secMatch = errorText.match(/try again in ([\d\.]+)s/i);
              if (msMatch && msMatch[1]) {
                waitMs = Math.max(600, Math.ceil(parseFloat(msMatch[1])) + 350);
              } else if (secMatch && secMatch[1]) {
                waitMs = Math.max(1000, Math.ceil(parseFloat(secMatch[1]) * 1000) + 500);
              }
            }

            // Step down model if TPM constrained (120b has 8k TPM; 20b has 15k; llama-3.1-8b has 30k)
            if (attempt >= 2 && currentModel.includes("120b")) {
              console.warn(
                `[Groq TPM Backoff] Model '${currentModel}' hit TPM limit on attempt ${attempt}. Switching batch to 'openai/gpt-oss-20b' for higher TPM throughput.`
              );
              currentModel = "openai/gpt-oss-20b";
            } else if (attempt >= 3 && currentModel !== "llama-3.1-8b-instant") {
              console.warn(
                `[Groq TPM Backoff] Still rate-limited on attempt ${attempt}. Switching batch to 'llama-3.1-8b-instant' (30k TPM quota).`
              );
              currentModel = "llama-3.1-8b-instant";
            }

            console.warn(
              `[Groq TPM Backoff] HTTP 429 (${currentModel}). Waiting ${(waitMs / 1000).toFixed(2)}s before retry ${attempt + 1}/${maxAttempts}...`
            );
            await sleep(waitMs);
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
            aiModel: currentModel,
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
          console.error(
            `Batch Groq classification failed (attempt ${attempt}/${maxAttempts}), using heuristic fallback:`,
            batchErr.message || batchErr
          );
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

    // Pace consecutive batches by 1200ms to ensure smooth token replenishment under sliding TPM window
    if (i + batchSize < missingFromCache.length) {
      await sleep(1200);
    }
  }

  return results;
}
