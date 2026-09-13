import React from "react";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: {
    text: string;
    type: "positive" | "negative" | "neutral";
  };
  className?: string;
}

export function StatCard({ title, value, subtitle, badge, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-[#E0E2F0] rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-[#C7D2FE] transition-all",
        className
      )}
    >
      <div className="flex items-center justify-between text-xs text-[#64748B] font-semibold">
        <span className="tracking-wide uppercase text-[11px]">{title}</span>
        {badge && (
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-semibold",
              badge.type === "positive" && "text-[#166534] bg-[#DCFCE7] border border-[#BBF7D0]",
              badge.type === "negative" && "text-[#DC2626] bg-[#FEE2E2] border border-[#FECACA]",
              badge.type === "neutral" && "text-[#4F46E5] bg-[#EEF2FF] border border-[#C7D2FE]"
            )}
          >
            {badge.text}
          </span>
        )}
      </div>

      <div className="mt-3 text-2xl font-bold text-[#0F172A] tracking-tight">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>

      {subtitle && (
        <div className="mt-1 text-xs text-[#64748B] truncate font-medium">
          {subtitle}
        </div>
      )}
    </div>
  );
}
