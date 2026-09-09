import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPageDocument extends Document {
  websiteId: mongoose.Types.ObjectId;
  normalizedUrl: string;
  originalUrl: string;
  lastmod?: Date;
  changefreq?: string;
  priority?: number;
  sourceSitemap?: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
  isReviewed?: boolean;
  title?: string;
  httpStatus?: number;
  createdAt: Date;
  updatedAt: Date;
}

const PageSchema = new Schema<IPageDocument>(
  {
    websiteId: { type: Schema.Types.ObjectId, ref: "Website", required: true, index: true },
    normalizedUrl: { type: String, required: true, trim: true },
    originalUrl: { type: String, required: true, trim: true },
    lastmod: { type: Date },
    changefreq: { type: String, trim: true },
    priority: { type: Number, min: 0, max: 1 },
    sourceSitemap: { type: String, trim: true },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    isActive: { type: Boolean, default: true, index: true },
    isReviewed: { type: Boolean, default: false, index: true },
    title: { type: String, trim: true },
    httpStatus: { type: Number },
  },
  { timestamps: true }
);

PageSchema.index({ websiteId: 1, normalizedUrl: 1 }, { unique: true });
PageSchema.index({ websiteId: 1, isActive: 1, lastSeenAt: -1 });

export const Page: Model<IPageDocument> =
  mongoose.models.Page || mongoose.model<IPageDocument>("Page", PageSchema);
