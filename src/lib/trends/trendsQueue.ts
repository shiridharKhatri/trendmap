/**
 * Overnight Background Demand Analysis Queue
 * Processes Google Trends data at a safe, gentle pace (2 to 3 items per minute)
 * to eliminate the need for expensive rotating proxies and prevent Google rate limits.
 */

import { connectToDatabase } from "../db/mongodb";
import { PageChange } from "../models/PageChange";
import { Website } from "../models/Website";
import { Settings } from "../models/Settings";
import { getProductTrend } from "./trendsService";

interface GlobalQueueState {
  __trendsQueueTimer?: NodeJS.Timeout | null;
  __trendsQueueActive?: boolean;
  __lastProcessedAt?: Date | null;
  __isProcessingItem?: boolean;
}

const globalState = globalThis as unknown as GlobalQueueState;

// Interval: 24,000ms = 2.5 items per minute (safely 2-3 items/min)
const QUEUE_INTERVAL_MS = 24000;

/**
 * Processes a single pending item from the queue.
 */
export async function processNextQueueItem(): Promise<{
  processed: boolean;
  item?: { id: string; keyword: string; score: number; priority: string };
  remainingCount?: number;
}> {
  if (globalState.__isProcessingItem) {
    return { processed: false };
  }

  globalState.__isProcessingItem = true;
  try {
    await connectToDatabase();

    // Find the oldest unranked missing product
    const candidate = await PageChange.findOne({
      type: "missing_from_primary",
      trendScore: { $exists: false },
    }).sort({ detectedAt: -1 });

    if (!candidate) {
      // Nothing left to process
      return { processed: false, remainingCount: 0 };
    }

    // Optional user SerpApi key from settings
    const website = await Website.findById(candidate.websiteId).lean();
    let serpApiKey: string | undefined;
    let defaultGeo = "US";

    if (website?.userId) {
      const settings = await Settings.findOne({ userId: website.userId }).lean();
      serpApiKey = settings?.serpApiKey;
      defaultGeo = settings?.defaultTrendGeo || "US";
    }

    const queryTerm = candidate.productSlug || candidate.normalizedUrl || candidate.url;
    const geo = candidate.trendGeo || defaultGeo;

    try {
      const trend = await getProductTrend(queryTerm, geo, "today 1-m", serpApiKey);

      candidate.trendScore = trend.score;
      candidate.trendPriority = trend.priority;
      candidate.trendGeo = trend.geo;
      candidate.trendExploreUrl = trend.exploreUrl;
      candidate.trendFetchedAt = new Date();
      candidate.trendQueueStatus = "completed";
      await candidate.save();

      globalState.__lastProcessedAt = new Date();

      const remainingCount = await PageChange.countDocuments({
        type: "missing_from_primary",
        trendScore: { $exists: false },
      });

      return {
        processed: true,
        item: {
          id: String(candidate._id),
          keyword: trend.keyword,
          score: trend.score,
          priority: trend.priority,
        },
        remainingCount,
      };
    } catch (trendErr) {
      console.warn(`[Trends Queue] Error analyzing "${queryTerm}":`, trendErr);
      candidate.trendQueueStatus = "failed";
      await candidate.save();
      return { processed: false };
    }
  } finally {
    globalState.__isProcessingItem = false;
  }
}

/**
 * Starts the gentle background queue worker (2-3 items per minute).
 */
export function startBackgroundQueueWorker(): boolean {
  if (globalState.__trendsQueueTimer) {
    globalState.__trendsQueueActive = true;
    return true;
  }

  globalState.__trendsQueueActive = true;

  // Process first item after 1 second, then every QUEUE_INTERVAL_MS
  setTimeout(async () => {
    if (globalState.__trendsQueueActive) {
      await processNextQueueItem().catch(() => {});
    }
  }, 1000);

  globalState.__trendsQueueTimer = setInterval(async () => {
    if (!globalState.__trendsQueueActive) return;

    try {
      const res = await processNextQueueItem();
      if (!res.processed && res.remainingCount === 0) {
        // Queue is finished, pause gently until more items are queued
        console.log("[Trends Queue] All queued items processed. Worker idling.");
        globalState.__trendsQueueActive = false;
        if (globalState.__trendsQueueTimer) {
          clearInterval(globalState.__trendsQueueTimer);
          globalState.__trendsQueueTimer = null;
        }
      }
    } catch (err) {
      console.error("[Trends Queue] Worker tick error:", err);
    }
  }, QUEUE_INTERVAL_MS);

  return true;
}

/**
 * Pauses the background queue worker.
 */
export function pauseBackgroundQueueWorker(): boolean {
  globalState.__trendsQueueActive = false;
  if (globalState.__trendsQueueTimer) {
    clearInterval(globalState.__trendsQueueTimer);
    globalState.__trendsQueueTimer = null;
  }
  return true;
}

/**
 * Queues all unranked missing products for background overnight analysis.
 */
export async function queueAllUnrankedProducts(userId?: string): Promise<{ queuedCount: number }> {
  await connectToDatabase();

  let filter: any = {
    type: "missing_from_primary",
    trendScore: { $exists: false },
  };

  if (userId) {
    const userWebsites = await Website.find({ userId }, { _id: 1 }).lean();
    const websiteIds = userWebsites.map((w) => w._id);
    filter.websiteId = { $in: websiteIds };
  }

  const result = await PageChange.updateMany(filter, {
    $set: { trendQueueStatus: "queued" },
  });

  const queuedCount = await PageChange.countDocuments(filter);

  if (queuedCount > 0) {
    startBackgroundQueueWorker();
  }

  return { queuedCount };
}

/**
 * Gets the current background queue status and statistics.
 */
export async function getQueueStatus(userId?: string): Promise<{
  active: boolean;
  queuedCount: number;
  completedCount: number;
  rate: string;
  lastProcessedAt: Date | null;
}> {
  await connectToDatabase();

  let baseFilter: any = { type: "missing_from_primary" };
  if (userId) {
    const userWebsites = await Website.find({ userId }, { _id: 1 }).lean();
    const websiteIds = userWebsites.map((w) => w._id);
    baseFilter.websiteId = { $in: websiteIds };
  }

  const queuedCount = await PageChange.countDocuments({
    ...baseFilter,
    trendScore: { $exists: false },
  });

  const completedCount = await PageChange.countDocuments({
    ...baseFilter,
    trendScore: { $exists: true },
  });

  return {
    active: Boolean(globalState.__trendsQueueActive && queuedCount > 0),
    queuedCount,
    completedCount,
    rate: "2 to 3 items/min",
    lastProcessedAt: globalState.__lastProcessedAt || null,
  };
}
