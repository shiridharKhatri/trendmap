export type ScanFrequency = "6h" | "12h" | "24h" | "3d" | "weekly" | "custom";

export type WebsiteStatus = "healthy" | "scanning" | "scheduled" | "warning" | "error" | "disabled";

export type ScanStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type PageChangeType = "added" | "removed" | "changed" | "missing_from_primary";

export type NotificationType = "info" | "warning" | "error" | "success";

export interface IUser {
  _id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
}

export interface IWebsite {
  _id: string;
  userId: string;
  name: string;
  url: string;
  domain: string;
  sitemapUrl?: string;
  isPrimary: boolean;
  isActive: boolean;
  scanFrequency: ScanFrequency;
  customFrequencyHours?: number;
  nextScanAt?: string;
  lastScanAt?: string;
  lastScanStatus?: WebsiteStatus;
  lastScanErrorMessage?: string;
  isScanning: boolean;
  lockAcquiredAt?: string;
  totalUrls: number;
  missingUrlsCount: number;
  newUrlsCount: number;
  crawlScope?: "all" | "products" | "blog" | "custom";
  urlIncludePatterns?: string[];
  urlExcludePatterns?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ISitemap {
  _id: string;
  websiteId: string;
  url: string;
  type: "sitemap" | "index";
  lastFetchedAt?: string;
  httpStatus?: number;
  responseTimeMs?: number;
  status: "valid" | "error" | "warning";
  urlCount: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IPage {
  _id: string;
  websiteId: string;
  normalizedUrl: string;
  originalUrl: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
  sourceSitemap?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
  isReviewed?: boolean;
  title?: string;
  httpStatus?: number;
  createdAt: string;
  updatedAt: string;
}

export interface IScan {
  _id: string;
  websiteId: string;
  status: ScanStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  totalUrls: number;
  newUrls: number;
  removedUrls: number;
  missingFromPrimaryCount: number;
  duplicateUrls: number;
  invalidUrls: number;
  errorCount: number;
  errorMessage?: string;
  processedFiles: number;
  createdAt: string;
}

export interface IPageChange {
  _id: string;
  websiteId: string;
  url: string;
  normalizedUrl: string;
  type: PageChangeType;
  previousScanId?: string;
  currentScanId: string;
  detectedAt: string;
  previousLastmod?: string;
  currentLastmod?: string;
  isReviewed: boolean;
  websiteDomain?: string;
  websiteName?: string;
  productSlug?: string;
  matchedUrl?: string;
  similarityScore?: number;
  trendScore?: number;
  trendPriority?: "high" | "medium" | "low";
  trendGeo?: string;
  trendExploreUrl?: string;
  trendFetchedAt?: string;
}

export interface IComparison {
  _id: string;
  primaryWebsiteId: string;
  monitoredWebsiteId: string;
  scanId?: string;
  totalPrimaryUrls: number;
  totalMonitoredUrls: number;
  matchingUrls: number;
  missingUrls: number;
  newUrls: number;
  removedUrls: number;
  createdAt: string;
}

export interface INotification {
  _id: string;
  userId: string;
  websiteId?: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
}

export interface ISettings {
  _id: string;
  userId: string;
  primaryWebsiteId?: string;
  defaultScanFrequency: ScanFrequency;
  ignoredQueryParams: string[];
  maxConcurrentScans: number;
  requestTimeoutMs: number;
  maxRetries: number;
  cronSecret: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveredChildSitemap {
  url: string;
  filename: string;
  category: "products" | "posts" | "pages" | "categories" | "other";
  lastmod?: string;
}

export interface DiscoveredSitemapCandidate {
  url: string;
  source: "robots.txt" | "common_path" | "user";
  status?: number;
  valid: boolean;
  type?: "sitemap" | "index";
  sampleUrlCount?: number;
  childSitemaps?: DiscoveredChildSitemap[];
  hasProductSitemap?: boolean;
  detectedProductSitemaps?: string[];
  summary?: {
    productsCount: number;
    postsCount: number;
    pagesCount: number;
    otherCount: number;
  };
}
