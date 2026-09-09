"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { TrendingUp } from "lucide-react";

function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast("Account created successfully", "success");
        window.location.href = "/dashboard";
      } else {
        toast(data.error || "Failed to create account", "error");
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
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 bg-[#2563EB] rounded-xl flex items-center justify-center text-white shadow-xs">
            <TrendingUp className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-[#0F172A]">
            TrendMap<span className="text-[#2563EB]">.</span>
          </span>
        </div>

        <h1 className="text-lg font-semibold text-[#0F172A]">Create Account</h1>
        <p className="text-xs text-[#64748B] mt-0.5 mb-5">
          Start monitoring websites and sitemap changes
        </p>

        <form onSubmit={handleRegister} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[#171717] mb-1">Full Name</label>
            <input
              type="text"
              required
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs focus:outline-none focus:border-[#171717]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#171717] mb-1">Work Email</label>
            <input
              type="email"
              required
              placeholder="jane@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs focus:outline-none focus:border-[#171717]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#171717] mb-1">Password (min 8 characters)</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs focus:outline-none focus:border-[#171717]"
            />
          </div>

          <div className="pt-1">
            <Button type="submit" size="md" className="w-full" isLoading={loading}>
              Create Account
            </Button>
          </div>
        </form>

        <div className="mt-5 text-center text-xs text-[#737373] border-t border-[#E5E5E5] pt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-[#2563EB] font-medium hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <ToastProvider>
      <RegisterForm />
    </ToastProvider>
  );
}
