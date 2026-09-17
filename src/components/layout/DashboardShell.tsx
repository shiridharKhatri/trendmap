"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Menu, RefreshCw, ChevronUp, ChevronDown, CheckCircle2, Globe, ExternalLink } from "lucide-react";
import { useScan } from "../providers/ScanProvider";
import Link from "next/link";
import { BrandLogo } from "../ui/BrandLogo";

interface DashboardShellProps {
  children: React.ReactNode;
  title?: string;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [ticker, setTicker] = useState(0);

  const { activeScans, hasActiveScans, isScanningAll } = useScan();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  // Update ticker every second when active scans exist to keep elapsed timers lively
  useEffect(() => {
    if (!hasActiveScans) return;
    const interval = setInterval(() => setTicker((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [hasActiveScans]);

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A] relative">
      <React.Suspense fallback={<div className="hidden md:block w-[260px] bg-white border-r border-slate-200/80" />}>
        <Sidebar
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          user={user}
        />
      </React.Suspense>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Minimal Mobile bar only (hidden on desktop) */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#E2E8F0]">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-[#64748B] hover:text-[#0F172A] p-1.5 rounded-lg hover:bg-[#F1F5F9]"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-base text-[#0F172A] flex items-center gap-2">
            <BrandLogo size={24} />
            <span>TrendMap</span>
          </span>
          <div className="w-8" />
        </div>

        <main className="flex-1 p-4 md:p-6 min-w-0">{children}</main>
      </div>

      {/* Persistent Floating Background Scan Status Pill */}
      {hasActiveScans && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full sm:w-auto animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="bg-white text-slate-900 border border-slate-200/90 rounded-xl p-3 shadow-lg ring-1 ring-slate-900/5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tracking-tight text-slate-900">
                      Scanning in Background
                    </span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-mono font-medium">
                      {activeScans.length} active
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate max-w-[210px] sm:max-w-[250px] mt-0.5">
                    {activeScans.length === 1
                      ? activeScans[0].domain
                      : `${activeScans[0]?.domain || "site"} + ${activeScans.length - 1} more`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title={isExpanded ? "Collapse scan details" : "Expand scan details"}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Expanded List Drawer */}
            {isExpanded && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {activeScans.map((scan) => {
                  const startTs = new Date(scan.startedAt).getTime();
                  const elapsed = Math.max(0, Math.floor((Date.now() - startTs) / 1000));
                  const minutes = Math.floor(elapsed / 60);
                  const seconds = elapsed % 60;
                  const timeFormatted = `${minutes > 0 ? `${minutes}m ` : ""}${seconds}s`;

                  return (
                    <div
                      key={scan.websiteId}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin shrink-0" />
                        <span className="font-medium text-slate-800 truncate">{scan.domain}</span>
                        {scan.isPrimary && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-semibold border border-slate-300">
                            Your Store
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 shrink-0">{timeFormatted}</span>
                    </div>
                  );
                })}

                <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Safe to navigate between tabs</span>
                  <Link
                    href="/dashboard/websites"
                    className="text-slate-900 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <span>View all</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

