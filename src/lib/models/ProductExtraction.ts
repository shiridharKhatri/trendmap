import mongoose, { Schema, Document, Model } from "mongoose";

export interface IProductExtractionDocument extends Document {
  url: string;
  slug: string;
  isProduct: boolean;
  cleanProductName: string;
  category?: string;
  confidence?: number;
  aiModel: string;
  extractedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProductExtractionSchema = new Schema<IProductExtractionDocument>(
  {
    url: { type: String, required: true, unique: true, index: true, trim: true },
    slug: { type: String, required: true, index: true, trim: true },
    isProduct: { type: Boolean, required: true, index: true },
    cleanProductName: { type: String, default: "", trim: true },
    category: { type: String, trim: true },
    confidence: { type: Number, default: 1.0 },
    aiModel: { type: String, default: "groq/openai/gpt-oss-120b" },
    extractedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const ProductExtraction: Model<IProductExtractionDocument> =
  mongoose.models.ProductExtraction ||
  mongoose.model<IProductExtractionDocument>("ProductExtraction", ProductExtractionSchema);
