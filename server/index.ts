import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import authRoutes from "./routes/auth";
import entityRoutes from "./routes/entities";
import integrationRoutes from "./routes/integrations";
import functionRoutes from "./routes/functions";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use("/api/storage", express.static(path.resolve("uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/entities", entityRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/functions", functionRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = parseInt(process.env.API_PORT || "3001");
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[CareMetric API] Server running on port ${PORT}`);

  try {
    const { db } = await import("./db");
    const { importBatches } = await import("./db/schema");
    const { eq, inArray, lt, and } = await import("drizzle-orm");

    const isCrawler = (b: any) => b.import_type === "nppes_registry" && b.file_name?.startsWith("crawler_");
    const STALL_THRESHOLD_MS = 15 * 60 * 1000;
    const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS);

    const stalled = await db.select().from(importBatches)
      .where(and(
        inArray(importBatches.status, ["processing", "validating"]),
        lt(importBatches.updated_date, cutoff),
      ));

    for (const batch of stalled) {
      if (isCrawler(batch)) {
        const { nppesQueueItems } = await import("./db/schema");
        await db.update(importBatches).set({ status: "failed", updated_date: new Date() }).where(eq(importBatches.id, batch.id));
        await db.update(nppesQueueItems)
          .set({ status: "failed", updated_date: new Date() })
          .where(and(eq(nppesQueueItems.batch_id, batch.id), inArray(nppesQueueItems.status, ["processing", "pending"])));
        console.log(`  - Batch ${batch.id} (crawler) marked failed for auto-resume`);
      } else {
        const resumeOffset = (batch as any).retry_params?.resume_offset || (batch as any).total_rows || 0;
        await db.update(importBatches).set({ updated_date: new Date() }).where(eq(importBatches.id, batch.id));
        const { handleAutoImportCMSData } = await import("./functions/triggerImport");
        const fileUrl = (batch as any).retry_params?.file_url;
        const year = (batch as any).data_year || 2024;
        if (fileUrl) {
          setTimeout(() => {
            handleAutoImportCMSData({
                import_type: batch.import_type,
                file_url: fileUrl,
                year,
                batch_id: batch.id,
                dry_run: false,
                resume_offset: resumeOffset,
              }).catch((e: any) => console.error(`[CareMetric API] Auto-resume CMS batch ${batch.id} failed:`, e.message));
          }, 3000);
          console.log(`  - Batch ${batch.id} (${batch.import_type}) CMS auto-resuming from offset ${resumeOffset}`);
        }
      }
    }

    const failedCrawlerBatches = await db.select().from(importBatches)
      .where(and(
        eq(importBatches.import_type, "nppes_registry"),
        eq(importBatches.status, "failed"),
      ));
    const resumableCrawlers = failedCrawlerBatches.filter(b => isCrawler(b) && ((b as any).imported_rows > 0));

    if (resumableCrawlers.length > 0) {
      console.log(`[CareMetric API] Found ${resumableCrawlers.length} failed NPPES crawler batch(es) to auto-resume`);
      setTimeout(async () => {
        try {
          const { handleNppesCrawler } = await import("./functions/nppesCrawler");
          await handleNppesCrawler({ action: "batch_resume" }, { role: "admin" });
          console.log(`[CareMetric API] NPPES crawler batches auto-resumed`);
        } catch (e: any) {
          console.error(`[CareMetric API] NPPES auto-resume failed:`, e.message);
        }
      }, 5000);
    }
  } catch (e: any) {
    console.error(`[CareMetric API] Stall detection error:`, e.message);
  }
});

export default app;
