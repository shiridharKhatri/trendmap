"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "../ui/Toast";

export interface ActiveScanItem {
  websiteId: string;
  domain: string;
  name?: string;
  isPrimary?: boolean;
  startedAt: string | Date;
  elapsedSeconds?: number;
}

interface ScanContextValue {
  activeScans: ActiveScanItem[];
  hasActiveScans: boolean;
  isScanningAll: boolean;
  isScanning: (websiteId: string) => boolean;
  triggerScan: (websiteId: string, domain?: string, force?: boolean) => Promise<boolean>;
  triggerScanAll: () => Promise<boolean>;
  refreshActiveScans: () => Promise<void>;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [activeScans, setActiveScans] = useState<ActiveScanItem[]>([]);
  const [isScanningAll, setIsScanningAll] = useState(false);
  const { toast } = useToast();

  // Track previous active scan IDs to detect when a scan finishes
  const prevActiveRef = useRef<Map<string, ActiveScanItem>>(new Map());
  const isScanningAllRef = useRef(false);
  isScanningAllRef.current = isScanningAll;

  // Query server for actively running scans
  const refreshActiveScans = useCallback(async () => {
    try {
      const res = await fetch("/api/scans/active", { cache: "no-store" });
      if (!res.ok) return;

      const data = await res.json();
      const currentList: ActiveScanItem[] = data.activeScans || [];

      // Check which previously active scans have finished
      const currentMap = new Map(currentList.map((item) => [item.websiteId, item]));

      prevActiveRef.current.forEach((prevItem, prevId) => {
        if (!currentMap.has(prevId)) {
          // This scan finished in the background!
          toast(`Scan completed for ${prevItem.domain || "website"}! Updated catalog & gaps.`, "success");

          // Dispatch event for any active page to refresh its tables/stats silently
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("trendmap:scan-completed", {
                detail: {
                  websiteId: prevId,
                  domain: prevItem.domain,
                  isPrimary: prevItem.isPrimary,
                },
              })
            );
          }
        }
      });

      // If batch scan was in progress and now no scans are active, finish batch state
      if (isScanningAllRef.current && currentList.length === 0) {
        setIsScanningAll(false);
        toast("All background website scans completed successfully!", "success");
      }

      prevActiveRef.current = currentMap;
      setActiveScans(currentList);
    } catch {
      // Background poll failure; silent retry next interval
    }
  }, [toast]);

  // Dynamic polling: frequent (3s) when scans are active, relaxed (15s) when idle
  useEffect(() => {
    // Initial fetch on mount
    refreshActiveScans();

    const intervalMs = activeScans.length > 0 || isScanningAll ? 3000 : 15000;
    const interval = setInterval(() => {
      refreshActiveScans();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [activeScans.length, isScanningAll, refreshActiveScans]);

  // Helper: check if a specific website is actively scanning
  const isScanning = useCallback(
    (websiteId: string) => {
      return activeScans.some((s) => s.websiteId === websiteId);
    },
    [activeScans]
  );

  // Trigger background scan for a single site
  const triggerScan = useCallback(
    async (websiteId: string, domain?: string, force = false): Promise<boolean> => {
      // Optimistically add to active scans immediately
      const optimisticItem: ActiveScanItem = {
        websiteId,
        domain: domain || "website",
        startedAt: new Date(),
        elapsedSeconds: 0,
      };

      setActiveScans((prev) => {
        if (prev.some((s) => s.websiteId === websiteId)) return prev;
        return [...prev, optimisticItem];
      });
      prevActiveRef.current.set(websiteId, optimisticItem);

      toast(
        force
          ? `Force scan started for ${domain || "website"} (runs in background)...`
          : `Scan started in background for ${domain || "website"}...`,
        "info"
      );

      try {
        const url = force ? `/api/websites/${websiteId}/scan?force=true` : `/api/websites/${websiteId}/scan`;
        const res = await fetch(url, { method: "POST" });
        const data = await res.json();

        if (!res.ok && res.status !== 202) {
          // If rejected (e.g. 409 or 404), revert optimistic state
          setActiveScans((prev) => prev.filter((s) => s.websiteId !== websiteId));
          prevActiveRef.current.delete(websiteId);
          toast(data.error || "Failed to start scan", "error");
          return false;
        }

        // Fast refresh to sync with server's locked record
        refreshActiveScans();
        return true;
      } catch (err: any) {
        setActiveScans((prev) => prev.filter((s) => s.websiteId !== websiteId));
        prevActiveRef.current.delete(websiteId);
        toast("Failed to initiate scan", "error");
        return false;
      }
    },
    [refreshActiveScans, toast]
  );

  // Trigger batch scan across all user websites
  const triggerScanAll = useCallback(async (): Promise<boolean> => {
    setIsScanningAll(true);
    toast("Checking all sites in background. You can safely switch tabs.", "info");

    try {
      const res = await fetch("/api/websites/scan-all", { method: "POST" });
      const data = await res.json();

      if (!res.ok && res.status !== 202) {
        setIsScanningAll(false);
        toast(data.error || "Failed to trigger scan-all", "error");
        return false;
      }

      if (data.websites && Array.isArray(data.websites)) {
        const batchItems: ActiveScanItem[] = data.websites.map((w: any) => ({
          websiteId: w.websiteId,
          domain: w.domain,
          name: w.name,
          isPrimary: w.isPrimary,
          startedAt: new Date(),
          elapsedSeconds: 0,
        }));
        setActiveScans(batchItems);
        batchItems.forEach((item) => prevActiveRef.current.set(item.websiteId, item));
      }

      refreshActiveScans();
      return true;
    } catch {
      setIsScanningAll(false);
      toast("Error initiating batch scan", "error");
      return false;
    }
  }, [refreshActiveScans, toast]);

  const value: ScanContextValue = {
    activeScans,
    hasActiveScans: activeScans.length > 0 || isScanningAll,
    isScanningAll,
    isScanning,
    triggerScan,
    triggerScanAll,
    refreshActiveScans,
  };

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan(): ScanContextValue {
  const context = useContext(ScanContext);
  if (!context) {
    throw new Error("useScan must be used within a ScanProvider");
  }
  return context;
}
