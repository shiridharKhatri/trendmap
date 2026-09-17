"use client";

import React, { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { type IScan, type ISitemap } from "@/types";
import { Layers, Download, RefreshCw, Eye, AlertCircle } from "lucide-react";

interface EnrichedScan extends IScan {
  websiteName?: string;
  websiteDomain?: string;
}

export default function ScansPage() {
  const [scans, setScans] = useState<EnrichedScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Drilldown Modal
  const [selectedScan, setSelectedScan] = useState<EnrichedScan | null>(null);
  const [scanSitemaps, setScanSitemaps] = useState<ISitemap[]>([]);
  const [isModalLoading, setIsModalLoading] = useState(false);

  const { toast } = useToast();

  const fetchScans = async () => {
    try {
      // Fetch dashboard data or recent scans list
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        const json = await res.json();
        setScans(json.recentScans || []);
        setTotal((json.recentScans || []).length);
      }
    } catch {
      toast("Failed to load scans", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScans();
  }, [page]);

  // Listen for background scan completions to auto-refresh scan audit logs
  useEffect(() => {
    const handleScanDone = () => {
      fetchScans();
    };
    window.addEventListener("trendmap:scan-completed", handleScanDone);
    return () => window.removeEventListener("trendmap:scan-completed", handleScanDone);
  }, []);

  const handleOpenScanDetails = async (scan: EnrichedScan) => {
    setSelectedScan(scan);
    setIsModalLoading(true);
    try {
      const res = await fetch(`/api/scans/${scan._id}`);
      if (res.ok) {
        const json = await res.json();
        setScanSitemaps(json.sitemaps || []);
      }
    } catch {
      toast("Failed to load scan details", "error");
    } finally {
      setIsModalLoading(false);
    }
  };

  const handleExportCsv = () => {
    window.location.href = "/api/export?type=scans";
  };

  return (
    <DashboardShell title="Scans">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E5E5] pb-4">
          <div>
            <h1 className="text-xl font-semibold text-[#171717]">Scan History & Audit</h1>
            <p className="text-xs text-[#737373] mt-0.5">
              Historical logs of all automatic scheduled and manual sitemap scans
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchScans}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Scans Table */}
        <div className="bg-white border border-[#E5E5E5] rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#171717]">
              <thead>
                <tr className="bg-[#FAFAF8] border-b border-[#E5E5E5] text-[#737373] font-medium">
                  <th className="py-2.5 px-4">Date & Time</th>
                  <th className="py-2.5 px-3">Target Website</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3 text-right">URLs Found</th>
                  <th className="py-2.5 px-3 text-right">New</th>
                  <th className="py-2.5 px-3 text-right">Removed</th>
                  <th className="py-2.5 px-3 text-right">Missing Baseline</th>
                  <th className="py-2.5 px-3">Errors</th>
                  <th className="py-2.5 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={`scan-skel-${i}`} className="animate-pulse">
                      <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-28" /></td>
                      <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded w-32" /></td>
                      <td className="py-3 px-3"><div className="h-5 bg-slate-200 rounded-full w-16" /></td>
                      <td className="py-3 px-3 text-right"><div className="h-4 bg-slate-100 rounded w-12 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><div className="h-4 bg-slate-200 rounded w-10 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><div className="h-4 bg-slate-100 rounded w-8 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><div className="h-4 bg-slate-100 rounded w-8 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><div className="h-4 bg-slate-100 rounded w-8 ml-auto" /></td>
                      <td className="py-3 px-3"><div className="h-4 bg-slate-100 rounded w-6" /></td>
                      <td className="py-3 px-4 text-right"><div className="h-6 bg-slate-100 rounded w-14 ml-auto" /></td>
                    </tr>
                  ))
                ) : scans.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-[#737373]">
                      No scans executed yet.
                    </td>
                  </tr>
                ) : (
                  scans.map((s) => (
                    <tr key={s._id} className="hover:bg-[#FAFAF8] transition-colors">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-[#171717]">
                        {new Date(s.createdAt).toLocaleString()}
                      </td>

                      <td className="py-2.5 px-3 font-medium text-[#171717]">
                        {s.websiteDomain || "Website"}
                      </td>

                      <td className="py-2.5 px-3">
                        <StatusBadge status={s.status} />
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-[#737373]">
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
                        {s.missingFromPrimaryCount || 0}
                      </td>

                      <td className="py-2.5 px-3 text-[#737373]">
                        {s.errorCount > 0 ? (
                          <span className="text-[#991B1B] font-medium">{s.errorCount}</span>
                        ) : (
                          "0"
                        )}
                      </td>

                      <td className="py-2.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenScanDetails(s)}
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scan Inspection Modal */}
        <Modal
          isOpen={!!selectedScan}
          onClose={() => setSelectedScan(null)}
          title={`Scan Summary: ${selectedScan?.websiteDomain}`}
          description={`Executed on ${
            selectedScan?.createdAt ? new Date(selectedScan.createdAt).toLocaleString() : ""
          }`}
          maxWidth="lg"
        >
          {selectedScan && (
            <div className="space-y-4 text-xs">
              {/* Stat grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-[#E0E2F0] rounded-xl shadow-xs">
                  <div className="text-[11px] text-slate-500 font-medium">Total URLs Found</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">
                    {selectedScan.totalUrls.toLocaleString()}
                  </div>
                </div>

                <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl shadow-xs">
                  <div className="text-[11px] text-emerald-700 font-medium">New URLs</div>
                  <div className="text-lg font-bold text-emerald-700 mt-1">
                    +{selectedScan.newUrls}
                  </div>
                </div>

                <div className="p-3 bg-rose-50/60 border border-rose-200/80 rounded-xl shadow-xs">
                  <div className="text-[11px] text-rose-700 font-medium">Removed URLs</div>
                  <div className="text-lg font-bold text-rose-700 mt-1">
                    -{selectedScan.removedUrls}
                  </div>
                </div>

                <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl shadow-xs">
                  <div className="text-[11px] text-amber-700 font-medium">Missing Baseline</div>
                  <div className="text-lg font-bold text-amber-800 mt-1">
                    {selectedScan.missingFromPrimaryCount}
                  </div>
                </div>
              </div>

              {/* Error box if any */}
              {selectedScan.errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <div className="font-semibold">Scan Error Details:</div>
                    <div className="mt-0.5 font-mono text-[11px] break-all">
                      {selectedScan.errorMessage}
                    </div>
                  </div>
                </div>
              )}

              {/* Processed Sitemaps */}
              <div>
                <div className="font-semibold text-slate-800 mb-2">
                  Processed Sitemaps & Diagnostics ({scanSitemaps.length})
                </div>
                <div className="border border-[#E0E2F0] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-[#E0E2F0] text-slate-500 font-medium">
                        <th className="py-2.5 px-3">File URL</th>
                        <th className="py-2.5 px-2">Type</th>
                        <th className="py-2.5 px-2">Status</th>
                        <th className="py-2.5 px-3 text-right">URLs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E0E2F0]">
                      {scanSitemaps.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-500">
                            No specific sitemap files logged.
                          </td>
                        </tr>
                      ) : (
                        scanSitemaps.map((f) => (
                          <tr key={f._id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-[11px] truncate max-w-sm text-slate-700">
                              {f.url}
                            </td>
                            <td className="py-2.5 px-2 text-slate-500 uppercase text-[10px] font-semibold">
                              {f.type}
                            </td>
                            <td className="py-2.5 px-2">
                              <StatusBadge status={f.status === "valid" ? "healthy" : "error"} />
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                              {f.urlCount.toLocaleString()}
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
        </Modal>
      </div>
    </DashboardShell>
  );
}
