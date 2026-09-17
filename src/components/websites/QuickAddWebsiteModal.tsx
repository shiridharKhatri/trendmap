"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useScan } from "@/components/providers/ScanProvider";
import { invalidateClientCache } from "@/lib/client/cache";
import { Globe, ShieldCheck, Swords } from "lucide-react";

interface QuickAddWebsiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultIsPrimary?: boolean;
}

export function QuickAddWebsiteModal({
  isOpen,
  onClose,
  onSuccess,
  defaultIsPrimary = false,
}: QuickAddWebsiteModalProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [urlError, setUrlError] = useState("");
  const [isPrimary, setIsPrimary] = useState(defaultIsPrimary);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { registerActiveScan } = useScan();

  // Keep isPrimary in sync when opened specifically for baseline vs competitor
  React.useEffect(() => {
    setIsPrimary(defaultIsPrimary);
  }, [defaultIsPrimary, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setUrlError("");

    if (!url.trim()) {
      setUrlError("Please enter a website address");
      return;
    }

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = `https://${cleanUrl}`;
    }

    // Auto-generate name from domain if empty
    let domainName = name.trim();
    if (!domainName) {
      try {
        const parsed = new URL(cleanUrl);
        domainName = parsed.hostname.replace(/^www\./, "");
      } catch {
        domainName = cleanUrl;
      }
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: domainName,
          url: cleanUrl,
          isPrimary,
          scanFrequency: "24h", // default to daily scan
          crawlScope: "products", // default to automatic product sitemap detection
        }),
      });

      const json = await res.json();

      if (res.ok) {
        toast(
          isPrimary
            ? `Added "${domainName}" to Your Stores! Background scan started.`
            : `Added "${domainName}" to Competitor Sites! Background scan started.`,
          "success"
        );
        invalidateClientCache();
        if (json.website?._id) {
          registerActiveScan({
            websiteId: json.website._id,
            domain: json.website.domain,
            name: json.website.name,
            isPrimary: json.website.isPrimary,
          });
        }
        setUrl("");
        setName("");
        setUrlError("");
        onSuccess();
        onClose();
      } else {
        setUrlError(json.error || "Failed to add website");
      }
    } catch {
      setUrlError("Network error adding website. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isPrimary ? "Add Your Store" : "Add Competitor Site"}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <p className="text-[#737373] text-xs">
          {isPrimary
            ? "Add one of your own online stores. Competitor products will be checked against this site."
            : "Add a competitor website. We will automatically extract its products and compare against all your sites."}
        </p>

        {/* Type Selector Tabs */}
        <div>
          <label className="block font-semibold text-[#171717] mb-1.5 uppercase tracking-wider text-[10px]">
            Site Classification
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsPrimary(true)}
              className={`p-3 rounded-sm border text-left flex items-start gap-2.5 transition-colors ${
                isPrimary
                  ? "border-[#166534] bg-[#F0FDF4] text-[#166534]"
                  : "border-[#E5E5E5] bg-white text-[#737373] hover:border-[#171717]"
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-xs">Your Store</div>
                <div className="text-[11px] opacity-80 mt-0.5">Your product catalog</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsPrimary(false)}
              className={`p-3 rounded-sm border text-left flex items-start gap-2.5 transition-colors ${
                !isPrimary
                  ? "border-[#171717] bg-[#F5F5F4] text-[#171717]"
                  : "border-[#E5E5E5] bg-white text-[#737373] hover:border-[#171717]"
              }`}
            >
              <Swords className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-xs">Competitor Site</div>
                <div className="text-[11px] opacity-80 mt-0.5">Monitored competitor</div>
              </div>
            </button>
          </div>
        </div>

        {/* URL Input */}
        <div>
          <label className="block font-semibold text-[#171717] mb-1 uppercase tracking-wider text-[10px]">
            Website URL or Domain <span className="text-[#991B1B]">*</span>
          </label>
          <div className="relative">
            <Globe className="w-3.5 h-3.5 absolute left-3 top-3 text-[#737373]" />
            <input
              type="text"
              required
              placeholder={isPrimary ? "e.g. myshop.com or https://myshop.com" : "e.g. competitor.com or https://competitor.com"}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError("");
              }}
              className={`w-full pl-9 pr-3 py-2 bg-white border ${
                urlError
                  ? "border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/20"
                  : "border-[#E5E5E5] focus:border-[#171717]"
              } rounded-sm text-xs text-[#171717] focus:outline-none transition-colors`}
            />
          </div>
          {urlError && (
            <p className="text-[11px] text-rose-600 mt-1.5 font-medium flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{urlError}</span>
            </p>
          )}
        </div>

        {/* Optional Custom Label */}
        <div>
          <label className="block font-semibold text-[#171717] mb-1 uppercase tracking-wider text-[10px]">
            Site Name <span className="text-[#737373] font-normal lowercase">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="Auto-detected from domain if empty"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
          />
        </div>

        <div className="p-2.5 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm text-[11px] text-[#737373]">
          💡 <strong>Automatic Sitemaps:</strong> We automatically discover XML sitemaps and isolate product listings without requiring any manual setup.
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E5E5]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            {isPrimary ? "Add to Our Sites" : "Add Competitor"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
