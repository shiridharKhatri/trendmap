import React from "react";
import { cn } from "@/lib/utils/cn";
import { type WebsiteStatus, type ScanStatus, type PageChangeType } from "@/types";

interface StatusBadgeProps {
  status?: WebsiteStatus | ScanStatus | PageChangeType | string;
  className?: string;
  title?: string;
}

export function StatusBadge({ status = "scheduled", className, title }: StatusBadgeProps) {
  let label = String(status);
  let colorStyles = "bg-[#F5F5F4] text-[#57534E] border-[#E7E5E4]";
  let dotColor = "bg-[#78716C]";

  switch (status) {
    case "healthy":
    case "completed":
    case "added":
      label = status === "added" ? "Added" : status === "completed" ? "Completed" : "Healthy";
      colorStyles = "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]";
      dotColor = "bg-[#166534]";
      break;

    case "scanning":
    case "running":
      label = "Scanning";
      colorStyles = "bg-[#F5F5F4] text-[#171717] border-[#D4D4D4]";
      dotColor = "bg-[#166534] animate-pulse";
      break;

    case "scheduled":
    case "queued":
      label = status === "queued" ? "Queued" : "Scheduled";
      colorStyles = "bg-[#F5F5F4] text-[#57534E] border-[#E5E5E5]";
      dotColor = "bg-[#A8A29E]";
      break;

    case "warning":
    case "changed":
      label = status === "changed" ? "Changed" : "Warning";
      colorStyles = "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]";
      dotColor = "bg-[#D97706]";
      break;

    case "error":
    case "failed":
    case "removed":
      label = status === "removed" ? "Removed" : status === "failed" ? "Failed" : "Error";
      colorStyles = "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]";
      dotColor = "bg-[#DC2626]";
      break;

    case "missing_from_primary":
      label = "Missing";
      colorStyles = "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]";
      dotColor = "bg-[#DC2626]";
      break;

    case "disabled":
    case "paused":
      label = "Paused";
      colorStyles = "bg-[#F5F5F4] text-[#78716C] border-[#E5E5E5]";
      dotColor = "bg-[#A8A29E]";
      break;
  }

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-medium border",
        colorStyles,
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
      {label}
    </span>
  );
}
