import mongoose, { Schema, Document, Model } from "mongoose";

export interface IScanDocument extends Document {
  websiteId: mongoose.Types.ObjectId;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  totalUrls: number;
  newUrls: number;
  removedUrls: number;
  missingFromPrimaryCount: number;
  duplicateUrls: number;
  invalidUrls: number;
  errorCount: number;
  errorMessage?: string;
  processedFiles: number;
  createdAt: Date;
}

const ScanSchema = new Schema<IScanDocument>(
  {
    websiteId: { type: Schema.Types.ObjectId, ref: "Website", required: true, index: true },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "cancelled"],
      default: "queued",
      index: true,
    },
    startedAt: { type: Date, default: Date.now, index: true },
    completedAt: { type: Date },
    durationMs: { type: Number },
    totalUrls: { type: Number, default: 0 },
    newUrls: { type: Number, default: 0 },
    removedUrls: { type: Number, default: 0 },
    missingFromPrimaryCount: { type: Number, default: 0 },
    duplicateUrls: { type: Number, default: 0 },
    invalidUrls: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    errorMessage: { type: String },
    processedFiles: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ScanSchema.index({ websiteId: 1, createdAt: -1 });

export const Scan: Model<IScanDocument> =
  mongoose.models.Scan || mongoose.model<IScanDocument>("Scan", ScanSchema);
