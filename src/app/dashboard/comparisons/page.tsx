"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { type IWebsite, type IPage } from "@/types";
import {
  GitCompare,
  Download,
  ExternalLink,
  Search,
  CheckCircle,
  ArrowRight,
  Globe,
} from "lucide-react";

interface ComparisonData {
  primaryWebsite: IWebsite | null;
  baselineWebsites?: IWebsite[];
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
  } | null;
  tab: "missing" | "shared" | "only_primary";
  pages: any[];
  total: number;
  page: number;
  limit: number;
}

export default function ComparisonsPage() {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"missing" | "shared" | "only_primary">("missing");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [page, setPage] = useState(1);

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
      try {
        setLoading(true);
        let url = `/api/comparisons?tab=${activeTab}&page=${page}&limit=25`;
        if (selectedCompetitorId) {
          url += `&monitoredId=${selectedCompetitorId}`;
        }
        if (debouncedSearchQuery.trim()) {
          url += `&search=${encodeURIComponent(debouncedSearchQuery.trim())}`;
        }

        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          toast("Failed to load comparison data", "error");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();

    return () => controller.abort();
  }, [selectedCompetitorId, activeTab, page, debouncedSearchQuery]);

  const handleExportCsv = () => {
    window.location.href = `/api/export?type=missing&websiteId=${selectedCompetitorId || "all"}`;
  };

  const stats = data?.stats;
  const baselineSites = data?.baselineWebsites || (data?.primaryWebsite ? [data.primaryWebsite] : []);

  return (
    <DashboardShell title="Website Comparison">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Website Comparison</h1>
              {baselineSites.length > 1 && (
                <span className="px-2.5 py-0.5 bg-[#DCFCE7] text-[#16A34A] rounded-full text-xs font-semibold">
                  {baselineSites.length} Baseline Sites
                </span>
              )}
              {stats?.duplicatesRemoved !== undefined && stats.duplicatesRemoved > 0 && (
                <span className="px-2.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded-full text-xs font-semibold">
                  ⚡ {stats.duplicatesRemoved.toLocaleString()} Duplicates Merged
                </span>
              )}
            </div>
            <p className="text-xs text-[#64748B] mt-1 font-medium">
              Compare 2 or more competitor catalogs in bulk against all baseline stores with automatic cross-competitor deduplication
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV (Deduplicated)</span>
            </button>
          </div>
        </div>

        {/* Baseline Selector and Competitor Selector Bar */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
            {/* Primary / Baseline Site Info */}
            <div className="md:col-span-5 p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
              <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                {baselineSites.length > 1 ? `Baseline Portfolio (${baselineSites.length} sites)` : "Baseline Website"}
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {baselineSites.map((b) => (
                    <span
                      key={b._id}
                      className="px-2.5 py-1 bg-white border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#0F172A] shadow-xs"
                    >
                      {b.domain}
                    </span>
                  ))}
                  {baselineSites.length === 0 && (
                    <span className="text-xs text-[#94A3B8]">No baseline website set</span>
                  )}
                </div>
                <div className="text-[11px] text-[#64748B] font-medium mt-0.5">
                  Total indexed URLs: <span className="font-semibold text-[#0F172A]">{(stats?.primaryTotal || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Comparison Divider Arrow */}
            <div className="md:col-span-1 flex justify-center text-[#94A3B8]">
              <ArrowRight className="w-4 h-4 hidden md:block" />
              <span className="md:hidden text-xs font-bold uppercase">vs</span>
            </div>

            {/* Competitor Selector */}
            <div className="md:col-span-5 p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  Compare Against Competitor(s)
                </label>
                {selectedCompetitorId === "all" && data?.monitoredWebsites && data.monitoredWebsites.length > 1 && (
                  <span className="text-[10px] font-semibold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.2 rounded-full">
                    Bulk Compare Active
                  </span>
                )}
              </div>
              {data?.monitoredWebsites && data.monitoredWebsites.length > 0 ? (
                <select
                  value={selectedCompetitorId}
                  onChange={(e) => {
                    setSelectedCompetitorId(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                >
                  <option value="all">
                    ⚡ All Competitors Combined ({data.monitoredWebsites.length} sites - Bulk & Deduplicated)
                  </option>
                  {data.monitoredWebsites.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.domain} ({w.name}) - {(w.totalUrls || 0).toLocaleString()} URLs
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-[#64748B]">
                  No monitored competitor websites yet.{" "}
                  <Link href="/dashboard/websites" className="text-[#2563EB] font-semibold underline">
                    Add one here
                  </Link>
                </div>
              )}
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
                {stats.duplicatesRemoved && stats.duplicatesRemoved > 0
                  ? `Deduplicated (${stats.duplicatesRemoved} duplicates merged)`
                  : "Unique catalog pages"}
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
            <div className="flex items-center bg-[#F1F5F9] p-1 rounded-xl">
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
          </div>

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
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#94A3B8]">
                      Calculating comparison metrics...
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
                        <div className="flex flex-col gap-1">
                          <a
                            href={p.originalUrl || p.normalizedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] font-medium hover:text-[#2563EB] hover:underline flex items-center gap-1.5"
                          >
                            <span className="truncate max-w-xl">{p.normalizedUrl}</span>
                            <ExternalLink className="w-2.5 h-2.5 text-[#94A3B8]" />
                          </a>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {p.productSlug && (
                              <div className="flex items-center gap-1 text-[10px]">
                                <span className="font-bold text-[#64748B] uppercase tracking-wider text-[9px]">
                                  Slug:
                                </span>
                                <code className="px-1.5 py-0.5 bg-[#F1F5F9] border border-[#E2E8F0] rounded-md text-[#0F172A] font-mono">
                                  {p.productSlug}
                                </code>
                              </div>
                            )}

                            {p.duplicateCount && p.duplicateCount > 1 && (
                              <span className="px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded-md text-[10px] font-semibold">
                                ⚡ Merged from {p.duplicateCount} Competitors
                              </span>
                            )}
                          </div>

                          {p.matchedUrl && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[#64748B]">
                              <span className="font-semibold text-[#16A34A]">Matched with:</span>
                              <span className="font-mono text-[#0F172A] truncate max-w-md">{p.matchedUrl}</span>
                              {p.matchedDomain && (
                                <span className="px-1.5 py-0.5 bg-[#DCFCE7] text-[#16A34A] rounded text-[9px] font-semibold">
                                  {p.matchedDomain}
                                </span>
                              )}
                              {p.similarityScore !== undefined && p.similarityScore < 1 && (
                                <span className="text-[#16A34A] font-semibold text-[9px]">
                                  ({Math.round(p.similarityScore * 100)}% match)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Found On Column */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {activeTab === "only_primary" ? (
                          <span className="font-semibold text-xs text-[#0F172A]">{p.domain || "Baseline"}</span>
                        ) : p.competitorDomains && p.competitorDomains.length > 1 ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] font-semibold rounded-md text-[10px] w-fit">
                              {p.competitorDomains.length} Competitor Sites
                            </span>
                            <span className="text-[11px] text-[#64748B] font-mono">
                              {p.competitorDomains.join(", ")}
                            </span>
                          </div>
                        ) : (
                          <span className="font-semibold text-xs text-[#0F172A]">
                            {p.competitorDomains?.[0] || p.competitorDomain || p.domain || "-"}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-[#64748B] text-[11px] font-medium whitespace-nowrap">
                        {p.lastmod ? new Date(p.lastmod).toLocaleDateString() : "-"}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {activeTab === "missing" && (
                          <span className="px-2.5 py-1 bg-[#FEF3C7] text-[#D97706] rounded-full text-[10px] font-semibold inline-block">
                            Missing from Baseline
                          </span>
                        )}
                        {activeTab === "shared" && (
                          <span className="px-2.5 py-1 bg-[#DCFCE7] text-[#16A34A] rounded-full text-[10px] font-semibold inline-block">
                            {p.similarityScore !== undefined && p.similarityScore < 1
                              ? "Pattern Matched"
                              : "Shared URL"}
                          </span>
                        )}
                        {activeTab === "only_primary" && (
                          <div className="flex flex-col gap-0.5">
                            <span className="px-2.5 py-1 bg-[#F1F5F9] text-[#475569] rounded-full text-[10px] font-semibold inline-block w-fit">
                              Baseline Only
                            </span>
                            {p.domain && (
                              <span className="text-[10px] text-[#94A3B8]">
                                {p.domain}
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
                          className="inline-flex items-center gap-1 text-[11px] text-[#2563EB] font-semibold hover:underline"
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

          <Pagination
            currentPage={page}
            pageSize={25}
            totalItems={data?.total || 0}
            onPageChange={setPage}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
