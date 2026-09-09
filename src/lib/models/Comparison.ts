import mongoose, { Schema, Document, Model } from "mongoose";

export interface IComparisonDocument extends Document {
  primaryWebsiteId: mongoose.Types.ObjectId;
  monitoredWebsiteId: mongoose.Types.ObjectId;
  scanId?: mongoose.Types.ObjectId;
  totalPrimaryUrls: number;
  totalMonitoredUrls: number;
  matchingUrls: number;
  missingUrls: number;
  newUrls: number;
  removedUrls: number;
  createdAt: Date;
}

const ComparisonSchema = new Schema<IComparisonDocument>(
  {
    primaryWebsiteId: { type: Schema.Types.ObjectId, ref: "Website", required: true, index: true },
    monitoredWebsiteId: { type: Schema.Types.ObjectId, ref: "Website", required: true, index: true },
    scanId: { type: Schema.Types.ObjectId, ref: "Scan" },
    totalPrimaryUrls: { type: Number, default: 0 },
    totalMonitoredUrls: { type: Number, default: 0 },
    matchingUrls: { type: Number, default: 0 },
    missingUrls: { type: Number, default: 0 },
    newUrls: { type: Number, default: 0 },
    removedUrls: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ComparisonSchema.index({ primaryWebsiteId: 1, monitoredWebsiteId: 1, createdAt: -1 });

export const Comparison: Model<IComparisonDocument> =
  mongoose.models.Comparison ||
  mongoose.model<IComparisonDocument>("Comparison", ComparisonSchema);
