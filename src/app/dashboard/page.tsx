"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { QuickAddWebsiteModal } from "@/components/websites/QuickAddWebsiteModal";
import {
  SUPPORTED_GEOS,
  cleanProductSearchKeyword,
  buildGoogleTrendsUrl,
} from "@/lib/trends/constants";
import { type IWebsite, type IPageChange } from "@/types";
import {
  Globe,
  Play,
  Download,
  ExternalLink,
  Search,
  CheckSquare,
  Square,
  RefreshCw,
  TrendingUp,
  BarChart2,
  ShieldCheck,
  Swords,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  Sparkles,
  ChevronDown,
} from "lucide-react";

interface PriorityCounts {
  high: number;
  medium: number;
  low: number;
  unanalyzed: number;
}

export default function UnifiedProductGapPage() {
  // Websites State
  const [websites, setWebsites] = useState<IWebsite[]>([]);
  const [loadingWebsites, setLoadingWebsites] = useState(true);

  // Missing Products State
  const [missingProducts, setMissingProducts] = useState<IPageChange[]>([]);
  const [totalMissing, setTotalMissing] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [priorityCounts, setPriorityCounts] = useState<PriorityCounts>({
    high: 0,
    medium: 0,
    low: 0,
    unanalyzed: 0,
  });

  // Filters State
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedGeo, setSelectedGeo] = useState<string>("US");
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounce search input by 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Scanning & Trends Action State
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [queueStatus, setQueueStatus] = useState<{
    active: boolean;
    queuedCount: number;
    completedCount: number;
    rate?: string;
  }>({ active: false, queuedCount: 0, completedCount: 0 });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDefaultIsPrimary, setModalDefaultIsPrimary] = useState(false);

  const { toast } = useToast();

  // Fetch Websites (Our Sites & Competitor Sites)
  const fetchWebsites = async () => {
    try {
      const res = await fetch("/api/websites");
      if (res.ok) {
        const json = await res.json();
        setWebsites(json.websites || []);
      }
    } catch {
      toast("Failed to load websites", "error");
    } finally {
      setLoadingWebsites(false);
    }
  };

  // Fetch Missing Products with Google Trends
  const fetchMissingProducts = async (signal?: AbortSignal, silent = false) => {
    if (!silent) setLoadingProducts(true);
    try {
      let url = `/api/missing?page=${page}&limit=25&sortBy=detectedAt&sortOrder=desc`;
      if (selectedCompetitorId) url += `&websiteId=${selectedCompetitorId}`;
      if (priorityFilter !== "all") url += `&priority=${priorityFilter}`;
      if (debouncedSearch.trim()) url += `&search=${encodeURIComponent(debouncedSearch.trim())}`;

      const res = await fetch(url, { signal });
      if (res.ok) {
        const json = await res.json();
        setMissingProducts(json.missingPages || []);
        setTotalMissing(json.total || 0);
        if (json.priorityCounts) {
          setPriorityCounts(json.priorityCounts);
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast("Failed to load missing products", "error");
      }
    } finally {
      if (!silent) setLoadingProducts(false);
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
          rate: json.rate,
        });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchWebsites();
    fetchQueueStatus();
  }, []);

  // Poll queue status periodically if active to stream progress
  useEffect(() => {
    if (!queueStatus.active) return;
    const interval = setInterval(() => {
      fetchQueueStatus();
      fetchMissingProducts();
    }, 15000);
    return () => clearInterval(interval);
  }, [queueStatus.active]);

  useEffect(() => {
    const controller = new AbortController();
    fetchMissingProducts(controller.signal);
    return () => controller.abort();
  }, [selectedCompetitorId, priorityFilter, selectedGeo, debouncedSearch, page]);

  // Split websites into Our Sites vs Competitors
  const ourSites = websites.filter((w) => w.isPrimary);
  const competitorSites = websites.filter((w) => !w.isPrimary);

  // Open Add Modal
  const handleOpenAdd = (isPrimary: boolean) => {
    setModalDefaultIsPrimary(isPrimary);
    setIsModalOpen(true);
  };

  // Delete a website
  const handleDeleteWebsite = async (id: string, domain: string) => {
    if (!confirm(`Are you sure you want to remove ${domain}?`)) return;
    try {
      const res = await fetch(`/api/websites/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast(`Removed ${domain}`, "success");
        fetchWebsites();
        fetchMissingProducts();
      } else {
        toast("Failed to remove website", "error");
      }
    } catch {
      toast("Error deleting website", "error");
    }
  };

  // 1-Click Scan & Compare All Sites
  const handleScanAll = async () => {
    if (websites.length === 0) {
      toast("Please add at least one website first", "error");
      return;
    }

    setIsScanningAll(true);
    toast("Checking all competitor sitemaps and comparing against our sites...", "info");

    try {
      const res = await fetch("/api/websites/scan-all", { method: "POST" });
      const json = await res.json();

      if (res.ok && json.success) {
        toast(`Scan complete! Checked ${json.scannedCount} websites`, "success");
        fetchWebsites();
        fetchMissingProducts();
      } else {
        toast(json.error || "Scan failed", "error");
      }
    } catch {
      toast("Error scanning websites", "error");
    } finally {
      setIsScanningAll(false);
    }
  };

  // Analyze single item trend
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
          `Trend for "${json.trend?.keyword}": ${json.trend?.score}/100 (${json.trend?.priority?.toUpperCase()})`,
          "success"
        );

        // Instant in-place row update without full table reload
        if (json.trend) {
          setMissingProducts((prev) =>
            prev.map((item) =>
              item._id === id
                ? {
                    ...item,
                    trendScore: json.trend.score,
                    trendPriority: json.trend.priority,
                    trendGeo: json.trend.geo,
                    trendExploreUrl: json.trend.exploreUrl,
                    trendFetchedAt: new Date().toISOString(),
                  }
                : item
            )
          );
        }

        // Silent background update for overall badge counters
        fetchMissingProducts(undefined, true);
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

  // Analyze bulk items trends
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

        // Instant in-place update for all selected items
        if (Array.isArray(json.results)) {
          const resultMap = new Map<string, any>(
            json.results.map((r: any) => [r.pageChangeId, r.trend])
          );
          setMissingProducts((prev) =>
            prev.map((item) => {
              const t: any = resultMap.get(item._id);
              if (t) {
                return {
                  ...item,
                  trendScore: t.score,
                  trendPriority: t.priority,
                  trendGeo: t.geo,
                  trendExploreUrl: t.exploreUrl,
                  trendFetchedAt: new Date().toISOString(),
                };
              }
              return item;
            })
          );
        }

        setSelectedIds(new Set());
        fetchMissingProducts(undefined, true);
      } else {
        toast("Failed to analyze Google Trends", "error");
      }
    } catch {
      toast("Error running bulk trend analysis", "error");
    } finally {
      setIsBulkAnalyzing(false);
    }
  };

  // Toggle background demand queue (2-3 items/min overnight safe processing)
  const handleToggleQueue = async () => {
    const wasActive = queueStatus.active;
    // 1. Optimistically flip state immediately
    setQueueStatus((prev) => ({
      ...prev,
      active: !wasActive,
      queuedCount: !wasActive ? (prev.queuedCount || priorityCounts.unanalyzed) : prev.queuedCount,
    }));
    toast(wasActive ? "Background queue paused." : "Background queue activated.", "info");

    try {
      if (wasActive) {
        const res = await fetch("/api/trends/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pause" }),
        });
        if (!res.ok) throw new Error("Failed to pause");
      } else {
        const res = await fetch("/api/trends/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "queue_all" }),
        });
        if (res.ok) {
          const json = await res.json();
          setQueueStatus((prev) => ({
            ...prev,
            active: true,
            queuedCount: json.queuedCount ?? prev.queuedCount,
            completedCount: json.completedCount ?? prev.completedCount,
          }));
        } else {
          throw new Error("Failed to start queue");
        }
      }
    } catch {
      // Revert on error
      setQueueStatus((prev) => ({ ...prev, active: wasActive }));
      toast("Error toggling background queue", "error");
    }
  };

  // Toggle row selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select all on page
  const handleSelectAll = () => {
    if (selectedIds.size === missingProducts.length && missingProducts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(missingProducts.map((p) => p._id)));
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    let url = "/api/export?type=missing";
    if (selectedCompetitorId) url += `&websiteId=${selectedCompetitorId}`;
    if (selectedGeo) url += `&geo=${encodeURIComponent(selectedGeo)}`;
    window.location.href = url;
  };

  const allSelected =
    missingProducts.length > 0 && selectedIds.size === missingProducts.length;

  return (
    <DashboardShell title="Product Gap Tracker">
      <div className="space-y-6 max-w-[1600px] w-full mx-auto pb-10">
        {/* Clean Dashboard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">
              Dashboard
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5 font-medium">
              Monitor competitor products missing from your baseline store & check real-time demand
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportCsv}
              disabled={missingProducts.length === 0}
              className="px-3.5 py-2 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#0F172A] rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => handleOpenAdd(true)}
              className="px-3.5 py-2 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#0F172A] rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Add Site</span>
            </button>

            <button
              id="check-all-btn"
              onClick={handleScanAll}
              disabled={isScanningAll}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isScanningAll ? "Checking Sites..." : "Check All Sites"}</span>
            </button>
          </div>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-xs">
            <div className="flex items-center justify-between text-[#64748B]">
              <span className="text-xs font-semibold">Missing Products</span>
              <Clock className="w-4 h-4 text-[#2563EB]" />
            </div>
            <div className="text-2xl font-bold text-[#0F172A] mt-1.5 font-mono">
              {totalMissing.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#94A3B8] mt-0.5">Found across competitors</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-xs">
            <div className="flex items-center justify-between text-[#64748B]">
              <span className="text-xs font-semibold">Baseline Stores</span>
              <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
            </div>
            <div className="text-2xl font-bold text-[#0F172A] mt-1.5 font-mono">
              {ourSites.length}
            </div>
            <div className="text-[11px] text-[#94A3B8] mt-0.5">Your baseline catalogs</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-xs">
            <div className="flex items-center justify-between text-[#64748B]">
              <span className="text-xs font-semibold">Competitors Tracked</span>
              <Swords className="w-4 h-4 text-[#F472B6]" />
            </div>
            <div className="text-2xl font-bold text-[#0F172A] mt-1.5 font-mono">
              {competitorSites.length}
            </div>
            <div className="text-[11px] text-[#94A3B8] mt-0.5">Active competitor crawls</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-xs">
            <div className="flex items-center justify-between text-[#64748B]">
              <span className="text-xs font-semibold">Auto-Scan Status</span>
              <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
            </div>
            <div className="text-lg font-bold text-[#16A34A] mt-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
              <span>Daily Active</span>
            </div>
            <div className="text-[11px] text-[#94A3B8] mt-0.5">Automated cron monitoring</div>
          </div>
        </div>

        {/* Primary Missing Products Section */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-xs overflow-hidden">
          {/* Card Top Title Bar */}
          <div className="p-5 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0]">
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">Missing Products & Demand</h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Competitor products not found across any of your baseline stores
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64748B] font-medium">Trends Region:</span>
              <select
                value={selectedGeo}
                onChange={(e) => {
                  setSelectedGeo(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              >
                {SUPPORTED_GEOS.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Clean Segmented Filters & Toolbar */}
          <div className="p-5 space-y-4 border-b border-[#E2E8F0] bg-[#FCFCFD]">
            {/* Top Row: Segmented Priority Filters & Search */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Segmented Demand Filters */}
              <div className="flex items-center bg-[#F1F5F9] p-1 rounded-xl overflow-x-auto scrollbar-none">
                <button
                  onClick={() => {
                    setPriorityFilter("all");
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    priorityFilter === "all"
                      ? "bg-white text-[#0F172A] shadow-xs"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  <span>All Missing</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#E2E8F0] text-[#0F172A]">
                    {totalMissing.toLocaleString()}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setPriorityFilter("high");
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    priorityFilter === "high"
                      ? "bg-white text-[#16A34A] shadow-xs"
                      : "text-[#64748B] hover:text-[#16A34A]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                  <span>High Demand (70+)</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#DCFCE7] text-[#16A34A]">
                    {priorityCounts.high.toLocaleString()}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setPriorityFilter("medium");
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    priorityFilter === "medium"
                      ? "bg-white text-[#D97706] shadow-xs"
                      : "text-[#64748B] hover:text-[#D97706]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                  <span>Medium (30-69)</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#FEF3C7] text-[#D97706]">
                    {priorityCounts.medium.toLocaleString()}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setPriorityFilter("low");
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    priorityFilter === "low"
                      ? "bg-white text-[#2563EB] shadow-xs"
                      : "text-[#64748B] hover:text-[#2563EB]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
                  <span>Low (0-29)</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#DBEAFE] text-[#2563EB]">
                    {priorityCounts.low.toLocaleString()}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setPriorityFilter("unanalyzed");
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    priorityFilter === "unanalyzed"
                      ? "bg-white text-[#0F172A] shadow-xs"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-[#94A3B8]" />
                  <span>Not Analyzed</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#F1F5F9] text-[#64748B]">
                    {priorityCounts.unanalyzed.toLocaleString()}
                  </span>
                </button>
              </div>

              {/* Fast Search Input */}
              <div className="relative w-full lg:w-72 shrink-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#94A3B8]" />
                <input
                  type="text"
                  placeholder="Search products or slugs..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-xl text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-colors"
                />
              </div>
            </div>

            {/* Background Demand Analysis Queue Banner */}
            {queueStatus.active && (
              <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl space-y-2 text-xs text-[#166534]">
                <div className="flex items-center justify-between font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A34A]"></span>
                    </span>
                    <span>Overnight Demand Analysis Active (2-3 items/min • Safe without Proxies)</span>
                    <span className="font-mono px-2 py-0.5 bg-white border border-[#BBF7D0] rounded-md text-[11px]">
                      {queueStatus.queuedCount} items remaining
                    </span>
                  </div>
                  <button
                    onClick={handleToggleQueue}
                    className="px-2.5 py-0.5 bg-white border border-[#BBF7D0] rounded-md text-[11px] font-semibold text-[#166534] hover:bg-[#DCFCE7] transition-colors"
                  >
                    Pause Queue
                  </button>
                </div>
                <div className="w-full bg-[#DCFCE7] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#166534] h-full transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (queueStatus.completedCount /
                            Math.max(1, queueStatus.completedCount + queueStatus.queuedCount)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Bottom Row: Secondary Filters & Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              {/* Competitor Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#64748B] font-semibold">Competitor:</span>
                <select
                  value={selectedCompetitorId}
                  onChange={(e) => {
                    setSelectedCompetitorId(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                >
                  <option value="">All Competitor Sites ({competitorSites.length})</option>
                  {competitorSites.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.domain} ({c.name})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => fetchMissingProducts()}
                  className="p-1.5 bg-white border border-[#CBD5E1] rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                  title="Refresh products table"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingProducts ? "animate-spin text-[#2563EB]" : ""}`} />
                </button>
              </div>

              {/* Background Overnight Queue Controller */}
              <div>
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
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                    title="Queue unranked products to process gently in the background at 2-3 items/minute overnight. Safe from Google rate limits without proxies!"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {priorityCounts.unanalyzed > 0
                        ? `Queue Overnight Analysis (${priorityCounts.unanalyzed.toLocaleString()} • 2-3/min)`
                        : "All Products Analyzed ✓"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bulk Action Banner */}
          {selectedIds.size > 0 && (
            <div className="px-5 py-2.5 bg-[#EFF6FF] border-b border-[#BFDBFE] flex items-center justify-between text-xs">
              <span className="font-semibold text-[#1E40AF]">
                {selectedIds.size} product{selectedIds.size > 1 ? "s" : ""} selected
              </span>
              <button
                disabled={isBulkAnalyzing}
                onClick={handleBulkAnalyzeTrends}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Analyze Google Trends for {selectedIds.size} Selected</span>
              </button>
            </div>
          )}

          {/* Products Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#0F172A]">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-8">
                    <button
                      onClick={handleSelectAll}
                      className="text-[#94A3B8] hover:text-[#0F172A] block"
                    >
                      {allSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Competitor Product / Slug</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Found On</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Baseline Status</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Google Trends ({selectedGeo || "Global"})</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Priority</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {loadingProducts ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#94A3B8]">
                      Loading missing products...
                    </td>
                  </tr>
                ) : missingProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-[#94A3B8]">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="w-6 h-6 text-[#16A34A]" />
                        <span className="font-semibold text-sm text-[#0F172A]">No missing products found</span>
                        <span className="text-xs text-[#64748B]">
                          All products on monitored competitors exist in your baseline.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  missingProducts.map((item) => (
                    <tr key={item._id} className="hover:bg-[#F8FAFC] transition-colors">
                      {/* Checkbox */}
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => handleToggleSelect(item._id)}
                          className="text-[#94A3B8] hover:text-[#0F172A] block"
                        >
                          {selectedIds.has(item._id) ? (
                            <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Product URL & Clean Slug */}
                      <td className="py-2.5 px-3 max-w-[240px] lg:max-w-xs xl:max-w-sm">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-xs text-[#0F172A] leading-snug line-clamp-1">
                            {cleanProductSearchKeyword(item.productSlug || item.normalizedUrl)}
                          </span>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] text-[#64748B] hover:text-[#2563EB] hover:underline flex items-center gap-1"
                          >
                            <span className="truncate max-w-[180px] sm:max-w-[220px] lg:max-w-xs">{item.normalizedUrl}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0 text-[#94A3B8]" />
                          </a>
                          {item.productSlug && (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="font-bold text-[#64748B] uppercase tracking-wider text-[9px]">
                                Slug:
                              </span>
                              <code className="px-1.5 py-0.2 bg-[#F1F5F9] border border-[#E2E8F0] rounded text-[#0F172A] font-mono truncate max-w-[160px] sm:max-w-[200px]">
                                {cleanProductSearchKeyword(item.productSlug).toLowerCase().replace(/\s+/g, "-")}
                              </code>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Found on Competitor */}
                      <td className="py-2.5 px-3 font-semibold text-xs text-[#0F172A] whitespace-nowrap">
                        {item.websiteDomain}
                      </td>

                      {/* Baseline Status */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] whitespace-nowrap inline-flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-[#DC2626]" />
                          Missing in Baseline
                        </span>
                      </td>

                      {/* Google Trends Meter */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {item.trendScore !== undefined ? (
                            <>
                              <div className="w-14 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    item.trendScore >= 70
                                      ? "bg-[#16A34A]"
                                      : item.trendScore >= 30
                                      ? "bg-[#F59E0B]"
                                      : "bg-[#94A3B8]"
                                  }`}
                                  style={{ width: `${item.trendScore}%` }}
                                />
                              </div>
                              <span className="font-bold font-mono text-xs text-[#0F172A]">
                                {item.trendScore}/100
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-[#94A3B8] italic">
                              Not analyzed
                            </span>
                          )}

                          <a
                            href={buildGoogleTrendsUrl(
                              item.productSlug || item.normalizedUrl,
                              selectedGeo || item.trendGeo || "US"
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-0.5 text-[#94A3B8] hover:text-[#2563EB] transition-colors"
                            title={`View "${cleanProductSearchKeyword(item.productSlug || item.normalizedUrl)}" on Google Trends`}
                          >
                            <BarChart2 className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>

                      {/* Priority Badge: EXACTLY ONE BADGE */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {item.trendPriority === "high" ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#DCFCE7] text-[#16A34A] inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                            <span>High Demand</span>
                          </span>
                        ) : item.trendPriority === "medium" ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF3C7] text-[#D97706] inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                            <span>Medium Demand</span>
                          </span>
                        ) : item.trendPriority === "low" ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#DBEAFE] text-[#2563EB] inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                            <span>Low Demand</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#F1F5F9] text-[#64748B] inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8]" />
                            <span>Unranked</span>
                          </span>
                        )}
                      </td>

                      {/* Actions: Clean whitespace-nowrap button */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <button
                            onClick={() => handleAnalyzeTrend(item._id)}
                            disabled={analyzingIds.has(item._id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-[#E2E8F0] hover:border-[#2563EB] hover:text-[#2563EB] text-[#0F172A] shadow-xs whitespace-nowrap transition-colors disabled:opacity-50"
                            title="Run live on-demand check for this product"
                          >
                            <TrendingUp className={`w-3 h-3 ${analyzingIds.has(item._id) ? "animate-spin text-[#2563EB]" : ""}`} />
                            <span>{item.trendScore !== undefined ? "Re-check" : "Check"}</span>
                          </button>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-[#94A3B8] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-md transition-colors"
                            title="Open Product URL"
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

          <div className="p-4 border-t border-[#E2E8F0]">
            <Pagination
              currentPage={page}
              pageSize={25}
              totalItems={totalMissing}
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>

      {/* Quick Add Modal */}
      <QuickAddWebsiteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          fetchWebsites();
          fetchMissingProducts();
        }}
        defaultIsPrimary={modalDefaultIsPrimary}
      />
    </DashboardShell>
  );
}
