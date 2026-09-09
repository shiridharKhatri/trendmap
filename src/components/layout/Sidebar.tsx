"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  GitCompare,
  History,
  FileWarning,
  Layers,
  Settings,
  LogOut,
  X,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  user?: { name: string; email: string } | null;
}

const navItems = [
  { name: "Product Gap Tracker", href: "/dashboard", icon: LayoutDashboard },
  { name: "Websites & Schedules", href: "/dashboard/websites", icon: Globe },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar({ mobileOpen, onCloseMobile, user }: SidebarProps) {
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#FFFFFF] border-r border-[#E2E8F0] w-64 p-5 select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between pb-6 pt-1">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-[#2563EB] flex items-center justify-center text-white shadow-xs group-hover:bg-[#1D4ED8] transition-colors">
            <TrendingUp className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#0F172A]">
            TrendMap<span className="text-[#2563EB]">.</span>
          </span>
        </Link>
        {mobileOpen && (
          <button
            onClick={onCloseMobile}
            className="md:hidden text-[#64748B] hover:text-[#0F172A] p-1.5 rounded-lg hover:bg-[#F1F5F9]"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Navigation Links */}
      <nav className="space-y-1.5 flex-1">
        <Link
          href="/dashboard"
          onClick={onCloseMobile}
          className={cn(
            "flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all",
            pathname === "/dashboard"
              ? "bg-[#2563EB] text-white shadow-sm font-semibold"
              : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
          )}
        >
          <LayoutDashboard className={cn("w-4 h-4", pathname === "/dashboard" ? "text-white" : "text-[#64748B]")} />
          <span>Dashboard</span>
        </Link>

        <Link
          href="/dashboard/websites"
          onClick={onCloseMobile}
          className={cn(
            "flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all",
            pathname.startsWith("/dashboard/websites")
              ? "bg-[#2563EB] text-white shadow-sm font-semibold"
              : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
          )}
        >
          <Globe className={cn("w-4 h-4", pathname.startsWith("/dashboard/websites") ? "text-white" : "text-[#64748B]")} />
          <span>Websites & Setup</span>
        </Link>

        <Link
          href="/dashboard/comparisons"
          onClick={onCloseMobile}
          className={cn(
            "flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all",
            pathname.startsWith("/dashboard/comparisons")
              ? "bg-[#2563EB] text-white shadow-sm font-semibold"
              : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
          )}
        >
          <GitCompare className={cn("w-4 h-4", pathname.startsWith("/dashboard/comparisons") ? "text-white" : "text-[#64748B]")} />
          <span>Full Comparison</span>
        </Link>

        {/* Monitored Competitors Section (Like 'Projects' in Mondays) */}
        <div className="pt-6 pb-2">
          <div className="flex items-center justify-between px-2 text-xs font-semibold text-[#0F172A] tracking-wider uppercase">
            <span>Competitors</span>
            <Link
              href="/dashboard/websites"
              className="text-[#64748B] hover:text-[#2563EB] p-0.5 rounded hover:bg-[#F1F5F9]"
              title="Add Competitor"
            >
              +
            </Link>
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex items-center gap-3 px-3 py-2 text-xs text-[#334155] rounded-lg hover:bg-[#F8FAFC] cursor-pointer">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#F472B6] shrink-0" />
              <span className="truncate font-medium">inmybowl.com</span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2 text-xs text-[#334155] rounded-lg hover:bg-[#F8FAFC] cursor-pointer">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#4ADE80] shrink-0" />
              <span className="truncate font-medium">thebuyersreviews</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Bottom Section: Settings & Help */}
      <div className="pt-4 border-t border-[#E2E8F0] space-y-1">
        <Link
          href="/dashboard/settings"
          onClick={onCloseMobile}
          className={cn(
            "flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all",
            pathname === "/dashboard/settings"
              ? "bg-[#2563EB] text-white font-semibold"
              : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
          )}
        >
          <Settings className="w-4 h-4 text-[#64748B]" />
          <span>Settings</span>
        </Link>

        {/* User profile info & sign out */}
        <div className="pt-3 flex items-center justify-between px-2 text-xs">
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-7 h-7 rounded-full bg-[#E2E8F0] flex items-center justify-center text-xs font-bold text-[#334155] uppercase shrink-0">
              {user?.name ? user.name.charAt(0) : "A"}
            </div>
            <div className="truncate">
              <div className="font-semibold text-[#0F172A] truncate text-[11px]">{user?.name || "Admin"}</div>
              <div className="text-[#94A3B8] text-[10px] truncate">{user?.email || "admin@trendmap.io"}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-[#94A3B8] hover:text-[#DC2626] p-1.5 rounded-lg hover:bg-[#FEE2E2] transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex shrink-0 h-screen sticky top-0 z-30">
        {navContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/40" onClick={onCloseMobile} aria-hidden="true" />
          <div className="relative flex flex-col z-10">{navContent}</div>
        </div>
      )}
    </>
  );
}
