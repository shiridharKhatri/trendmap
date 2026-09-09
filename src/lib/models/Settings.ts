import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISettingsDocument extends Document {
  userId: mongoose.Types.ObjectId;
  primaryWebsiteId?: mongoose.Types.ObjectId;
  defaultScanFrequency: "6h" | "12h" | "24h" | "3d" | "weekly" | "custom";
  ignoredQueryParams: string[];
  maxConcurrentScans: number;
  requestTimeoutMs: number;
  maxRetries: number;
  cronSecret: string;
  serpApiKey?: string;
  defaultTrendGeo?: string;
  groqApiKey?: string;
  groqModel?: string;
  aiExtractionEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SettingsSchema = new Schema<ISettingsDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    primaryWebsiteId: { type: Schema.Types.ObjectId, ref: "Website" },
    defaultScanFrequency: {
      type: String,
      enum: ["6h", "12h", "24h", "3d", "weekly", "custom"],
      default: "24h",
    },
    ignoredQueryParams: {
      type: [String],
      default: [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
        "msclkid",
        "ref",
        "mc_cid",
        "mc_eid",
      ],
    },
    maxConcurrentScans: { type: Number, default: 3, min: 1, max: 10 },
    requestTimeoutMs: { type: Number, default: 15000, min: 3000, max: 60000 },
    maxRetries: { type: Number, default: 3, min: 0, max: 5 },
    cronSecret: { type: String },
    serpApiKey: { type: String, trim: true },
    defaultTrendGeo: { type: String, default: "US", trim: true },
    groqApiKey: { type: String, trim: true },
    groqModel: { type: String, default: "openai/gpt-oss-120b", trim: true },
    aiExtractionEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Settings: Model<ISettingsDocument> =
  mongoose.models.Settings ||
  mongoose.model<ISettingsDocument>("Settings", SettingsSchema);
