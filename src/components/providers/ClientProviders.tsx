"use client";

import React from "react";
import { ToastProvider } from "../ui/Toast";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
