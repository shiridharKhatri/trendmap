import { describe, it, expect } from "vitest";
import { calculateNextScanAt } from "../src/lib/scanner/scanEngine";

describe("Schedule Calculation", () => {
  it("computes nextScanAt for 6h frequency", () => {
    const before = Date.now();
    const next = calculateNextScanAt("6h");
    const diffHours = (next.getTime() - before) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(6);
  });

  it("computes nextScanAt for 12h frequency", () => {
    const before = Date.now();
    const next = calculateNextScanAt("12h");
    const diffHours = (next.getTime() - before) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(12);
  });

  it("computes nextScanAt for 24h frequency", () => {
    const before = Date.now();
    const next = calculateNextScanAt("24h");
    const diffHours = (next.getTime() - before) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(24);
  });

  it("computes nextScanAt for 3d frequency", () => {
    const before = Date.now();
    const next = calculateNextScanAt("3d");
    const diffHours = (next.getTime() - before) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(72);
  });

  it("computes nextScanAt for weekly frequency", () => {
    const before = Date.now();
    const next = calculateNextScanAt("weekly");
    const diffHours = (next.getTime() - before) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(168);
  });

  it("computes nextScanAt for custom frequency", () => {
    const before = Date.now();
    const next = calculateNextScanAt("custom", 48);
    const diffHours = (next.getTime() - before) / (1000 * 60 * 60);
    expect(Math.round(diffHours)).toBe(48);
  });
});
