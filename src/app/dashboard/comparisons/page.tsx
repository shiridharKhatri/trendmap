"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { getClientCached, setClientCached } from "@/lib/client/cache";
import { type IWebsite, type IPage } from "@/types";
import { cleanProductSearchKeyword } from "@/lib/trends/constants";
import {
  GitCompare,
  Download,
  ExternalLink,
  Search,
  CheckCircle,
  ArrowRight,
  Globe,
  RefreshCw,
  CheckSquare,
  Square,
  Layers,
  LayoutGrid,
  List,
} from "lucide-react";

interface ComparisonData {
  primaryWebsite: IWebsite | null;
  baselineWebsites?: IWebsite[];
  activeBaselineWebsites?: IWebsite[];
  monitoredWebsites: IWebsite[];
  selectedMonitored: IWebsite | null;
  stats: {
    primaryTotal: number;
    monitoredTotal: number;
    rawMonitoredTotal?: number;
    duplicatesRemoved?: number;
    matchingCount: number;
    missingCount: number;
    onlyPrimaryCount: number;
    mergedDuplicatesCount?: number;
  } | null;
  tab: "missing" | "shared" | "only_primary" | "merged_duplicates";
  pages: any[];
  total: number;
  page: number;
  limit: number;
}

export default function ComparisonsPage() {
  const [selectedBaselineIds, setSelectedBaselineIds] = useState<string[]>([]);
  const [selectedCompetitorIds, setSelectedCompetitorIds] = useState<string[]>([]); // empty means "all"
  const [activeTab, setActiveTab] = useState<"missing" | "shared" | "only_primary" | "merged_duplicates">("missing");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const getComparisonCacheKey = (
    baselineIds: string[],
    competitorIds: string[],
    tab: string,
    pageNum: number,
    search: string
  ) => {
    const b = baselineIds.length === 0 ? "all" : [...baselineIds].sort().join(",");
    const m = competitorIds.length === 0 ? "all" : [...competitorIds].sort().join(",");
    return `comp_v3_b_${b}_m_${m}_${tab}_${pageNum}_${search.trim()}`;
  };

  // Compute unique cache key for current view
  const currentCacheKey = useMemo(
    () => getComparisonCacheKey(selectedBaselineIds, selectedCompetitorIds, activeTab, page, debouncedSearchQuery),
    [selectedBaselineIds, selectedCompetitorIds, activeTab, page, debouncedSearchQuery]
  );

  // Initialize uniformly to avoid SSR hydration mismatch
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { toast } = useToast();

  // 300ms debounce on search input to prevent hammering the server on every keystroke
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchComparison = async () => {
      // 1. Instant Cache Check (SWR pattern)
      const cached = getClientCached<ComparisonData>(currentCacheKey);
      if (cached) {
        setData(cached);
        setLoading(false);
        setIsRefreshing(true); // Revalidate silently in background
      } else if (!data) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        let url = `/api/comparisons?tab=${activeTab}&page=${page}&limit=25`;
        if (selectedBaselineIds.length > 0 && selectedBaselineIds.length < (data?.baselineWebsites?.length || 999)) {
          url += `&baselineId=${selectedBaselineIds.join(",")}`;
        }
        if (selectedCompetitorIds.length > 0) {
          url += `&monitoredId=${selectedCompetitorIds.join(",")}`;
        } else {
          url += `&monitoredId=all`;
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
  }, [currentCacheKey]);

  const allBaselineSites = data?.baselineWebsites || (data?.primaryWebsite ? [data.primaryWebsite] : []);
  const activeBaselineSites = data?.activeBaselineWebsites || allBaselineSites;
  const competitorSites = data?.monitoredWebsites || [];
  const isAllCompetitors = selectedCompetitorIds.length === 0 || selectedCompetitorIds.length === competitorSites.length;
  const isAllBaselines = selectedBaselineIds.length === 0 || selectedBaselineIds.length === allBaselineSites.length;

  const isBaselineSelected = (id: string) => {
    if (selectedBaselineIds.length === 0) return true;
    return selectedBaselineIds.includes(id);
  };

  const isCompetitorSelected = (id: string) => {
    if (isAllCompetitors) return true;
    return selectedCompetitorIds.includes(id);
  };

  const handleToggleBaseline = (id: string) => {
    setSelectedBaselineIds((prev) => {
      const current = (prev.length === 0 || prev.length === allBaselineSites.length)
        ? allBaselineSites.map((w) => String(w._id))
        : prev;

      let next: string[];
      if (current.includes(id)) {
        if (current.length <= 1) {
          toast("At least 1 baseline website must remain selected", "info");
          return current;
        }
        next = current.filter((x) => x !== id);
      } else {
        next = [...current, id];
        if (next.length === allBaselineSites.length) {
          next = [];
        }
      }
      setPage(1);
      return next;
    });
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
    setSelectedCompetitorIds((prev) => {
      const current = (prev.length === 0 || prev.length === competitorSites.length)
        ? competitorSites.map((w) => String(w._id))
        : prev;

      let next: string[];
      if (current.includes(id)) {
        if (current.length <= 1) {
          toast("At least 1 competitor website must remain selected", "info");
          return current;
        }
        next = current.filter((x) => x !== id);
      } else {
        next = [...current, id];
        if (next.length === competitorSites.length) {
          next = [];
        }
      }
      setPage(1);
      return next;
    });
  };

  const handleToggleAllCompetitors = () => {
    if (isAllCompetitors) {
      if (competitorSites.length > 0) {
        setSelectedCompetitorIds([String(competitorSites[0]._id)]);
        setPage(1);
      }
    } else {
      setSelectedCompetitorIds([]);
    }
    setPage(1);
  };

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedExportDatasets, setSelectedExportDatasets] = useState<string[]>(["missing"]);
  const [isExporting, setIsExporting] = useState(false);

  const handleOpenExportModal = () => {
    setSelectedExportDatasets([activeTab]);
    setIsExportModalOpen(true);
  };

  const handleToggleExportDataset = (dataset: string) => {
    setSelectedExportDatasets((prev) => {
      if (prev.includes(dataset)) {
        if (prev.length <= 1) return prev; // keep at least 1 selected
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

    let url = `/api/export?type=comparison&dataset=${datasetParam}&websiteId=${selectedCompetitorIds.length > 0 ? selectedCompetitorIds.join(",") : "all"}`;
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

  return (
    <DashboardShell title="Website Comparison">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Website Comparison</h1>
              {isRefreshing && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded-full text-[11px] font-medium animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Syncing...</span>
                </span>
              )}
              {allBaselineSites.length > 1 && (
                <span className="px-2.5 py-0.5 bg-[#DCFCE7] text-[#16A34A] rounded-full text-xs font-semibold">
                  {isAllBaselines ? allBaselineSites.length : selectedBaselineIds.length} of {allBaselineSites.length} Baseline Sites Active
                </span>
              )}
              {stats?.duplicatesRemoved !== undefined && stats.duplicatesRemoved > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("merged_duplicates");
                    setPage(1);
                  }}
                  className="px-2.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] hover:bg-[#DBEAFE] transition-colors rounded-full text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  title="Click to view all merged cross-competitor duplicates"
                >
                  <span>⚡ {stats.duplicatesRemoved.toLocaleString()} Duplicates Merged</span>
                  <span className="text-[10px] underline ml-0.5">View &rarr;</span>
                </button>
              )}
            </div>
            <p className="text-xs text-[#64748B] mt-1 font-medium">
              Compare 2 or more competitor catalogs in bulk against all baseline stores with automatic cross-competitor deduplication
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenExportModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              title="Configure and download comparison CSV report"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Baseline Selector and Competitor Selector Bar */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 items-stretch">
            {/* Primary / Baseline Sites Multi-Select Card */}
            <div className="lg:col-span-5 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                      Baseline Portfolio
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

                <div className="flex flex-wrap gap-2">
                  {allBaselineSites.map((b) => {
                    const isSelected = isBaselineSelected(String(b._id));
                    return (
                      <button
                        key={String(b._id)}
                        type="button"
                        onClick={() => handleToggleBaseline(String(b._id))}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-xs cursor-pointer select-none ${
                          isSelected
                            ? "bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8] ring-1 ring-[#2563EB]/25"
                            : "bg-white border-[#CBD5E1] text-[#64748B] hover:border-[#94A3B8] hover:bg-[#F1F5F9]"
                        }`}
                        title={isSelected ? "Click to uncheck from baseline" : "Click to check for baseline"}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#2563EB] shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-[#94A3B8] shrink-0" />
                        )}
                        <span className="truncate max-w-[170px]">{b.domain}</span>
                        {b.totalUrls !== undefined && (
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                              isSelected ? "bg-[#DBEAFE] text-[#1D4ED8]" : "bg-[#F1F5F9] text-[#64748B]"
                            }`}
                          >
                            {b.totalUrls.toLocaleString()}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {allBaselineSites.length === 0 && (
                    <span className="text-xs text-[#94A3B8] py-1">
                      {loading && !data ? "Loading baseline portfolio..." : "No baseline website set"}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-[#64748B] font-medium mt-3 pt-2.5 border-t border-[#E2E8F0]/60 flex items-center justify-between">
                <span>
                  Total Indexed URLs: <strong className="text-[#0F172A]">{(stats?.primaryTotal || 0).toLocaleString()}</strong>
                </span>
                <span className="text-[10px] text-[#94A3B8]">Check/uncheck to filter</span>
              </div>
            </div>

            {/* Comparison Divider Arrow */}
            <div className="lg:col-span-1 flex items-center justify-center text-[#94A3B8] py-2 lg:py-0">
              <div className="flex lg:flex-col items-center gap-1">
                <ArrowRight className="w-4 h-4 hidden lg:block text-[#94A3B8]" />
                <span className="text-xs font-bold uppercase text-[#94A3B8] tracking-wider">VS</span>
              </div>
            </div>

            {/* Competitor Multi-Select Card */}
            <div className="lg:col-span-5 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                      Compare Against Competitor(s)
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

                {competitorSites.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {/* "⚡ All Combined" Quick Chip if multiple competitors */}
                    {competitorSites.length > 1 && (
                      <button
                        type="button"
                        onClick={handleToggleAllCompetitors}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-xs cursor-pointer select-none ${
                          isAllCompetitors
                            ? "bg-[#F0FDF4] border-[#16A34A] text-[#15803D] ring-1 ring-[#16A34A]/25"
                            : "bg-white border-[#CBD5E1] text-[#64748B] hover:border-[#94A3B8] hover:bg-[#F1F5F9]"
                        }`}
                        title="Click to toggle all competitors combined"
                      >
                        {isAllCompetitors ? (
                          <CheckSquare className="w-4 h-4 text-[#16A34A] shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-[#94A3B8] shrink-0" />
                        )}
                        <span>⚡ All Combined</span>
                      </button>
                    )}

                    {/* Individual Competitor Checkboxes */}
                    {competitorSites.map((w) => {
                      const isSelected = isCompetitorSelected(String(w._id));
                      return (
                        <button
                          key={String(w._id)}
                          type="button"
                          onClick={() => handleToggleCompetitor(String(w._id))}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-xs cursor-pointer select-none ${
                            isSelected
                              ? "bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8] ring-1 ring-[#2563EB]/25"
                              : "bg-white border-[#CBD5E1] text-[#64748B] hover:border-[#94A3B8] hover:bg-[#F1F5F9]"
                          }`}
                          title={isSelected ? "Click to uncheck from comparison" : "Click to check for comparison"}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#2563EB] shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-[#94A3B8] shrink-0" />
                          )}
                          <span className="truncate max-w-[170px]">{w.domain}</span>
                          {w.totalUrls !== undefined && (
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                                isSelected ? "bg-[#DBEAFE] text-[#1D4ED8]" : "bg-[#F1F5F9] text-[#64748B]"
                              }`}
                            >
                              {w.totalUrls.toLocaleString()}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-[#64748B] py-1">
                    {loading && !data ? (
                      "Loading competitor catalogs..."
                    ) : (
                      <>
                        No monitored competitor websites yet.{" "}
                        <Link href="/dashboard/websites" className="text-[#2563EB] font-semibold underline">
                          Add one here
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-[#64748B] font-medium mt-3 pt-2.5 border-t border-[#E2E8F0]/60 flex items-center justify-between">
                <span>
                  Competitor Catalog: <strong className="text-[#0F172A]">{(stats?.monitoredTotal || 0).toLocaleString()} URLs</strong>
                  {stats?.duplicatesRemoved ? (
                    <span className="text-[#2563EB] ml-1.5 font-semibold">({stats.duplicatesRemoved.toLocaleString()} cross-merged)</span>
                  ) : null}
                </span>
                <span className="text-[10px] text-[#94A3B8]">Check/uncheck to filter</span>
              </div>
            </div>
          </div>
        </div>

        {/* Comparison Metrics Grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm">
              <div className="text-xs font-semibold text-[#64748B]">Competitor Products</div>
              <div className="text-2xl font-bold text-[#0F172A] mt-1">{stats.monitoredTotal.toLocaleString()}</div>
              <div className="text-[11px] text-[#94A3B8] mt-0.5">
                {stats.duplicatesRemoved && stats.duplicatesRemoved > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("merged_duplicates");
                      setPage(1);
                    }}
                    className="text-[11px] text-[#2563EB] hover:text-[#1D4ED8] hover:underline flex items-center gap-1 cursor-pointer font-medium text-left"
                    title="Click to view all merged duplicates"
                  >
                    <span>⚡ Deduplicated ({stats.duplicatesRemoved} merged - view list)</span>
                  </button>
                ) : (
                  "Unique catalog pages"
                )}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-[#64748B]">Missing from Baseline</div>
                {stats.missingCount > 0 && (
                  <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#D97706] rounded-full text-[10px] font-semibold">
                    Content Gap
                  </span>
                )}
              </div>
              <div className="text-2xl font-bold text-[#0F172A] mt-1">{stats.missingCount.toLocaleString()}</div>
              <div className="text-[11px] text-[#94A3B8] mt-0.5">Absent across all baseline stores</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-[#64748B]">Shared Products</div>
                <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] rounded-full text-[10px] font-semibold">
                  Matched
                </span>
              </div>
              <div className="text-2xl font-bold text-[#0F172A] mt-1">{stats.matchingCount.toLocaleString()}</div>
              <div className="text-[11px] text-[#94A3B8] mt-0.5">Present in both catalogs</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm">
              <div className="text-xs font-semibold text-[#64748B]">Baseline Only URLs</div>
              <div className="text-2xl font-bold text-[#0F172A] mt-1">{stats.onlyPrimaryCount.toLocaleString()}</div>
              <div className="text-[11px] text-[#94A3B8] mt-0.5">Unique to your baseline</div>
            </div>
          </div>
        )}

        {/* Tabbed URL Listing */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FCFCFD]">
            <div className="flex items-center bg-[#F1F5F9] p-1 rounded-xl flex-wrap gap-1">
              <button
                onClick={() => {
                  setActiveTab("missing");
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "missing"
                    ? "bg-white text-[#0F172A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Missing from Baseline ({stats?.missingCount || 0})
              </button>
              <button
                onClick={() => {
                  setActiveTab("shared");
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "shared"
                    ? "bg-white text-[#0F172A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Shared URLs ({stats?.matchingCount || 0})
              </button>
              {stats?.duplicatesRemoved !== undefined && stats.duplicatesRemoved > 0 && (
                <button
                  onClick={() => {
                    setActiveTab("merged_duplicates");
                    setPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    activeTab === "merged_duplicates"
                      ? "bg-white text-[#2563EB] shadow-xs ring-1 ring-[#BFDBFE]"
                      : "text-[#2563EB] hover:text-[#1D4ED8] hover:bg-[#EFF6FF]"
                  }`}
                >
                  <span>⚡ Merged Duplicates ({stats.mergedDuplicatesCount || stats.duplicatesRemoved})</span>
                </button>
              )}
              <button
                onClick={() => {
                  setActiveTab("only_primary");
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "only_primary"
                    ? "bg-white text-[#0F172A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Only on Baseline ({stats?.onlyPrimaryCount || 0})
              </button>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
              <div className="relative max-w-xs w-full">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#94A3B8]" />
                <input
                  type="text"
                  placeholder="Search comparison URLs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                />
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center bg-[#F1F5F9] p-1 rounded-xl border border-[#E2E8F0] shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === "cards"
                      ? "bg-white text-[#2563EB] shadow-xs"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  }`}
                  title="Card View (Spacious & Readable)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === "table"
                      ? "bg-white text-[#2563EB] shadow-xs"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  }`}
                  title="Table View (Compact)"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
              </div>
            </div>
          </div>

          {/* Cards or Table Listing */}
          {viewMode === "cards" ? (
            <div className="p-5 space-y-4 bg-[#F8FAFC]">
              {loading && !data ? (
                <div className="py-16 text-center text-[#94A3B8]">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium">Calculating comparison metrics...</span>
                  </div>
                </div>
              ) : !data?.pages || data.pages.length === 0 ? (
                <div className="py-16 text-center text-[#94A3B8] bg-white rounded-2xl border border-[#E2E8F0]">
                  <p className="text-sm font-medium">No products found matching this view.</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Try switching tabs or adjusting search keywords.</p>
                </div>
              ) : (
                data.pages.map((p, idx) => {
                  const rawTitle = cleanProductSearchKeyword(p.productSlug || p.normalizedUrl) || p.productSlug || "Product";
                  const formattedTitle = rawTitle
                    .split(" ")
                    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ");

                  const competitorCount = p.competitorDomains?.length || p.duplicateCount || 1;
                  const isMergedDuplicate = competitorCount > 1;

                  return (
                    <div
                      key={idx}
                      className="bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-all space-y-3.5"
                    >
                      {/* Top Row: Title, Badges, and Primary Action */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-[#0F172A] tracking-tight">
                              {formattedTitle}
                            </h3>
                            {isMergedDuplicate && (
                              <span className="px-2.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded-lg text-xs font-bold flex items-center gap-1">
                                ⚡ Merged ({competitorCount} Competitors)
                              </span>
                            )}
                            {activeTab === "missing" && (
                              <span className="px-2.5 py-0.5 bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] rounded-lg text-xs font-bold">
                                Missing from Baseline
                              </span>
                            )}
                            {activeTab === "shared" && (
                              <span className="px-2.5 py-0.5 bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] rounded-lg text-xs font-bold">
                                ✓ Shared in Baseline
                              </span>
                            )}
                            {activeTab === "only_primary" && (
                              <span className="px-2.5 py-0.5 bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0] rounded-lg text-xs font-bold">
                                Baseline Only
                              </span>
                            )}
                            {activeTab === "merged_duplicates" && (
                              p.matches && p.matches.length > 0 ? (
                                <span className="px-2.5 py-0.5 bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] rounded-lg text-xs font-bold">
                                  ✓ In Baseline
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] rounded-lg text-xs font-bold">
                                  ⚠ Missing Gap
                                </span>
                              )
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                            <span className="font-semibold text-[#0F172A] bg-[#F1F5F9] px-2 py-0.5 rounded-md">
                              {activeTab === "only_primary" ? p.domain || "Baseline" : p.competitorDomains?.[0] || p.competitorDomain || p.domain}
                            </span>
                            <span>•</span>
                            <span>
                              Last modified:{" "}
                              <strong className="text-[#0F172A]" suppressHydrationWarning>
                                {p.lastmod ? new Date(p.lastmod).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
                              </strong>
                            </span>
                            {p.productSlug && (
                              <>
                                <span>•</span>
                                <span className="font-mono text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 rounded text-xs">
                                  slug: {p.productSlug}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <a
                            href={p.originalUrl || p.normalizedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                          >
                            <span>Open URL</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {/* Main URL Link Bar */}
                      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Globe className="w-4 h-4 text-[#64748B] shrink-0" />
                          <a
                            href={p.originalUrl || p.normalizedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs sm:text-sm text-[#2563EB] hover:underline truncate"
                          >
                            {p.normalizedUrl}
                          </a>
                        </div>
                        <span className="text-xs text-[#94A3B8] shrink-0 hidden sm:inline font-medium">
                          Target Product Page
                        </span>
                      </div>

                      {/* Cross-Competitor Duplicate Links (if present on 2+ competitors) */}
                      {p.competitorUrls && p.competitorUrls.length > 1 && (
                        <div className="p-3.5 bg-[#EFF6FF]/60 border border-[#BFDBFE] rounded-xl space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-[#1D4ED8]">
                            <span>⚡ Also Found on ({p.competitorUrls.length - 1}) Other Competitor URL{p.competitorUrls.length - 1 > 1 ? "s" : ""}:</span>
                          </div>
                          <div className="space-y-1.5">
                            {p.competitorItems && p.competitorItems.length > 1 ? (
                              p.competitorItems.slice(1).map((ci: any, ciIdx: number) => (
                                <div
                                  key={ciIdx}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white border border-[#BFDBFE]/80 rounded-lg text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="px-2 py-0.5 bg-[#DBEAFE] text-[#1D4ED8] font-bold rounded text-xs shrink-0">
                                      {ci.domain}
                                    </span>
                                    <a
                                      href={ci.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-mono text-[#0F172A] hover:text-[#2563EB] hover:underline truncate"
                                    >
                                      {ci.url}
                                    </a>
                                  </div>
                                  <a
                                    href={ci.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-semibold text-[#2563EB] hover:underline shrink-0 inline-flex items-center gap-1"
                                  >
                                    <span>Open Competitor Page</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              ))
                            ) : (
                              p.competitorUrls.slice(1).map((cUrl: string, cIdx: number) => (
                                <div
                                  key={cIdx}
                                  className="flex items-center justify-between gap-2 p-2 bg-white border border-[#BFDBFE]/80 rounded-lg text-xs"
                                >
                                  <a
                                    href={cUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-[#2563EB] hover:underline truncate"
                                  >
                                    {cUrl}
                                  </a>
                                  <ExternalLink className="w-3 h-3 text-[#94A3B8] shrink-0" />
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      {/* Baseline Matches Section */}
                      {p.matches && p.matches.length > 0 ? (
                        <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl space-y-2.5">
                          <div className="flex items-center justify-between text-xs font-bold text-[#16A34A]">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle className="w-4 h-4 text-[#16A34A]" />
                              <span>Present in Your Baseline Portfolio ({p.matches.length} Baseline Store{p.matches.length > 1 ? "s" : ""} Matched):</span>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {p.matches.map((m: any, mIdx: number) => (
                              <div
                                key={mIdx}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white border border-[#BBF7D0] rounded-lg text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] font-bold rounded text-xs shrink-0">
                                    {m.domain}
                                  </span>
                                  <a
                                    href={m.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-[#0F172A] hover:text-[#2563EB] hover:underline truncate"
                                  >
                                    {m.url}
                                  </a>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="px-2 py-0.5 bg-[#F1F5F9] text-[#16A34A] font-bold rounded text-xs">
                                    {m.similarityScore !== undefined && m.similarityScore < 1
                                      ? `${Math.round(m.similarityScore * 100)}% Match`
                                      : "100% Exact Match"}
                                  </span>
                                  <a
                                    href={m.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-semibold text-[#2563EB] hover:underline inline-flex items-center gap-1"
                                  >
                                    <span>Open Baseline Store</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : activeTab !== "only_primary" ? (
                        <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-[#92400E]">
                            <span className="font-bold">Catalog Gap:</span>
                            <span>This product was not found across any of your active baseline stores.</span>
                          </div>
                          <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#B45309] font-bold rounded text-xs shrink-0 w-fit">
                            High Opportunity
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#0F172A]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[#64748B] bg-[#F8FAFC]">
                    <th className="py-3 px-5 font-semibold">Competitor Product / URL</th>
                    <th className="py-3 px-4 font-semibold whitespace-nowrap">Found On</th>
                    <th className="py-3 px-4 font-semibold">Last Modified</th>
                    <th className="py-3 px-4 font-semibold">Comparison Status</th>
                    <th className="py-3 px-5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {loading && !data ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#94A3B8]">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs font-medium">Calculating comparison metrics...</span>
                        </div>
                      </td>
                    </tr>
                  ) : !data?.pages || data.pages.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#94A3B8]">
                        No URLs found matching this view.
                      </td>
                    </tr>
                  ) : (
                    data.pages.map((p, idx) => (
                      <tr key={idx} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-3 px-5 text-[#0F172A]">
                          <div className="flex flex-col gap-1.5">
                            <a
                              href={p.originalUrl || p.normalizedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs font-medium hover:text-[#2563EB] hover:underline flex items-center gap-1.5"
                            >
                              <span className="truncate max-w-xl">{p.normalizedUrl}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-[#94A3B8]" />
                            </a>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {p.productSlug && (
                                <div className="flex items-center gap-1 text-xs">
                                  <span className="font-bold text-[#64748B] uppercase tracking-wider text-[10px]">
                                    Slug:
                                  </span>
                                  <code className="px-1.5 py-0.5 bg-[#F1F5F9] border border-[#E2E8F0] rounded-md text-[#0F172A] font-mono">
                                    {p.productSlug}
                                  </code>
                                </div>
                              )}

                              {p.duplicateCount && p.duplicateCount > 1 && (
                                <span className="px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded-md text-xs font-semibold">
                                  ⚡ Merged from {p.duplicateCount} Competitors
                                </span>
                              )}
                            </div>

                            {/* If present across multiple competitor URLs */}
                            {p.competitorUrls && p.competitorUrls.length > 1 && (
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                                  Also found on ({p.competitorUrls.length - 1} other {p.competitorUrls.length - 1 === 1 ? "competitor URL" : "competitor URLs"}):
                                </span>
                                <div className="flex flex-col gap-1 pl-2 border-l-2 border-[#BFDBFE]">
                                  {p.competitorItems && p.competitorItems.length > 1 ? (
                                    p.competitorItems.slice(1).map((ci: any, ciIdx: number) => (
                                      <div key={ciIdx} className="flex items-center gap-1.5 text-xs">
                                        <span className="px-1.5 py-0.5 bg-[#F1F5F9] text-[#0F172A] rounded font-semibold text-[10px]">
                                          {ci.domain}
                                        </span>
                                        <a
                                          href={ci.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-mono text-[#64748B] hover:text-[#2563EB] hover:underline truncate max-w-md flex items-center gap-1"
                                        >
                                          <span>{ci.url}</span>
                                          <ExternalLink className="w-2.5 h-2.5 text-[#94A3B8]" />
                                        </a>
                                      </div>
                                    ))
                                  ) : (
                                    p.competitorUrls.slice(1).map((cUrl: string, cIdx: number) => (
                                      <a
                                        key={cIdx}
                                        href={cUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-xs text-[#64748B] hover:text-[#2563EB] hover:underline truncate max-w-md flex items-center gap-1"
                                      >
                                        <span>{cUrl}</span>
                                        <ExternalLink className="w-2.5 h-2.5 text-[#94A3B8]" />
                                      </a>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Multi-Baseline Match Display */}
                            {p.matches && p.matches.length > 0 ? (
                              <div className="mt-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                  <span className="font-bold text-[#16A34A] uppercase tracking-wider text-[10px]">
                                    Matched with ({p.matches.length} Baseline {p.matches.length === 1 ? "Site" : "Sites"}):
                                  </span>
                                  {p.matches.map((m: any, mIdx: number) => (
                                    <span
                                      key={mIdx}
                                      className="px-1.5 py-0.5 bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] rounded text-[10px] font-semibold"
                                    >
                                      {m.domain}
                                    </span>
                                  ))}
                                </div>
                                <div className="flex flex-col gap-1 pl-2 border-l-2 border-[#86EFAC]">
                                  {p.matches.map((m: any, mIdx: number) => (
                                    <div key={mIdx} className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748B]">
                                      <span className="px-1.5 py-0.5 bg-[#F1F5F9] text-[#0F172A] rounded font-semibold text-[10px]">
                                        {m.domain}
                                      </span>
                                      <a
                                        href={m.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-[#0F172A] hover:text-[#2563EB] hover:underline truncate max-w-md flex items-center gap-1"
                                      >
                                        <span>{m.url}</span>
                                        <ExternalLink className="w-2.5 h-2.5 text-[#94A3B8]" />
                                      </a>
                                      {m.similarityScore !== undefined && m.similarityScore < 1 && (
                                        <span className="text-[#16A34A] font-semibold text-xs">
                                          ({Math.round(m.similarityScore * 100)}% match)
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : p.matchedUrl ? (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#64748B]">
                                <span className="font-semibold text-[#16A34A]">Matched with:</span>
                                <span className="font-mono text-[#0F172A] truncate max-w-md">{p.matchedUrl}</span>
                                {p.matchedDomain && (
                                  <span className="px-1.5 py-0.5 bg-[#DCFCE7] text-[#16A34A] rounded text-[10px] font-semibold">
                                    {p.matchedDomain}
                                  </span>
                                )}
                                {p.similarityScore !== undefined && p.similarityScore < 1 && (
                                  <span className="text-[#16A34A] font-semibold text-xs">
                                    ({Math.round(p.similarityScore * 100)}% match)
                                  </span>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        {/* Found On Column */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {activeTab === "only_primary" ? (
                            <span className="font-semibold text-xs text-[#0F172A]">{p.domain || "Baseline"}</span>
                          ) : p.competitorDomains && p.competitorDomains.length > 1 ? (
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] font-semibold rounded-md text-xs w-fit">
                                {p.competitorDomains.length} Competitors
                              </span>
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {p.competitorDomains.map((cd: string, cdIdx: number) => (
                                  <span key={cdIdx} className="px-1.5 py-0.5 bg-[#F1F5F9] text-[#0F172A] border border-[#E2E8F0] rounded text-xs font-mono">
                                    {cd}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="font-semibold text-xs text-[#0F172A]">
                              {p.competitorDomains?.[0] || p.competitorDomain || p.domain || "-"}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-[#64748B] text-xs font-medium whitespace-nowrap" suppressHydrationWarning>
                          {p.lastmod ? new Date(p.lastmod).toLocaleDateString() : "-"}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {activeTab === "missing" && (
                            <span className="px-2.5 py-1 bg-[#FEF3C7] text-[#D97706] rounded-full text-xs font-semibold inline-block">
                              Missing from Baseline
                            </span>
                          )}
                          {activeTab === "shared" && (
                            <div className="flex flex-col gap-0.5">
                              <span className="px-2.5 py-1 bg-[#DCFCE7] text-[#16A34A] rounded-full text-xs font-semibold inline-block w-fit">
                                {p.similarityScore !== undefined && p.similarityScore < 1
                                  ? "Pattern Matched"
                                  : "Shared URL"}
                              </span>
                              {p.matchedDomains && p.matchedDomains.length > 1 && (
                                <span className="text-xs text-[#16A34A] font-semibold">
                                  In {p.matchedDomains.length} Baseline Sites
                                </span>
                              )}
                            </div>
                          )}
                          {activeTab === "only_primary" && (
                            <div className="flex flex-col gap-0.5">
                              <span className="px-2.5 py-1 bg-[#F1F5F9] text-[#475569] rounded-full text-xs font-semibold inline-block w-fit">
                                Baseline Only
                              </span>
                              {p.domain && (
                                <span className="text-xs text-[#94A3B8]">
                                  {p.domain}
                                </span>
                              )}
                            </div>
                          )}
                          {activeTab === "merged_duplicates" && (
                            <div className="flex flex-col gap-1">
                              <span className="px-2.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] rounded-full text-xs font-semibold inline-block w-fit">
                                Merged ({p.competitorDomains?.length || p.duplicateCount || 2} Competitors)
                              </span>
                              {p.matches && p.matches.length > 0 ? (
                                <span className="text-xs text-[#16A34A] font-semibold flex items-center gap-1">
                                  ✓ In Baseline ({p.matchedDomains?.join(", ") || p.matchedDomain})
                                </span>
                              ) : (
                                <span className="text-xs text-[#D97706] font-semibold flex items-center gap-1">
                                  ⚠ Missing from Baseline
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-5 text-right whitespace-nowrap">
                          <a
                            href={p.originalUrl || p.normalizedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#2563EB] font-semibold hover:underline"
                          >
                            <span>Open URL</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            currentPage={page}
            pageSize={25}
            totalItems={data?.total || 0}
            onPageChange={setPage}
          />
        </div>

        {/* Export Comparison Modal */}
        <Modal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          title="Export Comparison Data"
          description="Select which comparison datasets to include in your CSV report"
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs text-[#0F172A]">
            {/* Header info / scope preview */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
              <div>
                <span className="text-[#64748B] font-medium">Scope: </span>
                <span className="font-semibold text-[#0F172A]">
                  {isAllBaselines ? allBaselineSites.length : selectedBaselineIds.length} Baseline Sites VS{" "}
                  {isAllCompetitors ? "All Competitors" : `${selectedCompetitorIds.length} Competitors`}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSelectAllExportDatasets}
                className="text-[#2563EB] hover:underline font-semibold cursor-pointer text-left"
              >
                {selectedExportDatasets.length === 4 ? "Reset to Current Tab" : "Select All Datasets"}
              </button>
            </div>

            {/* Datasets Checklist Cards */}
            <div className="space-y-2">
              {/* Option 1: Missing from Baseline */}
              <div
                onClick={() => handleToggleExportDataset("missing")}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  selectedExportDatasets.includes("missing")
                    ? "bg-[#EFF6FF] border-[#2563EB] ring-1 ring-[#2563EB]/20 shadow-2xs"
                    : "bg-white border-[#E2E8F0] hover:border-[#CBD5E1]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="pt-0.5">
                    {selectedExportDatasets.includes("missing") ? (
                      <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#94A3B8]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-[#0F172A]">Missing from Baseline</span>
                      <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#D97706] rounded-full text-[10px] font-semibold">
                        Content Gap
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-0.5">
                      Competitor products absent across your baseline catalog — highest opportunity content gaps.
                    </p>
                  </div>
                </div>
                <span className="font-mono font-semibold text-xs text-[#0F172A] shrink-0 bg-[#F8FAFC] px-2 py-1 rounded-md border border-[#E2E8F0]">
                  {(stats?.missingCount || 0).toLocaleString()} URLs
                </span>
              </div>

              {/* Option 2: Shared Products */}
              <div
                onClick={() => handleToggleExportDataset("shared")}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  selectedExportDatasets.includes("shared")
                    ? "bg-[#EFF6FF] border-[#2563EB] ring-1 ring-[#2563EB]/20 shadow-2xs"
                    : "bg-white border-[#E2E8F0] hover:border-[#CBD5E1]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="pt-0.5">
                    {selectedExportDatasets.includes("shared") ? (
                      <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#94A3B8]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-[#0F172A]">Shared Products</span>
                      <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] rounded-full text-[10px] font-semibold">
                        Matched
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-0.5">
                      Products present in both your baseline and competitor catalogs with similarity scores.
                    </p>
                  </div>
                </div>
                <span className="font-mono font-semibold text-xs text-[#0F172A] shrink-0 bg-[#F8FAFC] px-2 py-1 rounded-md border border-[#E2E8F0]">
                  {(stats?.matchingCount || 0).toLocaleString()} URLs
                </span>
              </div>

              {/* Option 3: Cross-Competitor Merged Duplicates */}
              <div
                onClick={() => handleToggleExportDataset("merged_duplicates")}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  selectedExportDatasets.includes("merged_duplicates")
                    ? "bg-[#EFF6FF] border-[#2563EB] ring-1 ring-[#2563EB]/20 shadow-2xs"
                    : "bg-white border-[#E2E8F0] hover:border-[#CBD5E1]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="pt-0.5">
                    {selectedExportDatasets.includes("merged_duplicates") ? (
                      <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#94A3B8]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-[#0F172A]">Cross-Competitor Merged Duplicates</span>
                      <span className="px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded-full text-[10px] font-semibold">
                        ⚡ Duplicates
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-0.5">
                      Products sold across 2 or more competitors (with all competitor domains and URLs listed).
                    </p>
                  </div>
                </div>
                <span className="font-mono font-semibold text-xs text-[#0F172A] shrink-0 bg-[#F8FAFC] px-2 py-1 rounded-md border border-[#E2E8F0]">
                  {(stats?.mergedDuplicatesCount || stats?.duplicatesRemoved || 0).toLocaleString()} URLs
                </span>
              </div>

              {/* Option 4: Only on Baseline */}
              <div
                onClick={() => handleToggleExportDataset("only_primary")}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  selectedExportDatasets.includes("only_primary")
                    ? "bg-[#EFF6FF] border-[#2563EB] ring-1 ring-[#2563EB]/20 shadow-2xs"
                    : "bg-white border-[#E2E8F0] hover:border-[#CBD5E1]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="pt-0.5">
                    {selectedExportDatasets.includes("only_primary") ? (
                      <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#94A3B8]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-[#0F172A]">Only on Baseline</span>
                      <span className="px-2 py-0.5 bg-[#F1F5F9] text-[#475569] rounded-full text-[10px] font-semibold">
                        Unique Catalog
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-0.5">
                      Products and URLs unique to your baseline stores that competitors do not offer.
                    </p>
                  </div>
                </div>
                <span className="font-mono font-semibold text-xs text-[#0F172A] shrink-0 bg-[#F8FAFC] px-2 py-1 rounded-md border border-[#E2E8F0]">
                  {(stats?.onlyPrimaryCount || 0).toLocaleString()} URLs
                </span>
              </div>
            </div>

            {/* Footer / Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#E2E8F0]">
              <span className="text-[11px] text-[#64748B]">
                {selectedExportDatasets.length} of 4 datasets selected
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsExportModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  isLoading={isExporting}
                  onClick={handleConfirmExport}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  <span>Download CSV</span>
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardShell>
  );
}
