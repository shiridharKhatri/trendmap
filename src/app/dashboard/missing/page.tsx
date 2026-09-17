"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { useScan } from "@/components/providers/ScanProvider";
import { getClientCached, setClientCached, invalidateClientCache } from "@/lib/client/cache";
import { type IPageChange, type IWebsite } from "@/types";
import {
  SUPPORTED_GEOS,
  SUPPORTED_TIMEFRAMES,
  cleanProductSearchKeyword,
} from "@/lib/trends/constants";
import { TrendMiniGraph } from "@/components/ui/TrendMiniGraph";
import {
  Download,
  ExternalLink,
  Search,
  CheckSquare,
  Square,
  Check,
  RefreshCw,
  TrendingUp,
  Clock,
  X,
  CheckCircle2,
  ListCheck,
  RotateCcw,
  Sparkles,
} from "lucide-react";

interface PriorityCounts {
  all?: number;
  high: number;
  medium: number;
  low: number;
  unanalyzed: number;
}

function MissingPagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab State: "opportunities" (active/unreviewed) or "completed" (reviewed checklist)
  const currentTabParam = searchParams?.get("tab");
  const [checklistTab, setChecklistTab] = useState<"opportunities" | "completed">(
    currentTabParam === "completed" ? "completed" : "opportunities"
  );

  const [missingPages, setMissingPages] = useState<IPageChange[]>([]);
  const [websites, setWebsites] = useState<IWebsite[]>([]);
  const [priorityCounts, setPriorityCounts] = useState<PriorityCounts>({
    all: 0,
    high: 0,
    medium: 0,
    low: 0,
    unanalyzed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const { activeScans, hasActiveScans } = useScan();

  // Filters
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all"); // all, high, medium, low, unanalyzed
  const [selectedGeo, setSelectedGeo] = useState<string>("US");
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("today 12-m");
  const [sortBy, setSortBy] = useState<"detectedAt" | "trendScore">("detectedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Sync tab state when URL search params change
  useEffect(() => {
    const tab = searchParams?.get("tab");
    setChecklistTab(tab === "completed" ? "completed" : "opportunities");
    setPage(1);
    setSelectedIds(new Set());
  }, [searchParams]);

  // Debounce search input by 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Bulk Selection & Trend Analysis State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [queueStatus, setQueueStatus] = useState<{
    active: boolean;
    queuedCount: number;
    completedCount: number;
  }>({ active: false, queuedCount: 0, completedCount: 0 });

  const { toast } = useToast();

  // Listen for background scan completions to invalidate cache and refresh list
  useEffect(() => {
    const handleScanDone = () => {
      invalidateClientCache("missing_");
      setIsRefreshing(true);
      setRefreshTrigger((c) => c + 1);
    };
    window.addEventListener("trendmap:scan-completed", handleScanDone);
    return () => window.removeEventListener("trendmap:scan-completed", handleScanDone);
  }, []);

  const handleSwitchTab = (tab: "opportunities" | "completed") => {
    setChecklistTab(tab);
    setPage(1);
    setSelectedIds(new Set());
    if (tab === "completed") {
      router.push("/dashboard/missing?tab=completed");
    } else {
      router.push("/dashboard/missing");
    }
  };

  const fetchMissing = async (signal?: AbortSignal) => {
    const isCompleted = checklistTab === "completed";
    const cacheKey = `missing_v4_${checklistTab}_${page}_${sortBy}_${sortOrder}_${selectedWebsiteId}_${priorityFilter}_${selectedGeo}_${debouncedSearch.trim()}`;
    const cached = getClientCached<any>(cacheKey);

    if (cached) {
      setMissingPages(cached.missingPages || []);
      setTotal(cached.total || 0);
      setWebsites(cached.websites || []);
      if (cached.priorityCounts) setPriorityCounts(cached.priorityCounts);
      if (cached.activeCount !== undefined) setActiveCount(cached.activeCount);
      if (cached.completedCount !== undefined) setCompletedCount(cached.completedCount);
      setLoading(false);
      setIsRefreshing(true);
    } else if (missingPages.length === 0) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      let url = `/api/missing?page=${page}&limit=25&sortBy=${sortBy}&sortOrder=${sortOrder}`;
      // Opportunities tab asks for reviewed=false, Completed tab asks for reviewed=true
      url += `&reviewed=${isCompleted ? "true" : "false"}`;

      if (selectedWebsiteId) url += `&websiteId=${selectedWebsiteId}`;
      if (priorityFilter !== "all") url += `&priority=${priorityFilter}`;
      if (selectedGeo) url += `&geo=${selectedGeo}`;
      if (debouncedSearch.trim()) url += `&search=${encodeURIComponent(debouncedSearch.trim())}`;

      const res = await fetch(url, { signal });
      if (res.ok) {
        const json = await res.json();
        setMissingPages(json.missingPages || []);
        setTotal(json.total || 0);
        setWebsites(json.websites || []);
        if (json.priorityCounts) {
          setPriorityCounts({
            all: json.priorityCounts.all ?? json.allCount ?? (priorityFilter === "all" ? json.total : 0),
            high: json.priorityCounts.high ?? 0,
            medium: json.priorityCounts.medium ?? 0,
            low: json.priorityCounts.low ?? 0,
            unanalyzed: json.priorityCounts.unanalyzed ?? 0,
          });
        }
        if (json.activeCount !== undefined) {
          setActiveCount(json.activeCount);
        }
        if (json.completedCount !== undefined) {
          setCompletedCount(json.completedCount);
        }
        setClientCached(cacheKey, json);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast("Failed to load missing pages", "error");
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchQueueStatus = async () => {
    try {
      const res = await fetch("/api/trends/queue");
      if (res.ok) {
        const json = await res.json();
        setQueueStatus({
          active: json.active,
          queuedCount: json.queuedCount ?? 0,
          completedCount: json.completedCount ?? 0,
        });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchMissing(controller.signal);
    fetchQueueStatus();
    return () => controller.abort();
  }, [
    checklistTab,
    page,
    selectedWebsiteId,
    priorityFilter,
    selectedGeo,
    sortBy,
    sortOrder,
    debouncedSearch,
    refreshTrigger,
  ]);

  // Poll queue status periodically if active
  useEffect(() => {
    if (!queueStatus.active) return;
    const interval = setInterval(() => {
      fetchQueueStatus();
      fetchMissing();
    }, 15000);
    return () => clearInterval(interval);
  }, [queueStatus.active]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, selectedWebsiteId, checklistTab, priorityFilter, selectedGeo]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllOnPage = () => {
    if (selectedIds.size === missingPages.length && missingPages.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(missingPages.map((p) => p._id)));
    }
  };

  // Instant optimistic checklist tick / untick handler (0ms response)
  const handleToggleReviewed = async (id: string, currentReviewed: boolean) => {
    const nextReviewed = !currentReviewed;

    // 1. Optimistically remove item from current view list immediately
    setMissingPages((prev) => prev.filter((item) => item._id !== id));
    setTotal((prev) => Math.max(0, prev - 1));

    if (nextReviewed) {
      // Moving from Opportunities -> Completed
      setActiveCount((c) => Math.max(0, c - 1));
      setCompletedCount((c) => c + 1);
      toast("Checked off! Saved to Completed tab ✓", "success");
    } else {
      // Restoring from Completed -> Opportunities
      setCompletedCount((c) => Math.max(0, c - 1));
      setActiveCount((c) => c + 1);
      toast("Restored back to Opportunities Checklist", "info");
    }

    try {
      const res = await fetch(`/api/missing/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isReviewed: nextReviewed }),
      });
      if (!res.ok) {
        throw new Error("Failed to update checklist item");
      }
    } catch {
      // Re-fetch to restore state on error
      fetchMissing();
      toast("Failed to update status. Please try again.", "error");
    }
  };

  // Instant optimistic bulk toggle
  const handleBulkReviewed = async (isReviewed: boolean) => {
    if (selectedIds.size === 0) return;
    const targetIds = new Set(selectedIds);
    const count = targetIds.size;
    setIsBulkUpdating(true);

    // 1. Optimistically update local state immediately
    setMissingPages((prev) => prev.filter((item) => !targetIds.has(item._id)));
    setTotal((prev) => Math.max(0, prev - count));

    if (isReviewed) {
      setActiveCount((c) => Math.max(0, c - count));
      setCompletedCount((c) => c + count);
      toast(`Marked ${count} product${count > 1 ? "s" : ""} completed and saved to Completed tab ✓`, "success");
    } else {
      setCompletedCount((c) => Math.max(0, c - count));
      setActiveCount((c) => c + count);
      toast(`Restored ${count} product${count > 1 ? "s" : ""} to Opportunities Checklist`, "info");
    }

    try {
      const res = await fetch("/api/missing/bulk-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(targetIds),
          isReviewed,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed bulk update");
      }
      setSelectedIds(new Set());
    } catch {
      toast("Failed to update items in bulk", "error");
      fetchMissing();
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Analyze single item with Google Trends
  const handleAnalyzeTrend = async (id: string) => {
    setAnalyzingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageChangeId: id,
          geo: selectedGeo,
          timeframe: selectedTimeframe,
          forceFresh: true,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        toast(
          `Trend score for "${json.trend?.keyword}": ${json.trend?.score}/100 (${json.trend?.priority.toUpperCase()})`,
          "success"
        );
        fetchMissing();
      } else {
        toast("Failed to analyze Google Trends", "error");
      }
    } catch {
      toast("Error analyzing trend", "error");
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Analyze bulk items with Google Trends
  const handleBulkAnalyzeTrends = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkAnalyzing(true);
    try {
      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageChangeIds: Array.from(selectedIds),
          geo: selectedGeo,
          timeframe: selectedTimeframe,
          forceFresh: true,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        toast(`Analyzed Google Trends for ${json.processed} items`, "success");
        fetchMissing();
      } else {
        toast("Failed to analyze Google Trends", "error");
      }
    } catch {
      toast("Error running bulk trend analysis", "error");
    } finally {
      setIsBulkAnalyzing(false);
    }
  };

  // Toggle overnight background queue
  const handleToggleQueue = async () => {
    try {
      if (queueStatus.active) {
        const res = await fetch("/api/trends/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pause" }),
        });
        if (res.ok) {
          setQueueStatus((prev) => ({ ...prev, active: false }));
          toast("Background queue paused.", "info");
        }
      } else {
        const res = await fetch("/api/trends/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "queue_all" }),
        });
        if (res.ok) {
          const json = await res.json();
          setQueueStatus({
            active: true,
            queuedCount: json.queuedCount ?? priorityCounts.unanalyzed,
            completedCount: json.completedCount ?? 0,
          });
          toast(
            `Queued ${json.queuedCount ?? priorityCounts.unanalyzed} products for background analysis (2-3 items/min). Safe without proxies!`,
            "success"
          );
        }
      }
    } catch {
      toast("Error managing background queue", "error");
    }
  };

  const handleExportCsv = () => {
    let url = `/api/export?type=missing&reviewed=${checklistTab === "completed" ? "true" : "false"}`;
    if (selectedWebsiteId) url += `&websiteId=${selectedWebsiteId}`;
    window.location.href = url;
  };

  const allSelected =
    missingPages.length > 0 && selectedIds.size === missingPages.length;

  return (
    <DashboardShell title="Missing Products & Demand Intelligence">
      <div className="space-y-6 max-w-7xl mx-auto relative">
        {/* Sleek Top-Edge Syncing Bar */}
        {(loading || isRefreshing) && (
          <div className="fixed top-0 left-0 right-0 h-1 z-50 overflow-hidden bg-indigo-100">
            <div className="h-full bg-indigo-600 w-full animate-pulse bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-600" />
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
                  Scanning <strong>{activeScans.map((s) => s.domain).join(", ")}</strong>. New missing catalog products will automatically appear here once indexing finishes.
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

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Missing Products & Demand Checklist</h1>
              {websites.filter((w) => w.isPrimary).length > 1 && (
                <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-sm text-[10px] font-medium">
                  {websites.filter((w) => w.isPrimary).length} Baselines Connected
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Identify missing competitor products, evaluate Google search demand, and check them off into your Completed list.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {queueStatus.active ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs font-semibold shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                </span>
                <span>Queue Active ({queueStatus.queuedCount} items • 2-3/min)</span>
                <button
                  onClick={handleToggleQueue}
                  className="ml-1 px-1.5 py-0.5 bg-white border border-emerald-300 hover:bg-emerald-100 rounded text-[10px] font-bold text-emerald-800 transition-colors cursor-pointer"
                  title="Pause background processing"
                >
                  Pause
                </button>
              </div>
            ) : (
              <button
                onClick={handleToggleQueue}
                disabled={priorityCounts.unanalyzed === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                title="Queue unranked products to process in the background at 2-3 items/minute overnight."
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {priorityCounts.unanalyzed > 0
                    ? `Queue Overnight Analysis (${priorityCounts.unanalyzed.toLocaleString()} • 2-3/min)`
                    : "All Products Analyzed ✓"}
                </span>
              </button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Primary View Switcher: Opportunities Checklist vs Completed Tab */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-2 sm:p-2.5 shadow-2xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSwitchTab("opportunities")}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                checklistTab === "opportunities"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <ListCheck className="w-4 h-4 text-emerald-400" />
              <span>Opportunities Checklist</span>
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                  checklistTab === "opportunities"
                    ? "bg-slate-800 text-slate-100"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {activeCount.toLocaleString()}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchTab("completed")}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                checklistTab === "completed"
                  ? "bg-emerald-800 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-emerald-50/60"
              }`}
            >
              <CheckCircle2
                className={`w-4 h-4 ${
                  checklistTab === "completed" ? "text-emerald-200" : "text-emerald-600"
                }`}
              />
              <span>Completed</span>
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                  checklistTab === "completed"
                    ? "bg-emerald-900 text-emerald-100"
                    : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                }`}
              >
                {completedCount.toLocaleString()}
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-500 font-medium px-2 sm:px-0">
            {checklistTab === "opportunities" ? (
              <span>Click <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Done ✓</span> to mark items and move them to Completed.</span>
            ) : (
              <span>Completed items saved here. Click <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">Restore</span> to return to Opportunities.</span>
            )}
          </div>
        </div>

        {/* Clean, Modern Toolbar */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-3 sm:p-3.5 shadow-xs space-y-2.5">
          {/* Row 1: Priority Tabs & Search Box */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Clean Segmented Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto text-xs pb-1 sm:pb-0">
              {[
                { key: "all", label: "All Priorities", count: priorityCounts.all || total },
                { key: "high", label: "High Demand", count: priorityCounts.high, badge: "bg-emerald-100 text-emerald-800" },
                { key: "medium", label: "Moderate", count: priorityCounts.medium, badge: "bg-amber-100 text-amber-800" },
                { key: "low", label: "Low", count: priorityCounts.low },
                { key: "unanalyzed", label: "Not Analyzed", count: priorityCounts.unanalyzed },
              ].map((tab) => {
                const isActive = priorityFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setPriorityFilter(tab.key as any);
                      setPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                      isActive
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-semibold ${
                        isActive
                          ? "bg-slate-800 text-slate-200"
                          : tab.badge || "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {tab.count.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Compact Search Box */}
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder={checklistTab === "completed" ? "Search completed..." : "Search products..."}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-slate-400 focus:ring-1 focus:ring-slate-400/20 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 transition-all outline-hidden"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Secondary Filters & Count */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {/* Competitor Store Selector */}
              <select
                value={selectedWebsiteId}
                onChange={(e) => {
                  setSelectedWebsiteId(e.target.value);
                  setPage(1);
                }}
                className="h-8 px-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:border-slate-400 cursor-pointer max-w-[170px] truncate"
              >
                <option value="">All Competitors</option>
                {websites.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.domain}
                  </option>
                ))}
              </select>

              {/* Country Selector */}
              <select
                value={selectedGeo}
                onChange={(e) => {
                  setSelectedGeo(e.target.value);
                  setPage(1);
                }}
                className="h-8 px-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:border-slate-400 cursor-pointer"
              >
                {SUPPORTED_GEOS.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name.split(" ")[0]} ({g.code})
                  </option>
                ))}
              </select>

              {/* Timeframe Selector */}
              <select
                value={selectedTimeframe}
                onChange={(e) => {
                  setSelectedTimeframe(e.target.value);
                }}
                className="h-8 px-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:border-slate-400 cursor-pointer"
              >
                <option value="today 12-m">Past 12M</option>
                <option value="today 1-m">Past 30D</option>
                <option value="today 3-m">Past 90D</option>
                <option value="today 5-y">Past 5Y</option>
              </select>

              {/* Sort Selector */}
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as any);
                  setPage(1);
                }}
                className="h-8 px-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:border-slate-400 cursor-pointer"
              >
                <option value="detectedAt">Sort: Date</option>
                <option value="trendScore">Sort: Trend Score</option>
              </select>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => fetchMissing()}
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                title="Refresh product list"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Results counter and reset */}
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>
                {missingPages.length} of {total.toLocaleString()} products
              </span>
              {(priorityFilter !== "all" || selectedWebsiteId || searchQuery || sortBy !== "detectedAt") && (
                <button
                  type="button"
                  onClick={() => {
                    setPriorityFilter("all");
                    setSelectedWebsiteId("");
                    setSearchQuery("");
                    setSortBy("detectedAt");
                    setPage(1);
                  }}
                  className="text-slate-900 hover:underline font-semibold cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Action Banner */}
        {selectedIds.size > 0 && (
          <div className="p-3 bg-slate-900 text-white rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm">
            <span className="font-semibold text-slate-100">
              {selectedIds.size} product{selectedIds.size > 1 ? "s" : ""} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700"
                isLoading={isBulkAnalyzing}
                onClick={handleBulkAnalyzeTrends}
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Analyze Google Trends ({selectedIds.size})</span>
              </Button>

              {checklistTab === "opportunities" ? (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  disabled={isBulkUpdating}
                  onClick={() => handleBulkReviewed(true)}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark as Completed ({selectedIds.size})</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700"
                  disabled={isBulkUpdating}
                  onClick={() => handleBulkReviewed(false)}
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restore to Opportunities ({selectedIds.size})</span>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Table of Missing Pages with Checklist & Google Trends */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-900">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-semibold text-[11px]">
                  <th className="py-3 px-3.5 w-10">
                    <button
                      onClick={handleSelectAllOnPage}
                      className="text-slate-400 hover:text-slate-700 block cursor-pointer"
                      aria-label="Select all"
                    >
                      {allSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3">Product Opportunity</th>
                  <th className="py-3 px-3 w-40">Competitor</th>
                  <th className="py-3 px-3 w-52">Search Demand</th>
                  <th className="py-3 px-4 text-right w-40">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && missingPages.length === 0 ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={`skel-miss-${i}`} className="animate-pulse">
                      <td className="py-3 px-3 w-10"><div className="w-4 h-4 bg-slate-200 rounded" /></td>
                      <td className="py-3 px-3">
                        <div className="h-4 bg-slate-200 rounded w-48 mb-1.5" />
                        <div className="h-3 bg-slate-100 rounded w-64" />
                      </td>
                      <td className="py-3 px-3 w-40"><div className="h-4 bg-slate-200 rounded w-24" /></td>
                      <td className="py-3 px-3 w-52"><div className="h-6 bg-slate-100 rounded-lg w-32" /></td>
                      <td className="py-3 px-4 text-right w-40"><div className="h-7 bg-slate-200 rounded-lg w-20 ml-auto" /></td>
                    </tr>
                  ))
                ) : hasActiveScans && missingPages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                          <RefreshCw className="w-7 h-7 animate-spin text-indigo-600" />
                        </div>
                        <p className="font-bold text-sm text-slate-900">
                          Catalog Sitemaps Are Being Extracted...
                        </p>
                        <p className="text-xs text-slate-500">
                          Currently analyzing competitor products from{" "}
                          <strong>{activeScans.map((s) => s.domain).join(", ")}</strong>. New product gap opportunities will appear here automatically upon completion.
                        </p>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50/80 border border-indigo-100 rounded-full text-xs font-semibold text-indigo-700 mt-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                          <span>Live updating in background</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : missingPages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      {checklistTab === "opportunities" ? (
                        <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto px-4">
                          {priorityFilter !== "all" ? (
                            <>
                              <TrendingUp className="w-8 h-8 text-slate-400" />
                              <p className="font-semibold text-sm text-slate-800">
                                No {priorityFilter === "high" ? "High Demand" : priorityFilter === "medium" ? "Moderate" : priorityFilter === "low" ? "Low" : "Unanalyzed"} products found
                              </p>
                              <p className="text-xs text-slate-500 text-center">
                                {priorityCounts.unanalyzed > 0 && priorityFilter !== "unanalyzed"
                                  ? `You have ${priorityCounts.unanalyzed.toLocaleString()} products waiting for Google Trends analysis. Run background analysis to identify and rank high-demand products.`
                                  : "No products match this priority filter."}
                              </p>
                              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPriorityFilter("all")}
                                >
                                  <span>View All Priorities ({priorityCounts.all || total})</span>
                                </Button>
                                {priorityCounts.unanalyzed > 0 && !queueStatus.active && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleToggleQueue}
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Start Trends Analysis</span>
                                  </Button>
                                )}
                              </div>
                            </>
                          ) : searchQuery || selectedWebsiteId ? (
                            <>
                              <Search className="w-8 h-8 text-slate-400" />
                              <p className="font-semibold text-sm text-slate-800">
                                No products match your current search or website filter.
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSearchQuery("");
                                  setSelectedWebsiteId("");
                                }}
                                className="mt-2"
                              >
                                <span>Clear Filters</span>
                              </Button>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                              <p className="font-semibold text-sm text-slate-800">
                                All caught up! No active missing products remaining.
                              </p>
                              <p className="text-xs text-slate-500">
                                {completedCount > 0
                                  ? `You have marked ${completedCount} products as completed.`
                                  : "New competitor items will appear here automatically after your next catalog scan."}
                              </p>
                              {completedCount > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSwitchTab("completed")}
                                  className="mt-2"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>View Completed Checklist ({completedCount})</span>
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                          <ListCheck className="w-8 h-8 text-slate-400" />
                          <p className="font-semibold text-sm text-slate-800">No completed products yet</p>
                          <p className="text-xs text-slate-500">
                            Items you check off with the &ldquo;Done&rdquo; button in the Opportunities Checklist will be saved here.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSwitchTab("opportunities")}
                            className="mt-2"
                          >
                            <ListCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Go to Opportunities Checklist</span>
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  missingPages.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50/70 transition-colors group">
                      <td className="py-3 px-3.5">
                        <button
                          onClick={() => handleToggleSelect(item._id)}
                          className="text-slate-400 hover:text-slate-700 block cursor-pointer"
                        >
                          {selectedIds.has(item._id) ? (
                            <CheckSquare className="w-4 h-4 text-emerald-700" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Product Name & Clean URL */}
                      <td className="py-3 px-3 max-w-md">
                        <div className="flex flex-col">
                          <span className="font-semibold text-xs text-slate-900 leading-snug">
                            {cleanProductSearchKeyword(item.productSlug || item.normalizedUrl)}
                          </span>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-slate-400 hover:text-slate-700 hover:underline truncate max-w-sm mt-0.5 transition-colors"
                            title={item.url}
                          >
                            {item.url.replace(/^https?:\/\/(www\.)?/, "")}
                          </a>
                        </div>
                      </td>

                      {/* Source Competitor */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="text-xs text-slate-600 font-medium">
                          {item.websiteDomain}
                        </span>
                      </td>

                      {/* Google Trends Interactive Mini Graph */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <TrendMiniGraph
                          score={item.trendScore}
                          timeline={item.trendTimeline}
                          keywordOrSlug={item.productSlug || item.normalizedUrl}
                          geo={selectedGeo || item.trendGeo || "US"}
                          timeframe={selectedTimeframe || "today 12-m"}
                          exploreUrl={item.trendExploreUrl}
                        />
                      </td>

                      {/* Clean Actions: Primary Done + Subtle Trend & External Link */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Re-check trend button */}
                          <button
                            type="button"
                            disabled={analyzingIds.has(item._id)}
                            onClick={() => handleAnalyzeTrend(item._id)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Re-check Google Trends"
                          >
                            <TrendingUp className={`w-3.5 h-3.5 ${analyzingIds.has(item._id) ? "animate-spin text-emerald-600" : ""}`} />
                          </button>

                          {/* Checklist Done / Restore Action */}
                          {checklistTab === "opportunities" ? (
                            <button
                              type="button"
                              onClick={() => handleToggleReviewed(item._id, false)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all cursor-pointer shadow-2xs"
                              title="Mark as completed & move to Completed tab"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Done</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleReviewed(item._id, true)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-amber-800 bg-slate-100 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 transition-all cursor-pointer"
                              title="Restore to Opportunities Checklist"
                            >
                              <RotateCcw className="w-3 h-3 text-amber-600" />
                              <span>Restore</span>
                            </button>
                          )}

                          {/* External link */}
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
                            title="Open competitor product URL"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={page}
            pageSize={25}
            totalItems={total}
            onPageChange={setPage}
          />
        </div>
      </div>
    </DashboardShell>
  );
}

export default function MissingPagesPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell title="Missing Products & Demand Intelligence">
          <div className="flex items-center justify-center py-20 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        </DashboardShell>
      }
    >
      <MissingPagesContent />
    </Suspense>
  );
}
