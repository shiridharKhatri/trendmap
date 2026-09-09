"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Menu } from "lucide-react";

interface DashboardShellProps {
  children: React.ReactNode;
  title?: string;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);

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

  return (
    <div className="min-h-screen flex bg-[#F5F6F8] text-[#0F172A]">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        user={user}
      />

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
          <span className="font-bold text-base text-[#0F172A] flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-lg bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold">T</span>
            <span>TrendMap<span className="text-[#2563EB]">.</span></span>
          </span>
          <div className="w-8" />
        </div>

        <main className="flex-1 p-4 md:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}
