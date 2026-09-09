"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { TrendingUp } from "lucide-react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast("Signed in successfully", "success");
        window.location.href = "/dashboard";
      } else {
        toast(data.error || "Invalid credentials", "error");
      }
    } catch {
      toast("An unexpected error occurred", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-[#FAFAF8] text-[#171717]">
      <div className="w-full max-w-sm bg-white border border-[#E5E5E5] rounded-sm p-6 shadow-xs">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 bg-[#2563EB] rounded-xl flex items-center justify-center text-white shadow-xs">
            <TrendingUp className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-[#0F172A]">
            TrendMap<span className="text-[#2563EB]">.</span>
          </span>
        </div>

        <h1 className="text-lg font-semibold text-[#0F172A]">Sign In</h1>
        <p className="text-xs text-[#64748B] mt-0.5 mb-5">
          Access your sitemap monitor & product demand platform
        </p>

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[#171717] mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs focus:outline-none focus:border-[#171717]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#171717] mb-1">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs focus:outline-none focus:border-[#171717]"
            />
          </div>

          <div className="pt-1">
            <Button type="submit" size="md" className="w-full" isLoading={loading}>
              Sign In
            </Button>
          </div>
        </form>

        <div className="mt-5 text-center text-xs text-[#737373] border-t border-[#E5E5E5] pt-4">
          Need an account?{" "}
          <Link href="/register" className="text-[#2563EB] font-medium hover:underline">
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
