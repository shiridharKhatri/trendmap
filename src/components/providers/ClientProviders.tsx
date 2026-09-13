"use client";

import React from "react";
import { ToastProvider } from "../ui/Toast";
import { ScanProvider } from "./ScanProvider";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ScanProvider>{children}</ScanProvider>
    </ToastProvider>
  );
}

