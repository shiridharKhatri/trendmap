"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { getClientCached, setClientCached } from "@/lib/client/cache";
import { type IPageChange, type IWebsite } from "@/types";
import {
  SUPPORTED_GEOS,
  cleanProductSearchKeyword,
  buildGoogleTrendsUrl,
} from "@/lib/trends/constants";
import {
  Download,
  ExternalLink,
  Search,
  CheckSquare,
  Square,
  Check,
  RefreshCw,
  TrendingUp,
  BarChart2,
  SlidersHorizontal,
  Clock,
} from "lucide-react";

interface PriorityCounts {
  high: number;
  medium: number;
  low: number;
  unanalyzed: number;
}

export default function MissingPagesPage() {
  const [missingPages, setMissingPages] = useState<IPageChange[]>([]);
  const [websites, setWebsites] = useState<IWebsite[]>([]);
  const [priorityCounts, setPriorityCounts] = useState<PriorityCounts>({
    high: 0,
    medium: 0,
    low: 0,
    unanalyzed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string>("");
  const [reviewedFilter, setReviewedFilter] = useState<string>("all"); // all, false, true
  const [priorityFilter, setPriorityFilter] = useState<string>("all"); // all, high, medium, low, unanalyzed
  const [selectedGeo, setSelectedGeo] = useState<string>("US"); // default to US or Worldwide
  const [sortBy, setSortBy] = useState<"detectedAt" | "trendScore">("detectedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounce search input by 250ms for buttery-smooth typing
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

  const fetchMissing = async (signal?: AbortSignal) => {
    const cacheKey = `missing_${page}_${sortBy}_${sortOrder}_${selectedWebsiteId}_${reviewedFilter}_${priorityFilter}_${selectedGeo}_${debouncedSearch.trim()}`;
    const cached = getClientCached<any>(cacheKey);
    if (cached) {
      setMissingPages(cached.missingPages || []);
      setTotal(cached.total || 0);
      setWebsites(cached.websites || []);
      if (cached.priorityCounts) setPriorityCounts(cached.priorityCounts);
      setLoading(false);
    } else if (missingPages.length === 0) {
      setLoading(true);
    }

    try {
      let url = `/api/missing?page=${page}&limit=25&sortBy=${sortBy}&sortOrder=${sortOrder}`;
      if (selectedWebsiteId) url += `&websiteId=${selectedWebsiteId}`;
      if (reviewedFilter !== "all") url += `&reviewed=${reviewedFilter}`;
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
          setPriorityCounts(json.priorityCounts);
        }
        setClientCached(cacheKey, json);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast("Failed to load missing pages", "error");
      }
    } finally {
      setLoading(false);
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
  }, [page, selectedWebsiteId, reviewedFilter, priorityFilter, selectedGeo, sortBy, sortOrder, debouncedSearch]);

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
  }, [page, selectedWebsiteId, reviewedFilter, priorityFilter, selectedGeo]);

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

  // Instant optimistic toggle
  const handleToggleReviewed = async (id: string, current: boolean) => {
    const nextReviewed = !current;
    // 1. Optimistically update local state immediately (0ms latency!)
    setMissingPages((prev) =>
      prev.map((item) => (item._id === id ? { ...item, isReviewed: nextReviewed } : item))
    );
    toast(current ? "Marked unreviewed" : "Marked reviewed", "success");

    try {
      const res = await fetch(`/api/missing/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isReviewed: nextReviewed }),
      });
      if (!res.ok) {
        throw new Error("Failed to update status");
      }
    } catch {
      // Revert on error
      setMissingPages((prev) =>
        prev.map((item) => (item._id === id ? { ...item, isReviewed: current } : item))
      );
      toast("Failed to update status", "error");
    }
  };

  // Instant optimistic bulk toggle
  const handleBulkReviewed = async (isReviewed: boolean) => {
    if (selectedIds.size === 0) return;
    const targetIds = new Set(selectedIds);
    setIsBulkUpdating(true);

    // 1. Optimistically update local state immediately
    setMissingPages((prev) =>
      prev.map((item) => (targetIds.has(item._id) ? { ...item, isReviewed } : item))
    );
    toast(
      isReviewed
        ? `Marked ${targetIds.size} products as reviewed`
        : `Marked ${targetIds.size} products as unreviewed`,
      "success"
    );

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
        body: JSON.stringify({ pageChangeId: id, geo: selectedGeo }),
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
    let url = "/api/export?type=missing";
    if (selectedWebsiteId) url += `&websiteId=${selectedWebsiteId}`;
    window.location.href = url;
  };

  const allSelected =
    missingPages.length > 0 && selectedIds.size === missingPages.length;

  return (
    <DashboardShell title="Missing Pages & Demand Intelligence">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E5E5] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-[#171717]">Missing Products & Demand Intelligence</h1>
              {websites.filter((w) => w.isPrimary).length > 1 && (
                <span className="px-2 py-0.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] rounded-sm text-[10px] font-medium">
                  {websites.filter((w) => w.isPrimary).length} Baselines Connected
                </span>
              )}
            </div>
            <p className="text-xs text-[#737373] mt-0.5">
              Evaluate competitor products absent from your catalog and prioritize them based on real Google search demand
            </p>
          </div>
          <div className="flex items-center gap-2">
            {queueStatus.active ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] rounded-lg text-xs font-semibold shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A34A]"></span>
                </span>
                <span>Queue Active ({queueStatus.queuedCount} items • 2-3/min)</span>
                <button
                  onClick={handleToggleQueue}
                  className="ml-1 px-1.5 py-0.5 bg-white border border-[#BBF7D0] hover:bg-[#DCFCE7] rounded text-[10px] font-bold text-[#15803D] transition-colors"
                  title="Pause background processing"
                >
                  Pause
                </button>
              </div>
            ) : (
              <button
                onClick={handleToggleQueue}
                disabled={priorityCounts.unanalyzed === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                title="Queue unranked products to process in the background at 2-3 items/minute overnight. Safe from rate limits without proxies."
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

        {/* Priority Filter Tabs & Region Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-[#E5E5E5] rounded-sm p-3">
          {/* Priority Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => {
                setPriorityFilter("all");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
                priorityFilter === "all"
                  ? "bg-[#171717] text-white"
                  : "text-[#737373] hover:bg-[#FAFAF8] hover:text-[#171717]"
              }`}
            >
              All Priorities ({total})
            </button>
            <button
              onClick={() => {
                setPriorityFilter("high");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
                priorityFilter === "high"
                  ? "bg-[#991B1B] text-white"
                  : "text-[#991B1B] hover:bg-[#FEF2F2]"
              }`}
            >
              <span>High Priority (70+)</span>
              <span className="px-1.5 py-0.2 bg-white/20 rounded text-[10px]">
                {priorityCounts.high}
              </span>
            </button>
            <button
              onClick={() => {
                setPriorityFilter("medium");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
                priorityFilter === "medium"
                  ? "bg-[#B45309] text-white"
                  : "text-[#B45309] hover:bg-[#FFFBEB]"
              }`}
            >
              <span>Medium (30-69)</span>
              <span className="px-1.5 py-0.2 bg-white/20 rounded text-[10px]">
                {priorityCounts.medium}
              </span>
            </button>
            <button
              onClick={() => {
                setPriorityFilter("low");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
                priorityFilter === "low"
                  ? "bg-[#57534E] text-white"
                  : "text-[#57534E] hover:bg-[#F5F5F4]"
              }`}
            >
              <span>Low (0-29)</span>
              <span className="px-1.5 py-0.2 bg-white/20 rounded text-[10px]">
                {priorityCounts.low}
              </span>
            </button>
            <button
              onClick={() => {
                setPriorityFilter("unanalyzed");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
                priorityFilter === "unanalyzed"
                  ? "bg-[#737373] text-white"
                  : "text-[#737373] hover:bg-[#FAFAF8]"
              }`}
            >
              <span>Not Analyzed</span>
              <span className="px-1.5 py-0.2 bg-white/20 rounded text-[10px]">
                {priorityCounts.unanalyzed}
              </span>
            </button>
          </div>

          {/* Region / Geo Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-[#737373]">Target Country:</span>
            <select
              value={selectedGeo}
              onChange={(e) => {
                setSelectedGeo(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm text-xs font-medium text-[#171717] focus:outline-none focus:border-[#171717]"
            >
              {SUPPORTED_GEOS.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white border border-[#E5E5E5] rounded-sm p-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Website Filter */}
            <select
              value={selectedWebsiteId}
              onChange={(e) => {
                setSelectedWebsiteId(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
            >
              <option value="">All Competitor Websites</option>
              {websites.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.domain} ({w.name})
                </option>
              ))}
            </select>

            {/* Review Status Filter */}
            <select
              value={reviewedFilter}
              onChange={(e) => {
                setReviewedFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
            >
              <option value="all">All Review Statuses</option>
              <option value="false">Unreviewed (Missing)</option>
              <option value="true">Reviewed</option>
            </select>

            {/* Sort Order Selector */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
            >
              <option value="detectedAt">Sort by Date</option>
              <option value="trendScore">Sort by Google Trend Score</option>
            </select>

            {/* Refresh Button */}
            <Button variant="outline" size="sm" onClick={() => fetchMissing()}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#737373]" />
            <input
              type="text"
              placeholder="Search URLs or product slugs..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm text-xs focus:outline-none focus:border-[#171717]"
            />
          </div>
        </div>

        {/* Bulk Action Banner */}
        {selectedIds.size > 0 && (
          <div className="p-2.5 bg-[#F5F5F4] border border-[#E5E5E5] rounded-sm flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-[#171717]">
              {selectedIds.size} page{selectedIds.size > 1 ? "s" : ""} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                isLoading={isBulkAnalyzing}
                onClick={handleBulkAnalyzeTrends}
              >
                <TrendingUp className="w-3.5 h-3.5 text-[#166534]" />
                <span>Analyze Google Trends ({selectedIds.size})</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                isLoading={isBulkUpdating}
                onClick={() => handleBulkReviewed(true)}
              >
                <Check className="w-3 h-3" />
                <span>Mark as Reviewed</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isBulkUpdating}
                onClick={() => handleBulkReviewed(false)}
              >
                Mark as Unreviewed
              </Button>
            </div>
          </div>
        )}

        {/* Table of Missing Pages with Google Trends */}
        <div className="bg-white border border-[#E5E5E5] rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#171717]">
              <thead>
                <tr className="bg-[#FAFAF8] border-b border-[#E5E5E5] text-[#737373] font-medium">
                  <th className="py-2.5 px-3 w-8">
                    <button
                      onClick={handleSelectAllOnPage}
                      className="text-[#737373] hover:text-[#171717] block"
                      aria-label="Select all"
                    >
                      {allSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[#166534]" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Missing Product / Slug</th>
                  <th className="py-2.5 px-3">Source Site</th>
                  <th className="py-2.5 px-3">Google Trends ({selectedGeo || "Global"})</th>
                  <th className="py-2.5 px-3">Demand Priority</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {loading && missingPages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#737373]">
                      Loading missing products and trend metrics...
                    </td>
                  </tr>
                ) : missingPages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#737373]">
                      No missing products found matching current filters.
                    </td>
                  </tr>
                ) : (
                  missingPages.map((item) => (
                    <tr key={item._id} className="hover:bg-[#FAFAF8] transition-colors">
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => handleToggleSelect(item._id)}
                          className="text-[#737373] hover:text-[#171717] block"
                        >
                          {selectedIds.has(item._id) ? (
                            <CheckSquare className="w-3.5 h-3.5 text-[#166534]" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>

                      {/* Product URL & Slug */}
                      <td className="py-2.5 px-3 text-[#171717] max-w-sm">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-xs text-[#171717] leading-tight">
                            {cleanProductSearchKeyword(item.productSlug || item.normalizedUrl)}
                          </span>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] text-[#737373] hover:text-[#171717] hover:underline flex items-center gap-1"
                          >
                            <span className="truncate max-w-xs">{item.normalizedUrl}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0 text-[#737373]" />
                          </a>
                          {item.productSlug && (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="font-semibold text-[#737373] uppercase tracking-wider text-[9px]">
                                Slug:
                              </span>
                              <code className="px-1.5 py-0.5 bg-[#F5F5F4] border border-[#E5E5E5] rounded-sm text-[#171717] font-mono">
                                {cleanProductSearchKeyword(item.productSlug).toLowerCase().replace(/\s+/g, "-")}
                              </code>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Source Website */}
                      <td className="py-2.5 px-3 font-medium text-[#171717]">
                        {item.websiteDomain}
                      </td>

                      {/* Google Trends Score & Visual Meter */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          {item.trendScore !== undefined ? (
                            <>
                              {/* Visual Progress Bar */}
                              <div className="w-16 h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    item.trendScore >= 70
                                      ? "bg-[#991B1B]"
                                      : item.trendScore >= 30
                                      ? "bg-[#B45309]"
                                      : "bg-[#737373]"
                                  }`}
                                  style={{ width: `${item.trendScore}%` }}
                                />
                              </div>
                              <span className="font-semibold font-mono text-[11px] text-[#171717]">
                                {item.trendScore}/100
                              </span>
                            </>
                          ) : (
                            <span className="text-[11px] text-[#A3A3A3] italic">
                              Not analyzed yet
                            </span>
                          )}

                          {/* Direct link to Google Trends graph */}
                          <a
                            href={buildGoogleTrendsUrl(item.productSlug || item.normalizedUrl, selectedGeo)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-[#737373] hover:text-[#166534] transition-colors"
                            title={`Open "${cleanProductSearchKeyword(item.productSlug || item.normalizedUrl)}" on Google Trends (${selectedGeo ? SUPPORTED_GEOS.find((g) => g.code === selectedGeo)?.name || selectedGeo : "Worldwide"})`}
                          >
                            <BarChart2 className="w-3.5 h-3.5 text-[#166534]" />
                          </a>
                        </div>
                      </td>

                      {/* Demand Priority Badge */}
                      <td className="py-2.5 px-3">
                        {item.trendPriority === "high" && (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-semibold border bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]">
                            High Demand
                          </span>
                        )}
                        {item.trendPriority === "medium" && (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-semibold border bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]">
                            Medium Demand
                          </span>
                        )}
                        {item.trendPriority === "low" && (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-semibold border bg-[#F5F5F4] text-[#57534E] border-[#E5E5E5]">
                            Low Demand
                          </span>
                        )}
                        {!item.trendPriority && (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-medium border bg-[#FAFAF8] text-[#A3A3A3] border-[#E5E5E5]">
                            Unranked
                          </span>
                        )}
                      </td>

                      {/* Review Status */}
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${
                            item.isReviewed
                              ? "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]"
                              : "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]"
                          }`}
                        >
                          {item.isReviewed ? "Reviewed" : "Missing"}
                        </span>
                      </td>

                      {/* Row Actions */}
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={analyzingIds.has(item._id)}
                            onClick={() => handleAnalyzeTrend(item._id)}
                            title="Run instant live check on demand"
                          >
                            <TrendingUp className="w-3 h-3 text-[#166534]" />
                            <span>{item.trendScore !== undefined ? "Re-check" : "Trends"}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleReviewed(item._id, item.isReviewed)}
                          >
                            {item.isReviewed ? "Unreview" : "Review"}
                          </Button>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-[#737373] hover:text-[#171717]"
                            title="Open URL"
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
