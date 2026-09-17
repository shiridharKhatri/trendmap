"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { validateUserName } from "@/lib/validation/name";

function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const validateEmail = (val: string): string => {
    const trimmed = val.trim();
    if (!trimmed) return "Work email is required";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return "Please enter a valid email address";
    }
    return "";
  };

  const validatePassword = (val: string): string => {
    if (!val) return "Password is required";
    if (val.length < 8) return "Password must be at least 8 characters";
    return "";
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError("");

    const nameValidation = validateUserName(name);
    const nErr = nameValidation.valid ? "" : (nameValidation.error || "Invalid name");
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);

    setNameError(nErr);
    setEmailError(eErr);
    setPasswordError(pErr);

    if (nErr || eErr || pErr) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast("Account created successfully", "success");
        window.location.href = "/dashboard";
      } else {
        if (data.errors && typeof data.errors === "object") {
          // Display all field errors returned by the server simultaneously
          if (data.errors.name) setNameError(data.errors.name);
          if (data.errors.email) setEmailError(data.errors.email);
          if (data.errors.password) setPasswordError(data.errors.password);
        } else {
          const errMsg = data.error || "Failed to create account";
          const lower = errMsg.toLowerCase();
          let matched = false;
          if (lower.includes("name")) {
            setNameError(errMsg);
            matched = true;
          }
          if (lower.includes("email") || lower.includes("user")) {
            setEmailError(errMsg);
            matched = true;
          }
          if (lower.includes("password")) {
            setPasswordError(errMsg);
            matched = true;
          }
          if (!matched) {
            setGeneralError(errMsg);
          }
        }
      }
    } catch {
      setGeneralError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-[#FAFAF8] text-[#171717]">
      <div className="w-full max-w-sm bg-white border border-[#E5E5E5] rounded-sm p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-6">
          <BrandLogo size={34} />
          <span className="font-bold text-lg tracking-tight text-[#0F172A]">
            TrendMap
          </span>
        </div>

        <h1 className="text-lg font-semibold text-[#0F172A]">Create Account</h1>
        <p className="text-xs text-[#64748B] mt-0.5 mb-5">
          Start monitoring websites and sitemap changes
        </p>

        {generalError && (
          <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 rounded-sm text-rose-700 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleRegister} noValidate className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[#171717] mb-1">Full Name</label>
            <input
              type="text"
              required
              placeholder="Lycoris"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) {
                  const res = validateUserName(e.target.value);
                  setNameError(res.valid ? "" : (res.error || ""));
                }
              }}
              onBlur={() => {
                if (name.trim()) {
                  const res = validateUserName(name);
                  setNameError(res.valid ? "" : (res.error || ""));
                }
              }}
              className={`w-full px-3 py-2 bg-white border ${
                nameError
                  ? "border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/20"
                  : "border-[#E5E5E5] focus:border-[#171717]"
              } rounded-sm text-xs focus:outline-none transition-colors`}
            />
            {nameError && (
              <p className="text-[11px] text-rose-600 mt-1.5 font-medium flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{nameError}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block font-medium text-[#171717] mb-1">Work Email</label>
            <input
              type="email"
              required
              placeholder="lycoris@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              onBlur={() => {
                if (email.trim()) {
                  setEmailError(validateEmail(email));
                }
              }}
              className={`w-full px-3 py-2 bg-white border ${
                emailError
                  ? "border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/20"
                  : "border-[#E5E5E5] focus:border-[#171717]"
              } rounded-sm text-xs focus:outline-none transition-colors`}
            />
            {emailError && (
              <p className="text-[11px] text-rose-600 mt-1.5 font-medium flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{emailError}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block font-medium text-[#171717] mb-1">Password (min 8 characters)</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              onBlur={() => {
                if (password) {
                  setPasswordError(validatePassword(password));
                }
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
              Create Account
            </Button>
          </div>
        </form>

        <div className="mt-5 text-center text-xs text-[#737373] border-t border-[#E5E5E5] pt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-slate-900 font-semibold hover:underline">
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
