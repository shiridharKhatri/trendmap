"use client";

import React, { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { type ISettings, type IWebsite } from "@/types";
import { Settings as SettingsIcon, Save, Copy, Check, Clock, ShieldCheck, Sparkles, Zap, Eye, EyeOff } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<ISettings | null>(null);
  const [websites, setWebsites] = useState<IWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [primaryWebsiteId, setPrimaryWebsiteId] = useState<string>("");
  const [defaultFrequency, setDefaultFrequency] = useState<string>("24h");
  const [ignoredParamsText, setIgnoredParamsText] = useState<string>("");
  const [maxConcurrency, setMaxConcurrency] = useState<number>(3);
  const [requestTimeout, setRequestTimeout] = useState<number>(15000);
  const [maxRetries, setMaxRetries] = useState<number>(3);
  const [copiedCron, setCopiedCron] = useState(false);

  // AI Extraction Settings
  const [groqApiKey, setGroqApiKey] = useState<string>("");
  const [groqModel, setGroqModel] = useState<string>("llama-3.1-8b-instant");
  const [aiExtractionEnabled, setAiExtractionEnabled] = useState<boolean>(true);
  const [testingGroq, setTestingGroq] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  const { toast } = useToast();

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setWebsites(data.websites || []);

        if (data.settings) {
          const s = data.settings;
          setPrimaryWebsiteId(s.primaryWebsiteId || "");
          setDefaultFrequency(s.defaultScanFrequency || "24h");
          setIgnoredParamsText((s.ignoredQueryParams || []).join(", "));
          setMaxConcurrency(s.maxConcurrentScans || 3);
          setRequestTimeout(s.requestTimeoutMs || 15000);
          setMaxRetries(s.maxRetries || 3);
          setGroqApiKey(s.groqApiKey || "");
          setGroqModel(s.groqModel && !s.groqModel.includes("120b") ? s.groqModel : "llama-3.1-8b-instant");
          setAiExtractionEnabled(s.aiExtractionEnabled !== undefined ? s.aiExtractionEnabled : true);
        }
      }
    } catch {
      toast("Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const ignoredArray = ignoredParamsText
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryWebsiteId: primaryWebsiteId || null,
          defaultScanFrequency: defaultFrequency,
          ignoredQueryParams: ignoredArray,
          maxConcurrentScans: maxConcurrency,
          requestTimeoutMs: requestTimeout,
          maxRetries: maxRetries,
          groqApiKey: groqApiKey.trim(),
          groqModel: groqModel.trim(),
          aiExtractionEnabled,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast("Settings saved successfully", "success");
        setSettings(data.settings);
      } else {
        toast(data.error || "Failed to update settings", "error");
      }
    } catch {
      toast("Error saving settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAiExtraction = async (nextVal: boolean) => {
    setAiExtractionEnabled(nextVal);
    toast(nextVal ? "AI extraction enabled" : "AI extraction disabled", "info");

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiExtractionEnabled: nextVal }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setSettings(data.settings);
      }
    } catch {
      setAiExtractionEnabled(!nextVal);
      toast("Failed to update AI extraction setting", "error");
    }
  };

  const handleTestGroq = async () => {
    setTestingGroq(true);
    try {
      const res = await fetch("/api/settings/test-groq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: groqApiKey, model: groqModel }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast(data.message, "success");
      } else {
        toast(data.error || "Groq connection test failed", "error");
      }
    } catch {
      toast("Groq connection test failed", "error");
    } finally {
      setTestingGroq(false);
    }
  };

  const cronUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/cron/scans?secret=${settings?.cronSecret || ""}`;

  const handleCopyCron = () => {
    navigator.clipboard.writeText(cronUrl);
    setCopiedCron(true);
    toast("Copied cron trigger URL to clipboard", "success");
    setTimeout(() => setCopiedCron(false), 3000);
  };

  return (
    <DashboardShell title="Settings">
      <div className="space-y-6 max-w-4xl mx-auto pb-10">
        {/* Header */}
        <div className="pb-2">
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">System & Comparison Settings</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Configure default scan cadence, comparison baseline, query normalization, and SerpApi integration
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-[#64748B]">Loading settings...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Primary Baseline Configuration */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4 shadow-2xs">
              <div className="border-b border-[#E2E8F0] pb-3">
                <h2 className="text-sm font-bold text-[#0F172A]">
                  Primary Website Baseline
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Select the main website against which all competitor URLs will be compared
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                  Primary Baseline Website
                </label>
                <select
                  value={primaryWebsiteId}
                  onChange={(e) => setPrimaryWebsiteId(e.target.value)}
                  className="w-full max-w-md px-3.5 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                >
                  <option value="">-- None Selected --</option>
                  {websites.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.domain} ({w.name}) {w.isPrimary ? "• Current Baseline" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#64748B] mt-1.5">
                  Any competitor URL not indexed on this baseline website is flagged as a potential missing page.
                </p>
              </div>
            </div>

            {/* URL Normalization & Crawl Options */}
            <div className="bg-white border border-[#E5E5E5] rounded-sm p-5 space-y-4">
              <div className="border-b border-[#E5E5E5] pb-3">
                <h2 className="text-sm font-semibold text-[#171717]">
                  URL Normalization & Scraper Tuning
                </h2>
                <p className="text-xs text-[#737373] mt-0.5">
                  Strip tracking parameters and configure safe network parameters
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">
                  Ignored Query Parameters (comma-separated)
                </label>
                <textarea
                  rows={3}
                  value={ignoredParamsText}
                  onChange={(e) => setIgnoredParamsText(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs font-mono text-[#171717] focus:outline-none focus:border-[#171717]"
                  placeholder="utm_source, utm_medium, utm_campaign, fbclid, gclid..."
                />
                <p className="text-[11px] text-[#737373] mt-1">
                  These tracking parameters will be stripped automatically before URL comparison so URLs like <code>/page?utm_source=fb</code> match <code>/page</code>.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">
                    Max Concurrent Scans
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={maxConcurrency}
                    onChange={(e) => setMaxConcurrency(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">
                    Request Timeout (ms)
                  </label>
                  <input
                    type="number"
                    min={3000}
                    max={60000}
                    step={1000}
                    value={requestTimeout}
                    onChange={(e) => setRequestTimeout(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">
                    Max Retries on Failure
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
                  />
                </div>
              </div>
            </div>

            {/* AI Product Extraction (Groq) */}
            <div className="bg-white border border-[#E5E5E5] rounded-sm p-5 space-y-4">
              <div className="border-b border-[#E5E5E5] pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[#171717] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#2563EB]" />
                    <span>AI Product Extraction & Verification (Groq)</span>
                  </h2>
                  <p className="text-xs text-[#737373] mt-0.5">
                    Use high-speed Groq LLMs to accurately distinguish products from blog articles and extract clean product names
                  </p>
                </div>
                <div className="flex items-center">
                  <Toggle
                    checked={aiExtractionEnabled}
                    onChange={handleToggleAiExtraction}
                    size="sm"
                    label={aiExtractionEnabled ? "Active" : "Disabled"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">
                    Groq API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      placeholder="gsk_..."
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs font-mono text-[#171717] focus:outline-none focus:border-[#171717]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-2.5 text-[#94A3B8] hover:text-[#0F172A]"
                      title={showApiKey ? "Hide API key" : "Show API key"}
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#171717] mb-1">
                    AI Model
                  </label>
                  <select
                    value={groqModel}
                    onChange={(e) => setGroqModel(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-sm text-xs text-[#171717] focus:outline-none focus:border-[#171717]"
                  >
                    <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant (Recommended • 30k TPM Quota • Sub-Second)</option>
                    <option value="openai/gpt-oss-20b">GPT OSS 20B (High Quota • Fast)</option>
                    <option value="qwen/qwen3.6-27b">Qwen 3.6 27B</option>
                    <option value="openai/gpt-oss-120b">GPT OSS 120B (Slow Reasoning • 8k TPM Limit)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-[11px] text-[#64748B] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Permanent MongoDB caching enabled: each URL is evaluated once and never queried twice.</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={testingGroq}
                  onClick={handleTestGroq}
                >
                  <Zap className="w-3 h-3 text-[#2563EB]" />
                  <span>Test Connection</span>
                </Button>
              </div>
            </div>

            {/* Background Cron Endpoint */}
            <div className="bg-white border border-[#E5E5E5] rounded-sm p-5 space-y-4">
              <div className="border-b border-[#E5E5E5] pb-3">
                <h2 className="text-sm font-semibold text-[#171717] flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#166534]" />
                  <span>Automated Background Scheduling (Cron)</span>
                </h2>
                <p className="text-xs text-[#737373] mt-0.5">
                  Trigger due scans automatically without needing a browser window open
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#171717] mb-1">
                  Secure Cron Webhook URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={cronUrl}
                    className="flex-1 px-3 py-2 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm text-xs font-mono text-[#171717]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCron}
                  >
                    {copiedCron ? <Check className="w-3.5 h-3.5 text-[#166534]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCron ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <div className="p-3 bg-[#FAFAF8] border border-[#E5E5E5] rounded-sm mt-3 text-xs text-[#737373] font-mono leading-relaxed">
                  # Example Crontab entry (runs every hour):<br />
                  0 * * * * curl -s -X POST &quot;{cronUrl}&quot; &gt; /dev/null
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-2">
              <Button type="submit" size="md" isLoading={saving}>
                <Save className="w-4 h-4" />
                <span>Save All Settings</span>
              </Button>
            </div>
          </form>
        )}
      </div>
    </DashboardShell>
  );
}
