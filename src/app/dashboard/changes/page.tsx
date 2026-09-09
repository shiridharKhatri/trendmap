"use client";

import React, { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { type IPageChange, type IWebsite } from "@/types";
import {
  History,
  Download,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
} from "lucide-react";

export default function ChangesPage() {
  const [changes, setChanges] = useState<IPageChange[]>([]);
  const [websites, setWebsites] = useState<IWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all"); // all, added, removed, changed
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string>("");
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

  const { toast } = useToast();

  const fetchChanges = async (signal?: AbortSignal) => {
    try {
      let url = `/api/changes?page=${page}&limit=25`;
      if (typeFilter !== "all") url += `&type=${typeFilter}`;
      if (selectedWebsiteId) url += `&websiteId=${selectedWebsiteId}`;
      if (debouncedSearch.trim()) url += `&search=${encodeURIComponent(debouncedSearch.trim())}`;

      const res = await fetch(url, { signal });
      if (res.ok) {
        const json = await res.json();
        setChanges(json.changes || []);
        setTotal(json.total || 0);
        setWebsites(json.websites || []);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast("Failed to load changes feed", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchChanges(controller.signal);
    return () => controller.abort();
  }, [typeFilter, selectedWebsiteId, debouncedSearch, page]);

  const handleExportCsv = () => {
    let url = "/api/export?type=changes";
    if (selectedWebsiteId) url += `&websiteId=${selectedWebsiteId}`;
    window.location.href = url;
  };

  return (
    <DashboardShell title="Changes">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E5E5] pb-4">
          <div>
            <h1 className="text-xl font-semibold text-[#171717]">URL Changes & Evolution</h1>
            <p className="text-xs text-[#737373] mt-0.5">
              Live audit feed of URLs added, removed, or modified across sitemaps
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-[#E5E5E5] rounded-sm p-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Type selector */}
            <div className="flex items-center border border-[#E5E5E5] rounded-sm overflow-hidden text-xs">
              {[
                { id: "all", label: "All Changes" },
                { id: "added", label: "New URLs" },
                { id: "removed", label: "Removed" },
                { id: "changed", label: "Modified" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTypeFilter(t.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    typeFilter === t.id
                      ? "bg-[#171717] text-white"
                      : "bg-white text-[#737373] hover:text-[#171717]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Website Filter */}
            <select
              value={selectedWebsiteId}
              onChange={(e) => {
                setSelectedWebsiteId(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
            >
              <option value="">All Monitored Websites</option>
              {websites.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.domain} ({w.name})
                </option>
              ))}
            </select>

            <Button variant="outline" size="sm" onClick={() => fetchChanges()}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>

          {/* Search */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#737373]" />
            <input
              type="text"
              placeholder="Search changed URLs..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm text-xs focus:outline-none focus:border-[#171717]"
            />
          </div>
        </div>

        {/* Changes Feed Table */}
        <div className="bg-white border border-[#E5E5E5] rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#171717]">
              <thead>
                <tr className="bg-[#FAFAF8] border-b border-[#E5E5E5] text-[#737373] font-medium">
                  <th className="py-2.5 px-4">Change Type</th>
                  <th className="py-2.5 px-3">URL</th>
                  <th className="py-2.5 px-3">Website</th>
                  <th className="py-2.5 px-3">Detected At</th>
                  <th className="py-2.5 px-3">Lastmod Details</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#737373]">
                      Loading changes feed...
                    </td>
                  </tr>
                ) : changes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#737373]">
                      No changes detected matching the current criteria.
                    </td>
                  </tr>
                ) : (
                  changes.map((c) => (
                    <tr key={c._id} className="hover:bg-[#FAFAF8] transition-colors">
                      <td className="py-2.5 px-4">
                        {c.type === "added" && (
                          <span className="px-1.5 py-0.5 bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] rounded-sm text-[10px] font-medium">
                            NEW
                          </span>
                        )}
                        {c.type === "removed" && (
                          <span className="px-1.5 py-0.5 bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA] rounded-sm text-[10px] font-medium">
                            REMOVED
                          </span>
                        )}
                        {c.type === "changed" && (
                          <span className="px-1.5 py-0.5 bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] rounded-sm text-[10px] font-medium">
                            MODIFIED
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#171717]">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center gap-1"
                        >
                          <span
                            className={`truncate max-w-xl ${
                              c.type === "removed" ? "line-through text-[#737373]" : ""
                            }`}
                          >
                            {c.normalizedUrl}
                          </span>
                          <ExternalLink className="w-2.5 h-2.5 text-[#737373]" />
                        </a>
                      </td>

                      <td className="py-2.5 px-3 font-medium text-[#171717]">
                        {c.websiteDomain}
                      </td>

                      <td className="py-2.5 px-3 text-[#737373] text-[11px]">
                        {new Date(c.detectedAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      <td className="py-2.5 px-3 text-[#737373] text-[11px]">
                        {c.currentLastmod ? (
                          <span>{new Date(c.currentLastmod).toLocaleDateString()}</span>
                        ) : (
                          "-"
                        )}
                      </td>

                      <td className="py-2.5 px-4 text-right">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#166534] hover:underline"
                        >
                          <span>Open</span>
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
            totalItems={total}
            onPageChange={setPage}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
