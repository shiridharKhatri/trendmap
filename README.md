# SitemapMonitor — Website Comparison & Sitemap Tracking Platform

A production-ready SaaS platform for automated sitemap discovery, continuous crawling, URL evolution tracking, and competitive content gap comparison.

Built with **Next.js (App Router)**, **TypeScript**, **MongoDB / Mongoose**, and **Tailwind CSS** with a restrained, high-density professional SaaS analytics aesthetic.

---

## Key Features

1. **Primary Website Baseline & Multi-Competitor Tracking**:
   - Establish one primary baseline website and track multiple competitors.
   - Automatically identify URLs that exist on competitor websites but are missing from your primary website.
2. **Automatic Sitemap Discovery**:
   - Probes `robots.txt` for `Sitemap:` directives.
   - Fallback probe for standard candidate paths (`/sitemap.xml`, `/sitemap_index.xml`, `/wp-sitemap.xml`).
   - Live interactive discovery preview with response codes and sample URL counts before saving.
3. **Robust Sitemap & Index Parser**:
   - Fast XML streaming parser supporting standard `<urlset>` and nested `<sitemapindex>` hierarchies.
   - Loop detection and max-recursion safeguards preventing XML bombs or infinite crawl loops.
   - Detects duplicate, invalid, and malformed URLs.
4. **URL Normalization Engine**:
   - Strips configurable tracking query parameters (`utm_*`, `fbclid`, `gclid`, `ref`, etc.).
   - Standardizes trailing slashes, scheme/host lowercasing, fragment removal, and port pruning.
5. **Change Tracking & Historical Scans**:
   - Compares successive scans: detects newly added URLs, removed URLs, and lastmod timestamp changes.
   - Complete audit trail of past scans with durations, file counts, and error summaries.
6. **Competitive Gap Analysis & Missing Pages**:
   - Real-time comparison metrics (Shared URLs, Missing from Baseline, Only on Baseline).
   - Dedicated Missing Pages table with review states, bulk review actions, and CSV export.
7. **Background Scheduling & Concurrency Locking**:
   - Cadences: Every 6h, 12h, 24h, 3 days, weekly, or custom intervals.
   - Atomic database locking (`isScanning` flag with automatic stale lock expiration) preventing duplicate scans.
   - Webhook cron endpoint (`/api/cron/scans`) protected by secret bearer token.
8. **Strict SSRF & Network Security**:
   - DNS resolution inspection disallowing private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`), IPv6 loopbacks, and cloud metadata endpoints.
   - Safe fetch wrapper with manual redirect re-validation.
9. **Restrained Professional UI**:
   - Off-white background (`#FAFAF8`), surface cards (`#FFFFFF`), charcoal text (`#171717`), and muted forest green accent (`#166534`).
   - Zero gradients, purple/neon colors, emojis, glassmorphism, or marketing fluff.

---

## Technology Stack

- **Framework**: Next.js 14/15 (App Router, Server Actions, Route Handlers)
- **Language**: TypeScript (Strict mode)
- **Database**: MongoDB with Mongoose ODM
- **Parsing**: `fast-xml-parser`
- **Styling**: Tailwind CSS
- **Authentication**: JWT session tokens with `jose` and `bcryptjs`
- **Testing**: Vitest unit & integration test suite

---

## Getting Started

### Prerequisites

- Node.js 18+ or 20+ (tested on Node v22)
- Local MongoDB running on `mongodb://127.0.0.1:27017` or a MongoDB Atlas connection URI

### Installation

```bash
git clone <repository_url>
cd sitemap-scrapper
npm install
```

### Environment Configuration

Create a `.env.local` file (or copy `.env.example`):

```bash
cp .env.example .env.local
```

Example configuration:

```env
# Database Connection
MONGODB_URI=mongodb://127.0.0.1:27017/sitemap_monitor

# Authentication Secret (Must be >= 32 characters)
AUTH_SECRET=your_production_jwt_secret_key_minimum_32_characters_long

# Base Application URL
APP_URL=http://localhost:3000

# Background Cron Endpoint Protection Secret
CRON_SECRET=your_production_cron_secret_token

# Scraper Safety & Concurrency Tuning
MAX_CONCURRENT_SCANS=3
REQUEST_TIMEOUT_MS=15000
MAX_SITEMAP_SIZE_BYTES=52428800
```

### Seed Initial Database

To seed realistic baseline data, competitor sitemaps, historical scans, and an administrator account:

```bash
npm run db:seed
```

**Default Admin Credentials**:
- **Email**: `admin@sitemapmonitor.io`
- **Password**: `admin12345`

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Automated Background Scanning & Cron Setup

The platform does not require a browser window to be open to execute scheduled scans. Scans can be triggered by any standard HTTP cron scheduler (e.g. crontab, Vercel Cron, GitHub Actions, AWS EventBridge):

### Cron Webhook

```bash
curl -X POST "http://localhost:3000/api/cron/scans?secret=YOUR_CRON_SECRET"
```
Or via Bearer authorization header:
```bash
curl -X POST "http://localhost:3000/api/cron/scans" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Crontab Example (runs every hour)

```bash
0 * * * * curl -s -X POST "http://localhost:3000/api/cron/scans?secret=YOUR_CRON_SECRET" > /dev/null
```

The cron worker:
1. Queries active websites where `nextScanAt <= now` and `isScanning === false`.
2. Acquires an atomic lock on the website record.
3. Concurrently processes scans up to `MAX_CONCURRENT_SCANS`.
4. Saves newly discovered, modified, and removed URLs.
5. Performs primary baseline diffing and generates alerts.
6. Computes the next scan date based on scan frequency and releases the lock.

---

## Running Tests

Execute the automated Vitest test suite:

```bash
npm test
```

Tests cover:
- URL normalization (trailing slashes, casing, parameter stripping, fragment removal)
- SSRF prevention (private IPs, loopback, AWS/GCP metadata endpoints)
- Recursive sitemap and index parsing
- Scheduled scan calculations across all cadences
- Competitor content gap diffing

---

## Database Architecture

- `users`: Account records with hashed passwords and roles.
- `websites`: Configured websites, domains, schedules, locks, and URL counters.
- `sitemaps`: Discovered sitemap files, HTTP response times, statuses, and URL counts.
- `pages`: Current inventory of normalized indexed URLs for each website.
- `scans`: Historical execution logs, durations, and URL change totals.
- `pagechanges`: Detected additions, removals, modifications, and primary baseline gaps.
- `comparisons`: Head-to-head competitive snapshot comparisons.
- `notifications`: In-app alert feeds for scan events and content gaps.
- `settings`: User preferences, default frequency, and ignored parameter lists.

---

## Production Build

To build the production-optimized Next.js bundle:

```bash
npm run build
npm start
```
