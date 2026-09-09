"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
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
  const [isPrimary, setIsPrimary] = useState(defaultIsPrimary);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Keep isPrimary in sync when opened specifically for baseline vs competitor
  React.useEffect(() => {
    setIsPrimary(defaultIsPrimary);
  }, [defaultIsPrimary, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      toast("Please enter a website URL", "error");
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
            ? `Added "${domainName}" to Our Sites (Baseline)`
            : `Added "${domainName}" to Competitor Sites`,
          "success"
        );
        setUrl("");
        setName("");
        onSuccess();
        onClose();
      } else {
        toast(json.error || "Failed to add website", "error");
      }
    } catch {
      toast("Network error adding website", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isPrimary ? "Add Our Site (Baseline)" : "Add Competitor Site"}
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
                <div className="font-semibold text-xs">Our Site</div>
                <div className="text-[11px] opacity-80 mt-0.5">Your catalog / baseline</div>
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
              onChange={(e) => setUrl(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
            />
          </div>
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
