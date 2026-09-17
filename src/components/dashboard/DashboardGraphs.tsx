"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, Check } from "lucide-react";
import { cleanProductSearchKeyword } from "@/lib/trends/constants";
import { type IWebsite } from "@/types";

/* -------------------------------------------------------------------------
 * 1. Demand Priority Donut Chart (Clean, No Icon Badge)
 * ------------------------------------------------------------------------- */
interface PrioritySlice {
  key: string;
  label: string;
  count: number;
  color: string;
  hoverColor: string;
}

export function DemandPriorityDonut({
  high,
  medium,
  low,
  unanalyzed,
  total,
}: {
  high: number;
  medium: number;
  low: number;
  unanalyzed: number;
  total: number;
}) {
  const [hoveredSlice, setHoveredSlice] = useState<PrioritySlice | null>(null);

  const slices: PrioritySlice[] = [
    { key: "high", label: "High Demand", count: high, color: "#059669", hoverColor: "#047857" },
    { key: "medium", label: "Moderate Demand", count: medium, color: "#D97706", hoverColor: "#B45309" },
    { key: "low", label: "Low Demand", count: low, color: "#64748B", hoverColor: "#475569" },
    { key: "unanalyzed", label: "Not Analyzed", count: unanalyzed, color: "#CBD5E1", hoverColor: "#94A3B8" },
  ];

  const validTotal = total > 0 ? total : 1;
  const radius = 64;
  const strokeWidth = 20;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col justify-between h-full">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Demand Priority Distribution</h3>
          <p className="text-[11px] text-slate-500">Google search volume breakdown across catalog gaps</p>
        </div>
        <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
          {total.toLocaleString()} total
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-around gap-6 my-auto py-2">
        {/* SVG Donut */}
        <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="transparent"
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
            />

            {total > 0 &&
              slices.map((slice) => {
                if (slice.count === 0) return null;
                const percent = slice.count / validTotal;
                const strokeDasharray = `${percent * circumference} ${circumference}`;
                const strokeDashoffset = -accumulatedPercent * circumference;
                accumulatedPercent += percent;

                const isHovered = hoveredSlice?.key === slice.key;

                return (
                  <circle
                    key={slice.key}
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="transparent"
                    stroke={isHovered ? slice.hoverColor : slice.color}
                    strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="butt"
                    className="transition-all duration-300 cursor-pointer"
                    onMouseEnter={() => setHoveredSlice(slice)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                );
              })}
          </svg>

          {/* Center Info */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
            <span className="text-2xl font-extrabold text-slate-900 font-mono tracking-tight">
              {hoveredSlice
                ? hoveredSlice.count.toLocaleString()
                : total.toLocaleString()}
            </span>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate max-w-[100px]">
              {hoveredSlice ? hoveredSlice.label : "Total Gaps"}
            </span>
            {hoveredSlice && (
              <span className="text-[10px] font-bold text-emerald-700 font-mono">
                {Math.round((hoveredSlice.count / validTotal) * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-2 w-full max-w-[210px]">
          {slices.map((slice) => {
            const pct = Math.round((slice.count / validTotal) * 100);
            const isHovered = hoveredSlice?.key === slice.key;
            return (
              <div
                key={slice.key}
                onMouseEnter={() => setHoveredSlice(slice)}
                onMouseLeave={() => setHoveredSlice(null)}
                className={`flex items-center justify-between p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isHovered ? "bg-slate-100/80" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="text-xs font-medium text-slate-700">{slice.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-900">
                    {slice.count.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>High &amp; Moderate demand represent top priorities</span>
        <Link
          href="/dashboard/missing?priority=high"
          className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 group"
        >
          <span>View High Demand</span>
          <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * 2. Search Demand Momentum Trajectory (100% Full-Width Responsive Spline)
 * ------------------------------------------------------------------------- */
export function TrendMomentumGraph({
  timeline,
}: {
  timeline: { label: string; value: number }[];
}) {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  // If no timeline data exists, show clean honest empty-state (NO fake data)
  if (!timeline || timeline.length === 0) {
    return (
      <div className="w-full bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Search Demand Momentum</h3>
            <p className="text-[11px] text-slate-500">Aggregated interest velocity from Google Trends</p>
          </div>
        </div>
        <div className="py-12 text-center text-xs text-slate-400 max-w-md mx-auto">
          No Google Trends timeline data analyzed yet. Click &ldquo;Trends&rdquo; on competitor products to plot real search velocity over time.
        </div>
      </div>
    );
  }

  // Real data points from Google Trends
  const points = timeline;

  // Dynamic Y-axis scale based on real data (avoids squashing into a flat floor at 10)
  const maxActual = Math.max(...points.map((p) => p.value), 0);
  const maxVal = Math.max(10, Math.ceil((Math.max(maxActual, 1) * 1.25) / 5) * 5);
  const minVal = 0;

  // SVG coordinate dimensions: Wide coordinate space with 100% stretch
  const svgWidth = 1000;
  const svgHeight = 220;
  const paddingLeft = 36;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 32;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const getCoordinates = (index: number, value: number) => {
    const x = paddingLeft + (index / Math.max(1, points.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - ((value - minVal) / (maxVal - minVal)) * chartHeight;
    return { x, y };
  };

  const coords = points.map((p, idx) => getCoordinates(idx, p.value));

  // Construct smooth cubic spline
  let pathD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = i > 0 ? coords[i - 1] : coords[0];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = i !== coords.length - 2 ? coords[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${paddingTop + chartHeight} L ${coords[0].x} ${paddingTop + chartHeight} Z`;

  const activePoint = activePointIndex !== null ? points[activePointIndex] : points[points.length - 1];
  const activeCoord = activePointIndex !== null ? coords[activePointIndex] : coords[coords.length - 1];

  // Grid steps (4 lines)
  const gridSteps = [0, Math.round(maxVal * 0.33), Math.round(maxVal * 0.66), maxVal];

  return (
    <div className="w-full bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
      {/* Header (Clean, No Icon Badge) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Search Demand Momentum</h3>
          <p className="text-[11px] text-slate-500">100% real Google Trends search velocity across catalog opportunities</p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 shrink-0">
          <span>Search Interest:</span>
          <span className="font-mono text-sm font-bold">{activePoint.value}/100</span>
          <span className="text-[10px] text-emerald-600 uppercase tracking-wide">({activePoint.label})</span>
        </div>
      </div>

      {/* SVG Canvas - Stretches 100% Full Width */}
      <div className="w-full overflow-hidden my-auto py-1">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
          className="w-full h-56 select-none overflow-visible"
        >
          <defs>
            <linearGradient id="fullWidthDemandGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
              <stop offset="70%" stopColor="#10B981" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines spanning 100% full width */}
          {gridSteps.map((gridVal) => {
            const y = paddingTop + chartHeight - ((gridVal - minVal) / (maxVal - minVal)) * chartHeight;
            return (
              <g key={gridVal}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="#F1F5F9"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono font-medium"
                >
                  {gridVal}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          <path d={areaD} fill="url(#fullWidthDemandGradient)" />

          {/* Smooth Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#059669"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Data Points & Labels */}
          {points.map((p, idx) => {
            const c = coords[idx];
            const isActive = activePointIndex === idx;

            return (
              <g key={`${p.label}-${idx}`}>
                {isActive && (
                  <line
                    x1={c.x}
                    y1={paddingTop}
                    x2={c.x}
                    y2={paddingTop + chartHeight}
                    stroke="#059669"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                )}

                {/* X Axis Label */}
                <text
                  x={c.x}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  className={`text-[10px] font-mono transition-colors ${
                    isActive ? "fill-emerald-800 font-bold" : "fill-slate-400 font-medium"
                  }`}
                >
                  {p.label}
                </text>

                {/* Hover Hotspot */}
                <rect
                  x={c.x - chartWidth / (points.length * 2)}
                  y={paddingTop}
                  width={chartWidth / points.length}
                  height={chartHeight + 20}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setActivePointIndex(idx)}
                />

                {/* Dot */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isActive ? "6" : "3.5"}
                  className={`transition-all ${
                    isActive
                      ? "fill-white stroke-emerald-700 stroke-[3px]"
                      : "fill-emerald-600"
                  }`}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>Higher curve indicates rising customer search volume</span>
        <span className="font-medium text-emerald-800">
          Peak period: {points.reduce((max, p) => (p.value > max.value ? p : max), points[0]).label}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * 3. Catalog Overlap Comparison (Clean, No Icon Badge)
 * ------------------------------------------------------------------------- */
export function CatalogComparisonGraph({
  ourSites,
  competitorSites,
  missingCount,
}: {
  ourSites: IWebsite[];
  competitorSites: IWebsite[];
  missingCount: number;
}) {
  const primarySite = ourSites[0];
  const primaryTotal = primarySite?.totalUrls || 0;

  const allPageCounts = [primaryTotal, ...competitorSites.map((c) => c.totalUrls || 0)];
  const maxCount = Math.max(...allPageCounts, 10);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Catalog Volume Comparison</h3>
          <p className="text-[11px] text-slate-500">Your baseline catalog size vs competitor stores</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold">
          <span className="inline-flex items-center gap-1 text-slate-700">
            <span className="w-2 h-2 rounded-xs bg-slate-900" />
            Baseline
          </span>
          <span className="inline-flex items-center gap-1 text-amber-800">
            <span className="w-2 h-2 rounded-xs bg-amber-500" />
            Competitors
          </span>
        </div>
      </div>

      <div className="space-y-4 my-auto py-1">
        {/* Baseline Store */}
        {primarySite && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 truncate max-w-[240px]">
                <span className="truncate">{primarySite.name || primarySite.domain}</span>
                <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[9px]">
                  Baseline
                </span>
              </div>
              <span className="font-mono font-bold text-slate-900 text-xs">
                {primaryTotal.toLocaleString()} URLs
              </span>
            </div>
            <div className="w-full h-4 bg-slate-100 rounded-lg overflow-hidden flex">
              <div
                className="h-full bg-slate-900 rounded-lg transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(4, (primaryTotal / maxCount) * 100))}%` }}
              />
            </div>
          </div>
        )}

        {/* Competitor Stores */}
        {competitorSites.map((comp) => {
          const compTotal = comp.totalUrls || 0;
          const widthPct = Math.min(100, Math.max(4, (compTotal / maxCount) * 100));

          return (
            <div key={comp._id} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-800 truncate max-w-[240px]">
                  {comp.name || comp.domain}
                </span>
                <span className="font-mono font-bold text-slate-700 text-xs">
                  {compTotal.toLocaleString()} URLs
                </span>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-lg overflow-hidden flex">
                <div
                  className="h-full bg-amber-500 rounded-lg transition-all duration-500"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}

        {competitorSites.length === 0 && (
          <div className="text-center py-6 text-xs text-slate-400">
            Add competitor sites to visualize catalog volume comparisons.
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>{missingCount.toLocaleString()} products missing from baseline catalog</span>
        <Link
          href="/dashboard/comparisons"
          className="text-slate-900 hover:underline font-semibold flex items-center gap-1 group"
        >
          <span>Matrix View</span>
          <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * 4. Checklist Progress Ring (Clean, No Icon Badge)
 * ------------------------------------------------------------------------- */
export function ChecklistProgressRing({
  completedCount,
  activeCount,
}: {
  completedCount: number;
  activeCount: number;
}) {
  const total = completedCount + activeCount;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const radius = 46;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Checklist Review Progress</h3>
          <p className="text-[11px] text-slate-500">Completed opportunities vs pending action backlog</p>
        </div>
        <Link
          href="/dashboard/missing?tab=completed"
          className="text-xs font-semibold text-emerald-800 hover:text-emerald-900 hover:underline"
        >
          View Completed
        </Link>
      </div>

      <div className="flex items-center justify-around gap-6 my-auto py-3">
        {/* Ring Chart */}
        <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke="#059669"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">{pct}%</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Done</span>
          </div>
        </div>

        {/* Telemetry Stats */}
        <div className="space-y-3 flex-1 max-w-[180px]">
          <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
            <div className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider">Completed</div>
            <div className="text-lg font-bold font-mono text-emerald-900 mt-0.5">
              {completedCount.toLocaleString()}
            </div>
            <div className="text-[10px] text-emerald-700">Checked off catalog gaps</div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Pending Action</div>
            <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
              {activeCount.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500">Awaiting demand review</div>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>Click &ldquo;Done&rdquo; in Opportunities to advance</span>
        <span className="font-semibold text-slate-700">{total.toLocaleString()} total items</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * 5. Top 5 Highest Demand Opportunities Radar (Clean, No Icon Badge)
 * ------------------------------------------------------------------------- */
export interface OpportunityItem {
  _id: string;
  url: string;
  productSlug?: string;
  normalizedUrl: string;
  trendScore?: number;
  trendPriority?: string;
  trendGeo?: string;
  websiteDomain: string;
}

export function TopDemandOpportunities({
  items,
  onMarkDone,
}: {
  items: OpportunityItem[];
  onMarkDone: (id: string) => void;
}) {
  const topItems = items.slice(0, 5);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Highest-Demand Opportunity Radar</h3>
          <p className="text-[11px] text-slate-500">Top prioritized products absent from your catalog</p>
        </div>
        <Link
          href="/dashboard/missing?priority=high"
          className="text-xs font-semibold text-emerald-800 hover:text-emerald-900 hover:underline flex items-center gap-1"
        >
          <span>View All High Demand</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {topItems.map((item, idx) => {
          const keyword = cleanProductSearchKeyword(item.productSlug || item.normalizedUrl);
          const score = item.trendScore ?? 0;

          return (
            <div
              key={item._id}
              className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between gap-3 group"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono font-bold text-slate-400">#{idx + 1}</span>
                  {score > 0 ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {score}/100
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500">
                      Unranked
                    </span>
                  )}
                </div>
                <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-emerald-800 transition-colors">
                  {keyword}
                </h4>
                <p className="text-[10px] text-slate-500 truncate mt-1">
                  {item.websiteDomain || "Competitor"}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-slate-500 hover:text-slate-800 hover:underline flex items-center gap-1 truncate max-w-[80px]"
                  title={item.url}
                >
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  <span>Visit</span>
                </a>
                <button
                  type="button"
                  onClick={() => onMarkDone(item._id)}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 hover:border-emerald-600 transition-all flex items-center gap-1 cursor-pointer"
                  title="Mark done and save to Completed tab"
                >
                  <Check className="w-3 h-3" />
                  <span>Done</span>
                </button>
              </div>
            </div>
          );
        })}

        {topItems.length === 0 && (
          <div className="col-span-5 text-center py-8 text-xs text-slate-400">
            No demand opportunities analyzed yet. Click &ldquo;Trends&rdquo; in the Missing table to populate this radar.
          </div>
        )}
      </div>
    </div>
  );
}
