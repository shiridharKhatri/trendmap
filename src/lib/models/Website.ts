import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWebsiteDocument extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  url: string;
  domain: string;
  sitemapUrl?: string;
  isPrimary: boolean;
  isActive: boolean;
  scanFrequency: "6h" | "12h" | "24h" | "3d" | "weekly" | "custom";
  customFrequencyHours?: number;
  nextScanAt?: Date;
  lastScanAt?: Date;
  lastScanStatus?: "healthy" | "scanning" | "scheduled" | "warning" | "error" | "disabled";
  lastScanErrorMessage?: string;
  isScanning: boolean;
  lockAcquiredAt?: Date;
  totalUrls: number;
  missingUrlsCount: number;
  newUrlsCount: number;
  crawlScope?: "all" | "products" | "blog" | "custom";
  urlIncludePatterns?: string[];
  urlExcludePatterns?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const WebsiteSchema = new Schema<IWebsiteDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    domain: { type: String, required: true, trim: true, index: true },
    sitemapUrl: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    scanFrequency: {
      type: String,
      enum: ["6h", "12h", "24h", "3d", "weekly", "custom"],
      default: "24h",
    },
    customFrequencyHours: { type: Number, min: 1, max: 720 },
    nextScanAt: { type: Date, index: true },
    lastScanAt: { type: Date },
    lastScanStatus: {
      type: String,
      enum: ["healthy", "scanning", "scheduled", "warning", "error", "disabled"],
      default: "scheduled",
    },
    lastScanErrorMessage: { type: String },
    isScanning: { type: Boolean, default: false, index: true },
    lockAcquiredAt: { type: Date },
    totalUrls: { type: Number, default: 0 },
    missingUrlsCount: { type: Number, default: 0 },
    newUrlsCount: { type: Number, default: 0 },
    crawlScope: {
      type: String,
      enum: ["all", "products", "blog", "custom"],
      default: "all",
    },
    urlIncludePatterns: { type: [String], default: [] },
    urlExcludePatterns: { type: [String], default: [] },
  },
  { timestamps: true }
);

WebsiteSchema.index({ userId: 1, domain: 1 });
WebsiteSchema.index({ isActive: 1, nextScanAt: 1 });

export const Website: Model<IWebsiteDocument> =
  mongoose.models.Website || mongoose.model<IWebsiteDocument>("Website", WebsiteSchema);
