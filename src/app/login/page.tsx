"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { BrandLogo } from "@/components/ui/BrandLogo";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError("");
    setEmailError("");
    setPasswordError("");

    const cleanEmail = email.trim();
    let hasErr = false;

    if (!cleanEmail) {
      setEmailError("Email is required");
      hasErr = true;
    }
    if (!password) {
      setPasswordError("Password is required");
      hasErr = true;
    }

    if (hasErr) return;

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast("Signed in successfully", "success");
        window.location.href = "/dashboard";
      } else {
        const errMsg = data.error || "Invalid credentials";
        const lower = errMsg.toLowerCase();
        if (lower.includes("email") || lower.includes("user")) {
          setEmailError(errMsg);
        } else if (lower.includes("password")) {
          setPasswordError(errMsg);
        } else {
          // If generic "Invalid email or password" or "Invalid credentials"
          setEmailError(" ");
          setPasswordError(errMsg);
        }
      }
    } catch {
      setGeneralError("An unexpected network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-[#FAFAF8] text-[#171717]">
      <div className="w-full max-w-sm bg-white border border-[#E5E5E5] rounded-sm p-6 shadow-xs">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-6">
          <BrandLogo size={34} />
          <span className="font-bold text-lg tracking-tight text-[#0F172A]">
            TrendMap
          </span>
        </div>

        <h1 className="text-lg font-semibold text-[#0F172A]">Sign In</h1>
        <p className="text-xs text-[#64748B] mt-0.5 mb-5">
          Access your sitemap monitor & product demand platform
        </p>

        {generalError && (
          <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 rounded-sm text-rose-700 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleLogin} noValidate className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[#171717] mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              className={`w-full px-3 py-2 bg-white border ${
                emailError
                  ? "border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/20"
                  : "border-[#E5E5E5] focus:border-[#171717]"
              } rounded-sm text-xs focus:outline-none transition-colors`}
            />
            {emailError && emailError.trim() && (
              <p className="text-[11px] text-rose-600 mt-1.5 font-medium flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{emailError}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block font-medium text-[#171717] mb-1">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              className={`w-full px-3 py-2 bg-white border ${
                passwordError
                  ? "border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/20"
                  : "border-[#E5E5E5] focus:border-[#171717]"
              } rounded-sm text-xs focus:outline-none transition-colors`}
            />
            {passwordError && (
              <p className="text-[11px] text-rose-600 mt-1.5 font-medium flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{passwordError}</span>
              </p>
            )}
          </div>

          <div className="pt-1">
            <Button type="submit" size="md" className="w-full" isLoading={loading}>
              Sign In
            </Button>
          </div>
        </form>

        <div className="mt-5 text-center text-xs text-[#737373] border-t border-[#E5E5E5] pt-4">
          Need an account?{" "}
          <Link href="/register" className="text-slate-900 font-semibold hover:underline">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <ToastProvider>
      <LoginForm />
    </ToastProvider>
  );
}
