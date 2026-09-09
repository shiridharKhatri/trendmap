import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../src/lib/models/User";
import { Website } from "../src/lib/models/Website";
import { Sitemap } from "../src/lib/models/Sitemap";
import { Page } from "../src/lib/models/Page";
import { Scan } from "../src/lib/models/Scan";
import { PageChange } from "../src/lib/models/PageChange";
import { Comparison } from "../src/lib/models/Comparison";
import { Notification } from "../src/lib/models/Notification";
import { Settings } from "../src/lib/models/Settings";
import { calculateNextScanAt } from "../src/lib/scanner/scanEngine";

const rawMongoUri = process.env.MONGODB_URI;
if (!rawMongoUri) {
  throw new Error("CRITICAL ERROR: MONGODB_URI environment variable is required to run seed script.");
}
const MONGODB_URI: string = rawMongoUri;

const rawCronSecret = process.env.CRON_SECRET;
if (!rawCronSecret) {
  throw new Error("CRITICAL ERROR: CRON_SECRET environment variable is required to run seed script.");
}
const CRON_SECRET: string = rawCronSecret;

async function seed() {
  console.log("Connecting to MongoDB at:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  // Clear existing collections to provide a pristine state
  console.log("Clearing previous seed data...");
  await Promise.all([
    User.deleteMany({ email: "admin@sitemapmonitor.io" }),
    Website.deleteMany({}),
    Sitemap.deleteMany({}),
    Page.deleteMany({}),
    Scan.deleteMany({}),
    PageChange.deleteMany({}),
    Comparison.deleteMany({}),
    Notification.deleteMany({}),
    Settings.deleteMany({}),
  ]);

  // 1. Create Default Admin User
  console.log("Creating default administrator account...");
  const passwordHash = await bcrypt.hash("admin12345", 10);
  const user = await User.create({
    email: "admin@sitemapmonitor.io",
    passwordHash,
    name: "Alex Vance",
    role: "admin",
  });

  // 2. Create User Settings
  console.log("Creating default settings...");
  const settings = await Settings.create({
    userId: user._id,
    defaultScanFrequency: "24h",
    ignoredQueryParams: [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "msclkid",
      "ref",
      "mc_cid",
      "mc_eid",
    ],
    maxConcurrentScans: 3,
    requestTimeoutMs: 15000,
    maxRetries: 3,
    cronSecret: CRON_SECRET,
  });

  // 3. Create Primary Baseline Website (mysite.com)
  console.log("Seeding primary baseline website...");
  const primarySite = await Website.create({
    userId: user._id,
    name: "My Organization",
    url: "https://mysite.com",
    domain: "mysite.com",
    sitemapUrl: "https://mysite.com/sitemap.xml",
    isPrimary: true,
    isActive: true,
    scanFrequency: "12h",
    nextScanAt: calculateNextScanAt("12h"),
    lastScanAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    lastScanStatus: "healthy",
    isScanning: false,
    totalUrls: 25,
    missingUrlsCount: 0,
    newUrlsCount: 2,
  });

  // Link primary in settings
  settings.primaryWebsiteId = primarySite._id as any;
  await settings.save();

  // Create Primary Sitemap File Record
  await Sitemap.create({
    websiteId: primarySite._id,
    url: "https://mysite.com/sitemap.xml",
    type: "sitemap",
    lastFetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    httpStatus: 200,
    responseTimeMs: 245,
    status: "valid",
    urlCount: 25,
  });

  // Base primary URL paths
  const primaryPaths = [
    "/",
    "/about",
    "/features",
    "/pricing",
    "/contact",
    "/docs",
    "/docs/getting-started",
    "/docs/api",
    "/docs/authentication",
    "/docs/webhooks",
    "/blog",
    "/blog/introducing-sitemap-monitor",
    "/blog/seo-best-practices-2026",
    "/blog/how-to-fix-404-errors",
    "/careers",
    "/privacy",
    "/terms",
    "/integrations",
    "/integrations/slack",
    "/integrations/github",
    "/integrations/zapier",
    "/customers",
    "/customers/case-study-fintech",
    "/security",
    "/changelog",
  ];

  for (const path of primaryPaths) {
    const fullUrl = `https://mysite.com${path}`;
    await Page.create({
      websiteId: primarySite._id,
      normalizedUrl: fullUrl,
      originalUrl: fullUrl,
      lastmod: new Date(Date.now() - Math.floor(Math.random() * 20) * 86400000),
      changefreq: "weekly",
      priority: path === "/" ? 1.0 : 0.8,
      sourceSitemap: "https://mysite.com/sitemap.xml",
      firstSeenAt: new Date(Date.now() - 30 * 86400000),
      lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      isActive: true,
      isReviewed: false,
    });
  }

  // 4. Create Monitored Competitor 1 (competitor1.com)
  console.log("Seeding monitored competitor 1 (competitor1.com)...");
  const competitor1 = await Website.create({
    userId: user._id,
    name: "Competitor Alpha",
    url: "https://competitor1.com",
    domain: "competitor1.com",
    sitemapUrl: "https://competitor1.com/sitemap_index.xml",
    isPrimary: false,
    isActive: true,
    scanFrequency: "24h",
    nextScanAt: calculateNextScanAt("24h"),
    lastScanAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    lastScanStatus: "healthy",
    isScanning: false,
    totalUrls: 32,
    missingUrlsCount: 8,
    newUrlsCount: 3,
  });

  await Sitemap.create({
    websiteId: competitor1._id,
    url: "https://competitor1.com/sitemap_index.xml",
    type: "index",
    lastFetchedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    httpStatus: 200,
    responseTimeMs: 312,
    status: "valid",
    urlCount: 32,
  });

  const competitor1Paths = [
    // Shared with primary
    "/",
    "/about",
    "/features",
    "/pricing",
    "/contact",
    "/docs",
    "/docs/getting-started",
    "/docs/api",
    "/privacy",
    "/terms",
    "/careers",
    "/security",
    // Missing from primary (Competitor Content Gaps!)
    "/blog/best-running-shoes-for-beginners",
    "/blog/ultimate-guide-to-sitemap-indexing",
    "/blog/competitor-seo-gap-analysis",
    "/tools/free-sitemap-validator",
    "/tools/xml-generator",
    "/compare/competitor1-vs-mysite",
    "/enterprise-sla-agreement",
    "/whitepapers/state-of-technical-seo-2026",
    // More shared/common
    "/customers",
    "/integrations",
    "/changelog",
    "/faq",
    "/resources",
    "/support",
    "/community",
    "/press",
    "/status",
    "/webinars",
    "/guides/sitemap-troubleshooting",
    "/partners",
  ];

  // Create scan record for competitor1
  const comp1Scan = await Scan.create({
    websiteId: competitor1._id,
    status: "completed",
    startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000 - 15000),
    completedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    durationMs: 14820,
    totalUrls: 32,
    newUrls: 3,
    removedUrls: 1,
    missingFromPrimaryCount: 8,
    duplicateUrls: 0,
    invalidUrls: 0,
    errorCount: 0,
    processedFiles: 2,
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
  });

  const missingGapsComp1 = [
    "/blog/best-running-shoes-for-beginners",
    "/blog/ultimate-guide-to-sitemap-indexing",
    "/blog/competitor-seo-gap-analysis",
    "/tools/free-sitemap-validator",
    "/tools/xml-generator",
    "/compare/competitor1-vs-mysite",
    "/enterprise-sla-agreement",
    "/whitepapers/state-of-technical-seo-2026",
  ];

  for (const path of competitor1Paths) {
    const fullUrl = `https://competitor1.com${path}`;
    await Page.create({
      websiteId: competitor1._id,
      normalizedUrl: fullUrl,
      originalUrl: fullUrl,
      lastmod: new Date(Date.now() - Math.floor(Math.random() * 15) * 86400000),
      changefreq: "weekly",
      priority: 0.8,
      sourceSitemap: "https://competitor1.com/sitemap_index.xml",
      firstSeenAt: new Date(Date.now() - 20 * 86400000),
      lastSeenAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      isActive: true,
      isReviewed: false,
    });
  }

  // Insert PageChanges for competitor1
  for (const missingPath of missingGapsComp1) {
    await PageChange.create({
      websiteId: competitor1._id,
      scanId: comp1Scan._id,
      url: `https://competitor1.com${missingPath}`,
      normalizedUrl: `https://competitor1.com${missingPath}`,
      type: "missing_from_primary",
      detectedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      isReviewed: false,
    });
  }

  // Insert New URLs for competitor1
  await PageChange.create({
    websiteId: competitor1._id,
    scanId: comp1Scan._id,
    url: "https://competitor1.com/tools/free-sitemap-validator",
    normalizedUrl: "https://competitor1.com/tools/free-sitemap-validator",
    type: "added",
    detectedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    isReviewed: false,
  });
  await PageChange.create({
    websiteId: competitor1._id,
    scanId: comp1Scan._id,
    url: "https://competitor1.com/blog/competitor-seo-gap-analysis",
    normalizedUrl: "https://competitor1.com/blog/competitor-seo-gap-analysis",
    type: "added",
    detectedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    isReviewed: false,
  });

  // 5. Create Monitored Competitor 2 (competitor2.io)
  console.log("Seeding monitored competitor 2 (competitor2.io)...");
  const competitor2 = await Website.create({
    userId: user._id,
    name: "Competitor Beta",
    url: "https://competitor2.io",
    domain: "competitor2.io",
    sitemapUrl: "https://competitor2.io/sitemap.xml",
    isPrimary: false,
    isActive: true,
    scanFrequency: "24h",
    nextScanAt: calculateNextScanAt("24h"),
    lastScanAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
    lastScanStatus: "healthy",
    isScanning: false,
    totalUrls: 18,
    missingUrlsCount: 4,
    newUrlsCount: 1,
  });

  await Sitemap.create({
    websiteId: competitor2._id,
    url: "https://competitor2.io/sitemap.xml",
    type: "sitemap",
    lastFetchedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
    httpStatus: 200,
    responseTimeMs: 188,
    status: "valid",
    urlCount: 18,
  });

  const comp2Scan = await Scan.create({
    websiteId: competitor2._id,
    status: "completed",
    startedAt: new Date(Date.now() - 8 * 60 * 60 * 1000 - 8000),
    completedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
    durationMs: 7650,
    totalUrls: 18,
    newUrls: 1,
    removedUrls: 0,
    missingFromPrimaryCount: 4,
    duplicateUrls: 0,
    invalidUrls: 0,
    errorCount: 0,
    processedFiles: 1,
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
  });

  const comp2Paths = [
    "/",
    "/pricing",
    "/features",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/blog/ai-search-crawlers",
    "/blog/google-sitemap-limits-2026",
    "/integrations/wordpress",
    "/integrations/webflow",
    "/enterprise",
    "/docs",
    "/changelog",
    // Missing
    "/solutions/e-commerce-seo",
    "/solutions/saas-growth",
    "/calculator/site-health",
    "/podcast/episode-42",
  ];

  for (const path of comp2Paths) {
    const fullUrl = `https://competitor2.io${path}`;
    await Page.create({
      websiteId: competitor2._id,
      normalizedUrl: fullUrl,
      originalUrl: fullUrl,
      lastmod: new Date(),
      changefreq: "monthly",
      priority: 0.7,
      sourceSitemap: "https://competitor2.io/sitemap.xml",
      firstSeenAt: new Date(Date.now() - 10 * 86400000),
      lastSeenAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      isActive: true,
      isReviewed: false,
    });
  }

  for (const p of ["/solutions/e-commerce-seo", "/solutions/saas-growth", "/calculator/site-health", "/podcast/episode-42"]) {
    await PageChange.create({
      websiteId: competitor2._id,
      scanId: comp2Scan._id,
      url: `https://competitor2.io${p}`,
      normalizedUrl: `https://competitor2.io${p}`,
      type: "missing_from_primary",
      detectedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      isReviewed: false,
    });
  }

  // 6. Create Initial Comparison Snapshot
  console.log("Creating comparison snapshot records...");
  await Comparison.create({
    primaryWebsiteId: primarySite._id,
    monitoredWebsiteId: competitor1._id,
    scanId: comp1Scan._id,
    totalPrimaryUrls: 25,
    totalMonitoredUrls: 32,
    matchingUrls: 24,
    missingUrls: 8,
    newUrls: 3,
    removedUrls: 1,
  });

  await Comparison.create({
    primaryWebsiteId: primarySite._id,
    monitoredWebsiteId: competitor2._id,
    scanId: comp2Scan._id,
    totalPrimaryUrls: 25,
    totalMonitoredUrls: 18,
    matchingUrls: 14,
    missingUrls: 4,
    newUrls: 1,
    removedUrls: 0,
  });

  // 7. Create In-App Notifications
  console.log("Creating initial notifications...");
  await Notification.create({
    userId: user._id,
    websiteId: competitor1._id,
    title: "Scan finished for competitor1.com",
    message: "32 URLs scanned. +3 new URLs detected and 8 content gaps identified.",
    type: "info",
    isRead: false,
  });
  await Notification.create({
    userId: user._id,
    websiteId: competitor2._id,
    title: "Scan finished for competitor2.io",
    message: "18 URLs scanned. 4 missing pages detected against primary baseline.",
    type: "info",
    isRead: false,
  });

  console.log("✓ Seeding complete!");
  console.log("  Default Admin Login:");
  console.log("  Email:    admin@sitemapmonitor.io");
  console.log("  Password: admin12345");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
