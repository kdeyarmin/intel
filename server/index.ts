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

if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve("dist");
  app.use(express.static(distPath));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = parseInt(process.env.PORT || process.env.API_PORT || "3001");
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[CareMetric API] Server running on port ${PORT}`);

  async function safeStartupQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await fn();
      } catch (e: any) {
        if (attempt === 3) {
          console.warn(`[CareMetric API] ${label} failed after 3 attempts: ${e.message}`);
          return fallback;
        }
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
    return fallback;
  }

  try {
    const { db } = await import("./db");
    const { users, importBatches } = await import("./db/schema");
    const { eq: eqCheck } = await import("drizzle-orm");
    const bcryptLib = await import("bcryptjs");

    const [existingAdmin] = await safeStartupQuery(
      () => db.select().from(users).where(eqCheck(users.email, "kdeyarmin@comcast.net")).limit(1),
      [] as any[], "check admin"
    );
    if (!existingAdmin) {
      const hash = await bcryptLib.default.hash("Baileydog1!", 10);
      await safeStartupQuery(
        () => db.insert(users).values({
          email: "kdeyarmin@comcast.net",
          password_hash: hash,
          role: "admin",
          full_name: "K Deyarmin",
        }),
        undefined, "seed admin"
      );
      console.log("[CareMetric API] Admin user seeded");
    }
    const { eq, inArray, and } = await import("drizzle-orm");

    const isCrawler = (b: any) => b.import_type === "nppes_registry" && b.file_name?.startsWith("crawler_");

    const activeBatches = await safeStartupQuery(
      () => db.select().from(importBatches).where(inArray(importBatches.status, ["processing", "validating"])),
      [] as any[], "fetch active batches"
    );

    const failedCrawlerBatches = await safeStartupQuery(
      () => db.select().from(importBatches).where(and(
        eq(importBatches.import_type, "nppes_registry"),
        eq(importBatches.status, "failed"),
      )),
      [] as any[], "fetch failed crawlers"
    );
    const resumableFailedCrawlers = failedCrawlerBatches.filter(b => isCrawler(b) && ((b as any).imported_rows > 0));
    const emptyFailedCrawlers = failedCrawlerBatches.filter(b => isCrawler(b) && !((b as any).imported_rows > 0));

    const crawlerActive = activeBatches.filter(isCrawler);
    const cmsActive = activeBatches.filter(b => !isCrawler(b));

    if (emptyFailedCrawlers.length > 0) {
      console.log(`[CareMetric API] Resetting ${emptyFailedCrawlers.length} empty failed crawler batch(es) to paused`);
      const { nppesQueueItems } = await import("./db/schema");
      for (const batch of emptyFailedCrawlers) {
        await safeStartupQuery(
          () => db.update(importBatches).set({ status: "paused", updated_date: new Date() }).where(eq(importBatches.id, batch.id)),
          undefined, `pause empty crawler ${batch.id}`
        );
        await safeStartupQuery(
          () => db.update(nppesQueueItems)
            .set({ status: "pending", updated_date: new Date() })
            .where(and(eq(nppesQueueItems.batch_id, batch.id), eq(nppesQueueItems.status, "failed"))),
          undefined, `reset queue ${batch.id}`
        );
      }
    }

    if (crawlerActive.length > 0 || resumableFailedCrawlers.length > 0) {
      const allCrawlerIds = [...crawlerActive, ...resumableFailedCrawlers];
      console.log(`[CareMetric API] Recovering ${allCrawlerIds.length} NPPES crawler batch(es)`);

      const { nppesQueueItems } = await import("./db/schema");
      for (const batch of crawlerActive) {
        await safeStartupQuery(
          () => db.update(importBatches).set({ status: "paused", updated_date: new Date() }).where(eq(importBatches.id, batch.id)),
          undefined, `pause crawler ${batch.id}`
        );
        await safeStartupQuery(
          () => db.update(nppesQueueItems)
            .set({ status: "pending", updated_date: new Date() })
            .where(and(eq(nppesQueueItems.batch_id, batch.id), inArray(nppesQueueItems.status, ["processing"]))),
          undefined, `reset processing ${batch.id}`
        );
      }

      for (const batch of resumableFailedCrawlers) {
        await safeStartupQuery(
          () => db.update(importBatches).set({ status: "paused", updated_date: new Date() }).where(eq(importBatches.id, batch.id)),
          undefined, `pause failed crawler ${batch.id}`
        );
        await safeStartupQuery(
          () => db.update(nppesQueueItems)
            .set({ status: "pending", updated_date: new Date() })
            .where(and(eq(nppesQueueItems.batch_id, batch.id), eq(nppesQueueItems.status, "failed"))),
          undefined, `reset failed items ${batch.id}`
        );
      }

      setTimeout(async () => {
        try {
          const { handleNppesCrawler, startCrawlerWatchdog } = await import("./functions/nppesCrawler");
          await handleNppesCrawler({ action: "batch_resume" }, { role: "admin" });
          console.log(`[CareMetric API] NPPES crawler batches resumed`);
          startCrawlerWatchdog();
        } catch (e: any) {
          console.error(`[CareMetric API] NPPES auto-resume failed:`, e.message);
        }
      }, 5000);
    }

    if (cmsActive.length > 0) {
      console.log(`[CareMetric API] Recovering ${cmsActive.length} CMS import batch(es)`);
      const { handleAutoImportCMSData } = await import("./functions/triggerImport");

      for (let i = 0; i < cmsActive.length; i++) {
        const batch = cmsActive[i] as any;
        const resumeOffset = batch.retry_params?.resume_offset || batch.total_rows || 0;
        const fileUrl = batch.retry_params?.file_url;
        const year = batch.data_year || 2024;

        if (fileUrl) {
          await db.update(importBatches).set({ updated_date: new Date() }).where(eq(importBatches.id, batch.id));
          setTimeout(() => {
            handleAutoImportCMSData({
              import_type: batch.import_type,
              file_url: fileUrl,
              year,
              batch_id: batch.id,
              dry_run: false,
              resume_offset: resumeOffset,
            }).catch((e: any) => console.error(`[CareMetric API] CMS batch ${batch.id} resume failed:`, e.message));
          }, 10000 + i * 5000);
          console.log(`  - Batch ${batch.id} (${batch.import_type}) resuming from offset ${resumeOffset} (delay ${10 + i * 5}s)`);
        } else {
          await db.update(importBatches).set({
            status: "failed",
            error_samples: [{ row: 0, message: "No file_url stored — cannot auto-resume" }],
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch.id));
          console.log(`  - Batch ${batch.id} (${batch.import_type}) failed — no file_url for resume`);
        }
      }
    }

    if (activeBatches.length === 0 && resumableFailedCrawlers.length === 0) {
      console.log(`[CareMetric API] No imports to recover`);
    }

    try {
      const { startCrawlerWatchdog } = await import("./functions/nppesCrawler");
      startCrawlerWatchdog();
    } catch (_) {}

    try {
      const { cleanupOrphanedEmailTasks } = await import("./functions/emailSearchBot");
      await cleanupOrphanedEmailTasks();
      const { cleanupOrphanedEnrichmentTasks } = await import("./functions/stubs");
      await cleanupOrphanedEnrichmentTasks();
      const { cleanupOrphanedIntelTasks } = await import("./functions/providerIntelligenceBot");
      await cleanupOrphanedIntelTasks();
    } catch (e: any) {
      console.error(`[CareMetric API] Background task cleanup error:`, e.message);
    }
  } catch (e: any) {
    console.error(`[CareMetric API] Startup recovery error:`, e.message);
  }
});

async function gracefulShutdown(signal: string) {
  console.log(`[CareMetric API] ${signal} received — saving in-progress import state`);
  try {
    const activeBatches = await db.select({ id: importBatches.id, import_type: importBatches.import_type })
      .from(importBatches)
      .where(eq(importBatches.status, "in_progress"))
      .limit(20);

    for (const batch of activeBatches) {
      await db.update(importBatches).set({
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch.id));
      console.log(`  - Marked batch ${batch.id} (${batch.import_type}) for recovery`);
    }
  } catch (e: any) {
    console.error(`[CareMetric API] Shutdown save failed:`, e.message);
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
