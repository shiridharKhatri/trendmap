"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatCard } from "@/components/ui/StatCard";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import {
  type IWebsite,
  type ISitemap,
  type IScan,
  type IPage,
  type IPageChange,
} from "@/types";
import { Modal } from "@/components/ui/Modal";
import {
  Play,
  Globe,
  ExternalLink,
  ArrowLeft,
  CheckCircle,
  FileCode,
  Layers,
  FileWarning,
  Sparkles,
  Search,
  Check,
  Filter,
  ShoppingBag,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export default function WebsiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const websiteId = resolvedParams.id;

  const [website, setWebsite] = useState<IWebsite | null>(null);
  const [sitemaps, setSitemaps] = useState<ISitemap[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "sitemaps" | "missing" | "new" | "removed" | "scans" | "errors"
  >("overview");

  // Tab Data States
  const [scans, setScans] = useState<IScan[]>([]);
  const [pages, setPages] = useState<IPage[]>([]);
  const [missingChanges, setMissingChanges] = useState<IPageChange[]>([]);
  const [newChanges, setNewChanges] = useState<IPageChange[]>([]);
  const [removedChanges, setRemovedChanges] = useState<IPageChange[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // 250ms search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Filter Rule States
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [formCrawlScope, setFormCrawlScope] = useState<"all" | "products" | "blog" | "custom">("all");
  const [showCustomFilters, setShowCustomFilters] = useState(false);
  const [formUrlInclude, setFormUrlInclude] = useState("");
  const [formUrlExclude, setFormUrlExclude] = useState("");
  const [isSavingFilters, setIsSavingFilters] = useState(false);

  const { toast } = useToast();

  const fetchWebsiteDetails = async () => {
    try {
      const res = await fetch(`/api/websites/${websiteId}`);
      if (res.ok) {
        const data = await res.json();
        setWebsite(data.website);
        setSitemaps(data.sitemaps || []);
      }
    } catch {
      toast("Failed to load website details", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchTabData = async (signal?: AbortSignal) => {
    if (!websiteId) return;

    try {
      if (activeTab === "scans") {
        const res = await fetch(`/api/websites/${websiteId}/scans?page=${pageNumber}&limit=20`, { signal });
        if (res.ok) {
          const data = await res.json();
          setScans(data.scans || []);
          setTotalItems(data.total || 0);
        }
      } else if (activeTab === "overview") {
        // Fetch latest pages
        const res = await fetch(`/api/websites/${websiteId}/pages?page=1&limit=10`, { signal });
        if (res.ok) {
          const data = await res.json();
          setPages(data.pages || []);
        }
      } else if (activeTab === "missing") {
        const res = await fetch(
          `/api/missing?websiteId=${websiteId}&page=${pageNumber}&limit=20&search=${encodeURIComponent(
            debouncedSearch
          )}`,
          { signal }
        );
        if (res.ok) {
          const data = await res.json();
          setMissingChanges(data.missingPages || []);
          setTotalItems(data.total || 0);
        }
      } else if (activeTab === "new") {
        const res = await fetch(
          `/api/changes?websiteId=${websiteId}&type=added&page=${pageNumber}&limit=20&search=${encodeURIComponent(
            debouncedSearch
          )}`,
          { signal }
        );
        if (res.ok) {
          const data = await res.json();
          setNewChanges(data.changes || []);
          setTotalItems(data.total || 0);
        }
      } else if (activeTab === "removed") {
        const res = await fetch(
          `/api/changes?websiteId=${websiteId}&type=removed&page=${pageNumber}&limit=20&search=${encodeURIComponent(
            debouncedSearch
          )}`,
          { signal }
        );
        if (res.ok) {
          const data = await res.json();
          setRemovedChanges(data.changes || []);
          setTotalItems(data.total || 0);
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        // Ignore aborted fetches
      }
    }
  };

  useEffect(() => {
    fetchWebsiteDetails();
  }, [websiteId]);

  useEffect(() => {
    setPageNumber(1);
  }, [activeTab, debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    fetchTabData(controller.signal);
    return () => controller.abort();
  }, [activeTab, websiteId, pageNumber, debouncedSearch]);

  const handleRunScan = async () => {
    if (!website) return;
    setIsScanning(true);
    toast(`Scan initiated for ${website.domain}...`, "info");

    try {
      const res = await fetch(`/api/websites/${website._id}/scan`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast(
          `Scan complete: ${data.result.totalUrls.toLocaleString()} URLs analyzed (+${data.result.newUrls} new, ${data.result.missingFromPrimary} missing)`,
          "success"
        );
        fetchWebsiteDetails();
        fetchTabData();
      } else {
        toast(`Scan failed: ${data.error || data.result?.errorMessage || "Error"}`, "error");
      }
    } catch {
      toast("Error executing scan", "error");
    } finally {
      setIsScanning(false);
    }
  };

  // Instant optimistic toggle
  const handleToggleReviewed = async (changeId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    // 1. Optimistically update local state immediately
    setMissingChanges((prev) =>
      prev.map((c) => (c._id === changeId ? { ...c, isReviewed: nextStatus } : c))
    );
    toast(currentStatus ? "Marked unreviewed" : "Marked reviewed", "success");

    try {
      const res = await fetch(`/api/missing/${changeId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isReviewed: nextStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch {
      setMissingChanges((prev) =>
        prev.map((c) => (c._id === changeId ? { ...c, isReviewed: currentStatus } : c))
      );
      toast("Failed to update status", "error");
    }
  };

  const openFilterModal = () => {
    setFormCrawlScope(website?.crawlScope || (website?.urlIncludePatterns?.length ? "custom" : "all"));
    setShowCustomFilters(Boolean(website?.urlIncludePatterns?.length || website?.urlExcludePatterns?.length || website?.crawlScope === "custom"));
    setFormUrlInclude((website?.urlIncludePatterns || []).join(", "));
    setFormUrlExclude((website?.urlExcludePatterns || []).join(", "));
    setIsFilterModalOpen(true);
  };

  const addIncludePattern = (pat: string) => {
    setFormUrlInclude((prev) => (prev ? `${prev}, ${pat}` : pat));
  };

  const addExcludePattern = (pat: string) => {
    setFormUrlExclude((prev) => (prev ? `${prev}, ${pat}` : pat));
  };

  const handleSaveFilters = async (andScan = false) => {
    if (!website) return;
    setIsSavingFilters(true);
    try {
      const res = await fetch(`/api/websites/${website._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crawlScope: formCrawlScope,
          urlIncludePatterns: formUrlInclude
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          urlExcludePatterns: formUrlExclude
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setWebsite(data.website);
        toast("Crawl scope updated successfully", "success");
        setIsFilterModalOpen(false);
        if (andScan) {
          handleRunScan();
        }
      } else {
        const err = await res.json();
        toast(`Failed to save scope: ${err.error || "Unknown error"}`, "error");
      }
    } catch {
      toast("Error saving scope", "error");
    } finally {
      setIsSavingFilters(false);
    }
  };

  if (loading) {
    return (
      <DashboardShell title="Website Details">
        <div className="py-12 text-center text-xs text-[#737373]">
          Loading website details...
        </div>
      </DashboardShell>
    );
  }

  if (!website) {
    return (
      <DashboardShell title="Website Details">
        <div className="py-12 text-center text-xs text-[#737373]">
          Website not found.
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={website.domain}>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Back Link & Header */}
        <div>
          <Link
            href="/dashboard/websites"
            className="inline-flex items-center gap-1.5 text-xs text-[#737373] hover:text-[#171717] mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to websites</span>
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E5E5] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-[#171717]">{website.name}</h1>
                <StatusBadge status={isScanning || website.isScanning ? "scanning" : website.lastScanStatus} />
                {website.isPrimary && (
                  <span className="px-1.5 py-0.5 bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] rounded-sm text-[10px] font-medium">
                    Primary Baseline
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-[#737373] mt-1.5">
                <a
                  href={website.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#171717] flex items-center gap-1 font-mono"
                >
                  <Globe className="w-3 h-3" />
                  <span>{website.domain}</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>

                {website.sitemapUrl && (
                  <span className="font-mono truncate max-w-sm" title={website.sitemapUrl}>
                    Sitemap: {website.sitemapUrl}
                  </span>
                )}

                <span>Schedule: Every {website.scanFrequency}</span>
              </div>

              {/* Active Scope & Filter Tags */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-[#F5F5F4] text-[11px]">
                <span className="text-[#737373] font-medium flex items-center gap-1 mr-1">
                  <span>Scope:</span>
                </span>
                {website.crawlScope === "products" ? (
                  <span className="px-1.5 py-0.5 bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] rounded-sm font-medium flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3" />
                    <span>Products Only (Auto-Detect)</span>
                  </span>
                ) : website.crawlScope === "blog" ? (
                  <span className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded-sm font-medium flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <span>Blog Only (Auto-Detect)</span>
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-[#F5F5F4] text-[#525252] border border-[#E5E5E5] rounded-sm font-medium flex items-center gap-1">
                    <Globe className="w-3 h-3 text-[#737373]" />
                    <span>Full Website</span>
                  </span>
                )}

                {website.urlIncludePatterns?.map((pat, idx) => (
                  <span
                    key={`inc-${idx}`}
                    className="px-1.5 py-0.5 bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] rounded-sm font-mono text-[10px]"
                  >
                    +{pat}
                  </span>
                ))}
                {website.urlExcludePatterns?.map((pat, idx) => (
                  <span
                    key={`exc-${idx}`}
                    className="px-1.5 py-0.5 bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA] rounded-sm font-mono text-[10px]"
                  >
                    -{pat}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={openFilterModal}
                  className="text-[11px] text-[#2563EB] hover:underline ml-1 font-medium"
                >
                  Change Scope
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={openFilterModal}
              >
                <Filter className="w-3.5 h-3.5 text-[#737373]" />
                <span>
                  Filters{" "}
                  {((website.urlIncludePatterns?.length || 0) + (website.urlExcludePatterns?.length || 0)) > 0 &&
                    `(${((website.urlIncludePatterns?.length || 0) + (website.urlExcludePatterns?.length || 0))})`}
                </span>
              </Button>
              <Button
                size="sm"
                isLoading={isScanning || website.isScanning}
                onClick={handleRunScan}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Run Scan Now</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Metrics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Indexed URLs"
            value={website.totalUrls || 0}
            subtitle="Current active URLs"
          />
          <StatCard
            title="Potential Missing URLs"
            value={website.missingUrlsCount || 0}
            subtitle="Not found on primary baseline"
            badge={
              (website.missingUrlsCount || 0) > 0
                ? { text: "Action Needed", type: "negative" }
                : undefined
            }
          />
          <StatCard
            title="New URLs Detected"
            value={website.newUrlsCount || 0}
            subtitle="Since previous scan"
            badge={
              (website.newUrlsCount || 0) > 0
                ? { text: "Recent", type: "positive" }
                : undefined
            }
          />
          <StatCard
            title="Last Scan Duration"
            value={
              website.lastScanAt
                ? new Date(website.lastScanAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "None"
            }
            subtitle={
              website.lastScanAt
                ? new Date(website.lastScanAt).toLocaleDateString()
                : "Awaiting first scan"
            }
          />
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-[#E5E5E5] flex items-center gap-1 overflow-x-auto text-xs font-medium">
          {[
            { id: "overview", label: "Overview" },
            { id: "sitemaps", label: `Sitemaps (${sitemaps.length})` },
            { id: "missing", label: `Missing Pages (${website.missingUrlsCount || 0})` },
            { id: "new", label: `New Pages (${website.newUrlsCount || 0})` },
            { id: "removed", label: "Removed Pages" },
            { id: "scans", label: "Scan History" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-[#166534] text-[#171717] font-semibold"
                  : "border-transparent text-[#737373] hover:text-[#171717]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content: Overview */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="bg-white border border-[#E5E5E5] rounded-sm p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#737373] mb-3">
                Sitemap & Health Diagnostics
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-[#737373] block">Processed Sitemaps:</span>
                  <span className="font-medium text-[#171717]">{sitemaps.length} files</span>
                </div>
                <div>
                  <span className="text-[#737373] block">Status:</span>
                  <span className="font-medium text-[#166534]">
                    {website.lastScanStatus || "Healthy"}
                  </span>
                </div>
                <div>
                  <span className="text-[#737373] block">Next Scheduled Crawl:</span>
                  <span className="font-medium text-[#171717]">
                    {website.nextScanAt
                      ? new Date(website.nextScanAt).toLocaleString()
                      : "Not scheduled"}
                  </span>
                </div>
              </div>
            </div>

            {/* Sample Indexed Pages Table */}
            <div className="bg-white border border-[#E5E5E5] rounded-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E5E5E5] flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#171717]">Recent Indexed Pages</h3>
                <span className="text-xs text-[#737373]">
                  {website.totalUrls.toLocaleString()} total
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#171717]">
                  <thead>
                    <tr className="bg-[#FAFAF8] border-b border-[#E5E5E5] text-[#737373]">
                      <th className="py-2.5 px-4">URL</th>
                      <th className="py-2.5 px-3">Last Modified</th>
                      <th className="py-2.5 px-3">Discovered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5]">
                    {pages.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-[#737373]">
                          No pages indexed yet. Click &quot;Run Scan Now&quot; to index this website.
                        </td>
                      </tr>
                    ) : (
                      pages.map((p) => (
                        <tr key={p._id} className="hover:bg-[#FAFAF8]">
                          <td className="py-2.5 px-4 font-mono text-[11px] text-[#171717]">
                            <a
                              href={p.originalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline flex items-center gap-1"
                            >
                              <span className="truncate max-w-xl">{p.normalizedUrl}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0 text-[#737373]" />
                            </a>
                          </td>
                          <td className="py-2.5 px-3 text-[#737373] text-[11px]">
                            {p.lastmod ? new Date(p.lastmod).toLocaleDateString() : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-[#737373] text-[11px]">
                            {new Date(p.firstSeenAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Sitemaps */}
        {activeTab === "sitemaps" && (
          <div className="bg-white border border-[#E5E5E5] rounded-sm overflow-hidden">
            <table className="w-full text-left text-xs text-[#171717]">
              <thead>
                <tr className="bg-[#FAFAF8] border-b border-[#E5E5E5] text-[#737373]">
                  <th className="py-2.5 px-4">Sitemap URL</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">HTTP Status</th>
                  <th className="py-2.5 px-3">Response Time</th>
                  <th className="py-2.5 px-3 text-right">URL Count</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {sitemaps.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#737373]">
                      No sitemaps processed yet. Run a scan to discover and parse sitemaps.
                    </td>
                  </tr>
                ) : (
                  sitemaps.map((s) => (
                    <tr key={s._id} className="hover:bg-[#FAFAF8]">
                      <td className="py-2.5 px-4 font-mono text-[11px] truncate max-w-md">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline text-[#171717] flex items-center gap-1"
                        >
                          <span className="truncate">{s.url}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-[#737373]" />
                        </a>
                      </td>
                      <td className="py-2.5 px-3 text-[#737373] uppercase text-[10px]">
                        {s.type}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        {s.httpStatus || 200}
                      </td>
                      <td className="py-2.5 px-3 text-[#737373] text-[11px]">
                        {s.responseTimeMs ? `${s.responseTimeMs}ms` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {(s.urlCount || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={s.status === "valid" ? "healthy" : "error"} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab Content: Missing Pages */}
        {activeTab === "missing" && (
          <div className="bg-white border border-[#E5E5E5] rounded-sm overflow-hidden">
            <div className="p-3 border-b border-[#E5E5E5] flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#737373]" />
                <input
                  type="text"
                  placeholder="Filter missing URLs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm text-xs focus:outline-none focus:border-[#171717]"
                />
              </div>
            </div>

            <table className="w-full text-left text-xs text-[#171717]">
              <thead>
                <tr className="bg-[#FAFAF8] border-b border-[#E5E5E5] text-[#737373]">
                  <th className="py-2.5 px-4">Missing URL</th>
                  <th className="py-2.5 px-3">Detected</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {missingChanges.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[#737373]">
                      No missing URLs detected for this website against the primary baseline.
                    </td>
                  </tr>
                ) : (
                  missingChanges.map((c) => (
                    <tr key={c._id} className="hover:bg-[#FAFAF8]">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-[#171717]">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center gap-1"
                        >
                          <span className="truncate max-w-xl">{c.normalizedUrl}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-[#737373]" />
                        </a>
                      </td>
                      <td className="py-2.5 px-3 text-[#737373] text-[11px]">
                        {new Date(c.detectedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded-sm text-[10px] font-medium border ${
                            c.isReviewed
                              ? "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]"
                              : "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]"
                          }`}
                        >
                          {c.isReviewed ? "Reviewed" : "Missing"}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleReviewed(c._id, c.isReviewed)}
                        >
                          {c.isReviewed ? "Mark Unreviewed" : "Mark Reviewed"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <Pagination
              currentPage={pageNumber}
              pageSize={20}
              totalItems={totalItems}
              onPageChange={setPageNumber}
            />
          </div>
        )}

        {/* Tab Content: New Pages */}
        {activeTab === "new" && (
          <div className="bg-white border border-[#E5E5E5] rounded-sm overflow-hidden">
            <table className="w-full text-left text-xs text-[#171717]">
              <thead>
                <tr className="bg-[#FAFAF8] border-b border-[#E5E5E5] text-[#737373]">
                  <th className="py-2.5 px-4">New URL</th>
                  <th className="py-2.5 px-3">Detected At</th>
                  <th className="py-2.5 px-3">Lastmod</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {newChanges.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-[#737373]">
                      No new URLs detected in recent scans.
                    </td>
                  </tr>
                ) : (
                  newChanges.map((c) => (
                    <tr key={c._id} className="hover:bg-[#FAFAF8]">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-[#171717]">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center gap-1"
                        >
                          <span className="truncate max-w-xl">{c.normalizedUrl}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-[#737373]" />
                        </a>
                      </td>
                      <td className="py-2.5 px-3 text-[#737373] text-[11px]">
                        {new Date(c.detectedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 text-[#737373] text-[11px]">
                        {c.currentLastmod ? new Date(c.currentLastmod).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={pageNumber}
              pageSize={20}
              totalItems={totalItems}
              onPageChange={setPageNumber}
            />
          </div>
        )}

        {/* Tab Content: Removed Pages */}
        {activeTab === "removed" && (
          <div className="bg-white border border-[#E5E5E5] rounded-sm overflow-hidden">
            <table className="w-full text-left text-xs text-[#171717]">
              <thead>
                <tr className="bg-[#FAFAF8] border-b border-[#E5E5E5] text-[#737373]">
                  <th className="py-2.5 px-4">Removed URL</th>
                  <th className="py-2.5 px-3">Removed On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {removedChanges.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-[#737373]">
                      No removed URLs detected for this website.
                    </td>
                  </tr>
                ) : (
                  removedChanges.map((c) => (
                    <tr key={c._id} className="hover:bg-[#FAFAF8]">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-[#991B1B]">
                        <span className="line-through">{c.normalizedUrl}</span>
                      </td>
                      <td className="py-2.5 px-3 text-[#737373] text-[11px]">
                        {new Date(c.detectedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={pageNumber}
              pageSize={20}
              totalItems={totalItems}
              onPageChange={setPageNumber}
            />
          </div>
        )}

        {/* Tab Content: Scans */}
        {activeTab === "scans" && (
          <div className="bg-white border border-[#E5E5E5] rounded-sm overflow-hidden">
            <table className="w-full text-left text-xs text-[#171717]">
              <thead>
                <tr className="bg-[#FAFAF8] border-b border-[#E5E5E5] text-[#737373]">
                  <th className="py-2.5 px-4">Scan Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3 text-right">Total URLs</th>
                  <th className="py-2.5 px-3 text-right">New</th>
                  <th className="py-2.5 px-3 text-right">Removed</th>
                  <th className="py-2.5 px-3 text-right">Missing</th>
                  <th className="py-2.5 px-3">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {scans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#737373]">
                      No historical scans recorded yet.
                    </td>
                  </tr>
                ) : (
                  scans.map((s) => (
                    <tr key={s._id} className="hover:bg-[#FAFAF8]">
                      <td className="py-2.5 px-4 text-[#171717] font-medium">
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#737373]">
                        {s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {s.totalUrls.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#166534]">
                        {s.newUrls > 0 ? `+${s.newUrls}` : "0"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#991B1B]">
                        {s.removedUrls > 0 ? `-${s.removedUrls}` : "0"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#991B1B]">
                        {s.missingFromPrimaryCount}
                      </td>
                      <td className="py-2.5 px-3 text-[#737373]">
                        {s.errorCount > 0 ? (
                          <span className="text-[#991B1B] font-medium">{s.errorCount} errors</span>
                        ) : (
                          "0"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={pageNumber}
              pageSize={20}
              totalItems={totalItems}
              onPageChange={setPageNumber}
            />
          </div>
        )}

        {/* URL Filter Configuration Modal */}
        <Modal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          title={`Crawl Scope: ${website.name}`}
          description="Choose what content to scrape. Select Products Only to automatically extract product URLs and bypass legal, tag, and author pages."
        >
          <div className="space-y-4">
            {/* Crawl Scope Selection */}
            <div className="space-y-2">
              <label className="block font-medium text-[#171717] text-xs">
                Target Content
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div
                  onClick={() => setFormCrawlScope("all")}
                  className={`p-2.5 rounded-sm border cursor-pointer transition-colors ${
                    formCrawlScope === "all"
                      ? "bg-[#F0FDF4] border-[#166534] text-[#171717]"
                      : "bg-white border-[#E5E5E5] hover:border-[#A3A3A3] text-[#737373]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-[#171717]">
                    <Globe className="w-3.5 h-3.5 text-[#737373]" />
                    <span>Full Website</span>
                  </div>
                  <p className="text-[10px] text-[#737373] mt-1">
                    Crawl all discoverable pages across the entire website.
                  </p>
                </div>

                <div
                  onClick={() => setFormCrawlScope("products")}
                  className={`p-2.5 rounded-sm border cursor-pointer transition-colors relative ${
                    formCrawlScope === "products"
                      ? "bg-[#F0FDF4] border-[#166534] text-[#171717] ring-1 ring-[#166534]"
                      : "bg-white border-[#E5E5E5] hover:border-[#A3A3A3] text-[#737373]"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-xs text-[#171717]">
                    <div className="flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-[#166534]" />
                      <span>Products Only</span>
                    </div>
                    <span className="text-[9px] bg-[#166534] text-white px-1 py-0.2 rounded-xs">
                      Auto
                    </span>
                  </div>
                  <p className="text-[10px] text-[#737373] mt-1">
                    Auto-targets product sitemaps & extracts product URLs. Excludes legal & admin pages.
                  </p>
                </div>

                <div
                  onClick={() => setFormCrawlScope("blog")}
                  className={`p-2.5 rounded-sm border cursor-pointer transition-colors ${
                    formCrawlScope === "blog"
                      ? "bg-[#F0FDF4] border-[#166534] text-[#171717]"
                      : "bg-white border-[#E5E5E5] hover:border-[#A3A3A3] text-[#737373]"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-xs text-[#171717]">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#166534]" />
                      <span>Blog / Posts</span>
                    </div>
                    <span className="text-[9px] bg-[#E5E5E5] text-[#525252] px-1 py-0.2 rounded-xs">
                      Auto
                    </span>
                  </div>
                  <p className="text-[10px] text-[#737373] mt-1">
                    Extracts blog posts, recipes, articles, and news content.
                  </p>
                </div>
              </div>

              {/* Active scope explanation pill */}
              {formCrawlScope === "products" && (
                <div className="p-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-sm flex items-start gap-2 text-xs text-[#166534]">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-[#166534]" />
                  <div>
                    <strong>Automatic Product Detection Active:</strong> The scanner will automatically detect product sub-sitemaps (e.g. <code>product-sitemap.xml</code>) and filter product URLs (<code>/product/</code>, <code>/products/</code>, <code>/shop/</code>, <code>/item/</code>). No manual rules needed!
                  </div>
                </div>
              )}

              {/* Advanced Custom Rules (Accordion) */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomFilters(!showCustomFilters)}
                  className="text-[11px] text-[#737373] hover:text-[#171717] flex items-center gap-1 font-medium"
                >
                  {showCustomFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span>{showCustomFilters ? "Hide Advanced Custom Filters" : "Advanced Custom Pattern Filters (Optional)"}</span>
                </button>

                {showCustomFilters && (
                  <div className="mt-2 p-3 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm space-y-3">
                    <div>
                      <label className="font-semibold text-[#171717] text-[11px] block">
                        Additional URL Include Patterns (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. product, /products/, /shop/, /cbd-"
                        value={formUrlInclude}
                        onChange={(e) => setFormUrlInclude(e.target.value)}
                        className="w-full mt-1 px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs font-mono text-[#171717] focus:outline-none focus:border-[#171717]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[#171717] text-[11px] block">
                        Additional URL Exclude Patterns (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. /general/, /privacy, /terms, /author/, /tag/"
                        value={formUrlExclude}
                        onChange={(e) => setFormUrlExclude(e.target.value)}
                        className="w-full mt-1 px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs font-mono text-[#171717] focus:outline-none focus:border-[#171717]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E5E5]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsFilterModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                isLoading={isSavingFilters}
                onClick={() => handleSaveFilters(false)}
              >
                Save Scope
              </Button>
              <Button
                size="sm"
                isLoading={isSavingFilters || isScanning}
                onClick={() => handleSaveFilters(true)}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Save & Re-Scan Now</span>
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardShell>
  );
}
