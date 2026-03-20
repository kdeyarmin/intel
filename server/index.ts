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

    const STALL_THRESHOLD_MS = 15 * 60 * 1000;
    const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS);

    const stalled = await db.select().from(importBatches)
      .where(and(
        inArray(importBatches.status, ["processing", "validating"]),
        lt(importBatches.updated_date, cutoff),
      ));

    if (stalled.length > 0) {
      const cmsStalled = stalled.filter(b => b.import_type !== "nppes_registry" && b.file_name && !b.file_name.startsWith("crawler_"));
      const crawlerStalled = stalled.filter(b => b.import_type === "nppes_registry" || b.file_name?.startsWith("crawler_"));

      for (const batch of crawlerStalled) {
        await db.update(importBatches).set({
          status: "failed",
          error_samples: [
            ...(Array.isArray((batch as any).error_samples) ? (batch as any).error_samples : []),
            { row: 0, message: "Job stalled due to inactivity — automatically marked as failed after 15 minutes with no progress" },
          ],
          updated_date: new Date(),
        }).where(eq(importBatches.id, batch.id));
        console.log(`  - Batch ${batch.id} (${batch.import_type}) marked failed: stalled since ${batch.updated_date}`);
      }

      for (const batch of cmsStalled) {
        const resumeOffset = (batch as any).retry_params?.resume_offset || (batch as any).total_rows || 0;
        console.log(`  - Batch ${batch.id} (${batch.import_type}) stalled, auto-resuming from offset ${resumeOffset}`);
        await db.update(importBatches).set({ updated_date: new Date() }).where(eq(importBatches.id, batch.id));
        try {
          const { handleAutoImportCMSData } = await import("./functions/triggerImport");
          const fileUrl = (batch as any).retry_params?.file_url;
          const year = (batch as any).data_year || 2024;
          if (fileUrl) {
            setTimeout(() => {
              handleAutoImportCMSData(batch.import_type!, fileUrl, year, batch.id, false, resumeOffset)
                .catch((e: any) => console.error(`[CareMetric API] Auto-resume batch ${batch.id} failed:`, e.message));
            }, 3000);
          } else {
            await db.update(importBatches).set({
              status: "failed",
              error_samples: [
                ...(Array.isArray((batch as any).error_samples) ? (batch as any).error_samples : []),
                { row: 0, message: "Job stalled — no file_url in retry_params for auto-resume" },
              ],
              updated_date: new Date(),
            }).where(eq(importBatches.id, batch.id));
          }
        } catch (resumeErr: any) {
          console.error(`[CareMetric API] Auto-resume error for batch ${batch.id}:`, resumeErr.message);
        }
      }

      console.log(`[CareMetric API] Stall recovery: ${crawlerStalled.length} marked failed, ${cmsStalled.length} auto-resumed`);
    }
  } catch (e: any) {
    console.error(`[CareMetric API] Stall detection error:`, e.message);
  }
});

export default app;
