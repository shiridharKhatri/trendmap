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
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-[#737373]">
                      Loading scan records...
                    </td>
                  </tr>
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
                <div className="p-3 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm">
                  <div className="text-[11px] text-[#737373]">Total URLs Found</div>
                  <div className="text-lg font-semibold text-[#171717] mt-1">
                    {selectedScan.totalUrls.toLocaleString()}
                  </div>
                </div>

                <div className="p-3 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm">
                  <div className="text-[11px] text-[#737373]">New URLs</div>
                  <div className="text-lg font-semibold text-[#166534] mt-1">
                    +{selectedScan.newUrls}
                  </div>
                </div>

                <div className="p-3 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm">
                  <div className="text-[11px] text-[#737373]">Removed URLs</div>
                  <div className="text-lg font-semibold text-[#991B1B] mt-1">
                    -{selectedScan.removedUrls}
                  </div>
                </div>

                <div className="p-3 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm">
                  <div className="text-[11px] text-[#737373]">Missing Baseline</div>
                  <div className="text-lg font-semibold text-[#991B1B] mt-1">
                    {selectedScan.missingFromPrimaryCount}
                  </div>
                </div>
              </div>

              {/* Error box if any */}
              {selectedScan.errorMessage && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-sm text-[#991B1B] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
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
                <div className="font-semibold text-[#171717] mb-2">
                  Processed Sitemaps & Diagnostics ({scanSitemaps.length})
                </div>
                <div className="border border-[#E5E5E5] rounded-sm overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#FAFAF8] border-b border-[#E5E5E5] text-[#737373]">
                        <th className="py-2 px-3">File URL</th>
                        <th className="py-2 px-2">Type</th>
                        <th className="py-2 px-2">Status</th>
                        <th className="py-2 px-2 text-right">URLs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E5E5]">
                      {scanSitemaps.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-[#737373]">
                            No specific sitemap files logged.
                          </td>
                        </tr>
                      ) : (
                        scanSitemaps.map((f) => (
                          <tr key={f._id} className="hover:bg-[#FAFAF8]">
                            <td className="py-2 px-3 font-mono text-[11px] truncate max-w-sm">
                              {f.url}
                            </td>
                            <td className="py-2 px-2 text-[#737373] uppercase text-[10px]">
                              {f.type}
                            </td>
                            <td className="py-2 px-2">
                              <StatusBadge status={f.status === "valid" ? "healthy" : "error"} />
                            </td>
                            <td className="py-2 px-2 text-right font-medium">
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
