"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useScan } from "@/components/providers/ScanProvider";
import { getClientCached, setClientCached, invalidateClientCache } from "@/lib/client/cache";
import { type IWebsite } from "@/types";
import {
  GitCompare,
  Download,
  ExternalLink,
  Search,
  RefreshCw,
  Check,
  Plus,
  Square,
  CheckSquare,
  ArrowRight,
  Globe,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  X,
  Filter,
  Layers,
} from "lucide-react";
import { TrendMiniGraph } from "@/components/ui/TrendMiniGraph";

export const SITE_THEME_COLORS = [
  {
    name: "amber",
    bg: "bg-[#FFB800]",
    hoverBg: "hover:bg-[#E5A600]",
    text: "text-slate-950",
    border: "border-[#FFB800]",
    badgeBg: "bg-[#FFFBEB]",
    circleCheckBg: "bg-[#FFB800]",
    circleCheckText: "text-slate-950",
    ringColor: "ring-[#FFB800]",
    dotColor: "#FFB800",
    label: "Feature 01",
  },
  {
    name: "sky",
    bg: "bg-[#0EA5E9]",
    hoverBg: "hover:bg-[#0284C7]",
    text: "text-white",
    border: "border-[#0EA5E9]",
    badgeBg: "bg-[#F0F9FF]",
    circleCheckBg: "bg-[#0EA5E9]",
    circleCheckText: "text-white",
    ringColor: "ring-[#0EA5E9]",
    dotColor: "#0EA5E9",
    label: "Feature 02",
  },
  {
    name: "coral",
    bg: "bg-[#FF5722]",
    hoverBg: "hover:bg-[#EA4C1A]",
    text: "text-white",
    border: "border-[#FF5722]",
    badgeBg: "bg-[#FFF7ED]",
    circleCheckBg: "bg-[#FF5722]",
    circleCheckText: "text-white",
    ringColor: "ring-[#FF5722]",
    dotColor: "#FF5722",
    label: "Feature 03",
  },
  {
    name: "emerald",
    bg: "bg-[#10B981]",
    hoverBg: "hover:bg-[#059669]",
    text: "text-white",
    border: "border-[#10B981]",
    badgeBg: "bg-[#ECFDF5]",
    circleCheckBg: "bg-[#10B981]",
    circleCheckText: "text-white",
    ringColor: "ring-[#10B981]",
    dotColor: "#10B981",
    label: "Feature 04",
  },
  {
    name: "purple",
    bg: "bg-[#8B5CF6]",
    hoverBg: "hover:bg-[#7C3AED]",
    text: "text-white",
    border: "border-[#8B5CF6]",
    badgeBg: "bg-[#F5F3FF]",
    circleCheckBg: "bg-[#8B5CF6]",
    circleCheckText: "text-white",
    ringColor: "ring-[#8B5CF6]",
    dotColor: "#8B5CF6",
    label: "Feature 05",
  },
  {
    name: "pink",
    bg: "bg-[#EC4899]",
    hoverBg: "hover:bg-[#DB2777]",
    text: "text-white",
    border: "border-[#EC4899]",
    badgeBg: "bg-[#FDF2F8]",
    circleCheckBg: "bg-[#EC4899]",
    circleCheckText: "text-white",
    ringColor: "ring-[#EC4899]",
    dotColor: "#EC4899",
    label: "Feature 06",
  },
];

function SiteFavicon({
  domain,
  size = 14,
  className = "",
}: {
  domain: string;
  size?: number;
  className?: string;
}) {
  const [error, setError] = useState(false);
  const cleanDomain = domain.replace(/^https?:\/\//i, "").split("/")[0].trim();

  if (!cleanDomain || error) {
    return (
      <Globe
        className={`text-slate-400 shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain)}&sz=32`}
      alt={cleanDomain}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setError(true)}
      className={`object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

interface MatrixRow {
  id: string;
  title: string;
  slug: string;
  status: "shared" | "missing_from_baseline" | "only_primary";
  sites: Record<string, { available: boolean; url?: string; lastmod?: Date | string }>;
  duplicateCount?: number;
  trendScore?: number;
  trendTimeline?: { date: string; value: number }[];
  trendExploreUrl?: string;
  trendPriority?: "high" | "medium" | "low";
}

export type CategoryMode = "all" | "nutra-nutra" | "ecom-ecom" | "ecom-nutra" | "nutra-ecom";

export const CATEGORY_MODE_CONFIG: Record<
  CategoryMode,
  {
    label: string;
    baselineCat: "all" | "nutra" | "ecom";
    monitoredCat: "all" | "nutra" | "ecom";
    description: string;
  }
> = {
  all: {
    label: "All",
    baselineCat: "all",
    monitoredCat: "all",
    description: "All stores across all categories",
  },
  "nutra-nutra": {
    label: "Nutra ↔ Nutra",
    baselineCat: "nutra",
    monitoredCat: "nutra",
    description: "Nutra store vs Nutra competitors",
  },
  "ecom-ecom": {
    label: "Ecom ↔ Ecom",
    baselineCat: "ecom",
    monitoredCat: "ecom",
    description: "E-Commerce store vs E-Commerce competitors",
  },
  "ecom-nutra": {
    label: "Ecom ↔ Nutra",
    baselineCat: "ecom",
    monitoredCat: "nutra",
    description: "E-Commerce store vs Nutra competitors",
  },
  "nutra-ecom": {
    label: "Nutra ↔ Ecom",
    baselineCat: "nutra",
    monitoredCat: "ecom",
    description: "Nutra store vs E-Commerce competitors",
  },
};

export const MARKET_OPTIONS = [
  { id: "all", label: "All Markets", name: "All Markets", flag: "🌐" },
  { id: "en", label: "🇺🇸 English", name: "English (US)", flag: "🇺🇸" },
  { id: "de", label: "🇩🇪 German", name: "German (DE)", flag: "🇩🇪" },
  { id: "it", label: "🇮🇹 Italian", name: "Italian (IT)", flag: "🇮🇹" },
  { id: "fr", label: "🇫🇷 French", name: "French (FR)", flag: "🇫🇷" },
];

export function CategoryPill({ category, className = "" }: { category?: "ecom" | "nutra" | string; className?: string }) {
  const isEcom = category === "ecom";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200/80 ${className}`}
    >
      {isEcom ? "Ecom" : "Nutra"}
    </span>
  );
}

interface ComparisonData {
  primaryWebsite: IWebsite | null;
  baselineWebsites?: IWebsite[];
  activeBaselineWebsites?: IWebsite[];
  monitoredWebsites: IWebsite[];
  allComparedSites?: IWebsite[];
  selectedMonitored: IWebsite | null;
  categoryMode?: string;
  baselineCategory?: string;
  monitoredCategory?: string;
  stats: {
    primaryTotal: number;
    monitoredTotal: number;
    rawMonitoredTotal?: number;
    duplicatesRemoved?: number;
    matchingCount: number;
    missingCount: number;
    onlyPrimaryCount: number;
    mergedDuplicatesCount?: number;
    matrixTotal?: number;
  } | null;
  tab: string;
  pages: MatrixRow[];
  total: number;
  page: number;
  limit: number;
}

export default function ComparisonsPage() {
  const [selectedBaselineIds, setSelectedBaselineIds] = useState<string[]>([]);
  const [selectedCompetitorIds, setSelectedCompetitorIds] = useState<string[]>([]); // empty means "all"
  const [categoryMode, setCategoryMode] = useState<CategoryMode>("all");
  const [baselineCategoryFilter, setBaselineCategoryFilter] = useState<"all" | "nutra" | "ecom">("all");
  const [competitorCategoryFilter, setCompetitorCategoryFilter] = useState<"all" | "nutra" | "ecom">("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "missing" | "shared" | "only_primary" | "merged_duplicates">("all");
  const [activeMatrixDomains, setActiveMatrixDomains] = useState<string[]>([]);
  const [secondColView, setSecondColView] = useState<"source" | "trend">("source");
  const [analyzingRowKeys, setAnalyzingRowKeys] = useState<Set<string>>(new Set());
  const [liveRowTrends, setLiveRowTrends] = useState<Record<string, any>>({});
  const [isBulkAnalyzingTrends, setIsBulkAnalyzingTrends] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isLoadedFromStorage, setIsLoadedFromStorage] = useState(false);

  // Dropdown States for Stores & Competitors
  const baselineDropdownRef = useRef<HTMLDivElement>(null);
  const competitorDropdownRef = useRef<HTMLDivElement>(null);
  const categoryModeDropdownRef = useRef<HTMLDivElement>(null);
  const marketDropdownRef = useRef<HTMLDivElement>(null);
  const [isBaselineDropdownOpen, setIsBaselineDropdownOpen] = useState(false);
  const [isCompetitorDropdownOpen, setIsCompetitorDropdownOpen] = useState(false);
  const [isCategoryModeDropdownOpen, setIsCategoryModeDropdownOpen] = useState(false);
  const [isMarketDropdownOpen, setIsMarketDropdownOpen] = useState(false);
  const [competitorSearch, setCompetitorSearch] = useState("");
  const [baselineSearch, setBaselineSearch] = useState("");

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (baselineDropdownRef.current && !baselineDropdownRef.current.contains(event.target as Node)) {
        setIsBaselineDropdownOpen(false);
      }
      if (competitorDropdownRef.current && !competitorDropdownRef.current.contains(event.target as Node)) {
        setIsCompetitorDropdownOpen(false);
      }
      if (categoryModeDropdownRef.current && !categoryModeDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryModeDropdownOpen(false);
      }
      if (marketDropdownRef.current && !marketDropdownRef.current.contains(event.target as Node)) {
        setIsMarketDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. Restore saved selections from localStorage on client mount
  useEffect(() => {
    try {
      const savedBaseline = localStorage.getItem("trendmap_comp_baseline_ids");
      if (savedBaseline) {
        const parsed = JSON.parse(savedBaseline);
        if (Array.isArray(parsed)) setSelectedBaselineIds(parsed);
      }

      const savedCompetitors = localStorage.getItem("trendmap_comp_competitor_ids");
      if (savedCompetitors) {
        const parsed = JSON.parse(savedCompetitors);
        if (Array.isArray(parsed)) setSelectedCompetitorIds(parsed);
      }

      const savedMatrixDomains = localStorage.getItem("trendmap_comp_matrix_domains");
      if (savedMatrixDomains) {
        const parsed = JSON.parse(savedMatrixDomains);
        if (Array.isArray(parsed)) setActiveMatrixDomains(parsed);
      }

      const savedCatMode = localStorage.getItem("trendmap_comp_category_mode");
      if (savedCatMode && Object.keys(CATEGORY_MODE_CONFIG).includes(savedCatMode)) {
        setCategoryMode(savedCatMode as CategoryMode);
        const cfg = CATEGORY_MODE_CONFIG[savedCatMode as CategoryMode];
        setBaselineCategoryFilter(cfg.baselineCat);
        setCompetitorCategoryFilter(cfg.monitoredCat);
      }

      const savedLang = localStorage.getItem("trendmap_comp_language");
      if (savedLang && ["all", "en", "de", "it", "fr"].includes(savedLang)) {
        setSelectedLanguage(savedLang);
      }

      const savedFilter = localStorage.getItem("trendmap_comp_active_filter");
      if (
        savedFilter &&
        ["all", "missing", "shared", "only_primary", "merged_duplicates"].includes(savedFilter)
      ) {
        setActiveFilter(savedFilter as any);
      }

      const savedColView = localStorage.getItem("trendmap_comp_second_col_view");
      if (savedColView === "source" || savedColView === "trend") {
        setSecondColView(savedColView);
      }
    } catch (e) {
      console.error("[Storage] Failed to restore comparisons preferences:", e);
    } finally {
      setIsLoadedFromStorage(true);
    }
  }, []);

  // 2. Persist baseline selections
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    try {
      localStorage.setItem("trendmap_comp_baseline_ids", JSON.stringify(selectedBaselineIds));
    } catch {}
  }, [selectedBaselineIds, isLoadedFromStorage]);

  // 3. Persist competitor selections
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    try {
      localStorage.setItem("trendmap_comp_competitor_ids", JSON.stringify(selectedCompetitorIds));
    } catch {}
  }, [selectedCompetitorIds, isLoadedFromStorage]);

  // 4. Persist active matrix column domains
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    try {
      localStorage.setItem("trendmap_comp_matrix_domains", JSON.stringify(activeMatrixDomains));
    } catch {}
  }, [activeMatrixDomains, isLoadedFromStorage]);

  // 5. Persist category mode
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    try {
      localStorage.setItem("trendmap_comp_category_mode", categoryMode);
    } catch {}
  }, [categoryMode, isLoadedFromStorage]);

  // 6. Persist market/language filter
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    try {
      localStorage.setItem("trendmap_comp_language", selectedLanguage);
    } catch {}
  }, [selectedLanguage, isLoadedFromStorage]);

  // 6. Persist active filter tab
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    try {
      localStorage.setItem("trendmap_comp_active_filter", activeFilter);
    } catch {}
  }, [activeFilter, isLoadedFromStorage]);

  // 7. Persist second column view mode (source vs trend)
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    try {
      localStorage.setItem("trendmap_comp_second_col_view", secondColView);
    } catch {}
  }, [secondColView, isLoadedFromStorage]);

  const getComparisonCacheKey = (
    baselineIds: string[],
    competitorIds: string[],
    filter: string,
    pageNum: number,
    search: string,
    catMode: string,
    bCat: string,
    mCat: string,
    lang: string
  ) => {
    const b = baselineIds.length === 0 ? "all" : [...baselineIds].sort().join(",");
    const m = competitorIds.length === 0 ? "all" : [...competitorIds].sort().join(",");
    return `comp_matrix_v6_b_${b}_m_${m}_${filter}_${pageNum}_${search.trim()}_${catMode}_${bCat}_${mCat}_${lang}`;
  };

  const currentCacheKey = useMemo(
    () =>
      getComparisonCacheKey(
        selectedBaselineIds,
        selectedCompetitorIds,
        activeFilter,
        page,
        debouncedSearchQuery,
        categoryMode,
        baselineCategoryFilter,
        competitorCategoryFilter,
        selectedLanguage
      ),
    [
      selectedBaselineIds,
      selectedCompetitorIds,
      activeFilter,
      page,
      debouncedSearchQuery,
      categoryMode,
      baselineCategoryFilter,
      competitorCategoryFilter,
      selectedLanguage,
    ]
  );

  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { toast } = useToast();
  const { activeScans, hasActiveScans } = useScan();

  // Dropdown state for competitor sources in table rows
  const [openSourceRowId, setOpenSourceRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!openSourceRowId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-source-dropdown]")) {
        setOpenSourceRowId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openSourceRowId]);

  // Listen for background scan completions to invalidate cache and refresh matrix
  useEffect(() => {
    const handleScanDone = () => {
      invalidateClientCache("comp_");
      setIsRefreshing(true);
      setRefreshTrigger((c) => c + 1);
    };
    window.addEventListener("trendmap:scan-completed", handleScanDone);
    return () => window.removeEventListener("trendmap:scan-completed", handleScanDone);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    if (!isLoadedFromStorage) return;

    const controller = new AbortController();

    const fetchComparison = async () => {
      const cached = getClientCached<ComparisonData>(currentCacheKey);
      if (cached) {
        setData(cached);
        setLoading(false);
        setIsRefreshing(true);
      } else if (!data) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        let url = `/api/comparisons?tab=matrix&filter=${activeFilter}&page=${page}&limit=25`;
        if (selectedBaselineIds.length > 0) {
          url += `&baselineId=${selectedBaselineIds.join(",")}`;
        }
        if (selectedCompetitorIds.length > 0) {
          url += `&monitoredId=${selectedCompetitorIds.join(",")}`;
        } else {
          url += `&monitoredId=all`;
        }
        if (categoryMode) {
          url += `&categoryMode=${categoryMode}`;
        }
        if (baselineCategoryFilter) {
          url += `&baselineCategory=${baselineCategoryFilter}`;
        }
        if (competitorCategoryFilter) {
          url += `&monitoredCategory=${competitorCategoryFilter}`;
        }
        if (selectedLanguage && selectedLanguage !== "all") {
          url += `&language=${selectedLanguage}`;
        }
        if (debouncedSearchQuery.trim()) {
          url += `&search=${encodeURIComponent(debouncedSearchQuery.trim())}`;
        }

        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setClientCached(currentCacheKey, json);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          toast("Failed to load comparison data", "error");
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    };

    fetchComparison();

    return () => controller.abort();
  }, [isLoadedFromStorage, currentCacheKey, refreshTrigger]);

  const allBaselineSites = data?.baselineWebsites || (data?.primaryWebsite ? [data.primaryWebsite] : []);
  const activeBaselineSites = data?.activeBaselineWebsites || allBaselineSites;
  const competitorSites = data?.monitoredWebsites || [];
  const isAllCompetitors = selectedCompetitorIds.length === 0 || selectedCompetitorIds.length === competitorSites.length;
  const isAllBaselines = selectedBaselineIds.length === 0 || selectedBaselineIds.length === allBaselineSites.length;

  const selectedMonitoredUrls = useMemo(() => {
    if (isAllCompetitors) return data?.stats?.monitoredTotal || 0;
    return competitorSites
      .filter((w) => selectedCompetitorIds.includes(String(w._id)))
      .reduce((acc, w) => acc + (w.totalUrls || 0), 0);
  }, [isAllCompetitors, data?.stats?.monitoredTotal, competitorSites, selectedCompetitorIds]);

  const filteredCompetitorsInDropdown = useMemo(() => {
    return competitorSites.filter((w) => {
      if (competitorSearch.trim()) {
        const q = competitorSearch.toLowerCase().trim();
        return w.domain.toLowerCase().includes(q) || (w.name && w.name.toLowerCase().includes(q));
      }
      return true;
    });
  }, [competitorSites, competitorSearch]);

  const filteredBaselinesInDropdown = useMemo(() => {
    return allBaselineSites.filter((b) => {
      if (baselineSearch.trim()) {
        const q = baselineSearch.toLowerCase().trim();
        return b.domain.toLowerCase().includes(q) || (b.name && b.name.toLowerCase().includes(q));
      }
      return true;
    });
  }, [allBaselineSites, baselineSearch]);

  const isBaselineSelected = (id: string) => {
    if (selectedBaselineIds.length === 0) return true;
    return selectedBaselineIds.includes(id);
  };

  const isCompetitorSelected = (id: string) => {
    if (isAllCompetitors) return true;
    return selectedCompetitorIds.includes(id);
  };

  const handleToggleBaseline = (id: string) => {
    const current = (selectedBaselineIds.length === 0 || selectedBaselineIds.length === allBaselineSites.length)
      ? allBaselineSites.map((w) => String(w._id))
      : selectedBaselineIds;

    if (current.includes(id)) {
      if (current.length <= 1) {
        toast("At least 1 store must remain selected", "info");
        return;
      }
      const next = current.filter((x) => x !== id);
      setSelectedBaselineIds(next);
    } else {
      const next = [...current, id];
      setSelectedBaselineIds(next.length === allBaselineSites.length ? [] : next);
    }
    setPage(1);
  };

  const handleToggleAllBaseline = () => {
    if (isAllBaselines) {
      if (allBaselineSites.length > 0) {
        setSelectedBaselineIds([String(allBaselineSites[0]._id)]);
        setPage(1);
      }
    } else {
      setSelectedBaselineIds([]);
      setPage(1);
    }
  };

  const handleToggleCompetitor = (id: string) => {
    const current = (selectedCompetitorIds.length === 0 || selectedCompetitorIds.length === competitorSites.length)
      ? competitorSites.map((w) => String(w._id))
      : selectedCompetitorIds;

    if (current.includes(id)) {
      if (current.length <= 1) {
        toast("At least 1 competitor website must remain selected", "info");
        return;
      }
      const next = current.filter((x) => x !== id);
      setSelectedCompetitorIds(next);
    } else {
      const next = [...current, id];
      setSelectedCompetitorIds(next.length === competitorSites.length ? [] : next);
    }
    setPage(1);
  };

  const handleToggleAllCompetitors = () => {
    if (isAllCompetitors) {
      if (competitorSites.length > 0) {
        setSelectedCompetitorIds([String(competitorSites[0]._id)]);
        setPage(1);
      }
    } else {
      setSelectedCompetitorIds([]);
      setPage(1);
    }
  };

  // Sites available for the Matrix Comparison columns (baseline/own sites only)
  const matrixCandidateSites = useMemo(() => {
    const baselines = activeBaselineSites.length > 0 ? activeBaselineSites : allBaselineSites;
    if (baselines.length > 0) return baselines;
    return data?.allComparedSites?.filter((s: any) => s.isPrimary) || [];
  }, [activeBaselineSites, allBaselineSites, data?.allComparedSites]);

  const isMatrixSiteActive = (domain: string) => {
    if (activeMatrixDomains.length === 0) return true;
    return activeMatrixDomains.includes(domain);
  };

  const toggleMatrixSite = (domain: string) => {
    const current = activeMatrixDomains.length === 0 ? matrixCandidateSites.map((s) => s.domain) : activeMatrixDomains;
    if (current.includes(domain)) {
      if (current.length <= 1) {
        toast("Keep at least 1 site selected in the comparison table", "info");
        return;
      }
      setActiveMatrixDomains(current.filter((d) => d !== domain));
    } else {
      setActiveMatrixDomains([...current, domain]);
    }
  };

  const handleSelectAllMatrixSites = () => {
    setActiveMatrixDomains([]);
  };

  const handleToggleColView = (view: "source" | "trend") => {
    setSecondColView(view);
    try {
      localStorage.setItem("trendmap_comp_second_col_view", view);
    } catch {}
  };

  const handleAnalyzeRowTrend = async (row: any) => {
    const rowKey = row.id || row.slug || row.title;
    if (!rowKey || analyzingRowKeys.has(rowKey)) return;

    setAnalyzingRowKeys((prev) => new Set(prev).add(rowKey));
    try {
      const targetTerm = row.slug || row.title;
      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: targetTerm,
        }),
      });

      const json = await res.json();
      if (res.ok && json.trend) {
        setLiveRowTrends((prev) => ({
          ...prev,
          [rowKey]: json.trend,
        }));
        toast(`Google Trends score for "${json.trend.keyword}": ${json.trend.score}/100`, "success");
      } else {
        toast(json.error || "Failed to analyze Google Trends", "error");
      }
    } catch {
      toast("Error analyzing Google Trends", "error");
    } finally {
      setAnalyzingRowKeys((prev) => {
        const next = new Set(prev);
        next.delete(rowKey);
        return next;
      });
    }
  };

  const handleAnalyzeAllPageTrends = async () => {
    if (isBulkAnalyzingTrends || rows.length === 0) return;

    const unanalyzed = rows.filter((r) => {
      const rowKey = r.id || r.slug || r.title;
      const live = liveRowTrends[rowKey];
      return live === undefined && r.trendScore === undefined;
    });

    if (unanalyzed.length === 0) {
      toast("All products on this page are already analyzed!", "info");
      return;
    }

    setIsBulkAnalyzingTrends(true);
    toast(`Analyzing Google Trends for ${unanalyzed.length} products…`, "info");

    try {
      for (const row of unanalyzed) {
        const rowKey = row.id || row.slug || row.title;
        const targetTerm = row.slug || row.title;
        const res = await fetch("/api/trends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: targetTerm }),
        });
        const json = await res.json();
        if (res.ok && json.trend) {
          setLiveRowTrends((prev) => ({ ...prev, [rowKey]: json.trend }));
        }
      }
      toast(`Completed Google Trends analysis for ${unanalyzed.length} products`, "success");
    } catch {
      toast("Error analyzing trends in bulk", "error");
    } finally {
      setIsBulkAnalyzingTrends(false);
    }
  };

  // Prune any stale baseline IDs that no longer exist in the portfolio
  useEffect(() => {
    if (!data?.baselineWebsites || selectedBaselineIds.length === 0) return;
    const existingIds = new Set(data.baselineWebsites.map((w) => String(w._id)));
    const valid = selectedBaselineIds.filter((id) => existingIds.has(id));
    if (valid.length !== selectedBaselineIds.length) {
      setSelectedBaselineIds(valid);
    }
  }, [data?.baselineWebsites]);

  // Prune any stale competitor IDs that no longer exist
  useEffect(() => {
    if (!data?.monitoredWebsites || selectedCompetitorIds.length === 0) return;
    const existingIds = new Set(data.monitoredWebsites.map((w) => String(w._id)));
    const valid = selectedCompetitorIds.filter((id) => existingIds.has(id));
    if (valid.length !== selectedCompetitorIds.length) {
      setSelectedCompetitorIds(valid);
    }
  }, [data?.monitoredWebsites]);

  // Prune any stale matrix domains that no longer exist in matrix candidates
  useEffect(() => {
    if (!matrixCandidateSites || matrixCandidateSites.length === 0 || activeMatrixDomains.length === 0) return;
    const existingDomains = new Set(matrixCandidateSites.map((s) => s.domain));
    const valid = activeMatrixDomains.filter((d) => existingDomains.has(d));
    if (valid.length !== activeMatrixDomains.length) {
      setActiveMatrixDomains(valid);
    }
  }, [matrixCandidateSites]);

  const activeMatrixSites = useMemo(() => {
    return matrixCandidateSites.filter((s) => isMatrixSiteActive(s.domain));
  }, [matrixCandidateSites, activeMatrixDomains]);

  // Competitor domain to category map
  const compMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of competitorSites) {
      map.set(w.domain, w.category || "nutra");
    }
    return map;
  }, [competitorSites]);

  // Mode & Category selection handlers
  const handleSelectCategoryMode = (mode: CategoryMode) => {
    setCategoryMode(mode);
    const cfg = CATEGORY_MODE_CONFIG[mode];
    setBaselineCategoryFilter(cfg.baselineCat);
    setCompetitorCategoryFilter(cfg.monitoredCat);
    setSelectedBaselineIds([]);
    setSelectedCompetitorIds([]);
    setPage(1);
  };

  const handleSetBaselineCategoryFilter = (cat: "all" | "nutra" | "ecom") => {
    setBaselineCategoryFilter(cat);
    const nextComp = competitorCategoryFilter;
    const matchedMode = (Object.keys(CATEGORY_MODE_CONFIG) as CategoryMode[]).find(
      (k) => CATEGORY_MODE_CONFIG[k].baselineCat === cat && CATEGORY_MODE_CONFIG[k].monitoredCat === nextComp
    );
    if (matchedMode) {
      setCategoryMode(matchedMode);
    }
    setSelectedBaselineIds([]);
    setPage(1);
  };

  const handleSetCompetitorCategoryFilter = (cat: "all" | "nutra" | "ecom") => {
    setCompetitorCategoryFilter(cat);
    const nextBase = baselineCategoryFilter;
    const matchedMode = (Object.keys(CATEGORY_MODE_CONFIG) as CategoryMode[]).find(
      (k) => CATEGORY_MODE_CONFIG[k].baselineCat === nextBase && CATEGORY_MODE_CONFIG[k].monitoredCat === cat
    );
    if (matchedMode) {
      setCategoryMode(matchedMode);
    }
    setSelectedCompetitorIds([]);
    setPage(1);
  };

  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedExportDatasets, setSelectedExportDatasets] = useState<string[]>(["missing"]);
  const [isExporting, setIsExporting] = useState(false);

  const handleOpenExportModal = () => {
    setSelectedExportDatasets([activeFilter === "all" ? "missing" : activeFilter]);
    setIsExportModalOpen(true);
  };

  const handleToggleExportDataset = (dataset: string) => {
    setSelectedExportDatasets((prev) => {
      if (prev.includes(dataset)) {
        if (prev.length <= 1) return prev;
        return prev.filter((d) => d !== dataset);
      } else {
        return [...prev, dataset];
      }
    });
  };

  const handleSelectAllExportDatasets = () => {
    if (selectedExportDatasets.length === 4) {
      setSelectedExportDatasets(["missing"]);
    } else {
      setSelectedExportDatasets(["missing", "shared", "merged_duplicates", "only_primary"]);
    }
  };

  const handleConfirmExport = () => {
    setIsExporting(true);
    let datasetParam = selectedExportDatasets.join(",");
    if (selectedExportDatasets.length === 4) {
      datasetParam = "all";
    }

    let url = `/api/export?type=comparison&dataset=${datasetParam}&websiteId=${selectedCompetitorIds.length > 0 ? selectedCompetitorIds.join(",") : "all"}&categoryMode=${categoryMode}&baselineCategory=${baselineCategoryFilter}&monitoredCategory=${competitorCategoryFilter}${selectedLanguage && selectedLanguage !== "all" ? `&language=${selectedLanguage}` : ""}`;
    if (selectedBaselineIds.length > 0) {
      url += `&baselineId=${selectedBaselineIds.join(",")}`;
    }

    window.location.href = url;

    setTimeout(() => {
      setIsExporting(false);
      setIsExportModalOpen(false);
      toast("Export started. Your CSV report will download shortly.", "success");
    }, 800);
  };

  const stats = data?.stats;
  const rows = data?.pages || [];

  return (
    <DashboardShell title="Product Comparison">
      <div className="space-y-4 max-w-7xl mx-auto relative">
        {/* Sleek Top-Edge Syncing Bar */}
        {(loading || isRefreshing) && (
          <div className="fixed top-0 left-0 right-0 h-1 z-50 overflow-hidden bg-indigo-100">
            <div className="h-full bg-indigo-600 w-full animate-pulse bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-600" />
          </div>
        )}

        {/* Floating Top Real-Time Notification Pill (Always visible in viewport without scrolling!) */}
        {isRefreshing && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-slate-900/95 text-white rounded-full shadow-2xl text-xs font-semibold border border-slate-700/80 backdrop-blur-xs">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>Updating Comparison Matrix…</span>
            </div>
          </div>
        )}

        {/* Background Scanning Notice Banner */}
        {hasActiveScans && (
          <div className="bg-gradient-to-r from-indigo-50/90 via-sky-50/80 to-emerald-50/90 border border-indigo-200/80 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white border border-indigo-200 shadow-2xs flex items-center justify-center shrink-0">
                <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    Sitemap Catalog Extraction In Progress
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                    {activeScans.length} active
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Currently indexing{" "}
                  <strong>{activeScans.slice(0, 3).map((s) => s.domain).join(", ")}</strong>
                  {activeScans.length > 3 && (
                    <span className="text-slate-500 font-medium"> and {activeScans.length - 3} more stores</span>
                  )}. The comparison matrix will update live automatically upon completion.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 bg-white/90 px-3 py-1 rounded-lg border border-indigo-200/60 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Live Auto-Sync Active</span>
              </span>
            </div>
          </div>
        )}

        {/* Header Bar with Dropdown Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Product Comparison Matrix
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Multi-site catalog gap analysis and product overlap.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Mode Dropdown */}
            <div className="relative" ref={categoryModeDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsCategoryModeDropdownOpen((prev) => !prev);
                  setIsMarketDropdownOpen(false);
                }}
                className={`inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 border rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                  isCategoryModeDropdownOpen
                    ? "border-indigo-500 ring-2 ring-indigo-500/10 text-indigo-950"
                    : "border-slate-200 text-slate-800"
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-500 font-medium">Category:</span>
                <span className="font-bold text-slate-900">
                  {CATEGORY_MODE_CONFIG[categoryMode]?.label || "All"}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    isCategoryModeDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isCategoryModeDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100">
                  <div className="px-2.5 py-1.5 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Select Comparison Category
                  </div>
                  <div className="py-1 space-y-0.5">
                    {(Object.keys(CATEGORY_MODE_CONFIG) as CategoryMode[]).map((modeKey) => {
                      const cfg = CATEGORY_MODE_CONFIG[modeKey];
                      const isActive = categoryMode === modeKey;
                      return (
                        <button
                          key={modeKey}
                          type="button"
                          onClick={() => {
                            handleSelectCategoryMode(modeKey);
                            setIsCategoryModeDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            isActive
                              ? "bg-indigo-50 text-indigo-950 font-bold"
                              : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                          }`}
                        >
                          <div>
                            <div>{cfg.label}</div>
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                              {cfg.description}
                            </div>
                          </div>
                          {isActive && <Check className="w-4 h-4 text-indigo-600 stroke-[2.5] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Language / Market Filter Dropdown */}
            <div className="relative" ref={marketDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsMarketDropdownOpen((prev) => !prev);
                  setIsCategoryModeDropdownOpen(false);
                }}
                className={`inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 border rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                  isMarketDropdownOpen
                    ? "border-indigo-500 ring-2 ring-indigo-500/10 text-indigo-950"
                    : "border-slate-200 text-slate-800"
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-500 font-medium">Market:</span>
                <span className="font-bold text-slate-900">
                  {MARKET_OPTIONS.find((m) => m.id === selectedLanguage)?.label || "All Markets"}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    isMarketDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isMarketDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100">
                  <div className="px-2.5 py-1.5 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Filter By Target Market
                  </div>
                  <div className="py-1 space-y-0.5">
                    {MARKET_OPTIONS.map((m) => {
                      const isActive = selectedLanguage === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedLanguage(m.id);
                            setSelectedCompetitorIds([]);
                            setPage(1);
                            setIsMarketDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            isActive
                              ? "bg-indigo-50 text-indigo-950 font-bold"
                              : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{m.flag}</span>
                            <span>{m.name}</span>
                          </div>
                          {isActive && <Check className="w-4 h-4 text-indigo-600 stroke-[2.5] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenExportModal}
              disabled={loading || !rows.length}
              className="border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl shadow-2xs cursor-pointer h-9 px-3"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Baseline Selector and Competitor Selector Bar */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
          <div className="grid grid-cols-1 lg:grid-cols-11 gap-3.5 items-center">

            {/* Left: Your Stores (lg:col-span-5) */}
            <div className="lg:col-span-5 relative" ref={baselineDropdownRef}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Your Stores
                  </span>
                  <span className="text-[10px] font-semibold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                    {isAllBaselines ? allBaselineSites.length : selectedBaselineIds.length} of {allBaselineSites.length} Active
                  </span>
                </div>
                {allBaselineSites.length > 1 && (
                  <button
                    type="button"
                    onClick={handleToggleAllBaseline}
                    className="text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:underline cursor-pointer"
                  >
                    {isAllBaselines ? "Isolate First" : "Select All"}
                  </button>
                )}
              </div>

              {allBaselineSites.length === 1 ? (
                /* Clean single-store card if only 1 baseline site */
                <div className="flex items-center justify-between p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <SiteFavicon domain={allBaselineSites[0].domain} size={16} className="rounded-xs shrink-0" />
                    <span className="font-semibold text-slate-900 truncate">{allBaselineSites[0].domain}</span>
                    <span className="text-xs shrink-0">{allBaselineSites[0].language === "de" ? "🇩🇪" : allBaselineSites[0].language === "it" ? "🇮🇹" : allBaselineSites[0].language === "fr" ? "🇫🇷" : "🇺🇸"}</span>
                    <span className="text-[10px] text-slate-400 font-medium">({allBaselineSites[0].category || "nutra"})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                    {(stats?.primaryTotal || allBaselineSites[0].totalUrls || 0).toLocaleString()} URLs
                  </span>
                </div>
              ) : (
                /* Multi-store Dropdown trigger for baseline sites */
                <div>
                  <button
                    type="button"
                    onClick={() => setIsBaselineDropdownOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between p-2.5 bg-[#F8FAFC] hover:bg-slate-100 border border-[#E2E8F0] hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-800 transition-all cursor-pointer shadow-2xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-base">🏪</span>
                      <span className="truncate">
                        {isAllBaselines
                          ? `All Stores Active (${allBaselineSites.length})`
                          : `${selectedBaselineIds.length} of ${allBaselineSites.length} Stores Selected`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {(stats?.primaryTotal || 0).toLocaleString()} URLs
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isBaselineDropdownOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {/* Baseline Dropdown Popover */}
                  {isBaselineDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
                      {allBaselineSites.length > 4 && (
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            placeholder="Search your stores..."
                            value={baselineSearch}
                            onChange={(e) => setBaselineSearch(e.target.value)}
                            className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-slate-400"
                          />
                        </div>
                      )}
                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50 p-1 space-y-0.5">
                        {filteredBaselinesInDropdown.map((b) => {
                          const isSelected = isBaselineSelected(String(b._id));
                          return (
                            <button
                              key={String(b._id)}
                              type="button"
                              onClick={() => handleToggleBaseline(String(b._id))}
                              className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                isSelected ? "bg-indigo-50/80 text-indigo-950 font-medium" : "hover:bg-white text-slate-700"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 truncate pr-2">
                                <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                  isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 bg-white"
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <SiteFavicon domain={b.domain} size={14} className="rounded-xs shrink-0" />
                                <span className="truncate font-mono text-[11px]">{b.domain}</span>
                                <span className="text-xs shrink-0">{b.language === "de" ? "🇩🇪" : b.language === "it" ? "🇮🇹" : b.language === "fr" ? "🇫🇷" : "🇺🇸"}</span>
                              </div>
                              {b.totalUrls !== undefined && (
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                  {b.totalUrls.toLocaleString()} URLs
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Middle: VS Divider (lg:col-span-1) */}
            <div className="lg:col-span-1 flex items-center justify-center text-slate-400 py-1 lg:py-0">
              <span className="text-[11px] font-black tracking-widest text-slate-500 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/80">
                VS
              </span>
            </div>

            {/* Right: Competitor Stores Multi-Select Dropdown (lg:col-span-5) */}
            <div className="lg:col-span-5 relative" ref={competitorDropdownRef}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Competitor Stores
                  </span>
                  {isAllCompetitors ? (
                    <span className="text-[10px] font-semibold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                      All ({competitorSites.length}) Combined
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                      {selectedCompetitorIds.length} of {competitorSites.length} Selected
                    </span>
                  )}
                </div>
                {competitorSites.length > 1 && (
                  <button
                    type="button"
                    onClick={handleToggleAllCompetitors}
                    className="text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:underline cursor-pointer"
                  >
                    {isAllCompetitors ? "Isolate First" : "Select All"}
                  </button>
                )}
              </div>

              {/* Competitor Trigger Button */}
              <button
                type="button"
                onClick={() => setIsCompetitorDropdownOpen((prev) => !prev)}
                className={`w-full flex items-center justify-between p-2.5 border rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                  isCompetitorDropdownOpen
                    ? "bg-white border-indigo-500 ring-2 ring-indigo-500/10"
                    : isAllCompetitors
                    ? "bg-[#F0FDF4]/70 hover:bg-[#F0FDF4] border-emerald-200 text-emerald-950"
                    : "bg-[#EFF6FF]/70 hover:bg-[#EFF6FF] border-blue-200 text-blue-950"
                }`}
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className="text-sm shrink-0">{isAllCompetitors ? "⚡" : "🎯"}</span>
                  <div className="truncate text-left">
                    <div className="truncate font-semibold">
                      {isAllCompetitors
                        ? `All Competitors Combined (${competitorSites.length} stores)`
                        : `${selectedCompetitorIds.length} Competitor Store${selectedCompetitorIds.length === 1 ? "" : "s"} Selected`}
                    </div>
                    <div className="text-[10px] font-normal text-slate-500 truncate">
                      {isAllCompetitors
                        ? "Cross-referencing catalog overlaps across all competitor domains"
                        : competitorSites
                            .filter((w) => selectedCompetitorIds.includes(String(w._id)))
                            .map((w) => w.domain)
                            .slice(0, 3)
                            .join(", ") + (selectedCompetitorIds.length > 3 ? ` +${selectedCompetitorIds.length - 3} more` : "")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-slate-600 bg-white/90 px-2 py-0.5 rounded-md border border-slate-200">
                    {isRefreshing ? (
                      <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        <span>Updating…</span>
                      </span>
                    ) : (
                      `${selectedMonitoredUrls.toLocaleString()} URLs`
                    )}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isCompetitorDropdownOpen ? "rotate-180" : ""}`} />
                </div>
              </button>

              {/* Competitor Dropdown Popover */}
              {isCompetitorDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3.5 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Search Bar & Quick Actions */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder={`Search ${competitorSites.length} competitor stores...`}
                        value={competitorSearch}
                        onChange={(e) => setCompetitorSearch(e.target.value)}
                        className="w-full pl-7 pr-6 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white"
                        autoFocus
                      />
                      {competitorSearch && (
                        <button
                          type="button"
                          onClick={() => setCompetitorSearch("")}
                          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleAllCompetitors}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors shrink-0 cursor-pointer"
                    >
                      {isAllCompetitors ? "Isolate First" : "⚡ Select All"}
                    </button>
                  </div>

                  {/* Market Quick Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto text-[11px] pb-0.5">
                    <span className="text-slate-400 font-medium mr-1 shrink-0">Market:</span>
                    {[
                      { id: "all", label: "All" },
                      { id: "en", label: "🇺🇸 US" },
                      { id: "de", label: "🇩🇪 DE" },
                      { id: "it", label: "🇮🇹 IT" },
                      { id: "fr", label: "🇫🇷 FR" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedLanguage(m.id);
                          setSelectedCompetitorIds([]);
                          setPage(1);
                        }}
                        className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer shrink-0 ${
                          selectedLanguage === m.id
                            ? "bg-slate-900 text-white shadow-2xs font-bold"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Scrollable Checkbox List */}
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50 p-1 space-y-0.5">
                    {filteredCompetitorsInDropdown.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No competitor stores found matching &quot;{competitorSearch}&quot;
                      </div>
                    ) : (
                      filteredCompetitorsInDropdown.map((w) => {
                        const isSelected = isCompetitorSelected(String(w._id));
                        return (
                          <button
                            key={String(w._id)}
                            type="button"
                            onClick={() => handleToggleCompetitor(String(w._id))}
                            className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                              isSelected
                                ? "bg-indigo-50/80 text-indigo-950 font-medium"
                                : "hover:bg-white text-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate pr-2">
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                                  isSelected
                                    ? "bg-indigo-600 border-indigo-600 text-white"
                                    : "border-slate-300 bg-white"
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <SiteFavicon domain={w.domain} size={14} className="rounded-xs shrink-0" />
                              <span className="truncate font-mono text-[11px]">{w.domain}</span>
                              <span className="text-xs shrink-0" title={`Market: ${w.language || "en"}`}>
                                {w.language === "de" ? "🇩🇪" : w.language === "it" ? "🇮🇹" : w.language === "fr" ? "🇫🇷" : "🇺🇸"}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">({w.category || "nutra"})</span>
                            </div>
                            {w.totalUrls !== undefined && (
                              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                {w.totalUrls.toLocaleString()} URLs
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Dropdown Footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-500">
                    <span className="text-[11px]">
                      Showing {filteredCompetitorsInDropdown.length} of {competitorSites.length} stores
                    </span>
                    <Button
                      size="sm"
                      onClick={() => setIsCompetitorDropdownOpen(false)}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1 h-7 text-xs rounded-lg cursor-pointer"
                    >
                      Apply Selection
                    </Button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ONE Single Clean Toolbar: Filter Pills + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* Filter Pills with Counts */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 select-none">
            <button
              type="button"
              onClick={() => {
                setActiveFilter("all");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${activeFilter === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
            >
              <span>All Products</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${activeFilter === "all" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                  }`}
              >
                {stats?.matrixTotal || data?.total || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveFilter("missing");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${activeFilter === "missing"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
            >
              <span>Missing Opportunities</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${activeFilter === "missing" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                  }`}
              >
                {stats?.missingCount || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveFilter("shared");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${activeFilter === "shared"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
            >
              <span>Shared Matched</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${activeFilter === "shared" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                  }`}
              >
                {stats?.matchingCount || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveFilter("only_primary");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${activeFilter === "only_primary"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
            >
              <span>Only in Your Store</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${activeFilter === "only_primary" ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700"
                  }`}
              >
                {stats?.onlyPrimaryCount || 0}
              </span>
            </button>

            {stats?.duplicatesRemoved !== undefined && stats.duplicatesRemoved > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveFilter("merged_duplicates");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${activeFilter === "merged_duplicates"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
              >
                <span>Merged Duplicates</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${activeFilter === "merged_duplicates" ? "bg-white/20 text-white" : "bg-sky-100 text-sky-800"
                    }`}
                >
                  {stats.duplicatesRemoved}
                </span>
              </button>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[220px] sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search products across comparison sites..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-700 text-sm leading-none font-semibold cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Comparison Table Container */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 relative overflow-hidden">
          {/* Real-time Table Loading Dimmer */}
          {isRefreshing && (
            <div className="absolute inset-0 bg-white/45 backdrop-blur-[0.5px] z-30 pointer-events-none transition-opacity duration-150" />
          )}
          {/* Clean Light Toolbar Header */}
          <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-3 rounded-t-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">Compare Columns:</span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {matrixCandidateSites.length > 0
                    ? `${activeMatrixSites.length} of ${matrixCandidateSites.length} sites shown`
                    : "Add websites to begin"}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                {secondColView === "trend" && (
                  <button
                    type="button"
                    onClick={handleAnalyzeAllPageTrends}
                    disabled={isBulkAnalyzingTrends}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                    title="Analyze Google Trends for all products on this page"
                  >
                    <TrendingUp className={`w-3.5 h-3.5 ${isBulkAnalyzingTrends ? "animate-spin text-emerald-600" : "text-emerald-600"}`} />
                    <span>{isBulkAnalyzingTrends ? "Analyzing Trends…" : "Analyze Page Trends"}</span>
                  </button>
                )}

                {activeMatrixDomains.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllMatrixSites}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Reset Columns
                  </button>
                )}
              </div>
            </div>

            {/* Site Toggle Pills */}
            {matrixCandidateSites.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-thin">
                {matrixCandidateSites.map((site) => {
                  const isTicked = isMatrixSiteActive(site.domain);

                  return (
                    <button
                      key={site.domain}
                      type="button"
                      onClick={() => toggleMatrixSite(site.domain)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all select-none shrink-0 cursor-pointer border ${isTicked
                        ? "bg-white border-slate-300 text-slate-800 shadow-2xs font-semibold"
                        : "bg-slate-100/60 border-slate-200 text-slate-400 hover:bg-slate-100"
                        }`}
                      title={`Click to ${isTicked ? "hide" : "show"} ${site.domain}`}
                    >
                      <SiteFavicon
                        domain={site.domain}
                        size={14}
                        className={`rounded-xs shrink-0 ${isTicked ? "" : "opacity-30 grayscale"}`}
                      />
                      <span className="truncate max-w-[120px]">{site.domain.replace(/\.com$/, '')}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Table Body with Horizontal Overflow Support */}
          <div className="w-full overflow-x-auto scrollbar-thin">
            <table
              className="w-full text-left border-collapse"
              style={{ minWidth: `${Math.max(720, 440 + activeMatrixSites.length * 110)}px` }}
            >
              <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 shadow-xs">
                <tr className="bg-slate-50">
                  <th className="sticky left-0 top-0 z-30 py-3 px-5 text-xs font-bold text-slate-800 tracking-wide bg-slate-50 border-b border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] w-[280px] min-w-[240px]">
                    Product / URL
                  </th>
                  <th className="sticky top-0 z-20 py-2.5 px-4 text-left bg-slate-50 border-b border-slate-200 w-[170px] min-w-[160px] shrink-0">
                    <div className="inline-flex items-center p-0.5 bg-slate-200/75 border border-slate-300/80 rounded-lg text-[11px] font-medium select-none shadow-2xs">
                      <button
                        type="button"
                        onClick={() => handleToggleColView("source")}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer focus:outline-none ${
                          secondColView === "source"
                            ? "bg-white text-slate-900 shadow-2xs font-semibold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="Show competitor source websites"
                      >
                        Source
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleColView("trend")}
                        className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none ${
                          secondColView === "trend"
                            ? "bg-white text-slate-900 shadow-2xs font-semibold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="Show Google Trends search graphs & scores"
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Trend</span>
                      </button>
                    </div>
                  </th>
                  {activeMatrixSites.map((site) => {
                    return (
                      <th
                        key={site.domain}
                        className="sticky top-0 z-20 py-3 px-2 text-center w-[110px] min-w-[95px] shrink-0 bg-slate-50 border-b border-slate-200"
                      >
                        <div className="flex flex-col items-center gap-1.5 py-0.5">
                          <div className="w-5 h-5 rounded-md bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center overflow-hidden shrink-0">
                            <SiteFavicon domain={site.domain} size={14} />
                          </div>
                          <span className="text-[11px] font-semibold text-slate-800 truncate max-w-[95px] leading-tight text-center" title={site.domain}>
                            {site.domain.replace(/\.com$/, '')}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={`comp-skel-${i}`} className="border-b border-slate-100 animate-pulse">
                      <td className="sticky left-0 py-3 px-5 bg-white border-r border-slate-100 w-[280px]">
                        <div className="h-4 bg-slate-200 rounded w-48 mb-1.5" />
                        <div className="h-3 bg-slate-100 rounded w-64" />
                      </td>
                      <td className="py-3 px-4 w-[170px]">
                        <div className="h-5 bg-slate-200 rounded-md w-28" />
                      </td>
                      {[...Array(Math.max(activeMatrixSites.length, 2))].map((_, cIdx) => (
                        <td key={cIdx} className="py-3 px-2 text-center w-[110px]">
                          <div className="w-5 h-5 bg-slate-200 rounded-full mx-auto" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : hasActiveScans && (matrixCandidateSites.length === 0 || rows.length === 0) ? (
                  <tr>
                    <td
                      colSpan={Math.max(activeMatrixSites.length, 1) + 2}
                      className="py-16 px-6 text-center"
                    >
                      <div className="max-w-md mx-auto">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-4">
                          <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Catalog Sitemaps Are Being Indexed...
                        </h3>
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                          Currently extracting and analyzing products from{" "}
                          <strong>{activeScans.map((s) => s.domain).join(", ")}</strong>. Products and matrix overlap will automatically appear here once indexing finishes.
                        </p>
                        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-indigo-50/70 border border-indigo-100 rounded-full text-xs font-semibold text-indigo-700">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                          <span>Live updating in background</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : matrixCandidateSites.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-20 px-6 text-center">
                      <div className="max-w-sm mx-auto">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                          <GitCompare className="w-7 h-7 text-slate-600" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">No Comparison Websites Yet</h3>
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                          Add your store and at least one competitor website to view the live comparison matrix.
                        </p>
                        <div className="mt-5">
                          <Link
                            href="/dashboard/websites"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Websites</span>
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activeMatrixSites.length + 2}
                      className="py-20 text-center"
                    >
                      <div className="max-w-sm mx-auto">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3">
                          <Search className="w-5 h-5 text-slate-400" />
                        </div>
                        <p className="text-sm font-bold text-slate-900">No products found</p>
                        <p className="text-xs text-slate-500 mt-1">Try selecting &quot;All Products&quot; or clearing your search term.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, rIdx) => {
                    const isEven = rIdx % 2 === 0;

                    return (
                      <tr
                        key={row.id || rIdx}
                        className={`${isEven ? "bg-white" : "bg-[#FAFBFD]"
                          } border-b border-slate-100 hover:bg-slate-50/80 transition-colors`}
                      >
                        {/* Product Details - Sticky Left Column */}
                        <td className={`sticky left-0 z-10 py-3 px-5 text-xs sm:text-sm text-slate-900 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] w-[280px] min-w-[240px] ${
                          isEven ? "bg-white" : "bg-[#FAFBFD]"
                        }`}>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 hover:text-indigo-600 transition-colors truncate">
                              {row.title}
                            </div>
                            {row.slug && (
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                                {row.slug}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Column 2: Competitor Source OR Google Trends */}
                        <td className="py-3 px-4 w-[170px] min-w-[160px] shrink-0">
                          {secondColView === "source" ? (
                            (() => {
                              const baselineDomains = new Set(allBaselineSites.map((b) => b.domain));
                              const compDomains = Object.entries(row.sites || {})
                                .filter(([domain, info]) => !baselineDomains.has(domain) && (info as any)?.available)
                                .map(([domain, info]) => ({ domain, url: (info as any)?.url }));

                              if (compDomains.length === 0) {
                                return <span className="text-[11px] text-slate-300 font-medium">—</span>;
                              }

                              if (compDomains.length === 1) {
                                const c = compDomains[0];
                                return (
                                  <a
                                    key={c.domain}
                                    href={c.url || `https://${c.domain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 transition-colors border border-slate-200/80 max-w-[155px]"
                                    title={`Found on ${c.domain}${c.url ? `\n${c.url}` : ''}`}
                                  >
                                    <SiteFavicon domain={c.domain} size={12} className="rounded-2xs shrink-0" />
                                    <span className="truncate">{c.domain.replace(/\.com$/, '')}</span>
                                    <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  </a>
                                );
                              }

                              const rowKey = row.id || row.slug || row.title || `row-${rIdx}`;
                              const isOpen = openSourceRowId === rowKey;
                              const openUpward = rIdx >= Math.max(rows.length - 3, 0) && rows.length > 3;

                              return (
                                <div className="relative inline-block text-left" data-source-dropdown>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenSourceRowId(isOpen ? null : rowKey);
                                    }}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none border ${
                                      isOpen
                                        ? "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs"
                                        : "bg-slate-100/90 hover:bg-slate-200/90 border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs"
                                    }`}
                                    title={`Click to view all ${compDomains.length} competitor sources`}
                                  >
                                    <Globe className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    <span>{compDomains.length} Sources</span>
                                    <ChevronDown
                                      className={`w-3 h-3 text-slate-400 transition-transform duration-150 shrink-0 ${
                                        isOpen ? "rotate-180 text-indigo-600" : ""
                                      }`}
                                    />
                                  </button>

                                  {isOpen && (
                                    <div
                                      className={`absolute left-0 w-64 max-h-72 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100 ${
                                        openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5"
                                      }`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="px-3 py-1.5 bg-slate-50 flex items-center justify-between text-[11px] font-bold text-slate-700">
                                        <span>Found on {compDomains.length} Competitors</span>
                                        <span className="text-[10px] text-slate-400 font-normal">Click to open ↗</span>
                                      </div>
                                      <div className="py-1">
                                        {compDomains.map((c) => (
                                          <a
                                            key={c.domain}
                                            href={c.url || `https://${c.domain}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-indigo-50/60 hover:text-indigo-600 transition-colors group"
                                            title={c.url || c.domain}
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <SiteFavicon domain={c.domain} size={14} className="rounded-xs shrink-0" />
                                              <span className="truncate font-medium text-slate-800 group-hover:text-indigo-600">
                                                {c.domain}
                                              </span>
                                            </div>
                                            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-500 shrink-0" />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            (() => {
                              const rowKey = row.id || row.slug || row.title;
                              const liveTrend = liveRowTrends[rowKey];
                              const trendScore = liveTrend ? liveTrend.score : row.trendScore;
                              const trendTimeline = liveTrend ? liveTrend.timeline : row.trendTimeline;
                              const trendExploreUrl = liveTrend ? liveTrend.exploreUrl : row.trendExploreUrl;
                              const isAnalyzing = analyzingRowKeys.has(rowKey);

                              if (trendScore !== undefined) {
                                return (
                                  <div className="flex items-center gap-2">
                                    <TrendMiniGraph
                                      score={trendScore}
                                      timeline={trendTimeline}
                                      keywordOrSlug={row.slug || row.title}
                                      exploreUrl={trendExploreUrl}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleAnalyzeRowTrend(row)}
                                      disabled={isAnalyzing}
                                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                      title="Re-check Google Trends"
                                    >
                                      <RefreshCw className={`w-3 h-3 ${isAnalyzing ? "animate-spin text-emerald-600" : ""}`} />
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <button
                                  type="button"
                                  onClick={() => handleAnalyzeRowTrend(row)}
                                  disabled={isAnalyzing}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                                  title="Analyze search interest on Google Trends"
                                >
                                  <TrendingUp className={`w-3 h-3 ${isAnalyzing ? "animate-spin text-emerald-600" : "text-emerald-600"}`} />
                                  <span className="text-[11px] font-semibold text-slate-700">
                                    {isAnalyzing ? "Analyzing…" : "Check Trend"}
                                  </span>
                                </button>
                              );
                            })()
                          )}
                        </td>

                        {/* Site Column Checkmarks / Dashes */}
                        {activeMatrixSites.map((site) => {
                          const siteData = row.sites?.[site.domain];
                          const isAvailable = siteData?.available;

                          return (
                            <td key={site.domain} className="py-2.5 px-2 text-center w-[110px] min-w-[95px] shrink-0">
                              <div className="flex items-center justify-center">
                                {isAvailable ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (siteData?.url) window.open(siteData.url, "_blank");
                                    }}
                                    className="w-6 h-6 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-2xs hover:scale-110 transition-all cursor-pointer"
                                    title={`Available on ${site.domain}${siteData?.url ? `\nClick to open: ${siteData.url}` : ""}`}
                                  >
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  </button>
                                ) : (
                                  <div
                                    className="w-6 h-6 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-300 select-none"
                                    title={`Not present on ${site.domain}`}
                                  >
                                    <span className="text-[10px] font-bold leading-none">—</span>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Integrated Pagination Bar */}
          <div className="border-t border-[#E0E2F0] bg-[#FAFBFD] rounded-b-2xl">
            <Pagination
              currentPage={page}
              pageSize={25}
              totalItems={data?.total || 0}
              onPageChange={setPage}
            />
          </div>
        </div>

        {/* Export CSV Modal */}
        <Modal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          title="Export Comparison Data"
          description="Select which datasets to include in your detailed CSV report"
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs text-slate-900">
            <div className="bg-slate-50 border border-[#E0E2F0] p-3.5 rounded-xl flex flex-col gap-2.5 text-[11px]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-slate-500 font-medium">Scope: </span>
                  <span className="font-semibold text-slate-900">
                    {isAllBaselines ? allBaselineSites.length : selectedBaselineIds.length} of Your Stores VS{" "}
                    {isAllCompetitors ? "All Competitors" : `${selectedCompetitorIds.length} Competitors`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSelectAllExportDatasets}
                  className="text-[#4F46E5] hover:underline font-semibold cursor-pointer text-left"
                >
                  {selectedExportDatasets.length === 4 ? "Reset to Current Filter" : "Select All Datasets"}
                </button>
              </div>
              <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-medium">Comparison Mode:</span>
                  <span className="font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                    {CATEGORY_MODE_CONFIG[categoryMode]?.label || "All"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium">
                  Includes detailed Category & Mode columns in CSV
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div
                onClick={() => handleToggleExportDataset("missing")}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${selectedExportDatasets.includes("missing")
                  ? "bg-amber-50/50 border-amber-400 ring-1 ring-amber-400/30"
                  : "bg-white border-[#E0E2F0] hover:border-slate-300"
                  }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="pt-0.5">
                    {selectedExportDatasets.includes("missing") ? (
                      <CheckSquare className="w-4 h-4 text-amber-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">Missing from Your Store</span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-semibold">
                        Content Gap
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Competitor products absent from your store catalog.
                    </p>
                  </div>
                </div>
              </div>

              <div
                onClick={() => handleToggleExportDataset("shared")}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${selectedExportDatasets.includes("shared")
                  ? "bg-emerald-50/50 border-emerald-400 ring-1 ring-emerald-400/30"
                  : "bg-white border-[#E0E2F0] hover:border-slate-300"
                  }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="pt-0.5">
                    {selectedExportDatasets.includes("shared") ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">Shared Products</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-semibold">
                        Overlapping
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Products available in both your store and competitor stores.
                    </p>
                  </div>
                </div>
              </div>

              <div
                onClick={() => handleToggleExportDataset("only_primary")}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${selectedExportDatasets.includes("only_primary")
                  ? "bg-indigo-50/50 border-indigo-400 ring-1 ring-indigo-400/30"
                  : "bg-white border-[#E0E2F0] hover:border-slate-300"
                  }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="pt-0.5">
                    {selectedExportDatasets.includes("only_primary") ? (
                      <CheckSquare className="w-4 h-4 text-[#4F46E5]" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">Only in Your Store</span>
                      <span className="px-2 py-0.5 bg-indigo-100 text-[#4F46E5] rounded-full text-[10px] font-semibold">
                        Unique Catalog
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Products found only in your store and not on competitor sites.
                    </p>
                  </div>
                </div>
              </div>

              <div
                onClick={() => handleToggleExportDataset("merged_duplicates")}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${selectedExportDatasets.includes("merged_duplicates")
                  ? "bg-sky-50/50 border-sky-400 ring-1 ring-sky-400/30"
                  : "bg-white border-[#E0E2F0] hover:border-slate-300"
                  }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="pt-0.5">
                    {selectedExportDatasets.includes("merged_duplicates") ? (
                      <CheckSquare className="w-4 h-4 text-sky-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">Cross-Competitor Duplicates</span>
                      <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-full text-[10px] font-semibold">
                        Cross-Merged
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Identical products offered across multiple competitors merged into single entries.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E0E2F0]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExportModalOpen(false)}
                disabled={isExporting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmExport}
                isLoading={isExporting}
                disabled={selectedExportDatasets.length === 0}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV Report</span>
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardShell>
  );
}
