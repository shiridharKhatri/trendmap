import mongoose from "mongoose";
import fs from "fs";
import path from "path";

// Simple env loader
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

async function clean() {
  loadEnv();
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/sitemap_monitor";
  console.log("Connecting to MongoDB at:", uri);
  await mongoose.connect(uri);

  const ptCol = mongoose.connection.collection("producttrends");
  const pcCol = mongoose.connection.collection("pagechanges");

  // 1. Delete legacy estimated ProductTrend records that had fake scores
  const deletedPt = await ptCol.deleteMany({
    $or: [{ source: "estimated" }, { score: 35 }],
  });
  console.log(`Removed ${deletedPt.deletedCount} legacy estimated/fake ProductTrend cached records.`);

  // 2. Reset PageChanges that were assigned the fake score of 35 or estimated medium
  const resetPc = await pcCol.updateMany(
    { trendScore: 35 },
    {
      $unset: {
        trendScore: "",
        trendPriority: "",
        trendGeo: "",
        trendExploreUrl: "",
        trendFetchedAt: "",
      },
      $set: {
        trendQueueStatus: "queued",
      },
    }
  );
  console.log(`Reset ${resetPc.modifiedCount} PageChange records that had fake 35 scores.`);

  await mongoose.disconnect();
  console.log("Cleanup complete!");
}

clean().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
