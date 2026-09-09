import { connectToDatabase } from "../db/mongodb";
import { Website } from "../models/Website";
import { Settings } from "../models/Settings";
import { executeWebsiteScan, ScanExecutionResult } from "./scanEngine";
import { processNextQueueItem } from "../trends/trendsQueue";

export interface CronRunSummary {
  checkedCount: number;
  triggeredCount: number;
  trendsQueueProcessed?: number;
  results: Array<{
    websiteId: string;
    domain: string;
    result: ScanExecutionResult;
  }>;
}

/**
 * Checks for all due websites and runs their scheduled scans.
 * Enforces concurrency limits and atomic lock protection.
 */
export async function runDueScheduledScans(maxConcurrencyOverride?: number): Promise<CronRunSummary> {
  await connectToDatabase();
  const now = new Date();

  // 1. Find all active websites that are due for a scan and not currently scanning
  // or whose lock is older than 15 minutes (stale)
  const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);

  const dueWebsites = await Website.find({
    isActive: true,
    $or: [
      { nextScanAt: { $lte: now } },
      { nextScanAt: { $exists: false } },
    ],
    $and: [
      {
        $or: [
          { isScanning: false },
          { isScanning: { $exists: false } },
          { lockAcquiredAt: { $lt: staleThreshold } },
        ],
      },
    ],
  }).limit(20);

  const checkedCount = dueWebsites.length;
  if (checkedCount === 0) {
    return {
      checkedCount: 0,
      triggeredCount: 0,
      results: [],
    };
  }

  // Get max concurrency
  const defaultSettings = await Settings.findOne();
  const maxConcurrency = maxConcurrencyOverride || defaultSettings?.maxConcurrentScans || 3;

  const websitesToProcess = dueWebsites.slice(0, maxConcurrency);
  const results: Array<{ websiteId: string; domain: string; result: ScanExecutionResult }> = [];

  // Run scans concurrently up to maxConcurrency
  const scanPromises = websitesToProcess.map(async (site) => {
    const res = await executeWebsiteScan(String(site._id));
    return {
      websiteId: String(site._id),
      domain: site.domain,
      result: res,
    };
  });

  const executed = await Promise.all(scanPromises);
  results.push(...executed);

  // Process up to 2 queued trend items during cron runs (safe rate)
  let trendsQueueProcessed = 0;
  try {
    const item1 = await processNextQueueItem();
    if (item1.processed) trendsQueueProcessed++;
    if (item1.processed && (item1.remainingCount ?? 0) > 0) {
      await new Promise((r) => setTimeout(r, 2000));
      const item2 = await processNextQueueItem();
      if (item2.processed) trendsQueueProcessed++;
    }
  } catch (qErr) {
    console.warn("[Cron] Trends queue tick skipped:", qErr);
  }

  return {
    checkedCount,
    triggeredCount: executed.length,
    trendsQueueProcessed,
    results,
  };
}
