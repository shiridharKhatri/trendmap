"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
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
import { invalidateClientCache } from "@/lib/client/cache";
import {
  Plus,
  Globe,
  Play,
  Trash2,
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
  Pause,
  Pencil,
  Clock,
} from "lucide-react";

function SiteFavicon({
  domain,
  size = 15,
  className = "",
}: {
  domain: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain)}&sz=${size * 2}`;

  if (failed) {
    return <Globe className={`w-3.5 h-3.5 text-slate-400 ${className}`} />;
  }

  return (
    <img
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 rounded-2xs ${className}`}
    />
  );
}

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<IWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const {
    isScanning: isGloballyScanning,
    triggerScan,
    triggerScanAll,
    registerActiveScan,
    isScanningAll,
  } = useScan();

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");

  // Delete State
  const [deletingWebsite, setDeletingWebsite] = useState<IWebsite | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Website State
  const [editingWebsite, setEditingWebsite] = useState<IWebsite | null>(null);
  const [editFrequency, setEditFrequency] = useState<string>("24h");
  const [editCustomHours, setEditCustomHours] = useState<number>(24);
  const [editCategory, setEditCategory] = useState<"nutra" | "ecom">("nutra");
  const [editLanguage, setEditLanguage] = useState<"en" | "de" | "it" | "fr">("en");
  const [editIsPrimary, setEditIsPrimary] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editName, setEditName] = useState("");
  const [editSitemapUrl, setEditSitemapUrl] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Form State
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [nameError, setNameError] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [formCategory, setFormCategory] = useState<"nutra" | "ecom">("nutra");
  const [formLanguage, setFormLanguage] = useState<"en" | "de" | "it" | "fr">("en");
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

  // Filters & Search State
  const [selectedCategory, setSelectedCategory] = useState<"all" | "nutra" | "ecom">("all");
  const [selectedLanguage, setSelectedLanguage] = useState<"all" | "en" | "de" | "it" | "fr">("all");
  const [searchQuery, setSearchQuery] = useState("");

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
    setUrlError("");
    setNameError("");
    setBulkError("");
    setFormCategory("nutra");
    setFormLanguage("en");
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
    if (urlError) setUrlError("");
    const inferred = detectWebsiteName(val);
    if (inferred && (!formName || formName === previousInferredNameRef.current)) {
      setFormName(inferred);
      previousInferredNameRef.current = inferred;
    }
    const lower = val.toLowerCase();
    if (lower.endsWith(".de") || lower.includes(".de/") || lower.includes("/de/") || lower.includes("/de")) {
      setFormLanguage("de");
    } else if (lower.endsWith(".it") || lower.includes(".it/") || lower.includes("/it/") || lower.includes("/it")) {
      setFormLanguage("it");
    } else if (lower.endsWith(".fr") || lower.includes(".fr/") || lower.includes("/fr/") || lower.includes("/fr")) {
      setFormLanguage("fr");
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
      const lower = clean.toLowerCase();
      if (lower.endsWith(".de") || lower.includes(".de/") || lower.includes("/de/") || lower.includes("/de")) {
        setFormLanguage("de");
      } else if (lower.endsWith(".it") || lower.includes(".it/") || lower.includes("/it/") || lower.includes("/it")) {
        setFormLanguage("it");
      } else if (lower.endsWith(".fr") || lower.includes(".fr/") || lower.includes("/fr/") || lower.includes("/fr")) {
        setFormLanguage("fr");
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

  const handleDiscoverSitemaps = async () => {
    if (!formUrl.trim()) {
      setUrlError("Please enter a website address first");
      return;
    }

    setIsDiscovering(true);
    setDiscoveredCandidates([]);
    setDiscoveryDomain("");
    setUrlError("");

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
          toast(`Found active sitemap: ${data.recommendedSitemap}`, "success");
        } else {
          toast("No active sitemap found automatically. You can enter one manually if you have it.", "info");
        }
      } else {
        setUrlError(data.error || "This website could not be found. Please check the website address.");
      }
    } catch {
      setUrlError("Could not connect to this website. Please check the website address.");
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError("");
    setNameError("");

    if (!formUrl.trim()) {
      setUrlError("Website address is required");
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
          language: formLanguage,
          country: formLanguage === "de" ? "DE" : formLanguage === "it" ? "IT" : formLanguage === "fr" ? "FR" : "US",
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
        invalidateClientCache();
        if (data.website?._id) {
          registerActiveScan({
            websiteId: data.website._id,
            domain: data.website.domain,
            name: data.website.name,
            isPrimary: data.website.isPrimary,
          });
        }
        setIsAddModalOpen(false);
        resetForm();
        fetchWebsites();
      } else {
        const errMsg = data.error || "Failed to add website";
        if (errMsg.toLowerCase().includes("name")) {
          setNameError(errMsg);
        } else {
          setUrlError(errMsg);
        }
      }
    } catch {
      setUrlError("Could not connect to server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError("");

    if (!bulkUrlsText.trim()) {
      setBulkError("Please enter at least one website link or domain");
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
          language: formLanguage,
          country: formLanguage === "de" ? "DE" : formLanguage === "it" ? "IT" : formLanguage === "fr" ? "FR" : "US",
          isPrimary: formIsPrimary,
          scanFrequency: formFrequency,
          autoScan: bulkAutoScan,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        invalidateClientCache();
        if (data.count > 0) {
          toast(
            bulkAutoScan
              ? `Successfully added ${data.count} website${data.count > 1 ? "s" : ""}! Auto-discovering sitemaps & scanning...`
              : `Successfully added ${data.count} website${data.count > 1 ? "s" : ""}!`,
            "success"
          );
          if (bulkAutoScan && Array.isArray(data.websites)) {
            data.websites.forEach((w: any) => {
              registerActiveScan({
                websiteId: w._id,
                domain: w.domain,
                name: w.name,
                isPrimary: w.isPrimary,
              });
            });
          }
        }
        if (data.errors && data.errors.length > 0) {
          toast(`${data.errors.length} link${data.errors.length > 1 ? "s were" : " was"} skipped (duplicate or invalid)`, "info");
        }
        setIsAddModalOpen(false);
        resetForm();
        fetchWebsites();
      } else {
        setBulkError(data.error || "Failed to add websites");
      }
    } catch {
      setBulkError("Request failed. Please try again.");
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

  const handleOpenEdit = (w: IWebsite) => {
    setEditingWebsite(w);
    setEditFrequency(w.scanFrequency || "24h");
    setEditCustomHours(w.customFrequencyHours || 24);
    setEditCategory((w.category as "nutra" | "ecom") || "nutra");
    setEditLanguage((w.language as "en" | "de" | "it" | "fr") || "en");
    setEditIsPrimary(Boolean(w.isPrimary));
    setEditIsActive(w.isActive !== false);
    setEditName(w.name || "");
    setEditSitemapUrl(w.sitemapUrl || "");
    setEditError("");
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingWebsite) return;
    setIsSavingEdit(true);
    setEditError("");

    try {
      const payload: any = {
        scanFrequency: editFrequency,
        customFrequencyHours: editFrequency === "custom" ? Number(editCustomHours) || 24 : undefined,
        language: editLanguage,
        category: editCategory,
        isPrimary: editIsPrimary,
        isActive: editIsActive,
      };
      if (editName.trim()) payload.name = editName.trim();
      if (editSitemapUrl.trim()) payload.sitemapUrl = editSitemapUrl.trim();

      const res = await fetch(`/api/websites/${editingWebsite._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast(`Updated scan frequency & settings for ${editingWebsite.domain}`, "success");
        setEditingWebsite(null);
        fetchWebsites();
      } else {
        const data = await res.json();
        setEditError(data.error || "Failed to update website");
      }
    } catch {
      setEditError("Failed to update website. Please try again.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const filteredWebsites = useMemo(() => {
    return websites.filter((w) => {
      if (selectedCategory !== "all" && (w.category || "nutra") !== selectedCategory) return false;
      if (selectedLanguage !== "all" && (w.language || "en") !== selectedLanguage) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          w.domain.toLowerCase().includes(q) ||
          (w.name && w.name.toLowerCase().includes(q)) ||
          (w.url && w.url.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [websites, selectedCategory, selectedLanguage, searchQuery]);

  return (
    <DashboardShell title="Websites">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Website Management</h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Add websites, configure scan schedules, and manage your stores and competitor websites
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

        {/* Filter & Search Toolbar */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter Pills */}
            <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl">
              {[
                { id: "all", label: "All Categories" },
                { id: "nutra", label: "💊 Nutra" },
                { id: "ecom", label: "🛒 E-Com" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategory(c.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                    selectedCategory === c.id
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Language / Market Filter Pills */}
            <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl">
              {[
                { id: "all", label: "All Markets" },
                { id: "en", label: "🇺🇸 English" },
                { id: "de", label: "🇩🇪 German" },
                { id: "it", label: "🇮🇹 Italian" },
                { id: "fr", label: "🇫🇷 French" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedLanguage(m.id as any)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                    selectedLanguage === m.id
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Box & Stats */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <span className="text-[11px] text-slate-500 whitespace-nowrap hidden sm:inline">
              Showing <strong>{filteredWebsites.length}</strong> of {websites.length} sites
            </span>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search domain or name..."
                className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Website List Table */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#0F172A] border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                  <th className="py-3 px-4 min-w-[240px]">Website & Store</th>
                  <th className="py-3 px-4 w-[180px] min-w-[160px]">Market & Category</th>
                  <th className="py-3 px-4 w-[120px] text-right">Catalog (URLs)</th>
                  <th className="py-3 px-4 w-[170px]">Schedule & Last Scan</th>
                  <th className="py-3 px-3 w-[110px]">Status</th>
                  <th className="py-3 px-4 w-[140px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={`skel-${i}`} className="animate-pulse">
                      <td className="py-3.5 px-4">
                        <div className="h-4 bg-slate-200 rounded-md w-40 mb-1.5" />
                        <div className="h-3 bg-slate-100 rounded-md w-24" />
                      </td>
                      <td className="py-3.5 px-4"><div className="h-5 bg-slate-100 rounded-md w-28" /></td>
                      <td className="py-3.5 px-4 text-right"><div className="h-4 bg-slate-200 rounded w-14 ml-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-slate-200 rounded-full w-20" /></td>
                      <td className="py-3.5 px-4 text-right"><div className="h-7 bg-slate-100 rounded-lg w-24 ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredWebsites.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      {websites.length === 0
                        ? "No websites added yet. Click \"Add Website\" to begin."
                        : "No websites match your filter criteria. Try clearing the filter or search query."}
                    </td>
                  </tr>
                ) : (
                  filteredWebsites.map((w) => (
                    <tr key={w._id} className="hover:bg-[#FAFAF8] transition-colors">
                      {/* Column 1: Website & Store */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 font-medium text-slate-900">
                          <SiteFavicon domain={w.domain} size={15} className="rounded-xs shrink-0" />
                          <Link href={`/dashboard/websites/${w._id}`} className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline transition-colors truncate">
                            {w.domain}
                          </Link>
                          <a
                            href={w.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                            title="Visit site in new tab"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {w.isPrimary && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold shrink-0">
                              <Star className="w-2.5 h-2.5 fill-current text-emerald-600" /> Your Store
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          {w.name && <span className="truncate max-w-[180px]">{w.name}</span>}
                          {w.crawlScope === "blog" && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded font-medium shrink-0">
                              <FileText className="w-2.5 h-2.5" /> Blog Only
                            </span>
                          )}
                          {((w.urlIncludePatterns && w.urlIncludePatterns.length > 0) ||
                            (w.urlExcludePatterns && w.urlExcludePatterns.length > 0)) && (
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-mono shrink-0">
                              Filtered
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 2: Market & Category (Never wraps!) */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          {/* Market Pill */}
                          {w.language === "de" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50/80 text-amber-900 border border-amber-200/80 rounded-md text-[11px] font-semibold shrink-0">
                              🇩🇪 German
                            </span>
                          ) : w.language === "it" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50/80 text-emerald-900 border border-emerald-200/80 rounded-md text-[11px] font-semibold shrink-0">
                              🇮🇹 Italian
                            </span>
                          ) : w.language === "fr" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50/80 text-sky-900 border border-sky-200/80 rounded-md text-[11px] font-semibold shrink-0">
                              🇫🇷 French
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded-md text-[11px] font-semibold shrink-0">
                              🇺🇸 English
                            </span>
                          )}

                          {/* Category Pill */}
                          {w.category === "ecom" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50/80 text-indigo-800 border border-indigo-200/70 rounded-md text-[11px] font-semibold shrink-0">
                              🛒 E-Com
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50/80 text-teal-900 border border-teal-200/70 rounded-md text-[11px] font-semibold shrink-0">
                              💊 Nutra
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Catalog & Coverage */}
                      <td className="py-3 px-4 text-right">
                        <div className="font-semibold text-slate-900 text-xs">
                          {(w.totalUrls || 0).toLocaleString()}
                        </div>
                        <div className="text-[11px] mt-0.5">
                          {!w.isPrimary && (w.missingUrlsCount || 0) > 0 ? (
                            <Link
                              href={`/dashboard/missing?websiteId=${w._id}`}
                              className="font-medium text-rose-600 hover:text-rose-800 hover:underline"
                              title="View missing products compared to your store"
                            >
                              {(w.missingUrlsCount || 0).toLocaleString()} missing
                            </Link>
                          ) : (
                            <span className="text-slate-400">0 missing</span>
                          )}
                        </div>
                      </td>

                      {/* Column 4: Schedule & Last Scan */}
                      <td className="py-3 px-4 text-xs">
                        <div className="text-slate-800 font-medium truncate">
                          {w.lastScanAt
                            ? new Date(w.lastScanAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : <span className="text-slate-400">Never scanned</span>}
                        </div>
                        <div className="mt-0.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(w)}
                            title="Click to edit scan frequency & settings"
                            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-600 font-medium transition-colors group/freq cursor-pointer"
                          >
                            <Clock className="w-3 h-3 text-slate-400 group-hover/freq:text-indigo-500 transition-colors" />
                            <span>
                              {w.isActive ? (
                                w.scanFrequency === "custom"
                                  ? `Every ${w.customFrequencyHours || 24}h`
                                  : `Every ${w.scanFrequency}`
                              ) : (
                                <span className="text-amber-600 font-medium">Paused</span>
                              )}
                            </span>
                            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/freq:opacity-100 text-slate-400 group-hover/freq:text-indigo-500 transition-opacity" />
                          </button>
                        </div>
                      </td>

                      {/* Column 5: Status */}
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

                      {/* Column 6: Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
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
                            className="h-7 px-2.5 text-xs font-semibold rounded-lg border-slate-300 hover:bg-slate-50 cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            <span>{isGloballyScanning(w._id) || w.isScanning ? "Scanning..." : "Scan"}</span>
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(w)}
                            title="Edit scan frequency & website settings"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(w)}
                            title={w.isActive ? "Pause monitoring" : "Resume monitoring"}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            {w.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-600" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingWebsite(w)}
                            title="Delete website"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${formCategory === "nutra"
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
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${formCategory === "ecom"
                    ? "bg-slate-100 border-[#0F172A] text-[#0F172A] ring-1 ring-slate-400/50 shadow-xs"
                    : "bg-white border-[#E0E2F0] text-slate-600 hover:border-slate-300"
                    }`}
                >
                  <span className="text-sm">🛒</span>
                  <span>E-Commerce</span>
                </button>
              </div>
            </div>

            {/* Market / Language Selector */}
            <div>
              <label className="block font-semibold text-slate-800 mb-1.5 uppercase tracking-wider text-[11px]">
                Market / Language
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: "en", label: "English", flag: "🇺🇸" },
                  { id: "de", label: "German", flag: "🇩🇪" },
                  { id: "it", label: "Italian", flag: "🇮🇹" },
                  { id: "fr", label: "French", flag: "🇫🇷" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setFormLanguage(m.id as any)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      formLanguage === m.id
                        ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                        : "bg-white border-[#E0E2F0] text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-sm">{m.flag}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
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
                      onChange={(e) => {
                        handleUrlChange(e.target.value);
                        if (urlError) setUrlError("");
                      }}
                      onBlur={handleUrlBlur}
                      className={`flex-1 px-3 py-2 bg-white border ${
                        urlError
                          ? "border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/20"
                          : "border-[#E0E2F0] focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]"
                      } rounded-xl text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors`}
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
                  {urlError ? (
                    <p className="text-[11px] text-rose-600 mt-1.5 font-medium flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>{urlError}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Enter any domain or URL. <code>https://</code> and website name will be detected automatically.
                    </p>
                  )}
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
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (nameError) setNameError("");
                    }}
                    className={`w-full px-3 py-2 bg-white border ${
                      nameError
                        ? "border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/20"
                        : "border-[#E0E2F0] focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]"
                    } rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors`}
                  />
                  {nameError && (
                    <p className="text-[11px] text-rose-600 mt-1.5 font-medium flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>{nameError}</span>
                    </p>
                  )}
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
                  onChange={(e) => {
                    setBulkUrlsText(e.target.value);
                    if (bulkError) setBulkError("");
                  }}
                  placeholder={`Paste websites or sitemaps here (one per line):

thebuyersreviews.com
supplementvibes.com, https://supplementvibes.com/sitemap_index.xml
https://dailyhealthsupplement.com/sitemap_index.xml
supplementdolphin.com`}
                  className={`w-full px-3 py-2 bg-white border ${
                    bulkError
                      ? "border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/20"
                      : "border-[#E0E2F0] focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                  } rounded-xl text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none leading-relaxed transition-colors`}
                />
                {bulkError && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{bulkError}</span>
                  </p>
                )}


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
                  label="This is Your Store"
                  description="Use as your store to find missing competitor products"
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
          isOpen={!!editingWebsite}
          onClose={() => setEditingWebsite(null)}
          title="Edit Website Settings"
          description={editingWebsite ? `Configure scan frequency, target market, and crawl settings for ${editingWebsite.domain}` : ""}
          maxWidth="md"
        >
          {editingWebsite && (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
                  {editError}
                </div>
              )}

              {/* Website Header Card */}
              <div className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <SiteFavicon domain={editingWebsite.domain} size={18} />
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-slate-900 truncate flex items-center gap-1.5">
                      <span>{editingWebsite.domain}</span>
                      {editingWebsite.isPrimary && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          ⭐ Your Store
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate font-mono">
                      {editingWebsite.sitemapUrl || editingWebsite.url}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditIsActive(!editIsActive)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    editIsActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                  }`}
                >
                  {editIsActive ? "● Active Monitoring" : "⏸ Monitoring Paused"}
                </button>
              </div>

              {/* Scan Frequency Selection - Prominent Cards */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Scan Frequency
                  <span className="text-[11px] font-normal text-slate-400 ml-1.5">
                    How often should this sitemap be crawled for product additions & changes?
                  </span>
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "6h", label: "Every 6 hours", sub: "High frequency" },
                    { id: "12h", label: "Every 12 hours", sub: "Twice daily" },
                    { id: "24h", label: "Every 24h (Daily)", sub: "Recommended" },
                    { id: "3d", label: "Every 3 days", sub: "Periodic" },
                    { id: "weekly", label: "Weekly", sub: "Every 7 days" },
                    { id: "custom", label: "Custom Hours", sub: "Specify hours" },
                  ].map((freq) => {
                    const isSelected = editFrequency === freq.id;
                    return (
                      <button
                        key={freq.id}
                        type="button"
                        onClick={() => setEditFrequency(freq.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-indigo-50/70 border-indigo-500 shadow-xs ring-1 ring-indigo-500/20"
                            : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${isSelected ? "text-indigo-700" : "text-slate-800"}`}>
                            {freq.label}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{freq.sub}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Hours Input if "custom" selected */}
                {editFrequency === "custom" && (
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Custom Interval (Hours)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="720"
                        value={editCustomHours}
                        onChange={(e) => setEditCustomHours(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-32 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                        placeholder="24"
                      />
                      <span className="text-xs text-slate-500">hours (e.g. 48 = every 2 days)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Market & Category */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200/80">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">Target Market</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: "en", label: "🇺🇸 English" },
                      { id: "de", label: "🇩🇪 German" },
                      { id: "it", label: "🇮🇹 Italian" },
                      { id: "fr", label: "🇫🇷 French" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setEditLanguage(m.id as any)}
                        className={`px-2 py-1.5 rounded-lg border text-xs font-medium text-left transition-all cursor-pointer ${
                          editLanguage === m.id
                            ? "bg-indigo-50 text-indigo-700 border-indigo-400 font-semibold"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">Category</label>
                  <div className="space-y-1.5">
                    {[
                      { id: "nutra", label: "💊 Nutra & Supplements" },
                      { id: "ecom", label: "🛒 E-Commerce General" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setEditCategory(c.id as any)}
                        className={`w-full px-2 py-1.5 rounded-lg border text-xs font-medium text-left transition-all cursor-pointer ${
                          editCategory === c.id
                            ? "bg-indigo-50 text-indigo-700 border-indigo-400 font-semibold"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Store Role & Baseline */}
              <div className="pt-3 border-t border-slate-200/80">
                <Toggle
                  checked={editIsPrimary}
                  onChange={setEditIsPrimary}
                  size="sm"
                  label="This is Your Store (Primary Baseline)"
                  description="Used as the baseline store to identify missing competitor products"
                />
              </div>

              {/* Sitemap URL (Optional Edit) */}
              <div className="pt-3 border-t border-slate-200/80">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Sitemap URL <span className="font-normal text-slate-400 text-[11px]">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={editSitemapUrl}
                  onChange={(e) => setEditSitemapUrl(e.target.value)}
                  placeholder="https://example.com/sitemap.xml"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200/80">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingWebsite(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isSavingEdit}>
                  Save Changes
                </Button>
              </div>
            </form>
          )}
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
