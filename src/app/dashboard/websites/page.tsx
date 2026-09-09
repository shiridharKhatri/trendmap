"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { type IWebsite, type DiscoveredSitemapCandidate } from "@/types";
import {
  Plus,
  Globe,
  Play,
  Trash2,
  Edit2,
  Search,
  Sparkles,
  Check,
  Star,
  ExternalLink,
  ShoppingBag,
  FileText,
  Layers,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<IWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanningIds, setScanningIds] = useState<Record<string, boolean>>({});

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingWebsite, setEditingWebsite] = useState<IWebsite | null>(null);

  // Delete State
  const [deletingWebsite, setDeletingWebsite] = useState<IWebsite | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSitemapUrl, setFormSitemapUrl] = useState("");
  const [formFrequency, setFormFrequency] = useState<any>("24h");
  const [formIsPrimary, setFormIsPrimary] = useState(false);
  const [formCrawlScope, setFormCrawlScope] = useState<"all" | "products" | "blog" | "custom">("all");
  const [showCustomFilters, setShowCustomFilters] = useState(false);
  const [formUrlInclude, setFormUrlInclude] = useState("");
  const [formUrlExclude, setFormUrlExclude] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto discovery State
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredCandidates, setDiscoveredCandidates] = useState<DiscoveredSitemapCandidate[]>([]);
  const [discoveryDomain, setDiscoveryDomain] = useState("");

  const { toast } = useToast();

  const fetchWebsites = async () => {
    try {
      const res = await fetch("/api/websites");
      if (res.ok) {
        const data = await res.json();
        setWebsites(data.websites || []);
      }
    } catch {
      toast("Failed to load websites", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebsites();
  }, []);

  const resetForm = () => {
    setFormName("");
    setFormUrl("");
    setFormSitemapUrl("");
    setFormFrequency("24h");
    setFormIsPrimary(false);
    setFormCrawlScope("all");
    setShowCustomFilters(false);
    setFormUrlInclude("");
    setFormUrlExclude("");
    setDiscoveredCandidates([]);
    setDiscoveryDomain("");
  };

  const addIncludePattern = (pat: string) => {
    setFormUrlInclude((prev) => (prev ? `${prev}, ${pat}` : pat));
  };

  const addExcludePattern = (pat: string) => {
    setFormUrlExclude((prev) => (prev ? `${prev}, ${pat}` : pat));
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (w: IWebsite) => {
    setEditingWebsite(w);
    setFormName(w.name);
    let initialUrl = w.url;
    if (!initialUrl || initialUrl === ".com" || initialUrl.includes("://.com") || initialUrl.endsWith("/.com")) {
      if (w.sitemapUrl) {
        try {
          initialUrl = new URL(w.sitemapUrl).origin;
        } catch {
          initialUrl = w.domain && w.domain !== ".com" ? `https://${w.domain}` : "";
        }
      }
    }
    setFormUrl(initialUrl);
    setFormSitemapUrl(w.sitemapUrl || "");
    setFormFrequency(w.scanFrequency || "24h");
    setFormIsPrimary(w.isPrimary);
    setFormCrawlScope(w.crawlScope || (w.urlIncludePatterns?.length ? "custom" : "all"));
    setShowCustomFilters(Boolean(w.urlIncludePatterns?.length || w.urlExcludePatterns?.length || w.crawlScope === "custom"));
    setFormUrlInclude((w.urlIncludePatterns || []).join(", "));
    setFormUrlExclude((w.urlExcludePatterns || []).join(", "));
    setIsEditModalOpen(true);
  };

  const handleDiscoverSitemaps = async () => {
    if (!formUrl.trim()) {
      toast("Please enter a website URL first", "error");
      return;
    }

    setIsDiscovering(true);
    try {
      const res = await fetch("/api/websites/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: formUrl }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setDiscoveredCandidates(data.candidates || []);
        setDiscoveryDomain(data.domain || "");
        
        // Auto-recommend product sitemap if detected
        const productCandidate = data.candidates?.find(
          (c: any) => c.hasProductSitemap && c.detectedProductSitemaps?.length > 0
        );
        if (productCandidate && productCandidate.detectedProductSitemaps?.[0]) {
          toast(`Product sitemap detected: ${productCandidate.detectedProductSitemaps[0].split("/").pop()}`, "info");
        } else if (data.recommendedSitemap) {
          toast(`Discovered sitemap: ${data.recommendedSitemap.split("/").pop()}`, "success");
        }
        if (data.recommendedSitemap) {
          setFormSitemapUrl(data.recommendedSitemap);
        }
        toast(data.error || "Failed to discover sitemaps", "error");
      }
    } catch {
      toast("Discovery request failed", "error");
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formUrl.trim()) {
      toast("Name and Website URL are required", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          url: formUrl,
          sitemapUrl: formSitemapUrl || undefined,
          scanFrequency: formFrequency,
          isPrimary: formIsPrimary,
          crawlScope: formCrawlScope,
          urlIncludePatterns: formUrlInclude
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
          urlExcludePatterns: formUrlExclude
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast(`Added website "${formName}" successfully`, "success");
        setIsAddModalOpen(false);
        resetForm();
        fetchWebsites();
      } else {
        toast(data.error || "Failed to add website", "error");
      }
    } catch {
      toast("Request error while creating website", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWebsite) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/websites/${editingWebsite._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          url: formUrl,
          sitemapUrl: formSitemapUrl,
          scanFrequency: formFrequency,
          isPrimary: formIsPrimary,
          crawlScope: formCrawlScope,
          urlIncludePatterns: formUrlInclude
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
          urlExcludePatterns: formUrlExclude
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast(`Updated "${formName}"`, "success");
        setIsEditModalOpen(false);
        setEditingWebsite(null);
        fetchWebsites();
      } else {
        toast(data.error || "Failed to update website", "error");
      }
    } catch {
      toast("Request error", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingWebsite) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/websites/${deletingWebsite._id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast(`Deleted ${deletingWebsite.domain} and its historical data`, "success");
        setDeletingWebsite(null);
        fetchWebsites();
      } else {
        const data = await res.json();
        toast(data.error || "Failed to delete website", "error");
      }
    } catch {
      toast("Failed to delete website", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRunScan = async (websiteId: string, domain: string, force = false) => {
    setScanningIds((prev) => ({ ...prev, [websiteId]: true }));
    toast(force ? `Force scan initiated for ${domain}...` : `Scan started for ${domain}...`, "info");

    try {
      const url = force ? `/api/websites/${websiteId}/scan?force=true` : `/api/websites/${websiteId}/scan`;
      const res = await fetch(url, {
        method: "POST",
      });
      const result = await res.json();

      if (res.ok && result.success) {
        const r = result.result;
        toast(
          `Scan completed: ${r.totalUrls.toLocaleString()} URLs (+${r.newUrls} new, ${r.missingFromPrimary} missing)`,
          "success"
        );
        fetchWebsites();
      } else {
        toast(`Scan failed for ${domain}: ${result.error || result.result?.errorMessage || "Error"}`, "error");
        fetchWebsites();
      }
    } catch {
      toast(`Failed to trigger scan for ${domain}`, "error");
      fetchWebsites();
    } finally {
      setScanningIds((prev) => ({ ...prev, [websiteId]: false }));
    }
  };

  const handleToggleActive = async (w: IWebsite) => {
    try {
      const res = await fetch(`/api/websites/${w._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !w.isActive }),
      });
      if (res.ok) {
        toast(w.isActive ? `Paused monitoring for ${w.domain}` : `Resumed monitoring for ${w.domain}`, "info");
        fetchWebsites();
      }
    } catch {
      toast("Failed to toggle website status", "error");
    }
  };

  return (
    <DashboardShell title="Websites">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Website Management</h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Add websites, configure scan schedules, and manage your baseline and competitor catalogs
            </p>
          </div>
          <Button size="sm" onClick={handleOpenAdd} className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl shadow-xs font-semibold">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Website</span>
          </Button>
        </div>

        {/* Website List Table */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#0F172A] border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                  <th className="py-3 px-4">Domain & Name</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Frequency</th>
                  <th className="py-3 px-3 text-right">URLs</th>
                  <th className="py-3 px-3 text-right">Missing</th>
                  <th className="py-3 px-4">Last Scan</th>
                  <th className="py-3 px-4">Next Scan</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-[#737373]">
                      Loading websites...
                    </td>
                  </tr>
                ) : websites.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-[#737373]">
                      No websites added yet. Click &quot;Add Website&quot; to begin.
                    </td>
                  </tr>
                ) : (
                  websites.map((w) => (
                    <tr key={w._id} className="hover:bg-[#FAFAF8] transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-medium text-[#171717]">
                          <Globe className="w-3.5 h-3.5 text-[#737373]" />
                          <Link href={`/dashboard/websites/${w._id}`} className="hover:underline">
                            {w.domain}
                          </Link>
                          <a
                            href={w.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#737373] hover:text-[#171717]"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-[#737373] truncate max-w-xs">{w.name}</span>
                          {w.crawlScope === "products" ? (
                            <span
                              className="text-[10px] text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0] px-1 py-0.2 rounded-xs font-medium flex items-center gap-0.5"
                              title="Automatically extracting products only"
                            >
                              <ShoppingBag className="w-2.5 h-2.5" />
                              <span>Products Only</span>
                            </span>
                          ) : w.crawlScope === "blog" ? (
                            <span
                              className="text-[10px] text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] px-1 py-0.2 rounded-xs font-medium flex items-center gap-0.5"
                              title="Extracting blog posts and articles only"
                            >
                              <FileText className="w-2.5 h-2.5" />
                              <span>Blog Only</span>
                            </span>
                          ) : ((w.urlIncludePatterns && w.urlIncludePatterns.length > 0) ||
                            (w.urlExcludePatterns && w.urlExcludePatterns.length > 0)) ? (
                            <span
                              className="text-[10px] text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0] px-1 py-0.2 rounded-xs font-mono"
                              title={`Include: ${w.urlIncludePatterns?.join(", ") || "all"} | Exclude: ${w.urlExcludePatterns?.join(", ") || "none"}`}
                            >
                              Filtered
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {w.isPrimary ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] rounded-sm text-[10px] font-medium">
                            <Star className="w-2.5 h-2.5 fill-current" /> Primary
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#737373]">Monitored</span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px] text-[#737373]">
                        Every {w.scanFrequency}
                      </td>

                      <td className="py-3 px-3 text-right font-medium">
                        {(w.totalUrls || 0).toLocaleString()}
                      </td>

                      <td className="py-3 px-3 text-right">
                        {!w.isPrimary && (w.missingUrlsCount || 0) > 0 ? (
                          <Link
                            href={`/dashboard/missing?websiteId=${w._id}`}
                            className="font-medium text-[#991B1B] hover:underline"
                          >
                            {(w.missingUrlsCount || 0).toLocaleString()}
                          </Link>
                        ) : (
                          <span className="text-[#737373]">0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-[#737373]">
                        {w.lastScanAt
                          ? new Date(w.lastScanAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Never"}
                      </td>

                      <td className="py-3 px-4 text-[#737373]">
                        {w.isActive && w.nextScanAt
                          ? new Date(w.nextScanAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Paused"}
                      </td>

                      <td className="py-3 px-3">
                        <StatusBadge
                          title={
                            w.lastScanErrorMessage ||
                            (!w.isActive
                              ? "Automated monitoring is paused. Click 'Resume' to re-enable schedule."
                              : w.lastScanStatus === "warning"
                              ? "Partial scan: Some child sitemaps failed to respond or timed out"
                              : undefined)
                          }
                          status={
                            scanningIds[w._id] || w.isScanning
                              ? "scanning"
                              : !w.isActive
                              ? "paused"
                              : w.lastScanStatus || "scheduled"
                          }
                        />
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={scanningIds[w._id]}
                            onClick={() => handleRunScan(w._id, w.domain, w.isScanning)}
                            title={w.isScanning ? "Website scan is in progress or recovering. Click to force rescan." : "Scan Now"}
                          >
                            <Play className="w-3 h-3" />
                            <span>{w.isScanning && !scanningIds[w._id] ? "Force Scan" : "Scan"}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleActive(w)}
                            title={w.isActive ? "Pause monitoring" : "Resume monitoring"}
                          >
                            {w.isActive ? "Pause" : "Resume"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(w)}
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeletingWebsite(w)}
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3 text-[#991B1B]" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Website Modal */}
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Add Website"
          description="Register a new website and discover its sitemap automatically"
          maxWidth="md"
        >
          <form onSubmit={handleSubmitAdd} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-[#171717] mb-1">Website Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Acme Corp"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#171717] mb-1">Website URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  required
                  placeholder="https://example.com"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={isDiscovering}
                  onClick={handleDiscoverSitemaps}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Discover Sitemap</span>
                </Button>
              </div>
              <p className="text-[11px] text-[#737373] mt-1">
                Enter your URL and click Discover to check robots.txt and standard locations.
              </p>
            </div>

            {/* Discovered Candidates preview */}
            {discoveredCandidates.length > 0 && (
              <div className="p-3 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-[#171717] text-[11px]">
                    Discovered Sitemaps for {discoveryDomain}:
                  </div>
                  <span className="text-[10px] text-[#737373]">
                    {discoveredCandidates.length} unique index source{discoveredCandidates.length > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-2">
                  {discoveredCandidates.map((c, i) => (
                    <div key={i} className="space-y-2 bg-white p-2.5 border border-[#E5E5E5] rounded-sm">
                      {/* Product Sitemap Alert if detected */}
                      {c.hasProductSitemap && c.detectedProductSitemaps && c.detectedProductSitemaps.length > 0 ? (
                        <div className="p-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xs flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <ShoppingBag className="w-3.5 h-3.5 text-[#166534] shrink-0" />
                            <div className="text-[11px] text-[#166534]">
                              <strong className="font-semibold">Product Sitemap Found:</strong>{" "}
                              <code className="font-mono">{c.detectedProductSitemaps[0].split("/").pop()}</code>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setFormSitemapUrl(c.detectedProductSitemaps![0]);
                              setFormCrawlScope("products");
                              toast("Selected product sitemap & set Products Only scope", "success");
                            }}
                            className="px-2 py-0.5 bg-[#166534] hover:bg-[#14532D] text-white rounded-xs text-[10px] font-medium transition-colors"
                          >
                            Use Product Sitemap
                          </button>
                        </div>
                      ) : (
                        <div className="p-1.5 bg-[#F9F9F8] border border-[#E5E5E5] rounded-xs flex items-center gap-1.5 text-[10px] text-[#737373]">
                          <Info className="w-3 h-3 text-[#737373] shrink-0" />
                          <span>
                            No separate product XML sitemap ({c.summary?.postsCount || 0} blog posts, {c.summary?.pagesCount || 0} pages). Choose <strong>Products Only</strong> below to automatically extract product URLs!
                          </span>
                        </div>
                      )}

                      <div
                        onClick={() => setFormSitemapUrl(c.url)}
                        className={`cursor-pointer p-1.5 rounded-sm flex items-center justify-between border text-[11px] ${
                          formSitemapUrl === c.url
                            ? "bg-[#F0FDF4] border-[#166534] text-[#166534]"
                            : "hover:bg-[#FAFAF8] border-[#E5E5E5] text-[#171717]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {formSitemapUrl === c.url && <Check className="w-3 h-3 text-[#166534]" />}
                          <span className="font-mono truncate">{c.url}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-[#737373]">
                          <span className="uppercase text-[10px] font-mono">{c.type || c.source}</span>
                          {c.sampleUrlCount !== undefined && (
                            <span className="text-[#166534] font-mono font-medium">~{c.sampleUrlCount} URLs</span>
                          )}
                          <span className="font-mono text-[10px]">HTTP {c.status}</span>
                        </div>
                      </div>

                      {/* Child Sitemaps List (if index) */}
                      {c.childSitemaps && c.childSitemaps.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <div className="text-[10px] text-[#737373] font-medium flex items-center justify-between">
                            <span>Sub-sitemaps in index ({c.childSitemaps.length}):</span>
                            <span className="text-[9px] text-[#A3A3A3]">Click to monitor single sub-sitemap</span>
                          </div>
                          <div className="max-h-28 overflow-y-auto space-y-1 pr-1 border border-[#F5F5F4] p-1 rounded-xs">
                            {c.childSitemaps.map((sub, sIdx) => {
                              const isSelected = formSitemapUrl === sub.url;
                              return (
                                <div
                                  key={sIdx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormSitemapUrl(sub.url);
                                    if (sub.category === "products") {
                                      setFormCrawlScope("products");
                                    }
                                  }}
                                  className={`p-1 rounded-xs flex items-center justify-between font-mono text-[10px] cursor-pointer border ${
                                    isSelected
                                      ? "bg-[#F0FDF4] border-[#166534] text-[#166534] font-semibold"
                                      : "hover:bg-[#F9F9F8] border-transparent text-[#737373] hover:text-[#171717]"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    {sub.category === "products" ? (
                                      <span className="px-1 py-0.2 bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0] rounded-xs text-[9px] font-sans font-medium">
                                        Product
                                      </span>
                                    ) : sub.category === "posts" ? (
                                      <span className="px-1 py-0.2 bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB] rounded-xs text-[9px] font-sans">
                                        Post
                                      </span>
                                    ) : sub.category === "pages" ? (
                                      <span className="px-1 py-0.2 bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB] rounded-xs text-[9px] font-sans">
                                        Page
                                      </span>
                                    ) : (
                                      <span className="px-1 py-0.2 bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA] rounded-xs text-[9px] font-sans">
                                        Category
                                      </span>
                                    )}
                                    <span className="truncate">{sub.filename}</span>
                                  </div>
                                  <span className="text-[9px] text-[#A3A3A3] shrink-0">
                                    {isSelected ? "Selected" : "Select"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block font-medium text-[#171717] mb-1">
                Sitemap URL (optional)
              </label>
              <input
                type="url"
                placeholder="https://example.com/sitemap.xml"
                value={formSitemapUrl}
                onChange={(e) => setFormSitemapUrl(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs font-mono text-[#171717] focus:outline-none focus:border-[#171717]"
              />
              <p className="text-[11px] text-[#737373] mt-1">
                Leave empty to automatically probe and use discovered sitemap, or paste a specific sub-sitemap.
              </p>
            </div>

            {/* Crawl Scope Selection */}
            <div className="space-y-2 pt-1 border-t border-[#E5E5E5]">
              <label className="block font-medium text-[#171717] text-xs">
                Crawl Scope
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
                    Auto-targets product sitemaps & extracts product URLs. Excludes legal and admin pages.
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
                <div className="p-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-sm flex items-start gap-2 text-[11px] text-[#166534]">
                  <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#166534]" />
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#171717] mb-1">Scan Frequency</label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
                >
                  <option value="6h">Every 6 hours</option>
                  <option value="12h">Every 12 hours</option>
                  <option value="24h">Every 24 hours (Daily)</option>
                  <option value="3d">Every 3 days</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>

              <div className="flex flex-col justify-end py-1">
                <Toggle
                  checked={formIsPrimary}
                  onChange={setFormIsPrimary}
                  size="sm"
                  label="Set as Primary Baseline Website"
                  description="Use as baseline to find missing competitor products"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E5E5]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                Save Website
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Website Modal */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit Website"
          description={`Update settings and URL filters for ${
            editingWebsite?.domain === ".com" && formUrl
              ? formUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
              : editingWebsite?.domain || ""
          }`}
          maxWidth="md"
        >
          <form onSubmit={handleSubmitEdit} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-[#171717] mb-1">Website Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#171717] mb-1">Website URL / Domain</label>
              <input
                type="text"
                required
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="e.g. consumerhealthdigest.com"
                className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs font-mono text-[#171717] focus:outline-none focus:border-[#171717]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#171717] mb-1">Sitemap URL</label>
              <input
                type="url"
                value={formSitemapUrl}
                onChange={(e) => {
                  setFormSitemapUrl(e.target.value);
                  if ((!formUrl || formUrl === ".com" || formUrl.includes("://.com")) && e.target.value) {
                    try {
                      const u = new URL(e.target.value);
                      setFormUrl(u.origin);
                    } catch {}
                  }
                }}
                className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs font-mono text-[#171717] focus:outline-none focus:border-[#171717]"
              />
              <p className="text-[11px] text-[#737373] mt-1">
                You can specify a direct child sitemap URL (e.g. <code>https://example.com/product-sitemap.xml</code>) to only fetch product links.
              </p>
            </div>

            {/* Crawl Scope Selection in Edit */}
            <div className="space-y-2 pt-1 border-t border-[#E5E5E5]">
              <label className="block font-medium text-[#171717] text-xs">
                Crawl Scope
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
                    Auto-targets product sitemaps & extracts product URLs. Excludes legal and admin pages.
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
                <div className="p-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-sm flex items-start gap-2 text-[11px] text-[#166534]">
                  <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#166534]" />
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#171717] mb-1">Scan Frequency</label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
                >
                  <option value="6h">Every 6 hours</option>
                  <option value="12h">Every 12 hours</option>
                  <option value="24h">Every 24 hours</option>
                  <option value="3d">Every 3 days</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>

              <div className="flex flex-col justify-end py-1">
                <Toggle
                  checked={formIsPrimary}
                  onChange={setFormIsPrimary}
                  size="sm"
                  label="Set as Primary Baseline Website"
                  description="Use as baseline to find missing competitor products"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E5E5]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirm Dialog */}
        <ConfirmDialog
          isOpen={!!deletingWebsite}
          onClose={() => setDeletingWebsite(null)}
          onConfirm={handleDelete}
          title="Delete Website"
          message={`Are you sure you want to delete "${deletingWebsite?.name}" (${deletingWebsite?.domain})? This will permanently remove all indexed pages, scan history, and change logs.`}
          confirmLabel="Delete Website"
          isLoading={isDeleting}
          isDestructive={true}
        />
      </div>
    </DashboardShell>
  );
}
