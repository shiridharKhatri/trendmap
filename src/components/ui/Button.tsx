import React from "react";
import { cn } from "@/lib/utils/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 select-none border";

    const variantStyles = {
      primary: "bg-[#166534] text-white border-[#166534] hover:bg-[#14532D]",
      secondary: "bg-[#171717] text-white border-[#171717] hover:bg-[#262626]",
      outline: "bg-white text-[#171717] border-[#E5E5E5] hover:bg-[#F5F5F4] hover:border-[#D4D4D4]",
      danger: "bg-[#991B1B] text-white border-[#991B1B] hover:bg-[#7F1D1D]",
      ghost: "bg-transparent text-[#737373] border-transparent hover:bg-[#F5F5F4] hover:text-[#171717]",
    };

    const sizeStyles = {
      sm: "h-8 px-2.5 text-xs rounded-sm gap-1.5",
      md: "h-9 px-3.5 text-sm rounded-sm gap-2",
      lg: "h-10 px-4 text-sm rounded-sm gap-2",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
