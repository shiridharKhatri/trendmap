"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  GitCompare,
  ShoppingBag,
  Settings,
  LogOut,
  X,
  TrendingUp,
  Search,
  ChevronLeft,
  ChevronRight,
  Command,
  CheckCircle2,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { cn } from "@/lib/utils/cn";

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  user?: { name: string; email: string } | null;
}

interface NavItemConfig {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

const mainNavItems: NavItemConfig[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Websites", href: "/dashboard/websites", icon: Globe },
  { name: "Comparisons", href: "/dashboard/comparisons", icon: GitCompare },
  { name: "Missing Products", href: "/dashboard/missing", icon: ShoppingBag },
  { name: "Completed", href: "/dashboard/missing?tab=completed", icon: CheckCircle2 },
];



export function Sidebar({ mobileOpen, onCloseMobile, user }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Collapsed state persisted in localStorage
  const [collapsed, setCollapsed] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Restore collapsed state on client mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("trendmap_sidebar_collapsed");
      if (stored !== null) {
        setCollapsed(stored === "true");
      }
    } catch { }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("trendmap_sidebar_collapsed", String(next));
      } catch { }
      return next;
    });
  };

  // Close profile dropdown on outside click or touch
  useEffect(() => {
    if (!isProfileOpen) return;

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [isProfileOpen]);

  // Keyboard shortcut ⌘K / Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === "Escape") {
        setIsSearchOpen(false);
        setIsProfileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  const userName = user?.name || "Admin User";
  const userEmail = user?.email || "admin@trendmap.io";
  const userInitial = userName.charAt(0).toUpperCase();

  const searchablePages = [
    { name: "Product Gap Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Websites & Schedules", href: "/dashboard/websites", icon: Globe },
    { name: "Product Comparison Matrix", href: "/dashboard/comparisons", icon: GitCompare },
    { name: "Missing Products & Content Gaps", href: "/dashboard/missing", icon: ShoppingBag },
    { name: "Account & System Settings", href: "/dashboard/settings", icon: Settings },
  ];

  const filteredSearch = searchQuery.trim()
    ? searchablePages.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
    )
    : searchablePages;

  const sidebarContent = (
    <div
      className={cn(
        "flex flex-col h-full bg-white border-r border-slate-200/80 p-4 select-none transition-all duration-200 ease-in-out shadow-xs",
        collapsed ? "w-[76px]" : "w-[260px]"
      )}
    >
      {/* 1. Header & Brand (16px top, 40px icon, 12px gap) */}
      <div className="flex items-center justify-between pb-4">
        <Link
          href="/dashboard"
          onClick={onCloseMobile}
          className={cn(
            "flex items-center group",
            collapsed ? "justify-center w-full" : "gap-3"
          )}
          title="TrendMap"
        >
          {/* Brand Logo */}
          <BrandLogo
            size={34}
            className="group-hover:scale-105 transition-transform"
          />

          {!collapsed && (
            <span className="text-[17px] font-bold tracking-tight text-slate-900 truncate">
              TrendMap
            </span>
          )}
        </Link>

        {/* Desktop Collapse Toggle */}
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden md:flex p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Mobile Close Button */}
        {mobileOpen && (
          <button
            onClick={onCloseMobile}
            className="md:hidden text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Expand Toggle when collapsed */}
      {collapsed && (
        <div className="hidden md:flex justify-center mb-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Search Bar (16px margin, ⌘K shortcut) */}
      <div className="mb-4">
        {collapsed ? (
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-500 mx-auto transition-colors cursor-pointer shadow-2xs"
            title="Search (⌘K)"
          >
            <Search className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="w-full h-10 px-3 rounded-xl bg-slate-50/80 hover:bg-white border border-slate-200/80 hover:border-slate-300 flex items-center justify-between text-xs text-slate-400 transition-all cursor-pointer shadow-2xs group"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
              <span className="font-medium text-slate-400 group-hover:text-slate-600 transition-colors">
                Search
              </span>
            </div>
            <kbd className="text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs flex items-center gap-0.5">
              <span>⌘</span>
              <span>K</span>
            </kbd>
          </button>
        )}
      </div>

      {/* 3. Navigation Sections */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-0.5">
        {/* Menu Section */}
        <div>
          {!collapsed ? (
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-3 mb-1.5">
              Menu
            </div>
          ) : (
            <div className="border-t border-slate-100 my-1" />
          )}

          <nav className="space-y-1">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const currentTab = searchParams?.get("tab");
              const isCompletedTab = item.href.includes("tab=completed");
              let isActive = false;
              if (isCompletedTab) {
                isActive = pathname === "/dashboard/missing" && currentTab === "completed";
              } else if (item.href === "/dashboard/missing") {
                isActive = pathname === "/dashboard/missing" && currentTab !== "completed";
              } else if (item.href === "/dashboard") {
                isActive = pathname === "/dashboard";
              } else {
                isActive = pathname.startsWith(item.href);
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  title={collapsed ? item.name : undefined}
                  className={cn(
                    "flex items-center h-11 rounded-xl transition-all select-none",
                    collapsed
                      ? "justify-center w-11 h-11 mx-auto"
                      : "px-3 gap-3",
                    isActive
                      ? "bg-slate-100 text-slate-900 font-semibold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50/80"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-5 h-5 shrink-0 transition-colors",
                      isActive ? "text-slate-900 font-semibold" : "text-slate-500"
                    )}
                  />
                  {!collapsed && (
                    <span className="text-xs font-medium truncate flex-1">
                      {item.name}
                    </span>
                  )}
                  {!collapsed && item.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>


      </div>

      {/* 4. Bottom User Profile & Popover Menu (Matching Spec on Right) */}
      <div className="relative pt-3 border-t border-slate-100 mt-auto" ref={profileRef}>
        {/* Profile Trigger Button */}
        <button
          type="button"
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className={cn(
            "w-full flex items-center rounded-xl transition-all cursor-pointer",
            collapsed
              ? "justify-center p-1 hover:bg-slate-100"
              : "p-2 gap-3 hover:bg-slate-50/80 border border-transparent hover:border-slate-200"
          )}
          title={userName}
        >
          {/* 40px Rounded Squircle Avatar */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
            {userInitial}
          </div>

          {!collapsed && (
            <div className="flex-1 text-left truncate min-w-0">
              <div className="font-semibold text-xs text-slate-900 truncate">
                {userName}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {userEmail}
              </div>
            </div>
          )}
        </button>

        {/* Profile Floating Menu */}
        {isProfileOpen && (
          <>
            {/* Transparent backdrop catching all clicks outside */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsProfileOpen(false)}
            />
            <div
              className={cn(
                "absolute bottom-full mb-2 bg-white border border-slate-200 rounded-2xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150 shadow-none",
                collapsed ? "left-0 w-60" : "left-0 right-0 w-full min-w-[220px]"
              )}
            >
            {/* Header with Avatar and info */}
            <div className="flex items-center gap-3 p-2.5 bg-slate-50/90 rounded-xl border border-slate-100 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {userInitial}
              </div>
              <div className="truncate min-w-0">
                <div className="font-bold text-xs text-slate-900 truncate">
                  {userName}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {userEmail}
                </div>
              </div>
            </div>

            {/* Direct Log out action */}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 h-10 rounded-xl bg-slate-100/80 hover:bg-rose-50 text-slate-700 hover:text-rose-600 font-semibold transition-colors cursor-pointer text-xs"
            >
              <LogOut className="w-4 h-4 text-slate-500 hover:text-rose-600 transition-colors shrink-0" />
              <span>Log out</span>
            </button>
          </div>
          </>
        )}
      </div>

    </div>
  );

  const searchDialog = (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
        onClick={() => setIsSearchOpen(false)}
      />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pages, settings, tools..."
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden"
          />
          <kbd className="text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        <div className="p-2 max-h-72 overflow-y-auto space-y-1">
          {filteredSearch.map((page) => {
            const Icon = page.icon;
            return (
              <button
                key={page.href}
                type="button"
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery("");
                  router.push(page.href);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 text-left text-xs text-slate-800 font-medium transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <span>{page.name}</span>
              </button>
            );
          })}
          {filteredSearch.length === 0 && (
            <div className="py-6 text-center text-xs text-slate-400">
              No pages found for &quot;{searchQuery}&quot;
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex shrink-0 h-screen sticky top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative flex flex-col z-10">{sidebarContent}</div>
        </div>
      )}

      {/* ⌘K Search Dialog mounted directly to document.body to avoid stacking context collisions */}
      {mounted && isSearchOpen && createPortal(searchDialog, document.body)}
    </>
  );
}
