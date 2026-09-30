"use client";

import React, { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { type ISettings, type IWebsite } from "@/types";
import {
  Save,
  Check,
  Send,
  Key,
  Globe,
  RefreshCw,
  Store,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Info,
} from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<ISettings | null>(null);
  const [websites, setWebsites] = useState<IWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Essential Settings
  const [primaryWebsiteId, setPrimaryWebsiteId] = useState<string>("");
  const [articleWebhookUrl, setArticleWebhookUrl] = useState<string>("");
  const [articleApiKey, setArticleApiKey] = useState<string>("");
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);

  // Optional Advanced Developer Settings (Hidden by default)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [defaultFrequency, setDefaultFrequency] = useState<string>("24h");
  const [copiedCron, setCopiedCron] = useState(false);

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
          setArticleWebhookUrl((s as any).articleManagementWebhookUrl || "");
          setArticleApiKey((s as any).articleManagementApiKey || "");
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

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryWebsiteId: primaryWebsiteId || null,
          defaultScanFrequency: defaultFrequency,
          articleManagementWebhookUrl: articleWebhookUrl.trim(),
          articleManagementApiKey: articleApiKey.trim(),
          autoExportToArticleManagement: false,
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

  const handleTestWebhook = async () => {
    if (!articleWebhookUrl.trim()) {
      toast("Please enter your Article Management Webhook URL first", "error");
      return;
    }

    setIsTestingWebhook(true);
    try {
      // First save settings so backend has the current endpoint & key
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleManagementWebhookUrl: articleWebhookUrl.trim(),
          articleManagementApiKey: articleApiKey.trim(),
          autoExportToArticleManagement: false,
        }),
      });

      const res = await fetch("/api/integrations/article-management/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast(data.message || "Connection to Article Management successful!", "success");
      } else {
        toast(data.error || "Failed to connect to Article Management", "error");
      }
    } catch {
      toast("Network error testing Article Management webhook", "error");
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const cronUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/cron/scans?secret=${settings?.cronSecret || ""}`;

  const handleCopyCron = () => {
    navigator.clipboard.writeText(cronUrl);
    setCopiedCron(true);
    toast("Copied cron trigger URL to clipboard", "success");
    setTimeout(() => setCopiedCron(false), 3000);
  };

  const selectedPrimaryWebsite = websites.find((w) => w._id === primaryWebsiteId);

  return (
    <DashboardShell title="Settings">
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Header */}
        <div className="pb-2">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure your store catalog baseline and Article Management integration.
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-600 mb-2" />
            <span>Loading settings...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {/* 1. Main Store Configuration */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Store className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Your Main Store (Catalog Baseline)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select your primary store. Competitor products will be checked against this catalog to identify missing product opportunities.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Select Your Website
                </label>
                <select
                  value={primaryWebsiteId}
                  onChange={(e) => setPrimaryWebsiteId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors cursor-pointer"
                >
                  <option value="">-- No Main Store Designated --</option>
                  {websites.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.domain} ({w.name}) {w.isPrimary ? "• Currently Primary" : ""}
                    </option>
                  ))}
                </select>

                {selectedPrimaryWebsite ? (
                  <div className="mt-2.5 p-2.5 bg-slate-50/80 border border-slate-200/60 rounded-xl flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Active Baseline: {selectedPrimaryWebsite.domain}</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {(selectedPrimaryWebsite.totalUrls || 0).toLocaleString()} URLs cataloged
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-600 mt-1.5 font-medium">
                    Please select your store so competitor gaps can be calculated correctly.
                  </p>
                )}
              </div>
            </div>

            {/* 2. Article Management Integration */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Send className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Article Management Integration</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Connect your account to send chosen missing products directly with all details.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestWebhook}
                  disabled={isTestingWebhook || !articleWebhookUrl.trim()}
                  className="border-slate-200 hover:bg-slate-50 text-xs font-semibold shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isTestingWebhook ? "animate-spin" : ""}`} />
                  <span>{isTestingWebhook ? "Testing..." : "Test Connection"}</span>
                </Button>
              </div>

              {/* Clean Notice */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-100/90 rounded-xl flex items-center gap-2.5 text-xs text-indigo-900">
                <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  <strong>Manual Send Mode:</strong> Products are only sent when you choose them in the Missing Products checklist.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span>Article Management Webhook URL</span>
                  </label>
                  <input
                    type="url"
                    value={articleWebhookUrl}
                    onChange={(e) => setArticleWebhookUrl(e.target.value)}
                    placeholder="https://article-management.example.com/api/webhooks/incoming-products"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    The endpoint where selected missing product details are posted.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    <span>API Key / Authorization Token (Optional)</span>
                  </label>
                  <input
                    type="password"
                    value={articleApiKey}
                    onChange={(e) => setArticleApiKey(e.target.value)}
                    placeholder="art_sec_... or user token"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Sent in the <code>Authorization: Bearer</code> header.
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Advanced Developer Options (Collapsible) */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Advanced Developer Options (Cron & Frequency)</span>
                </div>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showAdvanced && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 animate-in fade-in duration-150 text-xs">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Default Scan Frequency
                    </label>
                    <select
                      value={defaultFrequency}
                      onChange={(e) => setDefaultFrequency(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                    >
                      <option value="6h">Every 6 hours</option>
                      <option value="12h">Every 12 hours</option>
                      <option value="24h">Daily (24 hours)</option>
                      <option value="3d">Every 3 days</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Automated Cron Trigger URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={cronUrl}
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-600"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyCron}
                        className="h-8 text-xs"
                      >
                        {copiedCron ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCron ? "Copied" : "Copy"}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-end pt-2">
              <Button
                type="submit"
                size="md"
                isLoading={saving}
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold px-6 shadow-sm cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </Button>
            </div>
          </form>
        )}
      </div>
    </DashboardShell>
  );
}
