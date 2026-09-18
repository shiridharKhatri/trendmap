// Supported Geo / Country codes for Google Trends
export const SUPPORTED_GEOS = [
  { code: "", name: "Worldwide (Global)" },
  { code: "US", name: "United States (US)" },
  { code: "GB", name: "United Kingdom (UK)" },
  { code: "CA", name: "Canada (CA)" },
  { code: "AU", name: "Australia (AU)" },
  { code: "DE", name: "Germany (DE)" },
  { code: "FR", name: "France (FR)" },
  { code: "IT", name: "Italy (IT)" },
  { code: "ES", name: "Spain (ES)" },
  { code: "NL", name: "Netherlands (NL)" },
  { code: "JP", name: "Japan (JP)" },
  { code: "IN", name: "India (IN)" },
  { code: "BR", name: "Brazil (BR)" },
] as const;

// Supported Timeframe / Date range options for Google Trends
export const SUPPORTED_TIMEFRAMES = [
  { code: "today 12-m", name: "Past 12 Months (Past Year)" },
  { code: "today 5-y", name: "Past 5 Years" },
  { code: "today 3-m", name: "Past 3 Months" },
  { code: "today 1-m", name: "Past 30 Days" },
  { code: "now 7-d", name: "Past 7 Days" },
  { code: "all", name: "2004 - Present (All Time)" },
] as const;

export type TrendPriority = "high" | "medium" | "low";

// Comprehensive set of country, region, nationality names, and ISO codes
export const COUNTRY_AND_NATIONALITY_WORDS = new Set([
  // North America
  "usa",
  "us",
  "america",
  "american",
  "canada",
  "canadian",
  "mexico",
  "mexican",
  // Europe
  "uk",
  "gb",
  "britain",
  "british",
  "england",
  "english",
  "scotland",
  "scottish",
  "wales",
  "welsh",
  "ireland",
  "irish",
  "italy",
  "italia",
  "italian",
  "germany",
  "german",
  "deutschland",
  "france",
  "french",
  "spain",
  "spanish",
  "espana",
  "netherlands",
  "dutch",
  "holland",
  "sweden",
  "swedish",
  "norway",
  "norwegian",
  "denmark",
  "danish",
  "finland",
  "finnish",
  "switzerland",
  "swiss",
  "austria",
  "austrian",
  "belgium",
  "belgian",
  "portugal",
  "portuguese",
  "greece",
  "greek",
  "europe",
  "european",
  "eu",
  // Asia Pacific
  "australia",
  "australian",
  "aussie",
  "nz",
  "japan",
  "japanese",
  "china",
  "chinese",
  "india",
  "indian",
  "singapore",
  "singaporean",
  "korea",
  "korean",
  "philippines",
  "filipino",
  "thailand",
  "thai",
  "vietnam",
  "vietnamese",
  "indonesia",
  "indonesian",
  "malaysia",
  "malaysian",
  "asia",
  "asian",
  // South America & Africa
  "brazil",
  "brazilian",
  "brasil",
  "africa",
  "african",
  // Global
  "global",
  "worldwide",
]);

// Multi-word country & region phrases to strip prior to tokenization
export const MULTI_WORD_REGIONS = [
  "united states of america",
  "united states",
  "united kingdom",
  "great britain",
  "new zealand",
  "south africa",
  "puerto rico",
  "hong kong",
  "saudi arabia",
  "united arab emirates",
  "czech republic",
];

// Patterns representing non-product services, legal lead-gen, trade contractors, loans
const NON_PRODUCT_PATTERNS = [
  // Legal, Lawsuits, Personal Injury & Accident Claims
  /\bpersonal\s+injury\b/i,
  /\bpain(\s+and)?\s+suffering\b/i,
  /\baccident\s+(lawyer|attorney|claim|claims|settlement|law\s+firm)\b/i,
  /\b(car|truck|motorcycle|auto|vehicle)\s+accident\b/i,
  /\bslip\s+and\s+fall\b/i,
  /\bmedical\s+malpractice\b/i,
  /\bwrongful\s+death\b/i,
  /\blaw\s+firm\b/i,
  /\b(lawyer|lawyers|attorney|attorneys)\b/i,
  /\b(lawsuit|lawsuits|class\s+action|litigation)\b/i,
  /\bworkers?\s+comp(ensation)?\b/i,
  /\bcompensation\s+claim\b/i,
  /\b(settlement|settlements)\s+(amount|payout|calculator|offer)\b/i,
  /\bstructured\s+settlement\b/i,
  /\bdisability\s+(claim|benefits|lawyer)\b/i,

  // Home Services, Trades, Remodeling & Contractor Lead Gen
  /\b(bathroom|kitchen|home|house|basement)\s+(renovation|remodel|remodeling|makeover)\b/i,
  /\bone\s+day\s+bathroom\b/i,
  /\bwalk\s+in\s+tub\b/i,
  /\broof\s+(replacement|repair|inspection)\b/i,
  /\broofing\s+(contractor|company|services?)\b/i,
  /\bhvac\s+(repair|service|installation|replacement)\b/i,
  /\bac\s+repair\b/i,
  /\bair\s+conditioning\s+(repair|installation|service)\b/i,
  /\bplumbing\s+(service|services|repair|contractor)\b/i,
  /\bpest\s+control\b/i,
  /\btermite\s+(treatment|inspection|control)\b/i,
  /\bgutter\s+(cleaning|installation|repair|guards)\b/i,
  /\bgarage\s+door\s+(repair|installation|opener)\b/i,
  /\bwindow\s+(replacement|installation)\b/i,
  /\bflooring\s+(installation|contractor)\b/i,
  /\bcarpet\s+cleaning\b/i,
  /\btree\s+(removal|trimming|service)\b/i,
  /\bsolar\s+panel\s+(installation|cost)\b/i,
  /\bfoundation\s+repair\b/i,
  /\bbasement\s+waterproofing\b/i,

  // Financial, Lending, Debt & Insurance Lead Gen
  /\bmortgage\s+(rates?|refinance|calculator|lender)\b/i,
  /\b(refinance|refinancing)\s+(rates?|mortgage)\b/i,
  /\bpayday\s+loans?\b/i,
  /\bdebt\s+(consolidation|relief|settlement)\b/i,
  /\bcredit\s+repair\b/i,
  /\bbail\s+bonds?\b/i,
  /\b(auto|life|homeowners?)\s+insurance\s+(quotes?|rates?)\b/i,

  // Standard Website Utility Pages
  /\bprivacy\s+policy\b/i,
  /\bterms\s+(of\s+service|and\s+conditions|of\s+use)\b/i,
  /\bcontact\s+us\b/i,
  /\babout\s+us\b/i,
  /\bdisclaimer\b/i,
  /\bcookie\s+policy\b/i,

  // Editorial, Methodology, Rating Standards & Disclosures
  /\bmethodology\b/i,
  /\beditorial(\s+(policy|policies|guidelines?|standards?))?\b/i,
  /\bcorrections?(\s+policy)?\b/i,
  /\bhow\s+we\s+(rate|test|review|score|evaluate)(\s+products?)?\b/i,
  /\b(product\s+)?claim\s+standards?\b/i,
  /\b(affiliate\s+|advertiser\s+|advertising\s+)?disclosures?\b/i,

  // Buying Guides, Alternatives, Category Lists & Test Pages
  /\b(buying|buyers?|shopping|gift)\s+guides?\b/i,
  /\bcompact\s+tools\s+under\s+\$?\d+\b/i,
  /\b(tools|products|gifts|items|gadgets)\s+under\s+\$?\d+\b/i,
  /\balternatives?\b/i,
  /\bopiniones\b/i,
  /^(test|tests|test\s+(page|site|product|item|demo))$/i,

  // Generic Cooling & AC Roundups
  /\bcooling\s+options?\b/i,
  /\bpersonal\s+air\s+coolers?\b/i,
  /\bsmall\s+room\s+cooling(\s+options?)?\b/i,
  /\bportable\s+cooling(\s+(device|devices|unit|units|system|systems|options?))?\b/i,

  // Non-Product Fitness Challenges, Health Programs & Generic Medicine Guides
  /\b(30\s*day\s+)?booty\s+camp\b/i,
  /\bkidney\s+disease\s+solution(\s+program)?\b/i,
  /\b(over\s+the\s+counter|otc)\s+(.*?\s+)?heartburn(\s+medicine)?\b/i,
  /\bheartburn\s+medicine\b/i,
];

/**
 * Detects whether a URL or slug represents a non-product page
 * (e.g. Personal Injury law firms, Pain and Suffering claims, Bathroom/Kitchen renovation services, mortgage rates).
 */
export function isNonProduct(urlOrSlug: string): boolean {
  if (!urlOrSlug) return false;

  let target = urlOrSlug.trim();
  try {
    if (target.startsWith("http://") || target.startsWith("https://")) {
      target = new URL(target).pathname;
    }
  } catch {}

  // Strip file extensions
  target = target.replace(/\.(html?|php|aspx?)$/i, "");

  // Check standalone test page
  const lastSegment = target.split("/").filter(Boolean).pop() || target;
  const cleanSegment = lastSegment.replace(/[[\](){}<>]+/g, " ").trim().toLowerCase();
  if (/^(test|tests|test[-_]page|testing)$/i.test(cleanSegment)) {
    return true;
  }

  const normalized = target
    .replace(/[[\](){}<>]+/g, " ")
    .replace(/[-_/]+/g, " ")
    .replace(/%20/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return NON_PRODUCT_PATTERNS.some((pattern) => pattern.test(normalized));
}

// Noise words in review titles and affiliate content
const NOISE_WORDS = new Set([
  "reviews",
  "review",
  "ratings",
  "rating",
  "tested",
  "complaints",
  "complaint",
  "scam",
  "scams",
  "legit",
  "update",
  "updated",
  "worth",
  "cost",
  "price",
  "results",
  "result",
  "safe",
  "buy",
  "shop",
  "online",
  "cheap",
  "is",
  "it",
  "real",
  "or",
  "does",
  "work",
  "working",
  "side",
  "effects",
  "effect",
  "ingredients",
  "ingredient",
  "truth",
  "honest",
  "customer",
  "official",
  "website",
  "where",
  "to",
  "pros",
  "cons",
  "vs",
  "versus",
  "comparison",
  "fake",
  "alert",
  "exposed",
  "warning",
  "user",
  "experience",
  "benefits",
  "benefit",
  "dosage",
  "must",
  "read",
  "before",
  "after",
  "discount",
  "coupon",
  "code",
  "promo",
  "promocode",
  "free",
  "shipping",
  "order",
  "orders",
  "guarantee",
  "offer",
  "deals",
  "deal",
  "today",
  "the",
  "in",
  "on",
  "at",
  "by",
  "from",
]);

/**
 * Strips affiliate review words, year numbers, "for" clauses, country names,
 * and leading prefix noise ("Benefits of", "Side effects of", etc.) to isolate the pure product name.
 * 
 * Examples:
 * - "Benefits Of Cbd Gummies" -> "Cbd Gummies"
 * - "Green Antidote For Diabetes" -> "Green Antidote"
 * - "Lumo Therapy Italy" -> "Lumo Therapy"
 * - "All Multipurpose Cleaner" -> "All Multipurpose Cleaner"
 * - "Pain Suffering Personal Injury" -> "" (non-product)
 * - "One Day Bathroom Renovation" -> "" (non-product)
 */
export function cleanProductSearchKeyword(urlOrSlug: string): string {
  if (!urlOrSlug) return "";

  // If this is a non-product lead-gen/service page, filter out completely
  if (isNonProduct(urlOrSlug)) {
    return "";
  }

  let raw = urlOrSlug.trim();

  // Safely decode any prior URL encoding to eliminate %20 and %2520 artifacts
  try {
    while (raw.includes("%")) {
      const decoded = decodeURIComponent(raw);
      if (decoded === raw) break;
      raw = decoded;
    }
  } catch {}

  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      raw = new URL(raw).pathname;
    }
  } catch {}

  // Strip bracketed prefixes e.g. "[Benefits Of ] Cbd Gummies" -> "Cbd Gummies"
  raw = raw.replace(/^\[(benefits?|uses?|side[-_\s]*effects?|reviews?|guide|what\s+is|cost|price|truth|top\s+\d+|best)[^\]]*\]\s*/i, "");
  // Strip remaining brackets e.g. "[Kidney] Disease" or "[Small Room Cooling] Options"
  raw = raw.replace(/[\[\]]/g, " ").replace(/\s+/g, " ").trim();

  // Strip file extensions and directory prefixes
  raw = raw.replace(/\.(html?|php|aspx?)$/i, "");
  raw = raw.replace(
    /^\/?(products?|items?|shop|store|p|catalog|goods|collections?|listing|detail)(\/[a-z0-9_-]+)*\//i,
    ""
  );
  const segments = raw.split("/").filter(Boolean);
  raw = segments.pop() || raw;

  // Remove leading/trailing database IDs and years
  raw = raw.replace(/^\d{4,12}[-_]+/, "");
  raw = raw.replace(/[-_]?(202[0-9]|2030)([-_]|$)/gi, " ");
  raw = raw.replace(/[-_]+(p|sku|id)?[-_]*\d{4,12}$/i, "");

  // Strip leading prefix noise: "Benefits of", "Uses of", "Side effects of", "Cost of", "What is", "Truth about", "Top 10", etc.
  raw = raw.replace(
    /^(benefits?\s+(of\s+)?|uses?\s+(of\s+)?|side\s+effects?\s+(of\s+)?|effects?\s+(of\s+)?|cost\s+of\s+|price\s+of\s+|what\s+(is|are)\s+|how\s+to\s+(use|take|apply)\s+|truth\s+about\s+|guide\s+(to|on)\s+|ingredients?\s+((of|in)\s+)?|reviews?\s+of\s+|honest\s+reviews?\s+(of\s+)?|top\s+\d+\s+|best\s+)/i,
    ""
  );
  raw = raw.replace(
    /^(benefits?([-_]+of)?|uses?([-_]+of)?|side[-_]+effects?([-_]+of)?|effects?([-_]+of)?|cost[-_]+of|price[-_]+of|what[-_]+(is|are)|how[-_]+to[-_]+(use|take|apply)|truth[-_]+about|guide[-_]+(to|on)|ingredients?([-_]+(of|in))?|reviews?[-_]+of|honest[-_]+reviews?([-_]+of)?|top[-_]+\d+|best)[-_]+/i,
    ""
  );

  // Remove "for" and everything following it (e.g. "Green Antidote For Diabetes" -> "Green Antidote")
  // Guard against words like "Force" or "Formula", and ensure at least 2 chars precede "for"
  const forMatch = raw.match(/^(.*?)([-_\s]+\bfor\b([-_\s].*)?)$/i);
  if (forMatch && forMatch[1].trim().length >= 2) {
    raw = forMatch[1].trim();
  }

  // Strip multi-word countries & regions (e.g. "United States", "New Zealand", "South Africa")
  for (const region of MULTI_WORD_REGIONS) {
    const spaceReg = new RegExp(`(^|[-_\\s]+)${region}([-_\\s]+|$)`, "gi");
    raw = raw.replace(spaceReg, " ");
    const slugRegion = region.replace(/\s+/g, "[-_]+");
    const slugReg = new RegExp(`(^|[-_]+)${slugRegion}([-_]+|$)`, "gi");
    raw = raw.replace(slugReg, "-");
  }

  // Strip "in <country>" or "-in-<country>" suffix (e.g. "lumo-therapy-in-italy")
  raw = raw.replace(/[-_\s]+\bin[-_\s]+[a-z0-9_-]+$/i, "");

  // Strip affiliate review phrases & suffixes (e.g. -uk-review-is-it-real-or-scam, -reviews-does-it-work, etc.)
  raw = raw.replace(
    /[-_]+(uk|us|ca|au|gb|nz|ie)?[-_]*(reviews?|ratings?|is[-_]+it|does[-_]+it|side[-_]+effects?|ingredients?|scams?|legit|truth|complaints?|worth[-_]+it|customer[-_]+reviews?|honest[-_]+reviews?|where[-_]+to[-_]+buy|pros[-_]+and[-_]+cons|official[-_]+website|fake[-_]+or[-_]+real|before[-_]+and[-_]+after|results?|price|cost|discount|promo|exposed|warning).*/gi,
    ""
  );
  raw = raw.replace(/[-_]+(uk|us|ca|au|gb|nz|ie)$/i, "");

  const words = raw.split(/[-_\s]+/).filter(Boolean);
  const clean = words.filter((w) => {
    const lower = w.toLowerCase().trim();
    if (/^\d{4}$/.test(lower)) return false;
    if (NOISE_WORDS.has(lower)) return false;
    if (COUNTRY_AND_NATIONALITY_WORDS.has(lower)) return false;
    if (lower.length < 2 && !/^\d+$/.test(lower)) return false;
    return true;
  });

  const finalWords = clean.length > 0 ? clean : words.filter((w) => !COUNTRY_AND_NATIONALITY_WORDS.has(w.toLowerCase().trim()));
  const candidate = finalWords
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .trim();

  if (!candidate || isNonProduct(candidate)) {
    return "";
  }

  return candidate;
}

/**
 * Generates the official Google Trends explore URL with the exact target country and date range timeframe.
 * Always produces clean single-encoded terms and consistent region/locale/date parameters.
 */
export function buildGoogleTrendsUrl(keywordOrSlug: string, geo = "", date = "today 12-m"): string {
  const keyword = cleanProductSearchKeyword(keywordOrSlug);
  const cleanKeyword = encodeURIComponent(keyword.trim());
  const cleanGeo = (geo || "").trim().toUpperCase();
  const geoParam =
    cleanGeo && cleanGeo !== "GLOBAL" && cleanGeo !== "WORLDWIDE"
      ? `&geo=${encodeURIComponent(cleanGeo)}`
      : "";
  const dateParam = date ? `&date=${encodeURIComponent(date)}` : "";
  return `https://trends.google.com/explore?q=${cleanKeyword}${geoParam}${dateParam}&hl=en`;
}

