import mongoose from "mongoose";
import { Website } from "../models/Website";
import { Page } from "../models/Page";
import { PageChange } from "../models/PageChange";
import { Settings } from "../models/Settings";
import { extractProductSlug } from "../comparison/productMatcher";
import { isNonProduct } from "../trends/constants";

/**
 * Ensures a user has a designated primary baseline store and populates missing products
 * from indexed competitor pages into PageChange so the Missing Products checklist works immediately.
 */
export async function ensureMissingProductsPopulated(userId: string | mongoose.Types.ObjectId): Promise<{
  baselineWebsites: any[];
  missingCount: number;
  newlyPopulated: boolean;
}> {
  // 1. Check if user has an active baseline store
  let baselineWebsites = await Website.find({ userId, isPrimary: true }).lean();

  if (baselineWebsites.length === 0) {
    // Check if user settings has a primaryWebsiteId
    const settings = await Settings.findOne({ userId }).lean();
    if (settings?.primaryWebsiteId) {
      const site = await Website.findOne({ _id: settings.primaryWebsiteId, userId });
      if (site) {
        site.isPrimary = true;
        await site.save();
        baselineWebsites = [site.toObject()];
      }
    }

    // If still no primary website, pick a default baseline or the user's first registered website
    if (baselineWebsites.length === 0) {
      const preferredBaselines = [
        "dailyhealthsupplement.com",
        "thebuyersreviews.com",
        "supplementmag.com",
        "mysite.com",
      ];
      let candidate = await Website.findOne({
        userId,
        domain: { $in: preferredBaselines },
      });

      if (!candidate) {
        candidate = await Website.findOne({ userId }).sort({ createdAt: 1 });
      }

      if (candidate) {
        candidate.isPrimary = true;
        await candidate.save();
        baselineWebsites = [candidate.toObject()];
      }
    }
  }

  // 2. Fetch all competitor websites for this user
  const baselineIds = baselineWebsites.map((w) => w._id);
  const competitorWebsites = await Website.find({
    userId,
    _id: { $nin: baselineIds },
  }).lean();

  if (competitorWebsites.length === 0 || baselineWebsites.length === 0) {
    const existingCount = await PageChange.countDocuments({
      type: "missing_from_primary",
      websiteId: { $in: competitorWebsites.map((w) => w._id) },
    });
    return { baselineWebsites, missingCount: existingCount, newlyPopulated: false };
  }

  const competitorIds = competitorWebsites.map((w) => w._id);

  // Check if missing records already exist
  const existingMissingCount = await PageChange.countDocuments({
    websiteId: { $in: competitorIds },
    type: "missing_from_primary",
  });

  if (existingMissingCount > 0) {
    return { baselineWebsites, missingCount: existingMissingCount, newlyPopulated: false };
  }

  // 3. Populate missing products from active competitor pages
  const baselinePages = await Page.find(
    { websiteId: { $in: baselineIds }, isActive: true },
    { normalizedUrl: 1, lastmod: 1 }
  ).lean();

  const baselineSlugSet = new Set<string>();
  const baselinePathSet = new Set<string>();

  for (const p of baselinePages) {
    const slug = extractProductSlug(p.normalizedUrl);
    if (slug) baselineSlugSet.add(slug.toLowerCase().trim());
    try {
      const u = new URL(p.normalizedUrl);
      baselinePathSet.add(u.pathname.toLowerCase().replace(/\/$/, ""));
    } catch {}
  }

  const docsToInsert: any[] = [];
  const seenMissingSlugsPerComp = new Map<string, Set<string>>();

  // Extract competitor products missing from baseline
  for (const cw of competitorWebsites) {
    const compPages = await Page.find(
      { websiteId: cw._id, isActive: true },
      { normalizedUrl: 1, originalUrl: 1, lastmod: 1, firstSeenAt: 1, createdAt: 1 }
    )
      .sort({ lastmod: -1, createdAt: -1 })
      .limit(100)
      .lean();

    let compSeen = seenMissingSlugsPerComp.get(String(cw._id));
    if (!compSeen) {
      compSeen = new Set<string>();
      seenMissingSlugsPerComp.set(String(cw._id), compSeen);
    }

    let compMissingCount = 0;

    for (const cp of compPages) {
      const slug = extractProductSlug(cp.normalizedUrl);
      if (
        !slug ||
        isNonProduct(slug) ||
        isNonProduct(cp.normalizedUrl) ||
        !/[a-zA-Z]/.test(slug) ||
        /^\d+$/.test(slug)
      ) {
        continue;
      }

      const cleanSlug = slug.toLowerCase().trim();
      let path = "";
      try {
        path = new URL(cp.normalizedUrl).pathname.toLowerCase().replace(/\/$/, "");
      } catch {}

      // If exists on our baseline store, it's not missing!
      if (baselineSlugSet.has(cleanSlug) || (path && baselinePathSet.has(path))) {
        continue;
      }

      // Avoid duplicates for the same competitor
      if (compSeen.has(cleanSlug)) {
        continue;
      }
      compSeen.add(cleanSlug);
      compMissingCount++;

      docsToInsert.push({
        websiteId: cw._id,
        url: cp.originalUrl || cp.normalizedUrl,
        normalizedUrl: cp.normalizedUrl,
        type: "missing_from_primary",
        detectedAt: cp.firstSeenAt || cp.createdAt || new Date(),
        currentLastmod: cp.lastmod || cp.firstSeenAt || new Date(),
        isReviewed: false,
        productSlug: slug,
      });
    }

    if (compMissingCount > 0) {
      await Website.updateOne(
        { _id: cw._id },
        { $set: { missingUrlsCount: compMissingCount } }
      );
    }
  }

  if (docsToInsert.length > 0) {
    await PageChange.insertMany(docsToInsert, { ordered: false });
  }

  return {
    baselineWebsites,
    missingCount: docsToInsert.length,
    newlyPopulated: true,
  };
}
