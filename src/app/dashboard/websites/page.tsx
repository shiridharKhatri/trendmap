"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { useScan } from "@/components/providers/ScanProvider";
import { type IWebsite, type DiscoveredSitemapCandidate } from "@/types";
import { detectWebsiteName, sanitizeWebsiteUrl } from "@/lib/sitemap/normalizer";
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
  RefreshCw,
} from "lucide-react";

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<IWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const {
    isScanning: isGloballyScanning,
    triggerScan,
    triggerScanAll,
    isScanningAll,
  } = useScan();

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingWebsite, setEditingWebsite] = useState<IWebsite | null>(null);
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");

  // Delete State
  const [deletingWebsite, setDeletingWebsite] = useState<IWebsite | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formCategory, setFormCategory] = useState<"nutra" | "ecom">("nutra");
  const [formSitemapUrl, setFormSitemapUrl] = useState("");
  const [formFrequency, setFormFrequency] = useState<any>("24h");
  const [formIsPrimary, setFormIsPrimary] = useState(false);
  const [formCrawlScope, setFormCrawlScope] = useState<"all" | "products" | "blog" | "custom">("products");
  const [showCustomFilters, setShowCustomFilters] = useState(false);
  const [formUrlInclude, setFormUrlInclude] = useState("");
  const [formUrlExclude, setFormUrlExclude] = useState("");
  const [bulkUrlsText, setBulkUrlsText] = useState("");
  const [bulkAutoScan, setBulkAutoScan] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const previousInferredNameRef = useRef("");

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
    const handleScanDone = () => {
      fetchWebsites();
    };
    window.addEventListener("trendmap:scan-completed", handleScanDone);
    return () => window.removeEventListener("trendmap:scan-completed", handleScanDone);
  }, []);

  const resetForm = () => {
    setFormName("");
    setFormUrl("");
    setFormCategory("nutra");
    setFormSitemapUrl("");
    setFormFrequency("24h");
    setFormIsPrimary(false);
    setFormCrawlScope("products");
    setShowCustomFilters(false);
    setFormUrlInclude("");
    setFormUrlExclude("");
    setBulkUrlsText("");
    setBulkAutoScan(true);
    setAddMode("single");
    setDiscoveredCandidates([]);
    setDiscoveryDomain("");
    previousInferredNameRef.current = "";
  };

  const handleUrlChange = (val: string) => {
    setFormUrl(val);
    const inferred = detectWebsiteName(val);
    if (inferred && (!formName || formName === previousInferredNameRef.current)) {
      setFormName(inferred);
      previousInferredNameRef.current = inferred;
    }
  };

  const handleUrlBlur = () => {
    if (formUrl.trim()) {
      const clean = sanitizeWebsiteUrl(formUrl);
      setFormUrl(clean);
      const inferred = detectWebsiteName(clean);
      if (inferred && (!formName || formName === previousInferredNameRef.current)) {
        setFormName(inferred);
        previousInferredNameRef.current = inferred;
      }
    }
  };

  const bulkCount = bulkUrlsText
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => Boolean(s) && !s.startsWith("#") && !s.startsWith("//")).length;

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
    setFormCategory(w.category || "nutra");
    setFormSitemapUrl(w.sitemapUrl || "");
    setFormFrequency(w.scanFrequency || "24h");
    setFormIsPrimary(w.isPrimary);
    setFormCrawlScope("products");
    setShowCustomFilters(false);
    setFormUrlInclude("");
    setFormUrlExclude("");
    setIsEditModalOpen(true);
  };

  const handleDiscoverSitemaps = async () => {
    if (!formUrl.trim()) {
      toast("Please enter a website URL first", "error");
      return;
    }

    setIsDiscovering(true);
    setDiscoveredCandidates([]);
    setDiscoveryDomain("");

    const targetUrl = sanitizeWebsiteUrl(formUrl);
    setFormUrl(targetUrl);

    try {
      const res = await fetch(`/api/websites/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setDiscoveryDomain(data.domain || formUrl);
        setDiscoveredCandidates(data.candidates || []);

        if (data.recommendedSitemap) {
          setFormSitemapUrl(data.recommendedSitemap);
          toast(`Discovered sitemap: ${data.recommendedSitemap}`, "success");
        } else {
          toast("No standard XML sitemap found automatically. You can enter one manually.", "info");
        }
      } else {
        toast(data.error || "Failed to discover sitemap", "error");
      }
    } catch {
      toast("Discovery request failed", "error");
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUrl.trim()) {
      toast("Website URL or domain is required", "error");
      return;
    }

    const cleanUrl = sanitizeWebsiteUrl(formUrl);
    const cleanName = formName.trim() || detectWebsiteName(cleanUrl);

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          url: cleanUrl,
          category: formCategory,
          sitemapUrl: formSitemapUrl || undefined,
          scanFrequency: formFrequency,
          isPrimary: formIsPrimary,
          crawlScope: "products",
          urlIncludePatterns: [],
          urlExcludePatterns: [],
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast(`Added website "${cleanName}"! Background scan started automatically.`, "success");
        setIsAddModalOpen(false);
        resetForm();
        fetchWebsites();
        if (data.website?._id) {
          triggerScan(data.website._id, data.website.domain, true);
        }
      } else {
        toast(data.error || "Failed to add website", "error");
      }
    } catch {
      toast("Request error while creating website", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkUrlsText.trim()) {
      toast("Please enter at least one website link or domain", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/websites/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: bulkUrlsText,
          category: formCategory,
          isPrimary: formIsPrimary,
          scanFrequency: formFrequency,
          autoScan: bulkAutoScan,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.count > 0) {
          toast(
            bulkAutoScan
              ? `Successfully added ${data.count} website${data.count > 1 ? "s" : ""}! Auto-discovering sitemaps & scanning...`
              : `Successfully added ${data.count} website${data.count > 1 ? "s" : ""}!`,
            "success"
          );
          if (bulkAutoScan) {
            triggerScanAll();
          }
        }
        if (data.errors && data.errors.length > 0) {
          toast(`${data.errors.length} link${data.errors.length > 1 ? "s were" : " was"} skipped (duplicate or invalid)`, "info");
        }
        setIsAddModalOpen(false);
        resetForm();
        fetchWebsites();
      } else {
        toast(data.error || "Failed to add websites in bulk", "error");
      }
    } catch {
      toast("Request error while creating websites in bulk", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWebsite) return;

    const cleanUrl = sanitizeWebsiteUrl(formUrl);
    const cleanName = formName.trim() || detectWebsiteName(cleanUrl);

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/websites/${editingWebsite._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          url: cleanUrl,
          category: formCategory,
          sitemapUrl: formSitemapUrl,
          scanFrequency: formFrequency,
          isPrimary: formIsPrimary,
          crawlScope: "products",
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast(`Updated "${cleanName}"`, "success");
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
    await triggerScan(websiteId, domain, force);
  };

  const handleScanAll = async () => {
    await triggerScanAll();
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
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleScanAll}
              disabled={isScanningAll || websites.length === 0}
              isLoading={isScanningAll}
              className="border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningAll ? "animate-spin" : ""}`} />
              <span>{isScanningAll ? "Scanning All Sites..." : "Scan All Sites"}</span>
            </Button>

            <Button size="sm" onClick={handleOpenAdd} className="bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl shadow-xs font-semibold cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Website</span>
            </Button>
          </div>
        </div>

        {/* Website List Table */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#0F172A] border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                  <th className="py-3 px-4">Domain & Name</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Category</th>
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
                    <td colSpan={10} className="py-8 text-center text-[#737373]">
                      Loading websites...
                    </td>
                  </tr>
                ) : websites.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-[#737373]">
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
                          {w.crawlScope === "blog" ? (
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

                      <td className="py-3 px-3">
                        {w.category === "ecom" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE] rounded-sm text-[10px] font-semibold">
                            🛒 E-Com
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] rounded-sm text-[10px] font-semibold">
                            💊 Nutra
                          </span>
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
                            (w.lastScanStatus === "warning"
                              ? "Partial scan: Some child sitemaps failed to respond or timed out"
                              : undefined)
                          }
                          status={
                            isGloballyScanning(w._id) || w.isScanning
                              ? "scanning"
                              : !w.isActive
                                ? "disabled"
                                : w.lastScanStatus || "scheduled"
                          }
                        />
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={isGloballyScanning(w._id) || w.isScanning}
                            onClick={() => handleRunScan(w._id, w.domain, isGloballyScanning(w._id) || w.isScanning)}
                            title={
                              isGloballyScanning(w._id) || w.isScanning
                                ? "Website scan is processing in background. Click to force rescan if needed."
                                : "Scan Now"
                            }
                          >
                            <Play className="w-3 h-3" />
                            <span>{isGloballyScanning(w._id) || w.isScanning ? "Scanning..." : "Scan"}</span>
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
          title={addMode === "single" ? "Add Website" : "Bulk Add Websites"}
          description={
            addMode === "single"
              ? "Register a website to monitor product changes & catalog trends."
              : "Paste multiple website domains or URLs to register them in batch."
          }
          maxWidth="md"
        >
          {/* Mode Switcher Tabs */}
          <div className="flex border-b border-[#E0E2F0] mb-4 -mt-1">
            <button
              type="button"
              onClick={() => setAddMode("single")}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${addMode === "single"
                ? "border-[#0F172A] text-[#0F172A]"
                : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
            >
              Single Website
            </button>
            <button
              type="button"
              onClick={() => setAddMode("bulk")}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${addMode === "bulk"
                ? "border-[#0F172A] text-[#0F172A]"
                : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Bulk Add Links</span>
            </button>
          </div>

          <form onSubmit={addMode === "single" ? handleSubmitAdd : handleSubmitBulk} className="space-y-4 text-xs">
            {/* Category Pill Selector */}
            <div>
              <label className="block font-semibold text-slate-800 mb-1.5 uppercase tracking-wider text-[11px]">
                Category
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFormCategory("nutra")}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${formCategory === "nutra"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-800 ring-1 ring-emerald-400/50 shadow-xs"
                    : "bg-white border-[#E0E2F0] text-slate-600 hover:border-slate-300"
                    }`}
                >
                  <span className="text-sm">💊</span>
                  <span>Nutra / Health</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormCategory("ecom")}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${formCategory === "ecom"
                    ? "bg-slate-100 border-[#0F172A] text-[#0F172A] ring-1 ring-slate-400/50 shadow-xs"
                    : "bg-white border-[#E0E2F0] text-slate-600 hover:border-slate-300"
                    }`}
                >
                  <span className="text-sm">🛒</span>
                  <span>E-Commerce</span>
                </button>
              </div>
            </div>

            {addMode === "single" ? (
              <>
                {/* Single Mode: Website URL */}
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Website URL / Domain
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="e.g. GuruReviewsClub.com or https://example.com"
                      value={formUrl}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      onBlur={handleUrlBlur}
                      className="flex-1 px-3 py-2 bg-white border border-[#E0E2F0] rounded-xl text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isLoading={isDiscovering}
                      onClick={handleDiscoverSitemaps}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Discover</span>
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Enter any domain or URL. <code>https://</code> and website name will be detected automatically.
                  </p>
                </div>

                {/* Discovered Candidates preview */}
                {discoveredCandidates.length > 0 && (
                  <div className="p-3 bg-slate-50 border border-[#E0E2F0] rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900 text-[11px]">
                        Discovered Sitemaps for {discoveryDomain}:
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {discoveredCandidates.length} source{discoveredCandidates.length > 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {discoveredCandidates.map((c, i) => (
                        <div key={i} className="space-y-2 bg-white p-2.5 border border-[#E0E2F0] rounded-lg">
                          {c.hasProductSitemap && c.detectedProductSitemaps && c.detectedProductSitemaps.length > 0 ? (
                            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-md flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <ShoppingBag className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <div className="text-[11px] text-emerald-800">
                                  <strong className="font-semibold">Product Sitemap:</strong>{" "}
                                  <code className="font-mono">{c.detectedProductSitemaps[0].split("/").pop()}</code>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormSitemapUrl(c.detectedProductSitemaps![0]);
                                  toast("Selected product sitemap", "success");
                                }}
                                className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-[10px] font-medium transition-colors"
                              >
                                Use This
                              </button>
                            </div>
                          ) : null}

                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-slate-800 truncate max-w-[280px]">
                              {c.url}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setFormSitemapUrl(c.url);
                                toast("Sitemap URL selected", "success");
                              }}
                              className="px-2 py-0.5 border border-[#E0E2F0] hover:border-slate-600 text-slate-700 rounded-md text-[10px] font-medium transition-colors shrink-0"
                            >
                              Select
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Single Mode: Website Name */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-800">Website Name</label>
                    <span className="text-[10px] text-slate-500">Auto-detected from URL</span>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Guru Reviews Club"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#E0E2F0] rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]"
                  />
                </div>

                {/* Single Mode: Sitemap URL (Optional) */}
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Sitemap URL <span className="font-normal text-slate-500">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="https://example.com/sitemap.xml or leave blank for auto-discovery"
                    value={formSitemapUrl}
                    onChange={(e) => setFormSitemapUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#E0E2F0] rounded-xl text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Leave empty to probe automatically, or specify a direct products sitemap.
                  </p>
                </div>
              </>
            ) : (
              /* Bulk Mode: Multi-URL Textarea with Sitemap Support */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-800 text-xs">
                    Websites & Sitemaps <span className="text-slate-400 font-normal">(One per line)</span>
                  </label>
                  <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                    {bulkCount} website{bulkCount === 1 ? "" : "s"} detected
                  </span>
                </div>

                <textarea
                  required
                  rows={6}
                  value={bulkUrlsText}
                  onChange={(e) => setBulkUrlsText(e.target.value)}
                  placeholder={`Paste websites or sitemaps here (one per line):

thebuyersreviews.com
supplementvibes.com, https://supplementvibes.com/sitemap_index.xml
https://dailyhealthsupplement.com/sitemap_index.xml
supplementdolphin.com`}
                  className="w-full px-3 py-2 bg-white border border-[#E0E2F0] rounded-xl text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 leading-relaxed"
                />

                {/* Formats Supported Info Box */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[11px] text-slate-600">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Flexible Input Formats Supported:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-600 pl-1 text-[11px]">
                    <li><strong className="text-slate-800">Domain only:</strong> <code>example.com</code> (auto-probes robots.txt & discovers sitemap automatically)</li>
                    <li><strong className="text-slate-800">Domain + Sitemap:</strong> <code>example.com, https://example.com/sitemap_index.xml</code></li>
                    <li><strong className="text-slate-800">Direct Sitemap XML:</strong> <code>https://example.com/sitemap_index.xml</code></li>
                  </ul>
                </div>

                {/* Immediate Scan Toggle */}
                <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={bulkAutoScan}
                    onChange={(e) => setBulkAutoScan(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800">Auto-discover sitemaps & start scan immediately</span>
                    <p className="text-[11px] text-slate-500">
                      Probes robots.txt and sitemap index files, and queues background scans right away.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Scope info indicator (Always Products-Only) */}
            <div className="p-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-start gap-2 text-[11px] text-emerald-900">
              <ShoppingBag className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
              <div>
                <strong className="font-semibold text-emerald-950">Targeting Products Only:</strong> Crawls are optimized for catalog & product URLs. Informational and admin pages are excluded automatically.
              </div>
            </div>

            {/* Frequency & Primary Baseline */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#E0E2F0]">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">Scan Frequency</label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E0E2F0] rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#4F46E5]"
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
                  label="Set as Primary Baseline"
                  description="Use to find missing competitor products"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-2.5 pt-4 border-t border-[#E0E2F0]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                {addMode === "single"
                  ? "Save Website"
                  : `Add ${bulkCount > 0 ? bulkCount : ""} Website${bulkCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Website Modal */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit Website"
          description={`Update settings for ${editingWebsite?.domain === ".com" && formUrl
            ? formUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
            : editingWebsite?.domain || ""
            }`}
          maxWidth="md"
        >
          <form onSubmit={handleSubmitEdit} className="space-y-4 text-xs">
            {/* Category Pill Selector in Edit */}
            <div>
              <label className="block font-semibold text-slate-800 mb-1.5 uppercase tracking-wider text-[11px]">
                Category
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFormCategory("nutra")}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${formCategory === "nutra"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-800 ring-1 ring-emerald-400/50 shadow-xs"
                    : "bg-white border-[#E0E2F0] text-slate-600 hover:border-slate-300"
                    }`}
                >
                  <span className="text-sm">💊</span>
                  <span>Nutra / Health</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormCategory("ecom")}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${formCategory === "ecom"
                    ? "bg-indigo-50 border-[#4F46E5] text-[#4F46E5] ring-1 ring-indigo-400/50 shadow-xs"
                    : "bg-white border-[#E0E2F0] text-slate-600 hover:border-slate-300"
                    }`}
                >
                  <span className="text-sm">🛒</span>
                  <span>E-Commerce</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Website Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#E0E2F0] rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Website URL / Domain</label>
              <input
                type="text"
                required
                value={formUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                onBlur={handleUrlBlur}
                placeholder="e.g. consumerhealthdigest.com"
                className="w-full px-3 py-2 bg-white border border-[#E0E2F0] rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Sitemap URL</label>
              <input
                type="text"
                value={formSitemapUrl}
                onChange={(e) => {
                  setFormSitemapUrl(e.target.value);
                  if ((!formUrl || formUrl === ".com" || formUrl.includes("://.com")) && e.target.value) {
                    try {
                      const u = new URL(sanitizeWebsiteUrl(e.target.value));
                      setFormUrl(u.origin);
                    } catch { }
                  }
                }}
                className="w-full px-3 py-2 bg-white border border-[#E0E2F0] rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-[#4F46E5]"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                You can specify a direct child sitemap URL (e.g. <code>https://example.com/product-sitemap.xml</code>) to only fetch product links.
              </p>
            </div>

            <div className="p-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-start gap-2 text-[11px] text-emerald-900">
              <ShoppingBag className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
              <div>
                <strong className="font-semibold text-emerald-950">Products Only Crawl Active:</strong> Sitemaps are parsed specifically for product catalog entries.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#E0E2F0]">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">Scan Frequency</label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E0E2F0] rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#4F46E5]"
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
                  label="Set as Primary Baseline"
                  description="Use as baseline to find missing competitor products"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-[#E0E2F0]">
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
