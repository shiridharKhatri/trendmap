import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPageChangeDocument extends Document {
  websiteId: mongoose.Types.ObjectId;
  scanId: mongoose.Types.ObjectId;
  url: string;
  normalizedUrl: string;
  type: "added" | "removed" | "changed" | "missing_from_primary";
  detectedAt: Date;
  previousLastmod?: Date;
  currentLastmod?: Date;
  isReviewed: boolean;
  productSlug?: string;
  matchedUrl?: string;
  similarityScore?: number;
  trendScore?: number;
  trendPriority?: "high" | "medium" | "low";
  trendGeo?: string;
  trendExploreUrl?: string;
  trendFetchedAt?: Date;
  trendQueueStatus?: "queued" | "completed" | "failed";
}

const PageChangeSchema = new Schema<IPageChangeDocument>(
  {
    websiteId: { type: Schema.Types.ObjectId, ref: "Website", required: true, index: true },
    scanId: { type: Schema.Types.ObjectId, ref: "Scan", required: true, index: true },
    url: { type: String, required: true, trim: true },
    normalizedUrl: { type: String, required: true, trim: true, index: true },
    type: {
      type: String,
      enum: ["added", "removed", "changed", "missing_from_primary"],
      required: true,
      index: true,
    },
    detectedAt: { type: Date, default: Date.now, index: true },
    previousLastmod: { type: Date },
    currentLastmod: { type: Date },
    isReviewed: { type: Boolean, default: false, index: true },
    productSlug: { type: String, trim: true },
    matchedUrl: { type: String, trim: true },
    similarityScore: { type: Number },
    trendScore: { type: Number, min: 0, max: 100 },
    trendPriority: { type: String, enum: ["high", "medium", "low"], index: true },
    trendGeo: { type: String, trim: true },
    trendExploreUrl: { type: String },
    trendFetchedAt: { type: Date },
    trendQueueStatus: { type: String, enum: ["queued", "completed", "failed"], index: true },
  },
  { timestamps: true }
);

PageChangeSchema.index({ websiteId: 1, type: 1, isReviewed: 1 });
PageChangeSchema.index({ websiteId: 1, detectedAt: -1 });
PageChangeSchema.index({ trendPriority: 1, trendScore: -1 });

export const PageChange: Model<IPageChangeDocument> =
  mongoose.models.PageChange ||
  mongoose.model<IPageChangeDocument>("PageChange", PageChangeSchema);
