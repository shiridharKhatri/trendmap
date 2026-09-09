"use client";

import React from "react";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  size?: "sm" | "md";
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = "md",
  className = "",
}: ToggleProps) {
  const isSm = size === "sm";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-3 select-none ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        className={`relative inline-flex flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 ${
          isSm ? "h-5 w-9" : "h-6 w-11"
        } ${checked ? "bg-[#2563EB]" : "bg-[#CBD5E1]"}`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
            isSm ? "h-4 w-4 mt-0.5 ml-0.5" : "h-5 w-5 mt-0.5 ml-0.5"
          } ${
            checked
              ? isSm
                ? "translate-x-4"
                : "translate-x-5"
              : "translate-x-0"
          }`}
        />
      </button>

      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span
              className={`font-medium text-[#0F172A] ${
                isSm ? "text-xs" : "text-sm"
              }`}
            >
              {label}
            </span>
          )}
          {description && (
            <span className="text-xs text-[#64748B] mt-0.5">
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
