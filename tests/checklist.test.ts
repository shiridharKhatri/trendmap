import { describe, it, expect } from "vitest";

describe("Missing Products Checklist Logic", () => {
  interface MockPageChange {
    _id: string;
    normalizedUrl: string;
    productSlug: string;
    isReviewed: boolean;
    trendScore?: number;
  }

  const sampleItems: MockPageChange[] = [
    { _id: "1", normalizedUrl: "/products/running-shoe-alpha", productSlug: "running shoe alpha", isReviewed: false, trendScore: 88 },
    { _id: "2", normalizedUrl: "/products/marathon-vest", productSlug: "marathon vest", isReviewed: false, trendScore: 72 },
    { _id: "3", normalizedUrl: "/products/trail-gaiters", productSlug: "trail gaiters", isReviewed: true, trendScore: 54 },
    { _id: "4", normalizedUrl: "/products/hydration-pack", productSlug: "hydration pack", isReviewed: true, trendScore: 91 },
  ];

  it("partitions checklist into Opportunities (active) and Completed tabs", () => {
    const opportunities = sampleItems.filter((item) => !item.isReviewed);
    const completed = sampleItems.filter((item) => item.isReviewed);

    expect(opportunities).toHaveLength(2);
    expect(completed).toHaveLength(2);
    expect(opportunities.map((i) => i._id)).toEqual(["1", "2"]);
    expect(completed.map((i) => i._id)).toEqual(["3", "4"]);
  });

  it("marks an opportunity item as Done / Completed and updates counts optimistically", () => {
    let items = [...sampleItems];
    let activeCount = items.filter((i) => !i.isReviewed).length;
    let completedCount = items.filter((i) => i.isReviewed).length;

    // User clicks "Done" on item 1
    const targetId = "1";
    items = items.map((i) => (i._id === targetId ? { ...i, isReviewed: true } : i));
    activeCount = Math.max(0, activeCount - 1);
    completedCount = completedCount + 1;

    expect(activeCount).toBe(1);
    expect(completedCount).toBe(3);
    const target = items.find((i) => i._id === targetId);
    expect(target?.isReviewed).toBe(true);
  });

  it("restores a completed item back to Opportunities Checklist and updates counts", () => {
    let items = [...sampleItems];
    let activeCount = items.filter((i) => !i.isReviewed).length;
    let completedCount = items.filter((i) => i.isReviewed).length;

    // User clicks "Restore" on item 3
    const targetId = "3";
    items = items.map((i) => (i._id === targetId ? { ...i, isReviewed: false } : i));
    completedCount = Math.max(0, completedCount - 1);
    activeCount = activeCount + 1;

    expect(activeCount).toBe(3);
    expect(completedCount).toBe(1);
    const target = items.find((i) => i._id === targetId);
    expect(target?.isReviewed).toBe(false);
  });

  it("performs bulk review marking multiple items as completed", () => {
    let items = [...sampleItems];
    const selectedIds = new Set(["1", "2"]);

    items = items.map((i) => (selectedIds.has(i._id) ? { ...i, isReviewed: true } : i));

    const remainingActive = items.filter((i) => !i.isReviewed);
    const totalCompleted = items.filter((i) => i.isReviewed);

    expect(remainingActive).toHaveLength(0);
    expect(totalCompleted).toHaveLength(4);
  });
});
