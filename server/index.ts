import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { eq, inArray } from "drizzle-orm";
import { db, pool as dbPool } from "./db";
import { importBatches } from "./db/schema";
import { createAuthRouter } from "./routes/auth";
import { createAdminUsersRouter } from "./routes/adminUsers";
import { createAuditRouter } from "./routes/audit";
import { createAssistantRouter } from "./routes/assistant";
import { recordAudit } from "./lib/audit";
import { createLeadListWithMembers } from "./lib/leadLists";
import { createPgAssistantStore } from "./lib/assistant/store";
import { createToolDeps } from "./lib/assistant/data";
import { anthropicStreamFactory } from "./lib/assistant/anthropic";
import { defaultAccountDeps } from "./lib/accountDeps";
import { parseTrustProxy } from "./lib/trustProxy";
import { authMiddleware } from "./middleware/auth";
import entityRoutes from "./routes/entities";
import integrationRoutes from "./routes/integrations";
import functionRoutes from "./routes/functions";
import maintenanceRoutes from "./routes/maintenance";
import webhookRoutes from "./routes/webhooks";
import publicRoutes from "./routes/public";

const app = express();

// Which X-Forwarded-For hops to believe when working out a client's address
// (rate limits, audit IPs). See TRUST_PROXY in .env.example.
app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

// In production the SPA is served same-origin, so cross-origin requests should be
// limited to an explicit allowlist (ALLOWED_ORIGINS, comma-separated). In dev we
// reflect the request origin for convenience (Vite on a different port).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (process.env.NODE_ENV !== "production") return callback(null, true);
      // Same-origin / non-browser requests have no Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) {
        // In production with empty allowlist, reject cross-origin requests
        return callback(new Error("Not allowed by CORS"));
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  }),
);
// Needs the raw request body for signature checks, so it goes before express.json().
app.use("/api/webhooks", webhookRoutes);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Uploaded files are only for signed-in users (the SPA fetches them same-origin).
app.use("/api/storage", authMiddleware, express.static(path.resolve("uploads")));
const accountDeps = defaultAccountDeps(dbPool);
app.use("/api/auth", createAuthRouter(accountDeps));
app.use("/api/admin/users", createAdminUsersRouter(accountDeps));
app.use("/api/audit", createAuditRouter());
const assistantStore = createPgAssistantStore(dbPool);
app.use("/api/assistant", createAssistantRouter({
  store: assistantStore,
  toolDeps: createToolDeps(dbPool, assistantStore),
  createStream: anthropicStreamFactory,
  createLeadList: createLeadListWithMembers,
  audit: recordAudit,
}));
app.use("/api/entities", entityRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/functions", functionRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/public", express.urlencoded({ extended: false }), publicRoutes);

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

// Opt-in: apply pending migrations before serving (an advisory lock keeps
// parallel instances from racing). Refuse to start on failure rather than
// serve against a half-migrated schema.
if (process.env.DB_MIGRATE_ON_BOOT === "true") {
  const { pool } = await import("./db");
  const { runMigrations } = await import("./db/migrate");
  try {
    await runMigrations(pool);
  } catch (e: any) {
    console.error("[CareMetric API] Migrations failed; not starting:", e?.message || e);
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT || process.env.API_PORT || "3001");
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[CareMetric API] Server running on port ${PORT}`);
  if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
    console.warn(`[CareMetric API] WARNING: ALLOWED_ORIGINS is not configured in production — cross-origin requests will be rejected. Set ALLOWED_ORIGINS to enable access from your frontend domain.`);
  }

  // Session changes (disable, role, sign out everywhere) reach this instance
  // from the others at once (see server/lib/sessionUsers.ts).
  {
    const { startSessionUserListener } = await import("./lib/sessionUsers");
    const pg = (await import("pg")).default;
    startSessionUserListener(() => new pg.Client({ connectionString: process.env.DATABASE_URL }));
  }

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
    const { seedAdmin } = await import("./lib/adminSeed");
    const seed = await safeStartupQuery(
      () => seedAdmin(accountDeps.repo, { hashPassword: accountDeps.hashPassword, verifyPassword: accountDeps.verifyPassword }),
      null, "seed admin"
    );
    if (seed?.outcome === "seeded") {
      console.log(`[CareMetric API] Admin user seeded (${seed.email})`);
      if (!process.env.ADMIN_PASSWORD) {
        console.warn("[CareMetric API] ADMIN_PASSWORD not set — used built-in dev default. Do not deploy without setting ADMIN_PASSWORD.");
      }
    } else if (seed?.outcome === "restored") {
      console.warn(`[CareMetric API] No active admin existed; restored admin access for ${seed.email} (password matched ADMIN_PASSWORD).`);
    } else if (seed?.outcome === "skipped_no_password") {
      console.warn(`[CareMetric API] No admin user exists and ADMIN_PASSWORD is not set in production — skipping admin seed. Set ADMIN_EMAIL and ADMIN_PASSWORD secrets to seed the first admin.`);
    } else if (seed?.outcome === "left_alone") {
      console.warn(`[CareMetric API] ${seed.email} exists but isn't an active admin; left unchanged. Use scripts/admin-recover.ts if you're locked out.`);
    } else if (seed?.outcome === "invalid_email") {
      console.warn("[CareMetric API] ADMIN_EMAIL isn't a valid email address; skipping admin seed.");
    }
    const { and } = await import("drizzle-orm");

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
      console.log(`[CareMetric API] Recovering ${cmsActive.length} import batch(es)`);
      const { handleAutoImportCMSData, endedWithoutFinishing } = await import("./functions/triggerImport");
      const { handleImportNPPESFlatFile } = await import("./functions/importNPPESFlatFile");
      const { planRecovery } = await import("./lib/importRecovery");

      for (let i = 0; i < cmsActive.length; i++) {
        const batch = cmsActive[i] as any;
        const plan = planRecovery(batch);

        if (plan.action === "fail") {
          await db.update(importBatches).set({
            status: "failed",
            error_samples: [{ row: 0, message: plan.reason }],
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch.id));
          console.log(`  - Batch ${batch.id} (${batch.import_type}) failed — ${plan.reason}`);
          await endedWithoutFinishing(String(batch.import_type), batch.id, "failed", plan.reason);
          continue;
        }

        await db.update(importBatches).set({ updated_date: new Date() }).where(eq(importBatches.id, batch.id));
        const run = plan.action === "nppes_flat_file" ? handleImportNPPESFlatFile : handleAutoImportCMSData;
        setTimeout(() => {
          run(plan.params as any).catch((e: any) => console.error(`[CareMetric API] Batch ${batch.id} resume failed:`, e.message));
        }, 10000 + i * 5000);
        console.log(`  - Batch ${batch.id} (${batch.import_type}) resuming from ${plan.action === "nppes_flat_file" ? `byte ${plan.params.byte_offset}` : `offset ${plan.params.resume_offset}`} (delay ${10 + i * 5}s)`);
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
      const { cleanupOrphanedDMETasks } = await import("./functions/dmeReport");
      await cleanupOrphanedDMETasks();
    } catch (e: any) {
      console.error(`[CareMetric API] Background task cleanup error:`, e.message);
    }

    // Census geography (counties, ZCTAs) loads from server/data/census when
    // the tables are empty or the bundled data changed.
    (async () => {
      const { autoloadCensusGeography } = await import("./lib/census/load");
      await autoloadCensusGeography(dbPool);
    })();

    // Large-table indexes build in the background (see server/lib/bootIndexes.ts).
    (async () => {
      const { runBootIndexes } = await import("./lib/bootIndexes");
      await runBootIndexes(dbPool);
    })();

    // Optional in-process maintenance tick (MAINTENANCE_INPROCESS_INTERVAL_MS)
    // for hosts without an external cron; see server/lib/maintenanceTicker.ts.
    {
      const { startMaintenanceTicker } = await import("./lib/maintenanceTicker");
      startMaintenanceTicker(dbPool);
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
      .where(inArray(importBatches.status, ["processing", "validating"]))
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
