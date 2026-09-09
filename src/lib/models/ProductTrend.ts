import mongoose, { Schema, Document, Model } from "mongoose";

export interface IProductTrendDocument extends Document {
  keyword: string;
  geo: string; // "" for Worldwide, or country code like "US", "GB", etc.
  timeframe: string; // e.g. "today 1-m", "today 12-m"
  score: number; // 0 to 100
  priority: "high" | "medium" | "low";
  source: "google_trends" | "serpapi" | "estimated";
  timeline?: { date: string; value: number }[];
  exploreUrl: string;
  fetchedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProductTrendSchema = new Schema<IProductTrendDocument>(
  {
    keyword: { type: String, required: true, index: true },
    geo: { type: String, default: "", index: true },
    timeframe: { type: String, default: "today 1-m" },
    score: { type: Number, required: true, min: 0, max: 100 },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["google_trends", "serpapi", "estimated"],
      default: "google_trends",
    },
    timeline: [
      {
        date: { type: String },
        value: { type: Number },
      },
    ],
    exploreUrl: { type: String, required: true },
    fetchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // MongoDB TTL auto-cleanup
  },
  { timestamps: true }
);

// Compound index for fast cache lookup
ProductTrendSchema.index({ keyword: 1, geo: 1, timeframe: 1 }, { unique: true });

export const ProductTrend: Model<IProductTrendDocument> =
  mongoose.models.ProductTrend ||
  mongoose.model<IProductTrendDocument>("ProductTrend", ProductTrendSchema);
