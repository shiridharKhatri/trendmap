"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useToast } from "@/components/ui/Toast";
import { useScan } from "@/components/providers/ScanProvider";
import { QuickAddWebsiteModal } from "@/components/websites/QuickAddWebsiteModal";
import { invalidateClientCache } from "@/lib/client/cache";
import { type IWebsite } from "@/types";
import {
  DemandPriorityDonut,
  CatalogComparisonGraph,
  ChecklistProgressRing,
  TopDemandOpportunities,
  type OpportunityItem,
} from "@/components/dashboard/DashboardGraphs";
import {
  Play,
  RefreshCw,
  Plus,
  ListCheck,
  ArrowRight,
  GitCompare,
} from "lucide-react";

interface PriorityCounts {
  high: number;
  medium: number;
  low: number;
  unanalyzed: number;
}

export default function DashboardPage() {
  const [websites, setWebsites] = useState<IWebsite[]>([]);
  const [totalMissing, setTotalMissing] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [priorityCounts, setPriorityCounts] = useState<PriorityCounts>({
    high: 0,
    medium: 0,
    low: 0,
    unanalyzed: 0,
  });
  const [topOpportunities, setTopOpportunities] = useState<OpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const { isScanningAll, hasActiveScans, triggerScanAll, activeScans } = useScan();
  const scanningAll = isScanningAll || hasActiveScans;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDefaultIsPrimary, setModalDefaultIsPrimary] = useState(false);

  const { toast } = useToast();

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      if (res.ok) {
        const json = await res.json();
        setWebsites(json.websites || []);
        setTotalMissing(json.totalMissing || 0);
        setActiveCount(json.activeCount || 0);
        setCompletedCount(json.completedCount || 0);
        if (json.priorityCounts) setPriorityCounts(json.priorityCounts);
        setTopOpportunities(json.topOpportunities || []);
      }
    } catch {
      toast("Failed to load dashboard metrics", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  // Refresh data whenever a background scan completes
  useEffect(() => {
    const handleScanDone = () => {
      invalidateClientCache();
      fetchDashboardStats();
    };
    window.addEventListener("trendmap:scan-completed", handleScanDone);
    return () => window.removeEventListener("trendmap:scan-completed", handleScanDone);
  }, []);

  const handleScanAll = async () => {
    if (websites.length === 0) {
      toast("Please add at least one website first", "error");
      return;
    }
    await triggerScanAll();
  };

  const handleMarkDone = async (id: string) => {
    // Optimistically update
    setTopOpportunities((prev) => prev.filter((item) => item._id !== id));
    setActiveCount((c) => Math.max(0, c - 1));
    setCompletedCount((c) => c + 1);
    toast("Marked done and moved to Completed checklist ✓", "success");

    try {
      const res = await fetch(`/api/missing/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isReviewed: true }),
      });
      if (!res.ok) throw new Error("Failed update");
    } catch {
      fetchDashboardStats();
      toast("Failed to update status", "error");
    }
  };

  const ourSites = websites.filter((w) => w.isPrimary);
  const competitorSites = websites.filter((w) => !w.isPrimary);
  const totalCompleted = completedCount;
  const totalActive = activeCount || totalMissing;
  const completionPct = totalMissing > 0 ? Math.round((totalCompleted / (totalCompleted + totalActive)) * 100) : 0;

  return (
    <DashboardShell title="Visual Analytics & Demand Intelligence">
      <div className="space-y-6 w-full mx-auto pb-12 relative">
        {/* Sleek Top-Edge Syncing Bar */}
        {loading && (
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
                  Currently indexing{" "}
                  <strong>{activeScans.map((s) => s.domain).join(", ")}</strong>. Metrics and product catalog gaps will update live automatically when completed.
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

        {/* Clean Dashboard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/90 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Demand &amp; Gap Intelligence
              </h1>
              {ourSites.length > 0 && (
                <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
                  {ourSites[0].name || ourSites[0].domain} (Baseline)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Real-time telemetry on competitor catalog gaps, Google search demand, and review progress.
            </p>
          </div>

          {/* Header Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/dashboard/missing"
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all"
            >
              <ListCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>Checklist Table</span>
            </Link>

            <Link
              href="/dashboard/comparisons"
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all"
            >
              <GitCompare className="w-3.5 h-3.5 text-slate-600" />
              <span>Comparison Matrix</span>
            </Link>

            <button
              onClick={() => {
                setModalDefaultIsPrimary(false);
                setIsModalOpen(true);
              }}
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-slate-600" />
              <span>Add Competitor</span>
            </button>

            <button
              id="check-all-btn"
              onClick={handleScanAll}
              disabled={scanningAll}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {scanningAll ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{scanningAll ? "Scanning in Background..." : "Check All Sites"}</span>
            </button>
          </div>
        </div>

        {/* Executive Metric Ribbon (Clean, Minimal, No Clutter) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={`stat-skel-${i}`} className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs animate-pulse">
                <div className="h-3.5 bg-slate-200 rounded w-28 mb-3" />
                <div className="h-8 bg-slate-200 rounded w-20 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-36" />
              </div>
            ))
          ) : (
            <>
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500">Total Product Gaps</span>
                <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">
                  {totalMissing.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                  <span>Found across competitors</span>
                  <Link href="/dashboard/missing" className="text-emerald-700 font-semibold hover:underline">
                    Review &rarr;
                  </Link>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500">Moderate &amp; High Demand</span>
                <div className="text-2xl font-bold text-emerald-800 mt-2 font-mono">
                  {(priorityCounts.high + priorityCounts.medium).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                  <span>Active search intent</span>
                  <Link href="/dashboard/missing?priority=high" className="text-emerald-700 font-semibold hover:underline">
                    Filter &rarr;
                  </Link>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500">Checklist Completed</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl font-bold text-slate-900 font-mono">
                    {totalCompleted.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold text-emerald-700 font-mono">
                    ({completionPct}%)
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                  <span>Saved in Completed tab</span>
                  <Link href="/dashboard/missing?tab=completed" className="text-emerald-700 font-semibold hover:underline">
                    View &rarr;
                  </Link>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500">Stores Monitored</span>
                <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">
                  {websites.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                  <span>{ourSites.length} Baseline &bull; {competitorSites.length} Competitors</span>
                  <Link href="/dashboard/websites" className="text-emerald-700 font-semibold hover:underline">
                    Manage &rarr;
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Row 2 Graphs: Donut Breakdown + Checklist Progress Ring */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DemandPriorityDonut
            high={priorityCounts.high}
            medium={priorityCounts.medium}
            low={priorityCounts.low}
            unanalyzed={priorityCounts.unanalyzed}
            total={totalMissing}
          />
          <ChecklistProgressRing
            completedCount={totalCompleted}
            activeCount={totalActive}
          />
        </div>

        {/* Row 3 Graphs: Catalog Volume Comparison + Competitor Threat Matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CatalogComparisonGraph
            ourSites={ourSites}
            competitorSites={competitorSites}
            missingCount={totalMissing}
          />

          {/* Competitor Threat Matrix (Clean, No Icon Badge) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Competitor Threat Matrix</h3>
                <p className="text-[11px] text-slate-500">Catalog scale and identified gap contribution</p>
              </div>
              <Link
                href="/dashboard/websites"
                className="text-xs font-semibold text-emerald-800 hover:text-emerald-900 hover:underline"
              >
                All Sites
              </Link>
            </div>

            <div className="space-y-3.5 my-auto py-1">
              {competitorSites.map((comp) => {
                const isHealthy = comp.lastScanStatus === "healthy";
                const isWarning = comp.lastScanStatus === "warning";
                return (
                  <div
                    key={comp._id}
                    className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isHealthy ? "bg-emerald-500" : isWarning ? "bg-amber-500" : "bg-slate-400"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {comp.name || comp.domain}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {comp.domain}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-slate-900">
                          {(comp.totalUrls || 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400">crawled URLs</div>
                      </div>
                      <Link
                        href={`/dashboard/missing?websiteId=${comp._id}`}
                        className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors"
                        title="Filter missing products for this competitor"
                      >
                        <span>Gaps</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}

              {competitorSites.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-400">
                  No competitors added yet. Add a competitor store to see threat comparisons.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>{competitorSites.length} competitor stores currently tracked</span>
              <button
                onClick={() => {
                  setModalDefaultIsPrimary(false);
                  setIsModalOpen(true);
                }}
                className="text-slate-900 font-semibold hover:underline cursor-pointer"
              >
                + Add Competitor
              </button>
            </div>
          </div>
        </div>

        {/* Row 4: Top Demand Opportunities Radar (Clean, No Icon Badge) */}
        <TopDemandOpportunities
          items={topOpportunities}
          onMarkDone={handleMarkDone}
        />

        {/* Add Website Modal */}
        <QuickAddWebsiteModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            fetchDashboardStats();
          }}
          defaultIsPrimary={modalDefaultIsPrimary}
        />
      </div>
    </DashboardShell>
  );
}
