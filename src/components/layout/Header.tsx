"use client";

import React, { useState, useEffect, useRef } from "react";
import { Menu, Bell, Check, Search, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { type INotification } from "@/types";

interface HeaderProps {
  onOpenMobileMenu: () => void;
  title?: string;
}

export function Header({ onOpenMobileMenu, title }: HeaderProps) {
  const [notifications, setNotifications] = useState<INotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // Ignored
    }
  };

  return (
    <header className="h-16 bg-[#F5F6F8] px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden text-[#64748B] hover:text-[#0F172A] p-1.5 rounded-lg hover:bg-white"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search with Command Shortcut Chip (Mondays style) */}
        <div className="relative w-full max-w-md hidden sm:block">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Search or type a command"
            className="w-full pl-10 pr-12 py-2 bg-white border border-[#E2E8F0] rounded-xl text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] shadow-2xs transition-all"
          />
          <div className="absolute right-2.5 top-2 px-1.5 py-0.5 bg-[#F1F5F9] border border-[#E2E8F0] rounded text-[10px] font-semibold text-[#64748B] font-mono">
            ⌘ F
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3.5">
        {/* Blue Action Button with Split Arrow (Mondays style) */}
        <div className="inline-flex items-center shadow-xs rounded-xl overflow-hidden bg-[#2563EB]">
          <button
            onClick={() => {
              const btn = document.getElementById("check-all-btn");
              if (btn) btn.click();
              else window.location.href = "/dashboard";
            }}
            className="px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Check All Sites</span>
          </button>
          <div className="w-[1px] h-4 bg-white/20" />
          <button
            onClick={() => {
              window.location.href = "/dashboard/websites";
            }}
            className="px-2 py-2 text-white hover:bg-[#1D4ED8] transition-colors"
            title="Manage Sites"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Notifications Bell with Pink Pip */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-white rounded-xl border border-transparent hover:border-[#E2E8F0] transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#F472B6] rounded-full ring-2 ring-[#F5F6F8]" />
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-[#E2E8F0] rounded-2xl shadow-lg py-2 z-50 text-xs">
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#E2E8F0]">
                <span className="font-semibold text-[#0F172A]">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-[11px] text-[#2563EB] hover:underline flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-[#E2E8F0]">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-[#94A3B8]">No notifications</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n._id}
                      className={cn(
                        "p-3 text-xs transition-colors hover:bg-[#F8FAFC]",
                        !n.isRead && "bg-[#EFF6FF]"
                      )}
                    >
                      <div className="font-medium text-[#0F172A]">{n.title}</div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">{n.message}</div>
                      <div className="text-[10px] text-[#94A3B8] mt-1 font-mono">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar (Mondays style) */}
        <div className="w-8 h-8 rounded-full bg-[#E2E8F0] border-2 border-white shadow-2xs overflow-hidden flex items-center justify-center text-xs font-bold text-[#334155] cursor-pointer hover:ring-2 hover:ring-[#2563EB] transition-all">
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=faces"
            alt="Admin"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
      </div>
    </header>
  );
}
