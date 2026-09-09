import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISitemapDocument extends Document {
  websiteId: mongoose.Types.ObjectId;
  url: string;
  type: "sitemap" | "index";
  lastFetchedAt?: Date;
  httpStatus?: number;
  responseTimeMs?: number;
  status: "valid" | "error" | "warning";
  urlCount: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SitemapSchema = new Schema<ISitemapDocument>(
  {
    websiteId: { type: Schema.Types.ObjectId, ref: "Website", required: true, index: true },
    url: { type: String, required: true, trim: true },
    type: { type: String, enum: ["sitemap", "index"], default: "sitemap" },
    lastFetchedAt: { type: Date },
    httpStatus: { type: Number },
    responseTimeMs: { type: Number },
    status: { type: String, enum: ["valid", "error", "warning"], default: "valid" },
    urlCount: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

SitemapSchema.index({ websiteId: 1, url: 1 }, { unique: true });

export const Sitemap: Model<ISitemapDocument> =
  mongoose.models.Sitemap || mongoose.model<ISitemapDocument>("Sitemap", SitemapSchema);
