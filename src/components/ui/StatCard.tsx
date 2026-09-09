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
        "bg-white border border-[#E5E5E5] rounded-sm p-4 flex flex-col justify-between",
        className
      )}
    >
      <div className="flex items-center justify-between text-xs text-[#737373] font-medium">
        <span>{title}</span>
        {badge && (
          <span
            className={cn(
              "px-1.5 py-0.2 rounded-sm text-[11px] font-mono",
              badge.type === "positive" && "text-[#166534] bg-[#F0FDF4]",
              badge.type === "negative" && "text-[#991B1B] bg-[#FEF2F2]",
              badge.type === "neutral" && "text-[#57534E] bg-[#F5F5F4]"
            )}
          >
            {badge.text}
          </span>
        )}
      </div>

      <div className="mt-2 text-2xl font-semibold text-[#171717] tracking-tight">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>

      {subtitle && (
        <div className="mt-1 text-xs text-[#737373] truncate">
          {subtitle}
        </div>
      )}
    </div>
  );
}
